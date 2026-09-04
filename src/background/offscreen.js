/*!
 * SimpShare offscreen document：仅用于在内容脚本剪贴板写入失败时兜底，
 * 在拥有 DOM 的扩展页面上下文中把 PNG 写入系统剪贴板。
 */
'use strict';

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || msg.type !== 'OFFSCREEN_COPY_IMAGE') return false;
  (async function () {
    try {
      const blob = await (await fetch(msg.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      sendResponse({ ok: true });
    } catch (e) {
      sendResponse({ ok: false, error: String(e && e.message || e) });
    }
  })();
  return true;
});
