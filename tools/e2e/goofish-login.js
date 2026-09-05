/** 闲鱼登录态验证（交互式）：无头加载登录页 → 二维码截图用看图窗口打开 → 用户扫码 → 自动验证卡片
 *  用法：node tools/e2e/goofish-login.js
 */
'use strict';
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const EXT_PATH = path.join(__dirname, '..', '..');
const OUT = path.join(EXT_PATH, 'test', 'out');
const QR_PNG = path.join(OUT, 'goofish-qr.png');

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: path.join(__dirname, 'chrome', 'win64-136.0.7103.113', 'chrome-win64', 'chrome.exe'),
    headless: true,
    args: [
      `--disable-extensions-except=${EXT_PATH}`,
      `--load-extension=${EXT_PATH}`,
      '--window-size=480,860',
      '--lang=zh-CN'
    ]
  });
  const page = (await browser.pages())[0] || await browser.newPage();
  await page.setViewport({ width: 480, height: 860 });
  await page.goto('https://www.goofish.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await new Promise(r => setTimeout(r, 4000));
  await page.evaluate(() => {
    const cands = [...document.querySelectorAll('button, a, div, span')]
      .filter(el => /^(登录|请登录)$/.test((el.textContent || '').trim()) && el.offsetParent)
      .slice(0, 3);
    if (cands.length) cands[0].click();
  });
  await new Promise(r => setTimeout(r, 5000));
  await page.screenshot({ path: QR_PNG });
  console.log('[goofish] 二维码截图已保存并用看图窗口打开 — 请用闲鱼 App 扫码（8 分钟内）');
  try { execSync(`cmd /c start "" "${QR_PNG}"`); } catch (e) { console.log('[goofish] 看图窗口打开失败，请手动打开 ' + QR_PNG); }

  let logged = false;
  for (let i = 0; i < 160; i++) {
    await new Promise(r => setTimeout(r, 3000));
    try {
      const cookies = await page.cookies();
      if (cookies.some(c => c.name === 'unb' || c.name === 'lgc')) { logged = true; break; }
    } catch (e) { /* 跳转中 */ }
  }
  console.log('[goofish] 登录:', logged ? 'OK' : '超时未检测到（继续尝试验证）');

  // 登录后开商品页，走扩展 on-page 流程出卡（含 descFromDom 描述模块）
  await page.goto('https://www.goofish.com/item?id=839271901390&categoryId=201458416', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!document.querySelector('#simpshare-host'), { timeout: 20000 });
  await new Promise(r => setTimeout(r, 9000));
  const pageTitle = await page.title();
  console.log('[goofish] 商品页标题:', pageTitle.slice(0, 50));
  await page.bringToFront();
  const rect = await page.evaluate(() => {
    const f = document.querySelector('#simpshare-host').shadowRoot.querySelector('.fab');
    const r = f.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(rect.x, rect.y);
  await page.waitForFunction(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return sr.querySelector('.preview').classList.contains('ready') && sr.querySelector('.btn.copy').disabled === false;
  }, { timeout: 40000 });
  await new Promise(r => setTimeout(r, 500));
  const dataUrl = await page.evaluate(() =>
    document.querySelector('#simpshare-host').shadowRoot.querySelector('.preview canvas').toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, 'goofish-item-loggedin.png'), Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('[goofish] 已保存 goofish-item-loggedin.png');

  // 短链走 修改链接 → 后台无头标签页捕获（带登录 cookie）
  await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    sr.querySelector('.btn.edit').click();
  });
  await new Promise(r => setTimeout(r, 400));
  await page.evaluate(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    const input = sr.querySelector('.field input');
    input.value = 'https://p.goofish.com/p/BFk54Ckz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  });
  await page.waitForFunction(() => {
    const sr = document.querySelector('#simpshare-host').shadowRoot;
    return sr.querySelector('.preview').classList.contains('ready') && sr.querySelector('.btn.copy').disabled === false;
  }, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 500));
  const dataUrl2 = await page.evaluate(() =>
    document.querySelector('#simpshare-host').shadowRoot.querySelector('.preview canvas').toDataURL('image/png'));
  fs.writeFileSync(path.join(OUT, 'goofish-short-loggedin.png'), Buffer.from(dataUrl2.split(',')[1], 'base64'));
  console.log('[goofish] 已保存 goofish-short-loggedin.png');

  await browser.close();
  console.log('[goofish] DONE');
})().catch(e => { console.error('[goofish] FAIL:', e.message); process.exit(1); });
