/*!
 * SimpShare 规则解释器（GKD 风格）
 * 站点规则完全由 src/rules/rules.json 声明（与应用主体分离，可独立更新/替换），
 * 本文件只实现通用解释逻辑，不包含任何具体站点的硬编码：
 *   - match / matchAny：声明式 URL 匹配（hosts 后缀 + path 正则 + pathExclude + query + pathSource）
 *   - extract.state   ：从页面全局状态对象按 JSON 路径提取（{a.b.0.c[-1]} 取值 + 模板拼字段）
 *   - extract.api     ：声明式 Web API 提取（URL 模板 + 分支 + JSON 路径取值）
 *   - extract.og      ：head <meta> 元信息兜底（所有命中规则与未适配站点共用）
 *   - titleFromPath / transforms：标题/简介/封面的声明式变换
 * 同时运行于 content script 与 background service worker（无 chrome.* 依赖）。
 */
(function (global) {
  'use strict';

  const DEFAULT_META_TAGS = {
    title: ['og:title', 'twitter:title'],
    description: ['og:description', 'twitter:description', 'description'],
    image: ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']
  };

  let data = null;
  let compiled = [];
  let behavior = { ogForUnmatchedSites: true };
  let metaTags = DEFAULT_META_TAGS;
  let loadPending = null;

  function hostIs(host, suffix) {
    return host === suffix || host.endsWith('.' + suffix);
  }

  function safeUrl(urlStr) {
    try {
      const u = new URL(urlStr);
      return (u.protocol === 'http:' || u.protocol === 'https:') ? u : null;
    } catch (e) { return null; }
  }

  /* ---------------- JSON 路径取值 ----------------
   * 支持：a.b.c / 数组下标 0 / 负下标 [-1] / 通配 [*]
   * 含 [*] 的路径返回数组（供 join 使用）
   */
  function getPath(obj, path) {
    if (obj == null || !path) return undefined;
    const wantsArray = /\[\*/.test(path);
    const segs = String(path).replace(/\[(\d+|-1|\*)\]/g, '.$1').split('.').filter(Boolean);
    let cur = [obj];
    for (const seg of segs) {
      const next = [];
      for (const item of cur) {
        if (item == null) continue;
        if (seg === '*') {
          if (Array.isArray(item)) next.push(...item);
        } else {
          const idx = seg === '-1' ? -1 : (/^\d+$/.test(seg) ? Number(seg) : null);
          let v;
          if (idx === null) v = item[seg];
          else if (Array.isArray(item)) v = item[idx < 0 ? item.length + idx : idx];
          else v = item[seg];
          if (v !== undefined && v !== null) next.push(v);
        }
      }
      cur = next;
      if (!cur.length) return wantsArray ? [] : undefined;
    }
    if (wantsArray) return cur;
    return cur.length === 1 ? cur[0] : (cur.length ? cur : undefined);
  }

  /* ---------------- 模板 ----------------
   * "{路径}" 取值；修饰符：|join '分隔符' |fallback 路径 |clip 数字
   * 任一占位符未取到值时 ok=false（用于丢弃"歌手："这类残缺行）
   */
  function isBlank(v) { return v === undefined || v === null || v === ''; }

  function applyTemplate(tpl, resolve) {
    let missing = false;
    const text = String(tpl).replace(/\{([^{}]+)\}/g, (_, expr) => {
      const parts = expr.split('|').map(function (s) { return s.trim(); });
      let v = resolve(parts[0]);
      for (let i = 1; i < parts.length; i++) {
        const m = parts[i].match(/^(\w+)\s*(.*)$/);
        if (!m) continue;
        const mod = m[1];
        const arg = m[2].replace(/^['"]|['"]$/g, '');
        if (mod === 'join') {
          if (Array.isArray(v)) v = v.filter(function (x) { return !isBlank(x); }).map(String).join(arg || ' ');
        } else if (mod === 'fallback') {
          if (isBlank(v)) v = resolve(arg);
        } else if (mod === 'clip') {
          if (typeof v === 'string') {
            const n = parseInt(arg, 10) || 160;
            if (v.length > n) v = v.slice(0, n) + '…';
          }
        }
      }
      if (isBlank(v)) missing = true;
      return v == null ? '' : String(v);
    });
    return { text: text, ok: !missing };
  }

  /* ---------------- 编译与匹配 ---------------- */

  function compileMatch(m) {
    return {
      hosts: m.hosts || null,
      pathSource: m.pathSource || 'path',
      query: m.query || null,
      pathRe: m.path ? new RegExp(m.path, 'i') : null,
      excludeRe: m.pathExclude ? new RegExp(m.pathExclude, 'i') : null
    };
  }

  function loadFromData(d) {
    if (!d || !Array.isArray(d.siteRules)) throw new Error('invalid rules data');
    data = d;
    behavior = Object.assign({ ogForUnmatchedSites: true }, d.behavior || {});
    metaTags = Object.assign({}, DEFAULT_META_TAGS, d.metaTags || {});
    compiled = d.siteRules.map(function (r) {
      const alts = r.matchAny || (r.match ? [r.match] : []);
      return { raw: r, alts: alts.map(compileMatch) };
    });
    loadPending = null;
  }

  function load(url) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('rules HTTP ' + r.status);
      return r.json();
    }).then(loadFromData);
  }

  /** 记忆化加载（失败后可重试） */
  function loadOnce(url) {
    if (compiled.length) return Promise.resolve();
    if (!loadPending) {
      loadPending = load(url).catch(function (e) { loadPending = null; throw e; });
    }
    return loadPending;
  }

  function pathOf(u, m) {
    if (m && m.pathSource === 'pathAndHash') {
      const h = u.hash;
      return u.pathname + (h && h.indexOf('#/') === 0 ? h.slice(1) : '');
    }
    return u.pathname;
  }

  function matchOne(m, u) {
    if (m.hosts && !m.hosts.some(function (h) { return hostIs(u.hostname, h); })) return false;
    if (m.pathRe && !m.pathRe.test(pathOf(u, m))) return false;
    if (m.excludeRe && m.excludeRe.test(u.pathname)) return false;
    if (m.query) {
      for (const k of Object.keys(m.query)) {
        if (!u.searchParams.has(k)) return false;
      }
    }
    return true;
  }

  function match(urlStr) {
    if (!compiled.length) return null;
    const u = safeUrl(urlStr);
    if (!u) return null;
    for (const c of compiled) {
      for (const m of c.alts) {
        if (matchOne(m, u)) return c.raw;
      }
    }
    return null;
  }

  function isCoverSite(urlStr) { return !!match(urlStr); }

  /* ---------------- 状态提取（声明式字段映射） ---------------- */

  const TOKEN_RE = /\{([^{}]+)\}/g;

  /** 收集状态提取所需的全部路径，生成发给 MAIN world 的请求规格 */
  function stateSpec(rule) {
    const s = rule && rule.extract && rule.extract.state;
    if (!s || !s.source) return null;
    const paths = [];
    if (s.requirePath) paths.push(s.requirePath);
    for (const v of Object.values(s.fields || {})) {
      const arr = Array.isArray(v) ? v : [v];
      for (const t of arr) {
        TOKEN_RE.lastIndex = 0;
        let m;
        while ((m = TOKEN_RE.exec(String(t)))) paths.push(m[1].split('|')[0].trim());
      }
    }
    return { source: s.source, requirePath: s.requirePath || null, fields: s.fields || {}, paths: Array.from(new Set(paths)) };
  }

  /**
   * 按 spec 从"路径 → 值"映射表提取字段（MAIN world 与后台扫描共用）。
   * 返回 { title, description, coverUrl } 或 null（requirePath 未满足）。
   */
  function extractFromValues(spec, values) {
    if (!spec) return null;
    const get = function (p) { return Object.prototype.hasOwnProperty.call(values, p) ? values[p] : undefined; };
    if (spec.requirePath && isBlank(get(spec.requirePath))) return null;
    const f = spec.fields || {};
    const out = { title: '', description: '', coverUrl: null };
    if (f.title) out.title = applyTemplate(f.title, get).text.trim();
    out.description = (f.descLines || [])
      .map(function (t) { return applyTemplate(t, get); })
      .filter(function (l) { return l.ok && l.text.trim(); })
      .map(function (l) { return l.text; })
      .join('\n');
    if (f.cover) out.coverUrl = applyTemplate(f.cover, get).text || null;
    return out;
  }

  /* ---------------- 声明式 API 提取 ---------------- */

  /**
   * rule.extract.api：{ idFrom, branches: [{ whenPath, url, requirePath, fields }] }
   * 返回 { title, description, coverUrl } 或 null。
   */
  async function runApi(rule, urlStr, fetchFn) {
    const api = rule && rule.extract && rule.extract.api;
    if (!api) return null;
    const u = safeUrl(urlStr);
    if (!u) return null;

    let id = null;
    if (api.idFrom && api.idFrom.type === 'queryOrHash') {
      id = u.searchParams.get(api.idFrom.name);
      if (isBlank(id)) {
        const m = u.hash.match(new RegExp('[?&]' + api.idFrom.name + '=(\\w+)'));
        if (m) id = m[1];
      }
    }
    if (isBlank(id)) return null;

    const pathForMatch = pathOf(u, { pathSource: api.pathSource || 'pathAndHash' });
    const doFetch = fetchFn || global.fetch;
    for (const b of (api.branches || [])) {
      if (b.whenPath && !new RegExp(b.whenPath, 'i').test(pathForMatch)) continue;
      const apiUrl = applyTemplate(b.url, function (p) { return p === 'id' ? id : undefined; }).text;
      let json;
      try {
        const res = await doFetch(apiUrl, { credentials: 'omit' });
        if (!res.ok) continue;
        json = await res.json();
      } catch (e) { continue; }
      if (b.requirePath && isBlank(getPath(json, b.requirePath))) continue;
      const resolve = function (p) { return getPath(json, p); };
      const out = { title: '', description: '', coverUrl: null };
      if (b.fields.title) out.title = applyTemplate(b.fields.title, resolve).text.trim();
      out.description = (b.fields.descLines || [])
        .map(function (t) { return applyTemplate(t, resolve); })
        .filter(function (l) { return l.ok && l.text.trim(); })
        .map(function (l) { return l.text; })
        .join('\n');
      if (b.fields.cover) out.coverUrl = applyTemplate(b.fields.cover, resolve).text || null;
      return out;
    }
    return null;
  }

  /* ---------------- 声明式变换 ---------------- */

  function applyTransforms(rule, meta, urlStr) {
    const r = rule || {};
    if (r.titleFromPath && urlStr) {
      try {
        const u = new URL(urlStr);
        const m = u.pathname.match(new RegExp(r.titleFromPath.pattern));
        if (m) {
          meta.title = String(r.titleFromPath.template).replace(/\{(\d+)\}/g, (_, i) => m[i] || '');
        }
      } catch (e) { /* ignore */ }
    }
    for (const t of (r.transforms || [])) {
      const val = meta[t.field];
      if (typeof val !== 'string' || !val) continue;
      let out = val;
      if (t.stripRegex) {
        try { out = out.replace(new RegExp(t.stripRegex, t.flags || ''), '').trim(); } catch (e) { /* ignore */ }
      }
      if (t.forceHttps) out = out.replace(/^http:\/\//i, 'https://').replace(/^\/\//, 'https://');
      if (t.appendQuery && out.indexOf('?') < 0) out = out + '?' + t.appendQuery;
      meta[t.field] = out;
    }
  }

  /* ---------------- 未适配站点的 head <meta> 兜底 ---------------- */

  function allowUnmatchedCover() { return behavior.ogForUnmatchedSites !== false; }

  /** 供 ogFromDom 使用的 meta 选择器（由 rules.json metaTags 声明） */
  function metaSelectors() {
    const build = (keys) => {
      const sels = [];
      for (const k of keys) {
        sels.push('meta[property="' + k + '"]', 'meta[name="' + k + '"]');
      }
      return sels;
    };
    const s = {
      title: build(metaTags.title || []),
      description: build(metaTags.description || []),
      image: build(metaTags.image || [])
    };
    s.image.push('meta[itemprop="image"]');
    return s;
  }

  global.SimpShareRules = {
    load: load,
    loadOnce: loadOnce,
    loadFromData: loadFromData,
    match: match,
    isCoverSite: isCoverSite,
    getPath: getPath,
    applyTemplate: applyTemplate,
    stateSpec: stateSpec,
    extractFromValues: extractFromValues,
    runApi: runApi,
    applyTransforms: applyTransforms,
    metaSelectors: metaSelectors,
    allowUnmatchedCover: allowUnmatchedCover,
    get data() { return data; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
