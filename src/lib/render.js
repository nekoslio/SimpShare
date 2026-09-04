/*!
 * SimpShare 分享卡片渲染器（Canvas）
 * 设计稿：2100 × 900（严格 21:9），分浅色 / 深色两套配色（跟随浏览器 prefers-color-scheme）。
 * 三个区域：
 *   顶部：站点图标 + 页面标题（加粗放大，四周留白）
 *   左下：封面图（规则内站点）或大二维码（规则外站点） + 右侧简介
 *   右下：当前链接的二维码（仅规则内站点，较小但可识别）
 * 特殊元信息（由站点规则写入 meta）：
 *   meta.containCover = true  → 封面按原始比例完整展示，绝不裁切（GitHub 社交卡片）
 *   meta.hideDesc     = true  → 不绘制简介模块（封面图中已含简介文字时使用）
 * 只依赖全局 qrcode（qrcode-generator）。被 content script 与测试页共同使用。
 */
(function (global) {
  'use strict';

  const W = 2100, H = 900;
  const MARGIN = 96;
  const TILE = 88;                 // 图标圆角方块边长
  const TITLE_Y = MARGIN;          // 标题行起始 y
  const GAP = 64;                  // 标题行与内容区的间距
  const CONTENT_Y = TITLE_Y + TILE + GAP;
  const CH = H - MARGIN - CONTENT_Y;   // 内容区高度 556
  const QR_SIDE = 400;             // 右下角二维码边长
  const QR_SIDE_BIG = 460;         // 无封面时封面位二维码边长
  const DESC_FONT = 42;
  const DESC_LH = 62;
  const DESC_MAX_LINES = Math.floor(CH / DESC_LH) > 8 ? 8 : Math.floor(CH / DESC_LH);

  /* 浅色 / 深色两套配色（二维码底永远保持白色以保证识别率） */
  const PALETTES = {
    light: {
      bg: '#FFFFFF', title: '#1C1B1F', desc: '#49454F',
      tileBgMode: 'light', qrBox: '#FFFFFF', qrDark: '#1C1B1F',
      tagBg: '#D3E3FD', tagFg: '#041E49'
    },
    dark: {
      bg: '#1C1B1F', title: '#E6E1E9', desc: '#CAC4D0',
      tileBgMode: 'dark', qrBox: '#FFFFFF', qrDark: '#1C1B1F',
      tagBg: '#A8C7FA', tagFg: '#062E6F'
    }
  };

  const FONT_STACK = 'Roboto, "Segoe UI", system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif';

  function detectTheme() {
    try {
      if (typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches) return 'dark';
    } catch (e) { /* ignore */ }
    return 'light';
  }

  /* ---------------- 基础工具 ---------------- */

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { reject(new Error('image load failed')); };
      img.src = src;
    });
  }

  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = ((h * 31 + s.charCodeAt(i)) | 0);
    return Math.abs(h);
  }

  function hostOf(url) {
    try { return new URL(url).hostname || 'web'; } catch (e) { return 'web'; }
  }

  /** cover-fit 裁剪绘制（圆角）；当盒子比例与图片一致时即无损完整绘制 */
  function drawCoverImage(ctx, img, x, y, w, h, radius) {
    ctx.save();
    roundRectPath(ctx, x, y, w, h, radius);
    ctx.clip();
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (iw > 0 && ih > 0) {
      const ir = iw / ih, br = w / h;
      let dw, dh;
      if (ir > br) { dh = h; dw = h * ir; } else { dw = w; dh = w / ir; }
      ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
    }
    ctx.restore();
  }

  /** contain 绘制（不裁剪） */
  function drawContainImage(ctx, img, x, y, w, h) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    if (!(iw > 0 && ih > 0)) return;
    const s = Math.min(w / iw, h / ih);
    const dw = iw * s, dh = ih * s;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function ellipsisLine(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) return text;
    let lo = 0, hi = text.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid + 1;
      else hi = mid;
    }
    return text.slice(0, Math.max(0, lo - 1)) + '…';
  }

  /** 逐字换行（支持 \n 段落），超出行数尾部省略 */
  function wrapText(ctx, text, maxW, maxLines) {
    const lines = [];
    const paragraphs = String(text || '').split(/\n/);
    for (let p = 0; p < paragraphs.length && lines.length < maxLines; p++) {
      const rest = paragraphs[p].replace(/\s+$/g, '');
      if (!rest.length) { if (lines.length) lines.push(''); continue; }
      let cur = '';
      for (const ch of rest) {
        const next = cur + ch;
        if (ctx.measureText(next).width > maxW && cur) {
          lines.push(cur);
          if (lines.length >= maxLines) break;
          cur = ch;
        } else {
          cur = next;
        }
      }
      if (lines.length < maxLines && cur) lines.push(cur);
      if (lines.length >= maxLines) break;
    }
    const truncated = lines.length >= maxLines &&
      paragraphs.some(function (s) { return s.length > 0; });
    return { lines: lines, truncated: truncated };
  }

  /* ---------------- 二维码 ---------------- */

  let utf8Patched = false;
  function makeQR(text) {
    if (typeof qrcode === 'undefined') return null;
    if (!utf8Patched) {
      try {
        if (qrcode.stringToBytesFuncs && qrcode.stringToBytesFuncs['UTF-8']) {
          qrcode.stringToBytes = qrcode.stringToBytesFuncs['UTF-8'];
        }
      } catch (e) { /* ignore */ }
      utf8Patched = true;
    }
    try {
      const qr = qrcode(0, 'M');
      qr.addData(String(text), 'Byte');
      qr.make();
      return qr;
    } catch (e) {
      try {
        const qr2 = qrcode(0, 'L');
        qr2.addData(String(text), 'Byte');
        qr2.make();
        return qr2;
      } catch (e2) { return null; }
    }
  }

  /** 在 (x,y,size) 区域内绘制二维码（含 4 模块静区，白底黑码，任何主题下均可识别） */
  function drawQR(ctx, text, x, y, size) {
    const qr = makeQR(text);
    if (!qr) return false;
    const n = qr.getModuleCount();
    const quiet = 4;
    const total = n + quiet * 2;
    const m = size / total;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#1C1B1F';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(x + (c + quiet) * m, y + (r + quiet) * m, m + 0.6, m + 0.6);
        }
      }
    }
    return true;
  }

  /* ---------------- 卡片绘制 ---------------- */

  function drawFaviconTile(ctx, meta, img, x, y, s, pal) {
    const host = hostOf(meta.url);
    const hue = hashStr(host) % 360;
    roundRectPath(ctx, x, y, s, s, 22);
    if (pal.tileBgMode === 'dark') {
      ctx.fillStyle = 'hsl(' + hue + ', 28%, 24%)';
      ctx.fill();
      if (img) {
        drawCoverImage(ctx, img, x, y, s, s, 22);
      } else {
        const letter = (host.replace(/^www\./, '')[0] || 'W').toUpperCase();
        ctx.fillStyle = 'hsl(' + hue + ', 65%, 78%)';
        ctx.font = '700 ' + Math.round(s * 0.5) + 'px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, x + s / 2, y + s / 2 + s * 0.02);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    } else {
      ctx.fillStyle = 'hsl(' + hue + ', 60%, 92%)';
      ctx.fill();
      if (img) {
        drawCoverImage(ctx, img, x, y, s, s, 22);
      } else {
        const letter = (host.replace(/^www\./, '')[0] || 'W').toUpperCase();
        ctx.fillStyle = 'hsl(' + hue + ', 45%, 36%)';
        ctx.font = '700 ' + Math.round(s * 0.5) + 'px ' + FONT_STACK;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(letter, x + s / 2, y + s / 2 + s * 0.02);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'alphabetic';
      }
    }
  }

  /**
   * 绘制分享卡片。
   * @param theme 'light' | 'dark'；缺省时跟随浏览器 prefers-color-scheme
   */
  async function drawCard(canvas, meta, scale, theme) {
    scale = scale || 1;
    const pal = PALETTES[theme] || PALETTES[detectTheme()] || PALETTES.light;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    // 背景
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    // 图片素材（dataURL，绝不污染画布）
    let coverImg = null, favImg = null;
    try { if (meta.coverDataUrl) coverImg = await loadImage(meta.coverDataUrl); } catch (e) { coverImg = null; }
    try { if (meta.faviconDataUrl) favImg = await loadImage(meta.faviconDataUrl); } catch (e) { favImg = null; }

    // ---- 顶部：图标 + 标题 ----
    drawFaviconTile(ctx, meta, favImg, MARGIN, TITLE_Y, TILE, pal);
    const titleX = MARGIN + TILE + 28;
    ctx.font = '700 72px ' + FONT_STACK;
    ctx.fillStyle = pal.title;
    ctx.textBaseline = 'top';
    ctx.fillText(ellipsisLine(ctx, meta.title || '', W - MARGIN - titleX), titleX, TITLE_Y + (TILE - 72) / 2 + 4);
    ctx.textBaseline = 'alphabetic';

    // ---- 内容区 ----
    const hasCover = !!coverImg && meta.hasCover !== false;
    const qrText = meta.url || '';

    if (hasCover) {
      const iw = coverImg.naturalWidth || coverImg.width, ih = coverImg.naturalHeight || coverImg.height;
      const ar = (iw > 0 && ih > 0) ? iw / ih : 4 / 3;

      // 右下角二维码位置（规则内站点固定）
      const qrX = W - MARGIN - QR_SIDE;
      drawQR(ctx, qrText, qrX, CONTENT_Y + (CH - QR_SIDE) / 2, QR_SIDE);

      if (meta.containCover) {
        // 不裁切：按原始比例完整放入（简介模块按需省略，可用宽度更大）
        const availW = meta.hideDesc
          ? W - MARGIN * 2 - QR_SIDE - 64
          : W - MARGIN * 2 - QR_SIDE - 64 - 360;
        let bw = Math.min(CH * ar, availW);
        let bh = bw / ar;
        if (bh > CH) { bh = CH; bw = bh * ar; }
        const by = CONTENT_Y + (CH - bh) / 2;
        drawCoverImage(ctx, coverImg, MARGIN, by, bw, bh, 28);
        if (!meta.hideDesc) {
          const descX = MARGIN + bw + 64;
          drawDesc(ctx, meta.description, descX, (qrX - 64) - descX, pal);
        }
      } else {
        // 封面：高度撑满内容区，宽度按图片比例自适应（420 ~ 900），等比裁切
        const cw = Math.max(420, Math.min(900, Math.round(CH * ar)));
        drawCoverImage(ctx, coverImg, MARGIN, CONTENT_Y, cw, CH, 28);
        const descX = MARGIN + cw + 64;
        drawDesc(ctx, meta.description, descX, (qrX - 64) - descX, pal);
      }
    } else {
      // 规则外 / 无封面：封面位绘制大二维码，右侧简介不变，右下角二维码取消
      drawQR(ctx, qrText, MARGIN, CONTENT_Y + (CH - QR_SIDE_BIG) / 2, QR_SIDE_BIG);
      const descX = MARGIN + QR_SIDE_BIG + 64;
      drawDesc(ctx, meta.description, descX, W - MARGIN - descX, pal);
    }

    // ---- 右下角 URL 标注 ----
    // 以链接文本末端（右下角顶点）距卡片右/下边缘各 48 的固定距离为锚点右对齐；
    // 可用宽度被限制在左右页边距之间，链接过长会与其他控件冲突时改用提示文案。
    drawUrlCaption(ctx, meta.url, pal);
    if (meta.rewritten) drawRewrittenTag(ctx, pal);
    return canvas;
  }

  function drawUrlCaption(ctx, url, pal) {
    const text = String(url || '');
    if (!text) return;
    const anchorRight = W - 48;
    const anchorBottom = H - 48;
    const maxW = anchorRight - MARGIN;
    ctx.font = '400 34px ' + FONT_STACK;
    ctx.fillStyle = pal.desc;
    let line = text;
    if (ctx.measureText(text).width > maxW) {
      line = 'url过长，请扫描二维码';
    }
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(line, anchorRight, anchorBottom);
    ctx.textAlign = 'left';
  }

  /** 在 URL 标注上方绘制"已改写"药丸（M3 primary-container 配色） */
  function drawRewrittenTag(ctx, pal) {
    const text = '已改写';
    const font = 26;
    const padX = 18, padY = 10;
    ctx.font = '500 ' + font + 'px ' + FONT_STACK;
    const tw = ctx.measureText(text).width;
    const w = Math.round(tw + padX * 2);
    const h = Math.round(font + padY * 2);
    // 右对齐到 URL 标注的右下锚点（W-48），位于其上方
    const x = W - 48 - w;
    const y = H - 48 - h - 18;
    ctx.fillStyle = pal.tagBg;
    roundRectPath(ctx, x, y, w, h, h / 2);
    ctx.fill();
    ctx.fillStyle = pal.tagFg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2 + 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  }

  function drawDesc(ctx, text, x, w, pal) {
    if (!text || w <= 40) return;
    ctx.font = '400 ' + DESC_FONT + 'px ' + FONT_STACK;
    ctx.fillStyle = pal.desc;
    const wrapped = wrapText(ctx, text, w, DESC_MAX_LINES);
    const blockH = wrapped.lines.length * DESC_LH;
    const y0 = CONTENT_Y + Math.max(0, (CH - blockH) / 2);
    ctx.textBaseline = 'top';
    for (let i = 0; i < wrapped.lines.length; i++) {
      let line = wrapped.lines[i];
      if (i === wrapped.lines.length - 1 && wrapped.truncated && line) line = ellipsisLine(ctx, line + '…', w);
      ctx.fillText(line, x, y0 + i * DESC_LH);
    }
    ctx.textBaseline = 'alphabetic';
  }

  global.SimpShareRender = {
    W: W,
    H: H,
    drawCard: drawCard,
    drawQR: drawQR,
    makeQR: makeQR,
    detectTheme: detectTheme
  };
})(typeof self !== 'undefined' ? self : globalThis);
