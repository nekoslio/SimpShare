package com.nekoslio.simpshare;

import android.annotation.SuppressLint;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.LinearLayout;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;

/**
 * 应用内网页登录：登录门禁站点（闲鱼 / 淘宝 / 京东 / 拼多多）在这里登录网页版，
 * Cookie 存进应用的 WebView CookieManager 并持久化——之后 HeadlessCapture 的无头
 * WebView 即为登录态，分享这些站点的链接才能拿到完整商品信息。UA 与无头捕获
 * 保持一致（桌面 UA），确保登录的页面和无头捕获渲染的是同一套 DOM。
 */
public class LoginWebViewActivity extends AppCompatActivity {

    private static final String[] SITES = {
            "https://www.goofish.com/",
            "https://www.taobao.com/",
            "https://www.jd.com/",
            "https://mobile.yangkeduo.com/"
    };
    private static final String[] LABELS = {"闲鱼", "淘宝", "京东", "拼多多"};

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        int pad = (int) (getResources().getDisplayMetrics().density * 12);
        bar.setPadding(pad, pad, pad, pad);
        LinearLayout.LayoutParams chipLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        chipLp.setMargins(0, 0, pad / 2, 0);
        for (int i = 0; i < SITES.length; i++) {
            final String url = SITES[i];
            MaterialButton chip = new MaterialButton(this, null,
                    com.google.android.material.R.attr.materialButtonOutlinedStyle);
            chip.setText(LABELS[i]);
            chip.setMinimumWidth(0);
            chip.setPadding(pad / 2, 0, pad / 2, 0);
            chip.setOnClickListener(v -> web.loadUrl(url));
            bar.addView(chip, chipLp);
        }
        MaterialButton done = new MaterialButton(this);
        done.setText(R.string.login_done);
        done.setOnClickListener(v -> {
            CookieManager.getInstance().flush();
            android.widget.Toast.makeText(this, R.string.login_saved, android.widget.Toast.LENGTH_SHORT).show();
            finish();
        });
        bar.addView(done, chipLp);
        root.addView(bar);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setUserAgentString(HeadlessCapture.UA);
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return false;   // 登录跳转留在应用内 WebView，Cookie 才留得下
            }
        });
        root.addView(web, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f));
        setContentView(root);

        android.net.Uri data = getIntent().getData();
        web.loadUrl(data != null ? data.toString() : SITES[0]);
    }

    @Override
    protected void onPause() {
        CookieManager.getInstance().flush();   // 登录 Cookie 立即落盘
        super.onPause();
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }
}
