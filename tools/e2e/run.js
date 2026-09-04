/**
 * SimpShare 扩展端到端测试（puppeteer-core + 本机 Chrome）
 * 用法：node tools/e2e/run.js [测试页面URL，默认 GitHub 仓库页]
 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT_PATH = path.join(__dirname, '..', '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(EXT_PATH, 'test', 'out');
const TEST_URL = process.argv[2] || 'https://github.com/microsoft/vscode';

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chrome', 'win64-136.0.7103.113', 'chrome-win64', 'chrome.exe'),
    headless: true,   // Chrome 137+ 移除了 headless 下的 --load-extension，故用 Chrome for Testing 136
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--window-size=1366,850',
      '--lang=zh-CN'
    ]
  });

  const sw = browser.targets().find(t => t.type() === 'service_worker' && /chrome-extension/.test(t.url()));
  console.log('[e2e] service worker:', sw ? sw.url() : 'NOT FOUND');

  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 850 });
  await page.emulateMediaFeatures([{
    name: 'prefers-color-scheme',
    value: process.env.SIMPSHARE_THEME === 'dark' ? 'dark' : 'light'
  }]);
  console.log('[e2e] open:', TEST_URL);
  await page.goto(TEST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // 等待内容脚本注入（document_idle）
  await page.waitForFunction(() => !!document.querySelector('#simpshare-host'), { timeout: 20000 });
  console.log('[e2e] content script injected');

  // 点击 FAB（pointer 事件，用真实鼠标点击）
  const rect = await page.evaluate(() => {
    const f = document.querySelector('#simpshare-host').shadowRoot.querySelector('.fab');
    const r = f.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  console.log('[e2e] fab rect:', JSON.stringify(rect));
  await page.mouse.click(rect.x + rect.w / 2, rect.y + rect.h / 2);

  // 等待预览渲染完成
  await page.waitForFunction(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return sr.querySelector('.preview').classList.contains('ready');
  }, { timeout: 20000 });
  console.log('[e2e] preview ready');

  const state = await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return {
      panelHidden: sr.querySelector('.panel').hidden,
      copyEnabled: !sr.querySelector('.btn.copy').disabled,
      snackbar: sr.querySelector('.snackbar').textContent
    };
  });
  console.log('[e2e] panel state:', JSON.stringify(state));

  await page.screenshot({ path: path.join(OUT, 'e2e-panel.png') });
  console.log('[e2e] screenshot saved');

  // 附加验证：拖拽吸附（拖到屏幕右缘）
  await page.mouse.move(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await page.mouse.down();
  await page.mouse.move(1360, rect.y + 10, { steps: 12 });
  await page.mouse.up();
  await new Promise(r => setTimeout(r, 600));
  const dockState = await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return { fabHidden: sr.querySelector('.fab').hidden, dockShown: !sr.querySelector('.dock').hidden };
  });
  console.log('[e2e] dock state:', JSON.stringify(dockState));
  await page.screenshot({ path: path.join(OUT, 'e2e-docked.png') });

  // 吸附后悬停展开 + 点击恢复
  const dockRect = await page.evaluate(() => {
    const d = document.querySelector('#simpshare-host').shadowRoot.querySelector('.dock');
    const r = d.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });
  await page.mouse.move(dockRect.x + dockRect.w - 6, dockRect.y + dockRect.h / 2);
  await new Promise(r => setTimeout(r, 500));
  await page.screenshot({ path: path.join(OUT, 'e2e-dock-hover.png') });
  await page.mouse.click(dockRect.x + dockRect.w - 6, dockRect.y + dockRect.h / 2);
  await new Promise(r => setTimeout(r, 400));
  const restored = await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return { fabShown: !sr.querySelector('.fab').hidden, dockHidden: sr.querySelector('.dock').hidden };
  });
  console.log('[e2e] restored:', JSON.stringify(restored));

  await browser.close();
  console.log('[e2e] PASS');
})().catch(e => { console.error('[e2e] FAIL', e.message); process.exit(1); });
