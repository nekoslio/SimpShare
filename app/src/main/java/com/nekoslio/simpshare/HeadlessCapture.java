package com.nekoslio.simpshare;

import android.content.Context;
import android.graphics.Color;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.text.TextUtils;
import android.webkit.JsResult;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 无头 WebView 捕获：规则声明 render: true 的站点（小米社区、闲鱼短链、百度网盘带提取码等）
 * 用 HttpURLConnection 拿不到数据，且短链的重定向链含 JS 跳转。这里在后台线程同步等待，
 * 主线程创建一个不挂到界面的 WebView 交给真实内核加载——HTTP 302、JS 跳转、SPA 渲染全部
 * 发生完（location/title/og 快照连续稳定）后，从渲染好的 DOM 里取元信息并销毁 WebView。
 */
public final class HeadlessCapture {

    /** 一次捕获的结果 */
    public static class Captured {
        public String url = "";
        public String title = "";
        public String description = "";
        public String coverUrl;
        /** 正文里第一张加载完成的大图（≥200px），render.coverFromDom 规则的封面兜底 */
        public String firstImage;
        /** document.readyState === 'complete'（避免在加载中途返回空标题） */
        public boolean ready;
        public List<String> faviconCandidates;
    }

    /** 桌面 UA：与验证行为一致（部分站点按 UA 区分移动/桌面页）；LoginWebViewActivity 用同一 UA，
     *  保证应用内登录的 Cookie 对应无头捕获渲染的同一套页面 */
    public static final String UA =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/136.0.0.0 Safari/537.36";

    /** 快照连续稳定的判定窗口：短链 JS 跳转、SPA 数据到达都会刷新快照 */
    private static final long STABLE_MS = 2200;
    private static final long POLL_MS = 700;
    private static final long FIRST_POLL_MS = 1200;
    /** 懒加载滚动扫描（最多 8 屏 × 350ms ≈ 3.7s）后，再等待图片加载的时间 */
    private static final long SWEEP_WAIT_MS = 4800;
    /** 滚动触发懒加载（ fire-and-forget，异步执行） */
    private static final String SCROLL_SWEEP_JS =
            "(async function(){"
                    + "var st=Math.max(400,innerHeight||800);"
                    + "var max=Math.min((document.body?document.body.scrollHeight:st),st*8);"
                    + "for(var y=0;y<=max;y+=st){scrollTo(0,y);await new Promise(function(r){setTimeout(r,350)})}"
                    + "scrollTo(0,0);"
                    + "})()";

    private HeadlessCapture() {
    }

