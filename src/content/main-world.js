/*!
 * SimpShare MAIN world 注入脚本（world: "MAIN"）
 * 通用状态桥：按内容脚本下发的规则声明（spec.source + spec.paths）读取页面自身的
 * JS 全局状态对象（如 __INITIAL_STATE__、ytInitialPlayerResponse），用 JSON 路径
 * 取出白名单字段后通过 window.postMessage 回传。本文件不含任何站点硬编码。
 */
(function () {
  'use strict';
  if (window.__SIMPSHARE_MAIN__) return;
  window.__SIMPSHARE_MAIN__ = true;

  /** 与 src/lib/rules.js 解释器一致的路径取值（a.b.0.c[-1]） */
  function getPath(obj, path) {
    if (obj == null || !path) return undefined;
    const wantsArray = /\[\*/.test(path);
    const segs = String(path).replace(/\[(\d+|-1|\*)\]/g, '.$1').split('.').filter(Boolean);
    let cur = [obj];
    for (const seg of segs) {
      const next = [];
      for (const item of cur) {
        if (item == null) continue;
        if (seg === '*') {
          if (Array.isArray(item)) next.push(...item);
        } else {
          const idx = seg === '-1' ? -1 : (/^\d+$/.test(seg) ? Number(seg) : null);
          let v;
          if (idx === null) v = item[seg];
          else if (Array.isArray(item)) v = item[idx < 0 ? item.length + idx : idx];
          else v = item[seg];
          if (v !== undefined && v !== null) next.push(v);
        }
      }
      cur = next;
      if (!cur.length) return wantsArray ? [] : undefined;
    }
    if (wantsArray) return cur;
    return cur.length === 1 ? cur[0] : (cur.length ? cur : undefined);
  }

  window.addEventListener('message', function (e) {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== 'simpshare-page' || d.type !== 'GET_STATE') return;
    const values = {};
    try {
      const spec = d.spec || {};
      const root = window[spec.source];
      for (const p of (spec.paths || [])) {
        values[p] = getPath(root, p);
      }
    } catch (err) { /* ignore */ }
    try {
      window.postMessage({ source: 'simpshare-main', id: d.id, values: values }, '*');
    } catch (err) { /* ignore */ }
  });
})();
