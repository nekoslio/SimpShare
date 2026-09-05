// 规则解释器快速自检（Node）：匹配 + 提取 + 变换（本地验证用）
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ctx = { fetch, URL, console, setTimeout, Promise };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'src/lib/rules.js'), 'utf8'), ctx);
vm.runInContext('SimpShareRules.loadFromData(' + fs.readFileSync(path.join(ROOT, 'src/rules/rules.json'), 'utf8') + ')', ctx);

const U = (id) => id;
async function main() {
  // 1. 匹配自检
  const urls = [
    ['https://www.bilibili.com/read/cv24557928/', 'bilibili-read'],
    ['https://www.bilibili.com/read/mobile?id=cv24557928', 'bilibili-read'],
    ['https://www.bilibili.com/opus/1242413904246603781', 'bilibili-opus'],
    ['https://web.vip.miui.com/page/info/mio/mio/detail?isTop=0&postId=52824031', 'miui-community'],
    ['https://zh.wikipedia.org/wiki/%E6%B1%AA%E7%B2%BE%E5%8D%AB', 'wikipedia'],
    ['https://commons.wikimedia.org/wiki/Main_Page', 'wikipedia'],
    ['https://www.coolapk.com/feed/73574706', 'coolapk'],
    ['https://www.goofish.com/item?id=839271901390&categoryId=201458416', 'goofish'],
    ['https://p.goofish.com/p/BFk54Ckz', 'goofish'],
    ['https://h5.m.goofish.com/item?forceFlush=1&id=1077168528390', 'goofish'],
    ['https://pan.baidu.com/s/1uciNaJBL9xKwP7J1xONevQ?pwd=r5ak', 'baidu-pan'],
    ['https://duckduckgo.com/?q=%E5%AE%89%E8%B4%B9%E5%A5%A5%E5%88%A9&ia=web', 'duckduckgo'],
    ['https://duckduckgo.com/', null],
    ['https://1707690.share.123pan.cn/123pan/gxk9-19wGh', '123pan'],
    ['https://live.bilibili.com/6', 'bilibili-other'],
    ['https://www.bilibili.com/video/BV1GJ411x7h7/', 'bilibili-video']
  ];
  let bad = 0;
  for (const [u, expect] of urls) {
    const r = ctx.SimpShareRules.match(u);
    const got = r ? r.id : null;
    const ok = got === expect;
    if (!ok) bad++;
    console.log((ok ? '✓' : '✗') + ' match ' + u + ' → ' + got + (ok ? '' : ' (期望 ' + expect + ')'));
  }

  // 2. 专栏 API 提取
  const readRule = ctx.SimpShareRules.match('https://www.bilibili.com/read/cv24557928/');
  const readFields = await ctx.SimpShareRules.runApi(readRule, 'https://www.bilibili.com/read/cv24557928/');
  console.log('\nread api:', JSON.stringify({ title: readFields && readFields.title.slice(0, 40), cover: readFields && readFields.coverUrl.slice(0, 60), desc: readFields && readFields.description.slice(0, 40) }));

  // 3. opus 状态提取（用已抓取的页面 HTML 里的 INITIAL_STATE）
  const html = fs.readFileSync(path.join(__dirname, '../../probes/bopus.html'), 'utf8');
  const opusRule = ctx.SimpShareRules.match('https://www.bilibili.com/opus/1242413904246603781');
  const spec = ctx.SimpShareRules.stateSpec(opusRule);
  const i = html.indexOf('__INITIAL_STATE__=');
  const j = html.indexOf('{', i);
  let depth = 0, inStr = false, esc = false, end = -1;
  for (let k = j; k < html.length; k++) {
    const c = html[k];
    if (esc) { esc = false; continue; }
    if (inStr) { if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true; else if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { end = k + 1; break; } }
  }
  const st = JSON.parse(html.slice(j, end));
  const values = {};
  for (const p of spec.paths) values[p] = ctx.SimpShareRules.getPath(st, p);
  const opusFields = ctx.SimpShareRules.extractFromValues(spec, values);
  const meta = { title: opusFields.title, description: opusFields.description, coverUrl: opusFields.coverUrl };
  ctx.SimpShareRules.applyTransforms(opusRule, meta, 'https://www.bilibili.com/opus/1242413904246603781');
  console.log('opus state:', JSON.stringify({ title: meta.title, cover: meta.coverUrl && meta.coverUrl.slice(0, 60), desc: meta.description.slice(0, 50) }));

  // 4. titleFromQuery / stripRegex
  const ddgMeta = { title: '安费奥利 at DuckDuckGo', description: '', coverUrl: null };
  ctx.SimpShareRules.applyTransforms(ctx.SimpShareRules.match('https://duckduckgo.com/?q=%E5%AE%89%E8%B4%B9%E5%A5%A5%E5%88%A9&ia=web'), ddgMeta, 'https://duckduckgo.com/?q=%E5%AE%89%E8%B4%B9%E5%A5%A5%E5%88%A9&ia=web');
  console.log('ddg title:', ddgMeta.title);

  const p123Meta = { title: '18.2.2.2.0 - 123云盘免费不限速|下载免登录', description: '', coverUrl: null };
  ctx.SimpShareRules.applyTransforms(ctx.SimpShareRules.match('https://1707690.share.123pan.cn/123pan/gxk9-19wGh'), p123Meta, 'https://1707690.share.123pan.cn/123pan/gxk9-19wGh');
  console.log('123pan title:', p123Meta.title);

  const bdMeta = { title: 'Xiaomi13CustomRom_免费高速下载|百度网盘-分享无限制', description: '', coverUrl: null };
  ctx.SimpShareRules.applyTransforms(ctx.SimpShareRules.match('https://pan.baidu.com/s/1uciNaJBL9xKwP7J1xONevQ?pwd=r5ak'), bdMeta, 'https://pan.baidu.com/s/1uciNaJBL9xKwP7J1xONevQ?pwd=r5ak');
  console.log('baidu-pan title:', bdMeta.title);

  if (bad) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