    /**
     * 阻塞式捕获（内部切主线程）。minMs：快照稳定后仍至少等待的毫秒数
     * （兜底慢验证跳转，如百度网盘提取码页的自动验证）。
     * descSelector / descStripTitle / descClip：描述文本的 DOM 提取（descFromDom 规则）——
     * og 简介缺失时按选择器取文本最长的节点，剥离与标题重复的前缀，clip 截断加省略号；
     * descSelector 为 null 时跳过。超时或失败返回已有快照或 null，调用方回退普通抓取链路。
     */
    public static Captured capture(Context context, String url, long timeoutMs, long minMs,
                                   String descSelector, String descStripTitle, int descClip) {
        final AtomicReference<Captured> out = new AtomicReference<>();
        final CountDownLatch latch = new CountDownLatch(1);
        Handler main = new Handler(Looper.getMainLooper());
        main.post(() -> runCapture(context, url, timeoutMs, Math.max(minMs, 0),
                descSelector, descStripTitle, descClip, main, out, latch));
        try {
            latch.await(timeoutMs + 6000, TimeUnit.MILLISECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return out.get();
    }

    /** 诊断标记（临时）：供 Rules.extract 记录规则命中情况 */

    private static void runCapture(Context appContext, String url, long timeoutMs, long minMs,
                                   String descSelector, String descStripTitle, int descClip,
                                   Handler main, AtomicReference<Captured> out, CountDownLatch latch) {
        try {
            final WebView web = new WebView(appContext);
            // 未挂到窗口的 WebView 渲染进程不启动（evaluateJavascript 恒返回 null）：
            // 有 Activity 时挂到其视图树、全尺寸但平移到屏幕外，保证内核正常加载渲染
            final android.app.Activity act = appContext instanceof android.app.Activity
                    ? (android.app.Activity) appContext : null;
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setUserAgentString(UA);
            web.setBackgroundColor(Color.TRANSPARENT);
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView view, String u) {
                    return false;   // 重定向（含 HTTP 302 与 JS 跳转）一律交给 WebView 自己走
                }
            });
            // 无头环境下自动确认 JS 弹窗，避免 alert/confirm 挂住整个页面
            web.setWebChromeClient(new WebChromeClient() {
                @Override
                public boolean onJsAlert(WebView view, String u, String msg, JsResult result) {
                    result.confirm();
                    return true;
                }

                @Override
                public boolean onJsConfirm(WebView view, String u, String msg, JsResult result) {
                    result.confirm();
                    return true;
                }

                @Override
                public boolean onJsPrompt(WebView view, String u, String msg, String def,
                                          android.webkit.JsPromptResult result) {
                    result.confirm("");
                    return true;
                }
            });

            final long deadline = SystemClock.uptimeMillis() + timeoutMs;
            final long startedAt = SystemClock.uptimeMillis();
            final long[] lastChange = {SystemClock.uptimeMillis()};
            final String[] lastSnap = {""};
            final Captured[] lastCap = {null};
            final boolean[] finishing = {false};

            final Runnable release = () -> {
                try {
                    web.stopLoading();
                    web.loadUrl("about:blank");
                    if (act != null && web.getParent() instanceof android.view.ViewGroup) {
                        ((android.view.ViewGroup) web.getParent()).removeView(web);
                    }
                    web.removeAllViews();
                    web.destroy();
                } catch (Throwable t) {
                    // 销毁失败不影响结果返回
                }
                latch.countDown();
            };

            // 挂到 Activity 视图树（渲染进程才会启动），平移到屏幕外保持不可见
            if (act != null) {
                act.addContentView(web, new android.view.ViewGroup.LayoutParams(
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                        android.view.ViewGroup.LayoutParams.MATCH_PARENT));
                web.setTranslationY(web.getResources().getDisplayMetrics().heightPixels * 4f);
            }

            final Runnable[] poll = new Runnable[1];
            poll[0] = new Runnable() {
                @Override
                public void run() {
                    if (finishing[0]) return;
                    if (SystemClock.uptimeMillis() > deadline) {
                        // 超时：返回最后一次快照（可能仍是中间页），由调用方决定是否可用
                        out.set(lastCap[0]);
                        finishing[0] = true;
                        main.post(release);
                        return;
                    }
                    web.evaluateJavascript(COLLECT_JS, (String json) -> {
                        if (finishing[0]) return;
                        Captured cur = parse(json);
                        long now = SystemClock.uptimeMillis();
                        if (cur != null) {
                            lastCap[0] = cur;
                        }
                        String snap = cur == null ? ""
                                : cur.url + "\u0001" + cur.title + "\u0001"
                                + (cur.coverUrl == null ? "" : cur.coverUrl);
                        if (!snap.equals(lastSnap[0])) {
                            lastSnap[0] = snap;
                            lastChange[0] = now;
                        }
                        boolean pageSettled = cur != null && cur.ready
                                && now - lastChange[0] >= STABLE_MS
                                && now - startedAt >= minMs;
                        if (pageSettled) {
                            // 先滚动一遍触发懒加载（帖子配图多是懒加载），等图片加载后再复核收尾
                            web.evaluateJavascript(SCROLL_SWEEP_JS, (String unused) -> { });
                            main.postDelayed(() -> {
                                if (finishing[0]) return;
                                web.evaluateJavascript(COLLECT_JS, (String j2) -> {
                                    Captured fin = parse(j2);
                                    Captured best = fin != null && !fin.title.isEmpty() ? fin : lastCap[0];
                                    if (descSelector == null || best == null) {
                                        out.set(best);
                                        finishing[0] = true;
                                        main.post(release);
                                        return;
                                    }
                                    // descFromDom：og 简介缺失时按规则选择器取描述文本
                                    web.evaluateJavascript(descFromDomJs(descSelector, descStripTitle, descClip),
                                            (String j3) -> {
                                                // descFromDom 声明了即优先于页面自带 meta 简介（常为站点样板，后续由 transforms 清洗）
                                                String d = parsePlain(j3);
                                                if (!TextUtils.isEmpty(d)) best.description = d;
                                                out.set(best);
                                                finishing[0] = true;
                                                main.post(release);
                                            });
                                });
                            }, SWEEP_WAIT_MS);
                            return;
                        }
                        main.postDelayed(poll[0], POLL_MS);
                    });
                }
            };
            web.loadUrl(url);
            main.postDelayed(poll[0], FIRST_POLL_MS);
        } catch (Throwable t) {
            latch.countDown();
        }
    }

    /** 是否 ready（document.readyState === 'complete'），用于避免在加载中途返回空标题；
     *  firstImage 为正文第一张加载完成的大图（≥200px）：头图（cover/head-img class）优先、
     *  内容照片（jpg/webp）优先于 UI 素材，排除头像/logo/图标 —— 与扩展端 firstContentImage 同一启发式 */
    private static final String COLLECT_JS =
            "(function(){"
                    + "function m(sel){var e=document.querySelector(sel);return e?e.getAttribute('content'):null}"
                    + "var fav=[];var ls=document.querySelectorAll('link[rel]');"
                    + "for(var i=0;i<ls.length&&fav.length<8;i++){"
                    + "var r=(ls[i].getAttribute('rel')||'').toLowerCase();"
                    + "if(r.indexOf('icon')>=0||r.indexOf('apple-touch')>=0){"
                    + "var h=ls[i].getAttribute('href');"
                    + "if(h){try{fav.push(new URL(h,location.href).href)}catch(e){}}}}"
                    + "var BAD=/avatar|logo|icon|sprite|emoji|face|qrcode/i,HEAD=/cover|head-img|headimg/i;"
                    + "var cands=[],ims=document.images;"
                    + "for(var i2=0;i2<ims.length;i2++){"
                    + "var it=ims[i2],w=it.naturalWidth||0,s=it.currentSrc||it.src||'';"
                    + "if(w<200||s.indexOf('data:')===0)continue;"
                    + "var cls=(it.className&&typeof it.className==='string')?it.className:'';"
                    + "var head=HEAD.test(cls),bad=BAD.test(cls),el=it;"
                    + "for(var i3=0;i3<4&&el;i3++){"
                    + "cls=(el.className&&typeof el.className==='string')?el.className:'';"
                    + "if(HEAD.test(cls))head=true;if(BAD.test(cls))bad=true;el=el.parentElement}"
                    + "if(!bad){var photo=/\\.(jpg|jpeg|webp)(\\?|$)/i.test(s)||/\\/bao\\/uploaded\\//.test(s);"
                    + "cands.push({s:s,sc:(head?2:0)+(photo?1:0)})}}"
                    + "cands.sort(function(a,b){return b.sc-a.sc});"
                    + "var firstImg=cands.length?cands[0].s:null;"
                    + "var og=m('meta[property=\\\"og:title\\\"]')||m('meta[name=\\\"og:title\\\"]');"
                    + "var d=m('meta[property=\\\"og:description\\\"]')||m('meta[name=\\\"description\\\"]')||'';"
                    + "var c=m('meta[property=\\\"og:image\\\"]')||m('meta[name=\\\"og:image\\\"]');"
                    + "return JSON.stringify({url:location.href,title:og||document.title||'',"
                    + "ready:document.readyState==='complete',description:d,coverUrl:c,firstImage:firstImg,fav:fav});"
                    + "})()";

    /** descFromDom 提取脚本：selector 取文本最长的可见节点，stripTitle 剥离与标题重复的前缀
     *  （剥离点延伸到下一个标点/换行，≤12 字符，正好从“第二行/下一句”开始），clip 截断加省略号 */
    private static String descFromDomJs(String selector, String stripTitle, int clip) {
        String stripPart = stripTitle == null || stripTitle.isEmpty()
                ? ""
                : "var t0=(document.title||'').replace(new RegExp(" + JSONObject.quote(stripTitle) + "+'\\\\s*$'),'').trim();"
                        + "if(t0&&t.indexOf(t0)===0){var cut=t0.length;"
                        + "var m=t.slice(cut).match(/^[^，。！？；、…\\n]{0,12}[，。！？；、…\\n]/);"
                        + "if(m)cut+=m[0].length;"
                        + "t=t.slice(cut).trim()}";
        return "(function(){"
                + "var els=[].slice.call(document.querySelectorAll(" + JSONObject.quote(selector) + "))"
                + ".filter(function(el){return el.offsetParent!==null});"
                + "els.sort(function(a,b){return (b.innerText||'').trim().length-(a.innerText||'').trim().length});"
                + "if(!els.length)return '';"
                + "var t=(els[0].innerText||'').replace(/[ \\t]+\\n/g,'\\n').trim();"
                + stripPart
                + "if(!t)return '';"
                + "var n=" + Math.max(clip, 40) + ";"
                + "return t.length>n?t.slice(0,n)+'…':t;"
                + "})()";
    }

    private static String parsePlain(String json) {
        if (json == null || json.isEmpty() || "null".equals(json)) return "";
        try {
            Object v = new org.json.JSONTokener(json).nextValue();
            return v == null ? "" : String.valueOf(v);
        } catch (Exception e) {
            return "";
        }
    }

    private static Captured parse(String json) {
        if (json == null || json.isEmpty() || "null".equals(json)) return null;
        try {
            // evaluateJavascript 对字符串结果会再做一层 JSON 编码（"{\"url\":…}"），先解掉
            org.json.JSONTokener tk = new org.json.JSONTokener(json);
            Object v = tk.nextValue();
            JSONObject o;
            if (v instanceof JSONObject) {
                o = (JSONObject) v;
            } else if (v instanceof String) {
                o = new JSONObject((String) v);
            } else {
                return null;
            }
            Captured c = new Captured();
            c.url = o.optString("url", "");
            c.title = o.optString("title", "").trim();
            c.description = o.optString("description", "");
            c.coverUrl = o.isNull("coverUrl") ? null : o.optString("coverUrl", null);
            c.firstImage = o.isNull("firstImage") ? null : o.optString("firstImage", null);
            c.ready = o.optBoolean("ready", false);
            JSONArray fav = o.optJSONArray("fav");
            if (fav != null && fav.length() > 0) {
                List<String> list = new ArrayList<>();
                for (int i = 0; i < fav.length() && i < 8; i++) list.add(fav.optString(i));
                c.faviconCandidates = list;
            }
            return c.url.isEmpty() ? null : c;
        } catch (Exception e) {
            return null;
        }
    }
}
