/** E2E：修改链接 → 跨页提取 → 重新生成预览 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT_PATH = path.join(__dirname, '..', '..');
const OUT = path.join(EXT_PATH, 'test', 'out');

(async () => {
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
  await page.goto('http://127.0.0.1:8123/test/page.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForFunction(() => !!document.querySelector('#simpshare-host'), { timeout: 20000 });
  await new Promise(r => setTimeout(r, 1000));

  const rect = await page.evaluate(() => {
    const f = document.querySelector('#simpshare-host').shadowRoot.querySelector('.fab');
    const r = f.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(rect.x, rect.y);
  await page.waitForFunction(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return sr.querySelector('.preview').classList.contains('ready');
  }, { timeout: 20000 });

  // 点击"修改链接"
  await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    sr.querySelector('.btn.edit').click();
  });
  await new Promise(r => setTimeout(r, 400));
  const editorOpen = await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    const ed = sr.querySelector('.editor');
    return { open: ed.classList.contains('open'), value: sr.querySelector('.field input').value };
  });
  console.log('[edit-e2e] editor:', JSON.stringify(editorOpen));

  // 输入 B 站视频链接并回车
  await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    const input = sr.querySelector('.field input');
    input.value = 'www.bilibili.com/video/BV1bHtd6CESR/';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    sr.querySelector('.field input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });

  // 等待重新生成完成
  await page.waitForFunction(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return sr.querySelector('.preview').classList.contains('ready') &&
      sr.querySelector('.btn.copy').disabled === false;
  }, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 500));

  const dataUrl = await page.evaluate(() =>
    document.querySelector('#simpshare-host').shadowRoot.querySelector('.preview canvas').toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, 'edit-link-bilibili.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('[edit-e2e] preview regenerated with custom URL, saved');

  const editorAfter = await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return { editorOpen: sr.querySelector('.editor').classList.contains('open'), snackbar: sr.querySelector('.snackbar').textContent };
  });
  console.log('[edit-e2e] after submit:', JSON.stringify(editorAfter));

  await browser.close();
  console.log('[edit-e2e] PASS');
})().catch(e => { console.error('[edit-e2e] FAIL:', e.message); process.exit(1); });
