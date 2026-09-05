package com.nekoslio.simpshare;

import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.Bundle;
import android.text.TextUtils;
import android.util.Log;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;

import com.nekoslio.simpshare.card.CardRenderer;

import java.io.File;

/** 分享入口：接收系统分享的文本/链接，生成卡片图片后再唤起系统分享。 */
public class ShareActivity extends AppCompatActivity {

    private static final String TAG = "SimpShare";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        handleShare();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        // 已在栈顶时再次收到分享（如上一张卡片停在错误页），否则新分享会被静默丢弃
        setIntent(intent);
        handleShare();
    }

    /** 处理一次分享：无文本时仅展示操作流程，有文本时生成卡片图片并唤起系统分享 */
    private void handleShare() {
        String text = extractSharedText(getIntent());
        if (TextUtils.isEmpty(text)) {
            // 直接打开时仅展示操作流程
            startActivity(new Intent(this, MainActivity.class));
            finish();
            return;
        }
        setContentView(FlowView.loading(this));
        Log.i(TAG, "shared text: " + text);
        final String url = Urls.extract(text);
        if (TextUtils.isEmpty(url)) {
            Log.w(TAG, "no url in shared text: " + text);
            setContentView(FlowView.error(this, getString(R.string.error_no_url)));
            return;
        }
        final String raw = text;
        // 分享文本兜底信息：酷安等 App 分享的文本自带【标题】与“分享xxx的图文”前缀，
        // 站点数据拿不到真实标题时用它兜底
        final String titleHint;
        final String descHint;
        int open = text.indexOf('【');
        int close = open >= 0 ? text.indexOf('】', open) : -1;
        if (open >= 0 && close > open) {
            titleHint = text.substring(open + 1, close).trim();
            String prefix = text.substring(0, open).trim();
            descHint = prefix.replaceAll("[：:]$", "");
        } else {
            titleHint = null;
            descHint = null;
        }
        new Thread(() -> {
            try {
                Bitmap card = CardRenderer.render(ShareActivity.this, url, titleHint, descHint);
                File out = savePng(card);
                Uri uri = FileProvider.getUriForFile(
                        ShareActivity.this, getPackageName() + ".fileprovider", out);

                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("image/png");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_TEXT, raw);
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

                Intent chooser = Intent.createChooser(send, getString(R.string.share_chooser_title));
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                startActivity(chooser);
                finish();
            } catch (Exception e) {
                Log.e(TAG, "card generation failed for " + url, e);
                runOnUiThread(() -> setContentView(
                        FlowView.error(this, getString(R.string.error_generate, String.valueOf(e)))));
            }
        }, "simpshare-generate").start();
    }

    private static String extractSharedText(Intent intent) {
        if (intent == null) return null;
        if (!Intent.ACTION_SEND.equals(intent.getAction())) return null;
        return intent.getStringExtra(Intent.EXTRA_TEXT);
    }

    private File savePng(Bitmap card) throws Exception {
        File dir = new File(getCacheDir(), "share");
        if (!dir.exists()) dir.mkdirs();
        File out = new File(dir, "simpshare-card.png");
        try (java.io.FileOutputStream fos = new java.io.FileOutputStream(out)) {
            card.compress(Bitmap.CompressFormat.PNG, 100, fos);
        }
        return out;
    }
}
