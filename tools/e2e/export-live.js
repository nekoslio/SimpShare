/** 导出扩展生成的预览画布原图（验证真实提取链路的卡片内容） */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT_PATH = path.join(__dirname, '..', '..');
const OUT = path.join(EXT_PATH, 'test', 'out');
const URLS = process.argv.slice(2);
const TARGETS = URLS.length ? URLS : [
  'https://github.com/microsoft/vscode',
  'https://www.bilibili.com/video/BV1bHtd6CESR/',
  'https://music.163.com/song?id=186016'
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chrome', 'win64-136.0.7103.113', 'chrome-win64', 'chrome.exe'),
    headless: true,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--window-size=1366,850',
      '--lang=zh-CN'
    ]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });
  if (process.env.SIMPSHARE_THEME === 'dark') {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    console.log('[export] theme: dark (emulated)');
  } else {
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  }

  for (let i = 0; i < TARGETS.length; i++) {
    const url = TARGETS[i];
    console.log('[export]', url);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => !!document.querySelector('#simpshare-host'), { timeout: 20000 });
    await new Promise(r => setTimeout(r, 1200));
    const rect = await page.evaluate(() => {
      const f = document.querySelector('#simpshare-host').shadowRoot.querySelector('.fab');
      const r = f.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    });
    await page.mouse.click(rect.x, rect.y);
    await page.waitForFunction(() => {
      const sr = document.querySelector('#simpshare-host').shadowRoot;
      return sr.querySelector('.preview').classList.contains('ready');
    }, { timeout: 25000 });
    const dataUrl = await page.evaluate(() =>
      document.querySelector('#simpshare-host').shadowRoot.querySelector('.preview canvas').toDataURL('image/png'));
    const name = new URL(url).hostname.replace(/^www\./, '') + '-' + (i + 1) + '.png';
    fs.writeFileSync(path.join(OUT, 'live-' + name), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('[export] saved live-' + name);
    // 关闭面板
    await page.mouse.click(rect.x, rect.y);
    await new Promise(r => setTimeout(r, 400));
  }
  await browser.close();
  console.log('[export] DONE');
})().catch(e => { console.error('[export] FAIL:', e.message); process.exit(1); });
