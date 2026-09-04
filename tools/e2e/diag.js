/** 诊断：扩展是否随 --load-extension 加载 */
'use strict';
const puppeteer = require('puppeteer-core');

(async () => {
  const browser = await puppeteer.launch({
    executablePath: require('path').join(__dirname, 'chrome', 'win64-136.0.7103.113', 'chrome-win64', 'chrome.exe'),
    headless: true,
    args: [
      '--disable-extensions-except=D:/proj/simpshare',
      '--load-extension=D:/proj/simpshare',
      '--window-size=1366,850',
      '--lang=zh-CN'
    ]
  });
  await new Promise(r => setTimeout(r, 3000));
  const targets = browser.targets().map(t => t.type() + ' | ' + t.url().slice(0, 90));
  console.log('--- targets ---');
  console.log(targets.join('\n') || '(none)');
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8123/test/page.html', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 1500));
  const injected = await page.evaluate(() => !!document.querySelector('#simpshare-host'));
  console.log('--- content script injected on test page:', injected);
  await browser.close();
  console.log('--- done');
})().catch(e => { console.error('DIAG FAIL:', e.message); process.exit(1); });
