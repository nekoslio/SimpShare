package com.nekoslio.simpshare.card;

import android.content.Context;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Typeface;
import android.text.TextUtils;

import androidx.core.graphics.ColorUtils;

import com.nekoslio.simpshare.R;
import com.nekoslio.simpshare.net.Http;
import com.nekoslio.simpshare.rules.Rules;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 分享卡片渲染器：2100×900（21:9），与浏览器扩展端 src/lib/render.js 同一版式。
 * 浅色 / 深色双主题（跟随系统），二维码白底黑码，右下角 URL 标注过长自动改提示文案。
 */
public final class CardRenderer {

    private static final int W = 2100, H = 900;
    private static final int MARGIN = 96;
    private static final int TILE = 88;
    private static final int TITLE_Y = MARGIN;
    private static final int CONTENT_Y = TITLE_Y + TILE + 64;   // 248
    private static final int CH = H - MARGIN - CONTENT_Y;        // 556
    private static final int QR_SIDE = 400;
    private static final int QR_SIDE_BIG = 460;
    private static final float DESC_FONT = 42f;
    private static final int DESC_LH = 62;
    private static final int DESC_MAX_LINES = 8;

    private CardRenderer() {
    }

    /** 主入口：抓取元信息与图片，渲染卡片位图 */
    public static Bitmap render(Context context, String url) throws Exception {
        Rules.load(context.getAssets());
        Rules.Meta meta = Rules.extract(url);
        boolean night = (context.getResources().getConfiguration().uiMode
                & Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES;

        // 封面（降采样解码）
        Bitmap cover = null;
        if (meta.coverUrl != null) {
            try {
                byte[] bytes = Http.fetchBytes(meta.coverUrl, url, 8_000_000);
                cover = decodeDownsampled(bytes, 1600);
            } catch (Exception e) {
                cover = null;
            }
        }
        // favicon（失败回退首字母色块）
        Bitmap favicon = fetchFavicon(context, meta);

        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        draw(context, new Canvas(out), meta, cover, favicon, url, night);
        if (cover != null) cover.recycle();
        if (favicon != null) favicon.recycle();
        return out;
    }

    /* ================= 版面绘制 ================= */

    private static void draw(Context c, Canvas canvas, Rules.Meta meta,
                             Bitmap cover, Bitmap favicon, String url, boolean night) {
        int bg = night ? Color.parseColor("#1C1B1F") : Color.WHITE;
        int titleColor = night ? Color.parseColor("#E6E1E9") : Color.parseColor("#1C1B1F");
        int descColor = night ? Color.parseColor("#CAC4D0") : Color.parseColor("#49454F");

        Paint paint = new Paint();
        paint.setAntiAlias(true);
        canvas.drawColor(bg);

        // 顶部：站点图标 + 标题
        drawFaviconTile(canvas, paint, meta, favicon, url, night, MARGIN, TITLE_Y, TILE);
        Paint titlePaint = new Paint(paint);
        titlePaint.setColor(titleColor);
        titlePaint.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        titlePaint.setTextSize(72f);
        titlePaint.setTextAlign(Paint.Align.LEFT);
        String title = ellipsize(titlePaint, meta.title == null ? "" : meta.title,
                W - MARGIN - (MARGIN + TILE + 28));
        canvas.drawText(title, MARGIN + TILE + 28f, TITLE_Y + (TILE - 72) / 2f + 60f, titlePaint);

        // 内容区
        boolean hasCover = cover != null && meta.hasCover;
        if (hasCover) {
            int qrX = W - MARGIN - QR_SIDE;
            Qr.draw(canvas, url, qrX, CONTENT_Y + (CH - QR_SIDE) / 2, QR_SIDE);

            float iw = cover.getWidth(), ih = cover.getHeight();
            float ar = iw / ih;
            if (meta.containCover) {
                // 不裁切：按原始比例完整放入（GitHub 社交卡片自带简介，简介模块省略）
                float availW = meta.hideDesc ? W - MARGIN * 2f - QR_SIDE - 64
                        : W - MARGIN * 2f - QR_SIDE - 64 - 360;
                float bw = Math.min(CH * ar, availW);
                float bh = bw / ar;
                if (bh > CH) { bh = CH; bw = bh * ar; }
                float by = CONTENT_Y + (CH - bh) / 2f;
                drawRoundedBitmap(canvas, paint, cover, MARGIN, by, bw, bh, 28);
                if (!meta.hideDesc) {
                    drawDesc(canvas, paint, meta.description, MARGIN + bw + 64, (qrX - 64) - (MARGIN + bw + 64), descColor);
                }
            } else {
                int cw = (int) Math.max(420, Math.min(900, CH * ar));
                drawRoundedBitmap(canvas, paint, cover, MARGIN, CONTENT_Y, cw, CH, 28);
                drawDesc(canvas, paint, meta.description, MARGIN + cw + 64, (qrX - 64) - (MARGIN + cw + 64), descColor);
            }
        } else {
            // 规则外 / 无封面：封面位大二维码，右下角二维码取消
            Qr.draw(canvas, url, MARGIN, CONTENT_Y + (CH - QR_SIDE_BIG) / 2, QR_SIDE_BIG);
            drawDesc(canvas, paint, meta.description, MARGIN + QR_SIDE_BIG + 64,
                    W - MARGIN - (MARGIN + QR_SIDE_BIG + 64), descColor);
        }

        // 右下角 URL 标注（末端距右/下边缘各 48，过长则提示扫码）
        Paint cap = new Paint(paint);
        cap.setColor(descColor);
        cap.setTextSize(34f);
        cap.setTextAlign(Paint.Align.RIGHT);
        String line = url == null ? "" : url;
        if (cap.measureText(line) > anchorRight() - MARGIN) {
            line = c.getString(R.string.url_too_long);
        }
        canvas.drawText(line, anchorRight(), H - 48f, cap);
        cap.setTextAlign(Paint.Align.LEFT);
    }

    private static float anchorRight() {
        return W - 48f;
    }

    private static void drawDesc(Canvas canvas, Paint paint, String text, float x, float w, int color) {
        if (TextUtils.isEmpty(text) || w <= 40) return;
        Paint p = new Paint(paint);
        p.setColor(color);
        p.setTextSize(DESC_FONT);
        List<String> lines = wrap(p, text, w, DESC_MAX_LINES);
        if (lines.isEmpty()) return;
        float y0 = CONTENT_Y + Math.max(0, (CH - lines.size() * DESC_LH) / 2f) + DESC_FONT * 0.86f;
        for (int i = 0; i < lines.size(); i++) {
            canvas.drawText(lines.get(i), x, y0 + i * DESC_LH, p);
        }
    }

    private static void drawFaviconTile(Canvas canvas, Paint paint, Rules.Meta meta,
                                        Bitmap favicon, String url, boolean night, int x, int y, int s) {
        String host = hostOf(url);
        int hue = Math.abs(host.hashCode()) % 360;
        Path r = roundRect(x, y, s, s, 22);
        paint.setColor(ColorUtils.HSLToColor(new float[]{hue, night ? 0.28f : 0.60f, night ? 0.24f : 0.92f}));
        canvas.drawPath(r, paint);
        if (favicon != null) {
            drawCoverBitmap(canvas, paint, favicon, x, y, s, s, 22);
        } else {
            String letter = host.startsWith("www.") ? host.substring(4) : host;
            letter = letter.isEmpty() ? "W" : letter.substring(0, 1).toUpperCase();
            Paint t = new Paint(paint);
            t.setColor(ColorUtils.HSLToColor(new float[]{hue, night ? 0.65f : 0.45f, night ? 0.78f : 0.36f}));
            t.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
            t.setTextSize(s * 0.5f);
            t.setTextAlign(Paint.Align.CENTER);
            canvas.drawText(letter, x + s / 2f, y + s / 2f + s * 0.17f, t);
            t.setTextAlign(Paint.Align.LEFT);
        }
    }

    /* ================= 圆角位图 / 缩放 ================= */

    private static void drawRoundedBitmap(Canvas canvas, Paint paint, Bitmap b,
                                          float x, float y, float w, float h, float radius) {
        canvas.save();
        canvas.clipPath(roundRect(x, y, w, h, radius));
        canvas.drawBitmap(b, null, new android.graphics.RectF(x, y, x + w, y + h), paint);
        canvas.restore();
    }

    private static void drawContain(Canvas canvas, Paint paint, Bitmap b,
                                    float x, float y, float w, float h) {
        paint.setFilterBitmap(true);
        float s = Math.min(w / b.getWidth(), h / b.getHeight());
        float dw = b.getWidth() * s, dh = b.getHeight() * s;
        canvas.drawBitmap(b, x + (w - dw) / 2f, y + (h - dh) / 2f, paint);
    }

    /** cover 居中裁切：位图铺满目标区域（超出部分裁掉），带圆角 */
    private static void drawCoverBitmap(Canvas canvas, Paint paint, Bitmap b,
                                        float x, float y, float w, float h, float radius) {
        paint.setFilterBitmap(true);
        float scale = Math.max(w / b.getWidth(), h / b.getHeight());
        float dw = b.getWidth() * scale, dh = b.getHeight() * scale;
        canvas.save();
        canvas.clipPath(roundRect(x, y, w, h, radius));
        canvas.drawBitmap(b, x + (w - dw) / 2f, y + (h - dh) / 2f, paint);
        canvas.restore();
    }

    private static Path roundRect(float x, float y, float w, float h, float r) {
        Path p = new Path();
        p.addRoundRect(x, y, x + w, y + h, r, r, Path.Direction.CW);
        return p;
    }

    /* ================= 文本 ================= */

    private static List<String> wrap(Paint p, String text, float maxW, int maxLines) {
        List<String> out = new ArrayList<>();
        for (String para : (text == null ? "" : text).split("\n")) {
            if (out.size() >= maxLines) break;
            String rest = para.replaceAll("\\s+$", "");
            if (rest.isEmpty()) { if (!out.isEmpty()) out.add(""); continue; }
            StringBuilder cur = new StringBuilder();
            for (int i = 0; i < rest.length(); i++) {
                char ch = rest.charAt(i);
                String next = cur.toString() + ch;
                if (p.measureText(next) > maxW && cur.length() > 0) {
                    out.add(cur.toString());
                    if (out.size() >= maxLines) break;
                    cur = new StringBuilder();
                }
                cur.append(ch);
            }
            if (out.size() < maxLines && cur.length() > 0) out.add(cur.toString());
        }
        if (out.size() > maxLines) out.subList(maxLines, out.size()).clear();
        return out;
    }

    private static String ellipsize(Paint p, String text, float maxW) {
        if (p.measureText(text) <= maxW) return text;
        String t = text;
        while (t.length() > 1 && p.measureText(t + "…") > maxW) {
            t = t.substring(0, t.length() - 1);
        }
        return t + "…";
    }

    private static String hostOf(String url) {
        try { return new java.net.URL(url).getHost(); } catch (Exception e) { return "web"; }
    }

    /* ================= 图片解码 ================= */

    private static Bitmap decodeDownsampled(byte[] bytes, int targetW) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        int sample = 1;
        while (o.outWidth / (sample * 2) >= targetW) sample *= 2;
        BitmapFactory.Options o2 = new BitmapFactory.Options();
        o2.inSampleSize = sample;
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o2);
    }

    /** 解码全部候选并择优：URL 含 favicon、正方形、分辨率高者得分更高（避免偏大/偏小的图标） */
    private static Bitmap fetchFavicon(Context c, Rules.Meta meta) {
        List<String> candidates = meta.faviconCandidates;
        if (candidates == null) {
            candidates = new ArrayList<>();
            try {
                candidates.add(new java.net.URL(new java.net.URL(meta.url), "/favicon.ico").toString());
            } catch (Exception e) { /* ignore */ }
        }
        Bitmap best = null;
        int bestScore = -1;
        for (String u : candidates) {
            Bitmap b = null;
            try {
                byte[] bytes = Http.fetchBytes(u, meta.url, 1_000_000);
                b = BitmapFactory.decodeStream(new ByteArrayInputStream(bytes));
            } catch (Exception e) { /* 尝试下一个候选 */ }
            if (b == null) continue;
            int w = b.getWidth(), h = b.getHeight();
            int big = Math.max(w, h), small = Math.min(w, h);
            if (small < 8 || big / (float) small > 2.5f) { b.recycle(); continue; }
            int score = (w == h ? 1000 : 0)
                    + (small >= 32 ? 500 : small >= 16 ? 200 : 0)
                    + (u.toLowerCase().contains("favicon") ? 2000 : 0)
                    + Math.min(small, 256);
            if (score > bestScore) {
                if (best != null) best.recycle();
                best = b;
                bestScore = score;
            } else {
                b.recycle();
            }
        }
        if (best != null) {
            Bitmap trimmed = trimFaviconBorder(best);
            if (trimmed != best) best.recycle();
            best = trimmed;
        }
        return best;
    }

    /**
     * 裁掉图标四周的纯色 / 透明留白，让内容铺满位图（cover 铺满外框前必须调用，
     * 否则 logo 只占外框中间一小块）。
     */
    private static Bitmap trimFaviconBorder(Bitmap src) {
        int w = src.getWidth(), h = src.getHeight();
        if (w < 12 || h < 12) return src;
        int[] px = new int[w * h];
        src.getPixels(px, 0, w, 0, 0, w, h);
        int bg = px[0];
        boolean bgTransparent = (bg >>> 24) < 16;
        int minX = w, minY = h, maxX = -1, maxY = -1;
        for (int y = 0; y < h; y++) {
            for (int x = 0; x < w; x++) {
                int p = px[y * w + x];
                boolean content = bgTransparent
                        ? (p >>> 24) >= 16
                        : colorDist(p, bg) > 48;
                if (!content) continue;
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
        if (maxX < 0) return src;   // 全透明
        int inset = Math.max(1, Math.round(Math.max(w, h) * 0.015f));
        minX = Math.max(0, minX - inset);
        minY = Math.max(0, minY - inset);
        maxX = Math.min(w - 1, maxX + inset);
        maxY = Math.min(h - 1, maxY + inset);
        int cw = maxX - minX + 1, ch = maxY - minY + 1;
        if (cw >= w * 0.92f && ch >= h * 0.92f) return src;   // 内容已铺满，无需裁
        return Bitmap.createBitmap(px, minY * w + minX, w, cw, ch, src.getConfig());
    }

    private static int colorDist(int p, int q) {
        return Math.abs(((p >> 16) & 0xFF) - ((q >> 16) & 0xFF))
                + Math.abs(((p >> 8) & 0xFF) - ((q >> 8) & 0xFF))
                + Math.abs((p & 0xFF) - (q & 0xFF))
                + Math.abs((p >>> 24) - (q >>> 24));
    }
}
