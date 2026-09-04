/*!
 * SimpShare 内容脚本（isolated world）
 * UI：可拖拽 FAB（左右边缘吸附收纳）+ Material Design 3 分享面板
 * 流程：提取元信息（本页状态 / 跨页抓取）→ Canvas 渲染 21:9 分享图 → 复制到剪贴板
 */
(function () {
  'use strict';
  if (window.__SIMPSHARE_LOADED__) return;
  window.__SIMPSHARE_LOADED__ = true;

  /* ============================ 常量 ============================ */

  const ICONS = {
    share: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>',
    chevronLeft: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>',
    chevronRight: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path fill="currentColor" d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>',
    copy: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>',
    link: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>'
  };

  const CSS = `
    [hidden] { display: none !important; }
    .root * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      font-family: Roboto, "Segoe UI", system-ui, -apple-system, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .root {
      pointer-events: none;
      /* ---- Material 3 · 浅蓝色调（浅色模式） ---- */
      --sq-primary: #0B57D0;
      --sq-on-primary: #FFFFFF;
      --sq-primary-container: #D3E3FD;
      --sq-on-primary-container: #041E49;
      --sq-tonal-container: #D3E3FD;
      --sq-on-tonal-container: #041E49;
      --sq-surface: #FFFFFF;
      --sq-on-surface: #1F1F1F;
      --sq-on-surface-variant: #5F6368;
      --sq-outline: #C4C7C5;
      --sq-hover: rgba(11, 87, 208, .08);
      --sq-preview-bg: #E9EEF6;
      --sq-skeleton-a: #E4EAF2;
      --sq-skeleton-b: #F2F6FC;
      --sq-hint: #5F6368;
      --sq-snackbar-bg: #1F1F1F;
      --sq-snackbar-text: #E3E3E3;
      --sq-error: #B3261E;
      --sq-error-bg: #8C1D18;
      --sq-error-text: #FFFFFF;
      --sq-elev-shadow: 0 4px 8px 3px rgba(0,0,0,.15), 0 1px 3px rgba(0,0,0,.3);
      --sq-fab-shadow: 0 1px 2px rgba(0,0,0,.3), 0 1px 3px 1px rgba(0,0,0,.15);
    }
    @media (prefers-color-scheme: dark) {
      .root {
        --sq-primary: #A8C7FA;
        --sq-on-primary: #062E6F;
        --sq-primary-container: #A8C7FA;
        --sq-on-primary-container: #062E6F;
        --sq-tonal-container: #004A77;
        --sq-on-tonal-container: #C2E7FF;
        --sq-surface: #1E1F20;
        --sq-on-surface: #E3E3E3;
        --sq-on-surface-variant: #9AA0A6;
        --sq-outline: #444746;
        --sq-hover: rgba(168, 199, 250, .10);
        --sq-preview-bg: #26282B;
        --sq-skeleton-a: #26282B;
        --sq-skeleton-b: #313438;
        --sq-hint: #9AA0A6;
        --sq-snackbar-bg: #E3E3E3;
        --sq-snackbar-text: #1F1F1F;
        --sq-error: #F2B8B5;
        --sq-elev-shadow: 0 4px 8px 3px rgba(0,0,0,.45), 0 1px 3px rgba(0,0,0,.6);
        --sq-fab-shadow: 0 1px 2px rgba(0,0,0,.5), 0 1px 3px 1px rgba(0,0,0,.3);
      }
    }
    .root svg { display: block; flex: none; }

    /* ---------- FAB ---------- */
    .fab {
      pointer-events: auto;
      position: fixed;
      left: 0; top: 0;
      width: 56px; height: 56px;
      border: none;
      border-radius: 16px;
      background: var(--sq-primary-container);
      color: var(--sq-on-primary-container);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
      user-select: none;
      z-index: 2147483646;
      box-shadow: var(--sq-fab-shadow);
      transition: box-shadow .2s cubic-bezier(.2,0,0,1);
      will-change: left, top;
    }
    .fab:hover { box-shadow: 0 2px 6px 2px rgba(0,0,0,.2), 0 1px 2px rgba(0,0,0,.3); }
    .fab.dragging {
      cursor: grabbing;
      transition: none;
      box-shadow: 0 8px 12px 6px rgba(0,0,0,.2), 0 4px 4px rgba(0,0,0,.3);
    }

    /* ---------- 边缘吸附条 ---------- */
    .dock {
      pointer-events: auto;
      position: fixed;
      width: 14px; height: 64px;
      border: none;
      padding: 0;
      background: var(--sq-primary-container);
      color: var(--sq-on-primary-container);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 2147483646;
      opacity: .75;
      box-shadow: var(--sq-fab-shadow);
      transition: width .25s cubic-bezier(.2,0,0,1), opacity .2s;
    }
    .dock:hover { width: 48px; opacity: 1; }
    .dock.right { right: 0; border-radius: 10px 0 0 10px; }
    .dock.left { left: 0; border-radius: 0 10px 10px 0; }
    .dock svg { opacity: 0; transition: opacity .15s; }
    .dock:hover svg { opacity: 1; }

    /* ---------- 分享面板 ---------- */
    .panel {
      pointer-events: auto;
      position: fixed;
      z-index: 2147483646;
      width: 480px;
      max-width: calc(100vw - 24px);
      background: var(--sq-surface);
      border-radius: 28px;
      padding: 16px;
      box-shadow: var(--sq-elev-shadow);
      animation: panel-in .22s cubic-bezier(.05,.7,.1,1);
    }
    @keyframes panel-in {
      from { opacity: 0; transform: translateY(8px) scale(.96); }
    }
    .preview {
      position: relative;
      border-radius: 16px;
      overflow: hidden;
      background: var(--sq-preview-bg);
      aspect-ratio: 21 / 9;
    }
    .preview canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      display: block;
      opacity: 0;
      transition: opacity .25s;
    }
    .preview.ready canvas { opacity: 1; }
    .skeleton {
      position: absolute;
      inset: 0;
      background: linear-gradient(100deg, var(--sq-skeleton-a) 30%, var(--sq-skeleton-b) 50%, var(--sq-skeleton-a) 70%);
      background-size: 200% 100%;
      animation: shimmer 1.15s linear infinite;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .preview.ready .skeleton { display: none; }
    .skeleton span { font-size: 12px; color: var(--sq-hint); letter-spacing: .3px; }
    @keyframes shimmer { to { background-position: -200% 0; } }

    .actions { display: flex; gap: 12px; margin-top: 16px; }
    .btn {
      flex: 1;
      height: 40px;
      border: none;
      border-radius: 20px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      font-size: 14px;
      font-weight: 500;
      letter-spacing: .1px;
      cursor: pointer;
      position: relative;
      transition: box-shadow .2s cubic-bezier(.2,0,0,1), opacity .2s;
    }
    .btn::after {
      content: '';
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: currentColor;
      opacity: 0;
      transition: opacity .15s;
    }
    .btn:hover::after { opacity: .08; }
    .btn:active::after { opacity: .12; }
    .btn:disabled { opacity: .4; cursor: default; }
    .btn.filled { background: var(--sq-primary); color: var(--sq-on-primary); }
    .btn.tonal { background: var(--sq-tonal-container); color: var(--sq-on-tonal-container); }

    .editor {
      overflow: hidden;
      max-height: 0;
      opacity: 0;
      margin-top: 0;
      transition: max-height .25s cubic-bezier(.2,0,0,1), opacity .2s, margin-top .25s cubic-bezier(.2,0,0,1);
    }
    .editor.open { max-height: 76px; opacity: 1; margin-top: 16px; }
    .field {
      display: flex;
      align-items: center;
      gap: 8px;
      height: 52px;
      border: 1px solid var(--sq-outline);
      border-radius: 8px;
      padding: 0 6px 0 14px;
      color: var(--sq-on-surface-variant);
      transition: border-color .15s, box-shadow .15s;
    }
    .field:focus-within { border-color: var(--sq-primary); box-shadow: inset 0 0 0 1px var(--sq-primary); }
    .field.error { border-color: var(--sq-error); box-shadow: inset 0 0 0 1px var(--sq-error); }
    .field input {
      flex: 1;
      min-width: 0;
      height: 100%;
      border: none;
      outline: none;
      background: transparent;
      font-size: 14px;
      color: var(--sq-on-surface);
    }
    .field input::placeholder { color: var(--sq-hint); }
    .icon-btn {
      flex: none;
      width: 40px; height: 40px;
      border: none;
      border-radius: 50%;
      background: transparent;
      color: var(--sq-primary);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: background .15s;
    }
    .icon-btn:hover { background: var(--sq-hover); }

    /* ---------- Snackbar ---------- */
    .snackbar {
      pointer-events: none;
      position: fixed;
      z-index: 2147483647;
      left: 50%;
      bottom: 28px;
      transform: translateX(-50%) translateY(16px);
      height: 48px;
      padding: 0 20px;
      border-radius: 8px;
      background: var(--sq-snackbar-bg);
      color: var(--sq-snackbar-text);
      font-size: 14px;
      display: flex;
      align-items: center;
      white-space: nowrap;
      max-width: calc(100vw - 48px);
      overflow: hidden;
      text-overflow: ellipsis;
      opacity: 0;
      box-shadow: var(--sq-elev-shadow);
      transition: opacity .2s, transform .2s cubic-bezier(.2,0,0,1);
    }
    .snackbar.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .snackbar.error { background: var(--sq-error-bg); color: var(--sq-error-text); }
  `;

  /* ============================ DOM ============================ */

  const host = document.createElement('div');
  host.id = 'simpshare-host';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;top:0;left:0;width:0;height:0;pointer-events:none;';
  (document.documentElement || document.body).appendChild(host);
  const root = host.attachShadow({ mode: 'open' });
  try {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(CSS);
    root.adoptedStyleSheets = [sheet];
  } catch (e) {
    const styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    root.appendChild(styleEl);
  }
  root.innerHTML = `
    <div class="root">
      <button class="fab" title="SimpShare：点击生成分享图，拖动可吸附到屏幕边缘">${ICONS.share}</button>
      <button class="dock right" hidden title="点击恢复分享按钮">${ICONS.chevronLeft}</button>
      <div class="panel" hidden>
        <div class="preview">
          <div class="skeleton"><span>正在生成分享图…</span></div>
          <canvas width="1050" height="450"></canvas>
        </div>
        <div class="actions">
          <button class="btn filled copy">${ICONS.copy}<span>复制图片</span></button>
          <button class="btn tonal edit">${ICONS.edit}<span>修改链接</span></button>
        </div>
        <div class="editor">
          <div class="field">
            ${ICONS.link}
            <input type="text" spellcheck="false" placeholder="输入要分享的链接，回车提交" />
            <button class="icon-btn ok" title="提交并重新生成">${ICONS.check}</button>
          </div>
        </div>
      </div>
      <div class="snackbar"></div>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  const fab = $('.fab');
  const dock = $('.dock');
  const panel = $('.panel');
  const previewBox = $('.preview');
  const previewCanvas = $('.preview canvas');
  const copyBtn = $('.btn.copy');
  const editBtn = $('.btn.edit');
  const editor = $('.editor');
  const field = $('.field');
  const urlInput = $('.field input');
  const okBtn = $('.icon-btn.ok');
  const snackbar = $('.snackbar');

  /* ============================ 状态 ============================ */

  const FAB_SIZE = 56;
  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const vw = () => window.innerWidth || document.documentElement.clientWidth;
  const vh = () => window.innerHeight || document.documentElement.clientHeight;

  let pos = { x: vw() - FAB_SIZE - 24, y: 84 };   // FAB 左上角
  let docked = false;
  let dockSide = 'right';
  let panelOpen = false;
  let meta = null;          // 当前分享卡元信息（含 dataURL）
  let genToken = 0;
  let copyBusy = false;
  let snackbarTimer = null;
  const metaCache = new Map();      // url -> meta
  const faviconCache = new Map();   // origin -> dataURL

  /* ============================ 基础工具 ============================ */

  function sendBg(payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(payload, (r) => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(r || { ok: false, error: 'no response' });
        });
      } catch (e) {
        resolve({ ok: false, error: String(e && e.message || e) });
      }
    });
  }

  function toast(msg, isError) {
    snackbar.textContent = msg;
    snackbar.classList.toggle('error', !!isError);
    snackbar.classList.add('show');
    clearTimeout(snackbarTimer);
    snackbarTimer = setTimeout(() => snackbar.classList.remove('show'), 2400);
  }

  function saveLayout() {
    try { chrome.storage.local.set({ simpshareLayout: { pos, docked, dockSide } }); } catch (e) { /* ignore */ }
  }

  function applyFab() {
    fab.style.left = pos.x + 'px';
    fab.style.top = pos.y + 'px';
  }

  function applyDock() {
    dock.classList.toggle('right', dockSide === 'right');
    dock.classList.toggle('left', dockSide === 'left');
    dock.innerHTML = dockSide === 'right' ? ICONS.chevronLeft : ICONS.chevronRight;
    dock.style.top = clamp(pos.y, 8, vh() - 72) + 'px';
  }

  /* ============================ 规则加载（GKD 风格订阅文件） ============================ */

  const RULES_URL = chrome.runtime.getURL('src/rules/rules.json');
  let rulesLoading = null;
  function ensureRules() {
    if (!rulesLoading) rulesLoading = SimpShareRules.loadOnce(RULES_URL);
    return rulesLoading;
  }

  /* ============================ MAIN world 状态获取 ============================ */

  /** 按规则声明的 spec（source + paths）让 MAIN world 取状态字段，返回"路径 → 值"映射 */
  function requestMainState(spec, timeout) {
    return new Promise((resolve) => {
      const id = Math.random().toString(36).slice(2);
      let done = false;
      const finish = (v) => { if (!done) { done = true; window.removeEventListener('message', onMsg); clearTimeout(t); resolve(v); } };
      const onMsg = (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (d && d.source === 'simpshare-main' && d.id === id) finish(d.values || null);
      };
      const t = setTimeout(() => finish(null), timeout || 1200);
      window.addEventListener('message', onMsg);
      try { window.postMessage({ source: 'simpshare-page', type: 'GET_STATE', id: id, spec: spec }, '*'); }
      catch (e) { finish(null); }
    });
  }

  /* ============================ 元信息提取 ============================ */

  function collectFaviconCandidates() {
    const urls = [];
    for (const l of document.querySelectorAll('link[href]')) {
      const rel = (l.getAttribute('rel') || '').toLowerCase();
      if (/icon|apple-touch/.test(rel)) {
        try { urls.push(new URL(l.getAttribute('href'), location.href).href); } catch (e) { /* ignore */ }
      }
    }
    try { urls.push(new URL('/favicon.ico', location.origin).href); } catch (e) { /* ignore */ }
    return urls.slice(0, 6);
  }

  function ogFromDom() {
    // 选择器优先级由规则订阅文件的 metaTags 声明
    const sels = SimpShareRules.metaSelectors();
    const g = (sel) => { const el = document.querySelector(sel); return el ? (el.getAttribute('content') || '').trim() : ''; };
    const first = (list) => { for (const s of list) { const v = g(s); if (v) return v; } return ''; };
    // og:image 常为相对路径，解析为绝对 URL 供后台抓取
    let coverUrl = first(sels.image) || null;
    if (coverUrl) {
      try { coverUrl = new URL(coverUrl, location.href).href; } catch (e) { /* 保持原值 */ }
    }
    return {
      title: first(sels.title) || document.title || '',
      description: first(sels.description),
      coverUrl: coverUrl
    };
  }

  function isSamePage(url) {
    try {
      const u = new URL(url);
      return u.origin === location.origin && u.pathname === location.pathname && u.search === location.search;
    } catch (e) { return false; }
  }

  function mergeFields(base, fields) {
    if (!fields) return;
    if (fields.title) base.title = fields.title;
    if (fields.description) base.description = fields.description;
    if (fields.coverUrl) base.coverUrl = fields.coverUrl;
  }

  async function fetchFaviconData(meta, url) {
    const origin = (() => { try { return new URL(url).origin; } catch (e) { return ''; } })();
    if (origin && faviconCache.has(origin)) return faviconCache.get(origin);
    const candidates = (meta.faviconCandidates || []).slice(0, 3);
    try { candidates.push(new URL('/favicon.ico', url).href); } catch (e) { /* ignore */ }
    let dataUrl = null;
    for (const u of candidates) {
      const r = await sendBg({ type: 'FETCH_IMAGE', url: u });
      if (r.ok && r.dataUrl && r.dataUrl.length < 1200000) { dataUrl = r.dataUrl; break; }
    }
    if (origin) faviconCache.set(origin, dataUrl);
    return dataUrl;
  }

  function normalizeInputUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return null;
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = 'https://' + u;
    let parsed;
    try { parsed = new URL(u); } catch (e) { return null; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.href;
  }

  async function buildMeta(url) {
    await ensureRules().catch(() => { /* 规则加载失败时走通用 meta 兜底 */ });
    const rule = SimpShareRules.match(url);
    const samePage = isSamePage(url);
    let base;

    if (samePage) {
      // 本页：head <meta> 为基础，规则声明的状态/API 提取按需叠加
      const og = ogFromDom();
      base = {
        title: (og.title || '').slice(0, 300),
        description: og.description || '',
        coverUrl: og.coverUrl || null,
        faviconCandidates: collectFaviconCandidates()
      };
      if (rule && rule.extract && rule.extract.state) {
        const spec = SimpShareRules.stateSpec(rule);
        if (spec) {
          const values = await requestMainState(spec);
          if (values) mergeFields(base, SimpShareRules.extractFromValues(spec, values));
        }
      }
      if (rule && rule.extract && rule.extract.api) {
        const r = await sendBg({ type: 'RUN_RULE_API', url: url });
        if (r && r.ok && r.fields) mergeFields(base, r.fields);
      }
      SimpShareRules.applyTransforms(rule, base, url);
    } else {
      // 自定义链接：后台抓取 HTML / API 完成提取（含规则变换）
      const r = await sendBg({ type: 'EXTRACT_URL', url: url });
      base = (r && r.ok && r.meta)
        ? r.meta
        : { title: url, description: '', coverUrl: null, faviconCandidates: [] };
    }

    const coverDataUrl = base.coverUrl
      ? ((await sendBg({ type: 'FETCH_IMAGE', url: base.coverUrl, referer: url })).dataUrl || null)
      : null;
    const faviconDataUrl = await fetchFaviconData(base, url);

    // 未适配站点也允许从 head <meta> 取封面（behavior.ogForUnmatchedSites）
    const m = {
      title: base.title || url,
      description: base.description || '',
      coverDataUrl: coverDataUrl,
      faviconDataUrl: faviconDataUrl,
      url: url,
      hasCover: !!coverDataUrl && (rule ? true : SimpShareRules.allowUnmatchedCover())
    };
    // 站点专属卡片渲染提示（如 GitHub：封面不裁切、不绘制简介模块）
    if (rule && rule.card) Object.assign(m, rule.card);
    return m;
  }

  async function getMetaFor(url) {
    if (metaCache.has(url)) return metaCache.get(url);
    const m = await buildMeta(url);
    metaCache.set(url, m);
    if (metaCache.size > 24) metaCache.delete(metaCache.keys().next().value);
    return m;
  }

  /* ============================ 渲染 ============================ */

  async function renderFor(url) {
    const t = ++genToken;
    previewBox.classList.remove('ready');
    copyBtn.disabled = true;
    try {
      const m = await getMetaFor(url);
      if (t !== genToken || !panelOpen) return;
      meta = m;
      if (document.activeElement !== urlInput) urlInput.value = m.url;
      await SimpShareRender.drawCard(previewCanvas, m, 0.5);
      if (t !== genToken || !panelOpen) return;
      previewBox.classList.add('ready');
      copyBtn.disabled = false;
    } catch (e) {
      if (t === genToken) toast('分享图生成失败：' + (e && e.message || e), true);
    }
  }

  /* ============================ 面板 ============================ */

  function positionPanel() {
    const pw = panel.offsetWidth || 480;
    const ph = panel.offsetHeight || 300;
    const margin = 12;
    let x = pos.x + FAB_SIZE / 2 - pw / 2;
    x = clamp(x, margin, vw() - pw - margin);
    let y = pos.y + FAB_SIZE + 12;
    if (y + ph > vh() - margin) y = pos.y - ph - 12;
    y = clamp(y, margin, Math.max(margin, vh() - ph - margin));
    panel.style.left = x + 'px';
    panel.style.top = y + 'px';
  }

  function openPanel() {
    panel.hidden = false;
    panelOpen = true;
    editBtn.classList.remove('open-state');
    editor.classList.remove('open');
    field.classList.remove('error');
    positionPanel();
    renderFor(location.href);
  }

  function closePanel() {
    panel.hidden = true;
    panelOpen = false;
    genToken++;               // 作废进行中的生成
    editor.classList.remove('open');
    field.classList.remove('error');
  }

  function togglePanel() {
    if (panelOpen) closePanel(); else openPanel();
  }

  /* ============================ 复制图片 ============================ */

  async function onCopy() {
    if (!meta || copyBusy) return;
    copyBusy = true;
    copyBtn.disabled = true;
    try {
      const canvas = document.createElement('canvas');
      await SimpShareRender.drawCard(canvas, meta, 1);   // 高清版重新生成（2100×900）
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
      let ok = false;
      if (navigator.clipboard && typeof ClipboardItem !== 'undefined' && document.hasFocus()) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          ok = true;
        } catch (e) { /* 兜底 */ }
      }
      if (!ok) {
        const r = await sendBg({ type: 'COPY_IMAGE', dataUrl: canvas.toDataURL('image/png') });
        ok = !!(r && r.ok);
        if (!ok) throw new Error((r && r.error) || 'clipboard unavailable');
      }
      toast('已复制分享图到剪贴板');
    } catch (e) {
      toast('复制失败：' + (e && e.message || e), true);
    }
    copyBusy = false;
    copyBtn.disabled = !meta;
  }

  /* ============================ 修改链接 ============================ */

  async function submitUrl() {
    const url = normalizeInputUrl(urlInput.value);
    if (!url) {
      field.classList.add('error');
      toast('请输入有效的链接（http/https）', true);
      return;
    }
    field.classList.remove('error');
    editor.classList.remove('open');
    await renderFor(url);
    if (panelOpen && genToken > 0) toast('已更新链接并重新生成分享图');
  }

  /* ============================ 拖拽 / 吸附 ============================ */

  let drag = null;

  function maybeSnap() {
    const snapMargin = 32;
    if (pos.x <= snapMargin) return dockFab('left');
    if (pos.x >= vw() - FAB_SIZE - snapMargin) return dockFab('right');
  }

  function dockFab(side) {
    docked = true;
    dockSide = side;
    fab.hidden = true;
    dock.hidden = false;
    if (panelOpen) closePanel();
    applyDock();
    saveLayout();
  }

  function undock() {
    docked = false;
    dock.hidden = true;
    pos.x = dockSide === 'left' ? 36 : vw() - FAB_SIZE - 36;
    pos.y = clamp(parseFloat(dock.style.top) || pos.y, 8, vh() - FAB_SIZE - 8);
    fab.hidden = false;
    applyFab();
    saveLayout();
  }

  fab.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    drag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    try { fab.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  });

  fab.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) > 6) {
      drag.moved = true;
      fab.classList.add('dragging');
      if (panelOpen) closePanel();
    }
    if (drag.moved) {
      pos.x = clamp(drag.ox + dx, 0, vw() - FAB_SIZE);
      pos.y = clamp(drag.oy + dy, 0, vh() - FAB_SIZE);
      applyFab();
    }
  });

  fab.addEventListener('pointerup', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const wasDrag = drag.moved;
    drag = null;
    fab.classList.remove('dragging');
    if (wasDrag) {
      maybeSnap();
      saveLayout();
    } else {
      togglePanel();
    }
  });

  fab.addEventListener('pointercancel', () => {
    drag = null;
    fab.classList.remove('dragging');
  });

  dock.addEventListener('click', undock);

  window.addEventListener('resize', () => {
    pos.x = clamp(pos.x, 0, vw() - FAB_SIZE);
    pos.y = clamp(pos.y, 0, vh() - FAB_SIZE);
    if (docked) applyDock(); else applyFab();
    if (panelOpen) positionPanel();
  });

  /* ============================ 面板事件 ============================ */

  // 浏览器深浅色模式切换时，实时重绘当前预览
  try {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (panelOpen && meta) {
        previewBox.classList.remove('ready');
        SimpShareRender.drawCard(previewCanvas, meta, 0.5)
          .then(() => { if (panelOpen) previewBox.classList.add('ready'); })
          .catch(() => { if (panelOpen) previewBox.classList.add('ready'); });
      }
    });
  } catch (e) { /* 旧浏览器不支持 */ }

  copyBtn.addEventListener('click', onCopy);

  editBtn.addEventListener('click', () => {
    if (!meta) return;
    const opening = !editor.classList.contains('open');
    editor.classList.toggle('open', opening);
    field.classList.remove('error');
    if (opening) {
      urlInput.value = meta.url;
      urlInput.focus();
      urlInput.select();
    }
  });

  okBtn.addEventListener('click', submitUrl);
  urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submitUrl(); }
    else if (e.key === 'Escape') { editor.classList.remove('open'); field.classList.remove('error'); }
  });
  urlInput.addEventListener('input', () => field.classList.remove('error'));

  /* ============================ 初始化 ============================ */

  (async function init() {
    // 预热规则订阅文件（失败不阻塞，buildMeta 时会再尝试）
    ensureRules().catch(() => { });
    let layout = null;
    try {
      const st = await chrome.storage.local.get('simpshareLayout');
      layout = st && st.simpshareLayout;
    } catch (e) { /* ignore */ }
    if (layout && layout.pos) {
      pos = layout.pos;
      docked = !!layout.docked;
      dockSide = layout.dockSide === 'left' ? 'left' : 'right';
    }
    pos.x = clamp(pos.x, 0, Math.max(0, vw() - FAB_SIZE));
    pos.y = clamp(pos.y, 0, Math.max(0, vh() - FAB_SIZE));
    if (docked) { fab.hidden = true; dock.hidden = false; applyDock(); }
    else { applyFab(); }
  })();
})();
