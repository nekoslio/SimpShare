/**
 * 规则内站点批量复核脚本
 * 用与 background service worker 相同的方式抓取每个站点的样本 URL，
 * 检查 og:title / og:image / og:description 是否可提取、封面图是否可下载。
 * 用法：node tools/review-sites.js [仅检查的站点id...]
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');

/* 与 SW 一致的解析逻辑 */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…' };
function decodeEntities(s) {
  return String(s || '').replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, e) => {
    if (e[0] === '#') {
      const n = (e[1] === 'x' || e[1] === 'X') ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] || m;
  });
}
function metaGet(html, keys) {
  for (const t of (html.match(/<meta\b[^>]*>/gi) || [])) {
    const attr = (n) => { const m = t.match(new RegExp(n + '\\s*=\\s*("([^"]*)"|\'([^\']*)\')', 'i')); return m ? (m[2] !== undefined ? m[2] : m[3]) : ''; };
    const k = (attr('property') || attr('name') || attr('itemprop')).toLowerCase();
    if (keys.includes(k)) {
      const v = attr('content');
      if (v) return v;
    }
  }
  return '';
}
function extractAssignedObject(html, varName) {
  const i = html.indexOf(varName);
  if (i < 0) return null;
  const start = html.indexOf('{', i);
  if (start < 0) return null;
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let j = start; j < html.length && j - start < 4000000; j++) {
    const c = html[j];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { end = j + 1; break; } }
  }
  if (end < 0) return null;
  try { return JSON.parse(html.slice(start, end)); } catch (e) { return null; }
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

async function checkSite(site, sample) {
  const result = { id: site, url: sample, ok: false, http: null, title: '', hasCover: false, cover: '', note: '' };
  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 20000);
    const r = await fetch(sample, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8', 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' },
      redirect: 'follow',
      signal: ac.signal
    });
    clearTimeout(timer);
    result.http = r.status;
    if (!r.ok) { result.note = 'HTTP ' + r.status; return result; }
    const html = (await r.text()).slice(0, 3000000);

    // 规则匹配确认（规则来自 GKD 风格订阅文件 rules.json）
    const matched = vm.runInContext(`SimpShareRules.match(${JSON.stringify(sample)})`, ctx);
    result.ruleMatched = !!matched;
    result.ruleId = matched ? matched.id : null;
    if (!matched) { result.note = '规则未命中'; return result; }

    // 站点特化提取（与 SW 相同）
    let title = '', cover = '', desc = '';
    if (matched.id === 'bilibili-video') {
      const v = (extractAssignedObject(html, '__INITIAL_STATE__') || {}).videoData;
      if (v) { title = v.title; cover = (v.pic || '').replace(/^http:/, 'https:'); desc = v.desc; }
    } else if (matched.id === 'youtube') {
      const vd = (extractAssignedObject(html, 'ytInitialPlayerResponse') || {}).videoDetails;
      if (vd) { title = vd.title; cover = (vd.thumbnail || {}).thumbnails && vd.thumbnail.thumbnails.slice(-1)[0].url; desc = (vd.shortDescription || '').slice(0, 80); }
    } else if (matched.id === 'bilibili-read') {
      // 专栏壳页无数据，走开放 API（与规则 extract.api 声明一致）
      const m = sample.match(/\/read\/(?:cv|mobile\?id=cv)?(\d+)/);
      if (m) {
        const r2 = await fetch('https://api.bilibili.com/x/article/view?id=' + m[1], { headers: { 'User-Agent': UA } });
        const d2 = (await r2.json()).data;
        if (d2 && d2.title) {
          title = d2.title; cover = d2.banner_url || (d2.image_urls || [])[0] || '';
          desc = ((d2.author || {}).name ? 'UP主：' + d2.author.name + '\n' : '') + (d2.summary || '').slice(0, 80);
        }
      }
    } else if (matched.id === 'bilibili-opus') {
      const d = (extractAssignedObject(html, '__INITIAL_STATE__') || {}).detail || {};
      if (d.basic && d.basic.title) {
        title = d.basic.title;
        const texts = [], pics = [];
        let author = '';
        for (const mo of (d.modules || [])) {
          if (mo.module_author && mo.module_author.name) author = mo.module_author.name;
          for (const pa of ((mo.module_content || {}).paragraphs || [])) {
            for (const nd of ((pa.text || {}).nodes || [])) {
              if (nd.word && nd.word.words) texts.push(nd.word.words);
              if (nd.pic && nd.pic.url) pics.push(nd.pic.url);
            }
          }
        }
        cover = pics[0] || '';
        desc = (author ? 'UP主：' + author + '\n' : '') + texts.join('').slice(0, 80);
      }
    }
    if (!title) title = decodeEntities(metaGet(html, ['og:title', 'twitter:title']));
    if (!cover) cover = metaGet(html, ['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src']);
    if (!cover) cover = metaGet(html, ['image']) ? metaGet(html, ['image']) : '';
    if (!desc) desc = decodeEntities(metaGet(html, ['og:description', 'twitter:description', 'description']));
    if (!title) {
      const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      title = m ? decodeEntities(m[1].trim()) : '';
    }
    result.title = title.slice(0, 60);
    result.desc = desc.slice(0, 40);
    result.cover = cover.slice(0, 100);
    result.hasCover = !!cover;

    // 封面可下载性（与 SW 一致：带来源页 referrer，无 credentials）
    if (cover) {
      try {
        const cu = new URL(decodeEntities(cover), sample);
        const cr = await fetch(cu, { headers: { 'User-Agent': UA }, referrer: sample, redirect: 'follow', signal: AbortSignal.timeout(15000) });
        result.coverHttp = cr.status;
        result.coverType = (cr.headers.get('content-type') || '').slice(0, 30);
        result.ok = cr.ok && (cr.headers.get('content-type') || '').startsWith('image/');
        if (!result.ok) result.note = '封面不可下载: HTTP ' + cr.status + ' ' + result.coverType;
      } catch (e) {
        result.note = '封面下载失败: ' + String(e.message || e).slice(0, 60);
      }
    } else {
      result.note = '无 og:image（内容脚本运行后 og 也缺失时会自动降级二维码模式）';
      result.ok = false;
    }
  } catch (e) {
    result.note = '抓取失败: ' + String(e.message || e).slice(0, 80);
  }
  return result;
}

