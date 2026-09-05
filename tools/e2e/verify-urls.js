/** 批量 URL 验证：修改链接 → 后台 EXTRACT_URL（含 render 规则的无头标签页捕获）→ 导出卡片
 *  用法：node tools/e2e/verify-urls.js <url> [url...]
 *  环境变量 SIMPSHARE_PROXY=socks5://127.0.0.1:10808 时给 Chrome 挂代理。
 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const EXT_PATH = path.join(__dirname, '..', '..');
const OUT = path.join(EXT_PATH, 'test', 'out');
const TARGETS = process.argv.slice(2);

(async () => {
  if (!TARGETS.length) {
    console.error('用法: node tools/e2e/verify-urls.js <url> [url...]');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const args = [
    `--disable-extensions-except=${EXT_PATH}`,
    `--load-extension=${EXT_PATH}`,
    '--window-size=1366,850',
    '--lang=zh-CN'
  ];
  if (process.env.SIMPSHARE_PROXY) {
    args.push('--proxy-server=' + process.env.SIMPSHARE_PROXY);
    console.log('[verify] proxy:', process.env.SIMPSHARE_PROXY);
  }
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chrome', 'win64-136.0.7103.113', 'chrome-win64', 'chrome.exe'),
    headless: true,
    args
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

  const openEditor = () => page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    sr.querySelector('.btn.edit').click();
  });

  for (let i = 0; i < TARGETS.length; i++) {
    const url = TARGETS[i];
    console.log('[verify]', url);
    await openEditor();
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate((u) => {
      const sr = document.querySelector('#simpshare-host').shadowRoot;
      const input = sr.querySelector('.field input');
      input.value = u;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }, url);
    try {
      await page.waitForFunction(() => {
        const sr = document.querySelector('#simpshare-host').shadowRoot;
        return sr.querySelector('.preview').classList.contains('ready') &&
          sr.querySelector('.btn.copy').disabled === false;
      }, { timeout: 60000 });
    } catch (e) {
      const snackbar = await page.evaluate(() =>
        document.querySelector('#simpshare-host').shadowRoot.querySelector('.snackbar').textContent);
      console.log('[verify] FAILED:', url, '→', snackbar);
      continue;
    }
    await new Promise(r => setTimeout(r, 500));
    const cardUrl = await page.evaluate(() =>
      document.querySelector('#simpshare-host').shadowRoot.querySelector('.field input').value);
    const dataUrl = await page.evaluate(() =>
      document.querySelector('#simpshare-host').shadowRoot.querySelector('.preview canvas').toDataURL('image/png'));
    const host = (() => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch (e) { return 'url'; } })();
    const file = 'verify-' + (i + 1) + '-' + host.replace(/[^a-z0-9.-]/gi, '_') + '.png';
    fs.writeFileSync(path.join(OUT, file), Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log('[verify] saved', file, '→ 卡片链接:', cardUrl);
  }
  await browser.close();
  console.log('[verify] DONE');
})().catch(e => { console.error('[verify] FAIL:', e.message); process.exit(1); });
