/**
 * 用 headless Chrome 将图标 SVG 栅格化为扩展图标 PNG。
 * - 48 / 128：使用 src/assets/icon.svg（完整设计：卡片 + 分享节点 + 二维码角标）
 * - 16 / 32：使用简化变体（放大卡片与节点、去掉角标），小尺寸下更清晰
 * 依赖 tools/e2e/node_modules 里的 puppeteer-core 与 tools/e2e/chrome 下的 Chrome for Testing。
 * 运行：node tools/make-icons-svg.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const puppeteer = require(path.join(__dirname, 'e2e', 'node_modules', 'puppeteer-core'));

const CHROME = path.join(__dirname, 'e2e', 'chrome', 'win64-136.0.7103.113', 'chrome-win64', 'chrome.exe');
const SVG = path.join(__dirname, '..', 'src', 'assets', 'icon.svg');
const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'icons');

const GLYPH = 'M18,16.08c-0.76,0 -1.44,0.3 -1.96,0.77L8.91,12.7c0.05,-0.23 0.09,-0.46 0.09,-0.7s-0.04,-0.47 -0.09,-0.7l7.05,-4.11c0.54,0.5 1.25,0.81 2.04,0.81 1.66,0 3,-1.34 3,-3s-1.34,-3 -3,-3 -3,1.34 -3,3c0,0.24 0.04,0.47 0.09,0.7L8.04,9.81C7.5,9.31 6.79,9 6,9c-1.66,0 -3,1.34 -3,3s1.34,3 3,3c0.79,0 1.5,-0.31 2.04,-0.81l7.12,4.16c-0.05,0.21 -0.08,0.43 -0.08,0.65 0,1.61 1.31,2.92 2.92,2.92 1.61,0 2.92,-1.31 2.92,-2.92s-1.31,-2.92 -2.92,-2.92z';

/** 小尺寸简化变体：更大的卡片与节点，无二维码角标 */
const SMALL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="100%" height="100%">
  <rect width="108" height="108" rx="24" fill="#0B57D0"/>
  <path fill="#FFFFFF" d="M32.5,37.57 h43 a7,7 0 0 1 7,7 v10.86 a7,7 0 0 1 -7,7 h-43 a7,7 0 0 1 -7,-7 v-10.86 a7,7 0 0 1 7,-7 z"/>
  <g transform="translate(42.6,38.6) scale(0.95)">
    <path fill="#0B57D0" d="${GLYPH}"/>
  </g>
</svg>`;

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage();
  const fullSvg = fs.readFileSync(SVG, 'utf8')
      .replace('width="512" height="512"', 'width="100%" height="100%"');
  const htmlOf = (svg) => `<!doctype html><html><body style="margin:0;background:transparent">${svg}</body></html>`;

  for (const size of [16, 32, 48, 128]) {
    const svg = size <= 32 ? SMALL_SVG : fullSvg;
    await page.setViewport({ width: size, height: size });
    await page.setContent(htmlOf(svg), { waitUntil: 'load' });
    const png = await page.screenshot({ omitBackground: true });
    const file = path.join(OUT_DIR, `icon${size}.png`);
    fs.writeFileSync(file, png);
    console.log('written', file, png.length, 'bytes');
  }
  await browser.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
