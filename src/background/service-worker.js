/*!
 * SimpShare 后台 Service Worker（MV3）
 * 职责：
 *   1. FETCH_IMAGE：绕过页面 CORS 抓取图片并转为 dataURL（供 Canvas 绘制，不污染画布）
 *   2. EXTRACT_URL：为"修改链接"提交的自定义 URL 抓取 HTML 并解析元信息（含 B 站/YouTube 内嵌状态）
 *   3. COPY_IMAGE：内容脚本剪贴板失败时，通过 offscreen document 兜底写入剪贴板
 */
'use strict';
importScripts('../lib/rules.js');

/** GKD 风格规则订阅文件（与应用主体分离） */
const RULES_URL = 'src/rules/rules.json';
function ensureRules() {
  return SimpShareRules.loadOnce(chrome.runtime.getURL(RULES_URL));
}

/* ---------------- 通用工具 ---------------- */

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  nbsp: '\u00A0', hellip: '…', mdash: '\u2014', ndash: '\u2013',
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201C', rdquo: '\u201D', middot: '\u00B7'
};

function decodeEntities(s) {
  return String(s || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, function (m, e) {
    if (e[0] === '#') {
      const n = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] || m;
  });
}

/** meta 文本清洗：部分站点（如 MediaWiki 系）的 og:title 自带 HTML 标记，解码实体后需剥离标签并压平空白 */
function cleanMetaText(s) {
  return decodeEntities(s).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function absUrl(u, base) {
  if (!u) return null;
  try { return new URL(u, base).href; } catch (e) { return /^https?:\/\//i.test(u) ? u : null; }
}

async function fetchText(url, maxLen) {
  const r = await fetch(url, { credentials: 'omit', redirect: 'follow' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const t = await r.text();
  return { html: t.slice(0, maxLen || 3000000), finalUrl: r.url || url };
}

function blobToDataURL(blob) {
  return new Promise(function (resolve, reject) {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('FileReader failed'));
    fr.readAsDataURL(blob);
  });
}

/* ---------------- 图片抓取 ---------------- */

async function fetchImage(url, referer) {
  try {
    // 带上来源页面作为 Referer，绕过豆瓣等站点的无 Referer 防盗链
    const opts = { credentials: 'omit', redirect: 'follow' };
    if (referer && /^https?:\/\//i.test(referer)) opts.referrer = referer;
    const r = await fetch(url, opts);
    if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.startsWith('image/') && !ct.includes('octet-stream')) {
      return { ok: false, error: 'not image: ' + ct };
    }
    const blob = await r.blob();
    if (blob.size > 8 * 1024 * 1024) return { ok: false, error: 'image too large' };
    const dataUrl = await blobToDataURL(blob);
    if (!/^data:image\//i.test(dataUrl) && !/^data:application\/octet-stream/i.test(dataUrl)) {
      return { ok: false, error: 'bad data url' };
    }
    return { ok: true, dataUrl: dataUrl, contentType: ct };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/** 依序尝试候选 favicon，返回第一个成功的 */
async function fetchFavicon(candidates) {
  for (const u of (candidates || [])) {
    if (!u) continue;
    const r = await fetchImage(u);
    if (r.ok && r.dataUrl && r.dataUrl.length < 1200000) return { ok: true, dataUrl: r.dataUrl };
  }
  return { ok: false };
}

/* ---------------- HTML 元信息解析（SW 中无 DOMParser，用正则） ---------------- */

function metaTagsOf(html) {
  return html.match(/<meta\b[^>]*>/gi) || [];
}

function attrOf(tag, name) {
  const m = tag.match(new RegExp(name + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i'));
  return m ? (m[2] !== undefined ? m[2] : m[3]) : '';
}

function getMeta(html, keys) {
  for (const t of metaTagsOf(html)) {
    const k = (attrOf(t, 'property') || attrOf(t, 'name') || attrOf(t, 'itemprop')).toLowerCase();
    if (keys.indexOf(k) >= 0) {
      const v = attrOf(t, 'content');
      if (v) return v;
    }
  }
  return '';
}

function getMetaByItemprop(html, value) {
  for (const t of metaTagsOf(html)) {
    if (attrOf(t, 'itemprop').toLowerCase() === value) {
      const v = attrOf(t, 'content');
      if (v) return v;
    }
  }
  return '';
}

function faviconCandidatesOf(html, baseUrl) {
  const out = [];
  for (const t of (html.match(/<link\b[^>]*>/gi) || [])) {
    const rel = attrOf(t, 'rel').toLowerCase();
    if (/(icon|apple-touch)/.test(rel)) {
      const href = attrOf(t, 'href');
      if (href) {
        const abs = absUrl(decodeEntities(href), baseUrl);
        if (abs) out.push(abs);
      }
    }
  }
  try { out.push(new URL('/favicon.ico', baseUrl).href); } catch (e) { /* ignore */ }
  return out.slice(0, 6);
}

/** 提取 `varName = {...}` 的 JSON（平衡花括号扫描），用于 B 站 / YouTube 内嵌状态 */
function extractAssignedObject(html, varName) {
  const i = html.indexOf(varName);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let j = start; j < html.length && j - start < 4000000; j++) {
    const c = html[j];
    if (esc) { esc = false; continue; }
    if (inStr) {
      if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(start, end)); } catch (e) { return null; }
}

function genericMetaFromHtml(html, baseUrl) {
  let title = getMeta(html, ['og:title', 'twitter:title']);
  if (!title) {
    const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (m) title = m[1].trim();
  }
  const description = getMeta(html, ['og:description', 'twitter:description', 'description']);
  let coverUrl = getMeta(html, ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
  if (!coverUrl) coverUrl = getMetaByItemprop(html, 'image');
  return {
    title: cleanMetaText(title).slice(0, 300),
    description: cleanMetaText(description).slice(0, 2000),
    coverUrl: absUrl(decodeEntities(coverUrl), baseUrl),
    faviconCandidates: faviconCandidatesOf(html, baseUrl)
  };
}

/* ---------------- 自定义 URL 提取 ---------------- */

async function extractUrl(url) {
  await ensureRules();
  const rule = SimpShareRules.match(url);
  const meta = { title: '', description: '', coverUrl: null, faviconCandidates: [], ruleId: rule ? rule.id : null };
  let fields = null;
  let finalUrl = url;

  // 1) 声明式 API 提取（如网易云音乐 Web API）
  if (rule && rule.extract && rule.extract.api) {
    try { fields = await SimpShareRules.runApi(rule, url); } catch (e) { fields = null; }
  }

  // 2) 抓取 HTML：声明式状态提取（如 __INITIAL_STATE__）→ og 元信息兜底
  if (!fields) {
    const f = await fetchText(url, 3000000);
    finalUrl = f.finalUrl;
    if (rule && rule.extract && rule.extract.state) {
      const spec = SimpShareRules.stateSpec(rule);
      if (spec) {
        const raw = extractAssignedObject(f.html, spec.source);
        if (raw) {
          const values = {};
          for (const p of spec.paths) values[p] = SimpShareRules.getPath(raw, p);
          fields = SimpShareRules.extractFromValues(spec, values);
        }
      }
    }
    if (!fields) {
      const g = genericMetaFromHtml(f.html, finalUrl);
      meta.title = g.title || '';
      meta.description = g.description || '';
      meta.coverUrl = g.coverUrl || null;
      meta.faviconCandidates = g.faviconCandidates;
    }
  } else {
    try { meta.faviconCandidates = [new URL('/favicon.ico', url).href]; } catch (e) { /* ignore */ }
  }

  // 3) 规则字段覆盖 og 兜底，并应用声明式变换（titleFromPath / stripRegex / forceHttps …）
  if (fields) {
    if (fields.title) meta.title = fields.title;
    if (fields.description) meta.description = fields.description;
    if (fields.coverUrl) meta.coverUrl = fields.coverUrl;
  }
  SimpShareRules.applyTransforms(rule, meta, finalUrl);

  if (!meta.title) meta.title = url;
  return { ok: true, meta: meta };
}

/* ---------------- 剪贴板兜底（offscreen document） ---------------- */

let creatingOffscreen = null;

async function ensureOffscreen() {
  if (chrome.runtime.getContexts) {
    const ctxs = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (ctxs && ctxs.length) return;
  }
  if (!creatingOffscreen) {
    creatingOffscreen = chrome.offscreen.createDocument({
      url: 'src/background/offscreen.html',
      reasons: ['CLIPBOARD'],
      justification: '将 SimpShare 生成的分享图片写入系统剪贴板'
    }).catch(function (e) {
      if (!/already exists/i.test(String(e))) throw e;
    }).then(function () { creatingOffscreen = null; });
  }
  await creatingOffscreen;
}

async function copyImageOffscreen(dataUrl) {
  await ensureOffscreen();
  return await chrome.runtime.sendMessage({ type: 'OFFSCREEN_COPY_IMAGE', dataUrl: dataUrl });
}

/* ---------------- 消息路由 ---------------- */

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  (async function () {
    try {
      switch (msg && msg.type) {
        case 'FETCH_IMAGE': {
          let r = await fetchImage(msg.url, msg.referer);
          if (!r.ok) {
            // 直链偶发的瞬时失败（DNS / 连接重置）短暂等待后重试一次
            await new Promise(res => setTimeout(res, 400));
            r = await fetchImage(msg.url, msg.referer);
          }
          sendResponse(r);
          break;
        }
        case 'FETCH_FAVICON':
          sendResponse(await fetchFavicon(msg.candidates));
          break;
        case 'EXTRACT_URL':
          sendResponse(await extractUrl(msg.url));
          break;
        case 'RUN_RULE_API': {
          // 内容脚本发起的声明式 API 提取（如网易云同源 API 在后台执行避免 CORS 顾虑）
          await ensureRules();
          let fields = null;
          const rule = SimpShareRules.match(msg.url);
          if (rule && rule.extract && rule.extract.api) {
            try { fields = await SimpShareRules.runApi(rule, msg.url); } catch (e) { fields = null; }
          }
          sendResponse({ ok: true, fields: fields });
          break;
        }
        case 'COPY_IMAGE':
          sendResponse(await copyImageOffscreen(msg.dataUrl));
          break;
        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (e) {
      try { sendResponse({ ok: false, error: String(e && e.message || e) }); } catch (e2) { /* channel closed */ }
    }
  })();
  return true; // 异步响应
});