/* ---- 复核样本清单（每条规则一个真实代表 URL；2026-09 逐站浏览器复核后更新） ---- */
const SAMPLES = [
  ['bilibili-video', 'https://www.bilibili.com/video/BV1bHtd6CESR/'],
  ['netease-music', 'https://music.163.com/song?id=186016'],
  ['github', 'https://github.com/microsoft/vscode'],
  ['youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'],
  ['bilibili-other', 'https://live.bilibili.com/6'],
  ['tencent-video', 'https://v.qq.com/x/cover/mzc00200b4z0poc.html'],
  ['iqiyi', 'https://www.iqiyi.com/v_bgzyyt3g7s.html'],
  ['youku', 'https://v.youku.com/v_show/id_XNjU2MzMxODA4MA==.html'],
  ['vimeo', 'https://vimeo.com/76979871'],
  ['spotify', 'https://open.spotify.com/track/4cOdK2wGLETKBW3PvgPWqT'],
  ['soundcloud', 'https://soundcloud.com/forss/flickermood'],
  ['qq-music', 'https://y.qq.com/n/ryqq/songDetail/0039MnYb0qxYhV'],
  ['kugou', 'https://www.kugou.com/mixsong/ftkz2rbb.html'],
  ['weixin', 'https://mp.weixin.qq.com/s?src=11&timestamp=1788501752&ver=6945'],
  ['zhihu', 'https://www.zhihu.com/question/19550227'],
  ['zhihu-zhuanlan', 'https://zhuanlan.zhihu.com/p/28852607'],
  ['douban', 'https://movie.douban.com/subject/1292052/'],
  ['juejin', 'https://juejin.cn/post/7637856870833635343'],
  ['csdn', 'https://blog.csdn.net/blogdevteam/article/details/126135357'],
  ['sspai', 'https://sspai.com/post/114164'],
  ['jianshu', 'https://www.jianshu.com/p/3b3b32499957'],
  ['stackoverflow', 'https://stackoverflow.com/questions/231767/what-does-the-yield-keyword-do-in-python'],
  ['segmentfault', 'https://segmentfault.com/a/1190000047736045'],
  ['v2ex', 'https://v2ex.com/t/1'],
  ['gitlab', 'https://gitlab.com/gitlab-org/gitlab'],
  ['npm', 'https://www.npmjs.com/package/react'],
  ['pypi', 'https://pypi.org/project/requests/'],
  ['arxiv', 'https://arxiv.org/abs/1706.03762'],
  ['steam', 'https://store.steampowered.com/app/570/Dota_2/'],
  ['bilibili-read', 'https://www.bilibili.com/read/cv24557928/'],
  ['bilibili-opus', 'https://www.bilibili.com/opus/1242413904246603781'],
  ['miui-community', 'https://web.vip.miui.com/page/info/mio/mio/detail?isTop=0&postId=52824031'],
  ['wikipedia', 'https://zh.wikipedia.org/wiki/%E6%B1%AA%E7%B2%BE%E5%8D%AB'],
  ['coolapk', 'https://www.coolapk.com/feed/73574706'],
  ['goofish', 'https://www.goofish.com/item?id=839271901390&categoryId=201458416'],
  ['baidu-pan', 'https://pan.baidu.com/s/1uciNaJBL9xKwP7J1xONevQ?pwd=r5ak'],
  ['duckduckgo', 'https://duckduckgo.com/?q=%E5%AE%89%E8%B4%B9%E5%A5%A5%E5%88%A9&ia=web'],
  ['123pan', 'https://1707690.share.123pan.cn/123pan/gxk9-19wGh']
];

/* ---- VM 上下文：加载规则解释器与订阅文件（一次） ---- */
const ctx = { fetch, URL, console, setTimeout };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/lib/rules.js'), 'utf8'), ctx);
vm.runInContext('SimpShareRules.loadFromData(' +
  fs.readFileSync(path.join(ROOT, 'src/rules/rules.json'), 'utf8') + ')', ctx);

(async () => {
  const filter = process.argv.slice(2);
  const list = filter.length ? SAMPLES.filter(s => filter.includes(s[0])) : SAMPLES;
  const out = [];
  const CONCURRENCY = 5;
  let idx = 0;
  async function worker() {
    while (idx < list.length) {
      const [id, url] = list[idx++];
      const r = await checkSite(id, url);
      out.push(r);
      const mark = r.ok ? '✓' : (r.ruleMatched && !r.hasCover ? '△' : '✗');
      console.log(`${mark} [${r.id}] ${r.http || '-'} 封面:${r.hasCover ? 'Y' : 'N'} ${r.ruleMatched === false ? '(规则未命中!)' : ''} ${r.title.slice(0, 30)} ${r.note}`);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  fs.writeFileSync(path.join(ROOT, 'test/out/site-review.json'), JSON.stringify(out, null, 2));
  const okN = out.filter(r => r.ok).length;
  console.log(`\n合计 ${out.length} 条：✓ ${okN} · △ 规则命中但无og封面 ${out.filter(r => r.ruleMatched && !r.hasCover).length} · ✗ ${out.filter(r => !r.ok).length}`);
})().catch(e => { console.error(e); process.exit(1); });
