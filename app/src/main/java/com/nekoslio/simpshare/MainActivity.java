package com.nekoslio.simpshare;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.view.View;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.button.MaterialButton;
import com.google.android.material.card.MaterialCardView;
import com.nekoslio.simpshare.rules.Rules;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * 桌面入口：展示操作流程 + 站点规则订阅管理。
 * 规则文件与浏览器扩展端同构（siteRules + redirect.rules），导入后替换内置规则，
 * 生效于之后的每次卡片生成。真正的功能入口在任意应用的系统分享菜单里。
 */
public class MainActivity extends AppCompatActivity {

    private static final int REQUEST_IMPORT_RULES = 41;
    private static final String RULES_FILE = "rules.json";

    private TextView ruleStatus;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        LinearLayout root = FlowView.instructionsColumn(this);
        root.addView(rulesCard(), root.getChildCount() - 1, FlowView.margin(0, FlowView.dp(this, 20), 0, 0));
        root.addView(loginCard(), root.getChildCount() - 1, FlowView.margin(0, FlowView.dp(this, 20), 0, 0));
        setContentView(FlowView.wrapInScroll(root));
        loadPersistedRules();
    }

    /* ---------- 网页登录卡片 ---------- */

    private View loginCard() {
        MaterialCardView card = new MaterialCardView(this);
        card.setRadius(FlowView.dp(this, 24));
        card.setCardElevation(0);
        card.setCardBackgroundColor(FlowView.attrColor(this,
                com.google.android.material.R.attr.colorSurfaceContainerLow));

        LinearLayout inner = FlowView.column(this);
        int pad = FlowView.dp(this, 20);
        inner.setPadding(pad, pad, pad, pad);
        card.addView(inner);

        TextView head = new TextView(this);
        head.setText(R.string.web_login_title);
        head.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 17);
        head.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT,
                android.graphics.Typeface.BOLD));
        head.setTextColor(FlowView.attrColor(this,
                com.google.android.material.R.attr.colorOnSurface));
        inner.addView(head, FlowView.margin(0, 0, 0, FlowView.dp(this, 8)));

        TextView hint = new TextView(this);
        hint.setText(R.string.login_hint);
        hint.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 13);
        hint.setTextColor(FlowView.attrColor(this,
                com.google.android.material.R.attr.colorOnSurfaceVariant));
        inner.addView(hint, FlowView.margin(0, 0, 0, FlowView.dp(this, 12)));

        LinearLayout row = FlowView.column(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        String[] labels = {"闲鱼", "淘宝", "京东", "拼多多"};
        String[] urls = {
                "https://www.goofish.com/",
                "https://www.taobao.com/",
                "https://www.jd.com/",
                "https://mobile.yangkeduo.com/"
        };
        for (int i = 0; i < labels.length; i++) {
            final String url = urls[i];
            MaterialButton chip = new MaterialButton(this, null,
                    com.google.android.material.R.attr.materialButtonOutlinedStyle);
            chip.setText(labels[i]);
            chip.setMinimumWidth(0);
            chip.setPadding(FlowView.dp(this, 8), 0, FlowView.dp(this, 8), 0);
            chip.setOnClickListener(v -> startActivity(
                    new Intent(this, LoginWebViewActivity.class).setData(Uri.parse(url))));
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(0,
                    LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
            if (i > 0) lp.setMargins(FlowView.dp(this, 8), 0, 0, 0);
            row.addView(chip, lp);
        }
        inner.addView(row);
        return card;
    }

    /* ---------- 规则订阅卡片 ---------- */

    private View rulesCard() {
        MaterialCardView card = new MaterialCardView(this);
        card.setRadius(FlowView.dp(this, 24));
        card.setCardElevation(0);
        card.setCardBackgroundColor(FlowView.attrColor(this,
                com.google.android.material.R.attr.colorSurfaceContainerLow));

        LinearLayout inner = FlowView.column(this);
        int pad = FlowView.dp(this, 20);
        inner.setPadding(pad, pad, pad, pad);
        card.addView(inner);

        TextView head = new TextView(this);
        head.setText(R.string.rules_title);
        head.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 17);
        head.setTypeface(android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT,
                android.graphics.Typeface.BOLD));
        head.setTextColor(FlowView.attrColor(this,
                com.google.android.material.R.attr.colorOnSurface));
        inner.addView(head, FlowView.margin(0, 0, 0, FlowView.dp(this, 12)));

        ruleStatus = new TextView(this);
        ruleStatus.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14);
        ruleStatus.setTextColor(FlowView.attrColor(this,
                com.google.android.material.R.attr.colorOnSurfaceVariant));
        inner.addView(ruleStatus, FlowView.margin(0, 0, 0, FlowView.dp(this, 16)));

        LinearLayout row = FlowView.column(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        MaterialButton importBtn = new MaterialButton(this);
        importBtn.setText(R.string.rules_import);
        importBtn.setOnClickListener(v -> startImport());
        row.addView(importBtn, new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        MaterialButton resetBtn = new MaterialButton(this, null,
                com.google.android.material.R.attr.materialButtonOutlinedStyle);
        resetBtn.setText(R.string.rules_reset);
        resetBtn.setOnClickListener(v -> resetRules());
        LinearLayout.LayoutParams resetLp = new LinearLayout.LayoutParams(0,
                LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        resetLp.setMargins(FlowView.dp(this, 12), 0, 0, 0);
        row.addView(resetBtn, resetLp);
        inner.addView(row);

        updateRuleStatus();
        return card;
    }

    private void updateRuleStatus() {
        ruleStatus.setText(Rules.describe());
    }

    /* ---------- 导入 ---------- */

    private void startImport() {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType("application/json");
        intent.putExtra(Intent.EXTRA_MIME_TYPES,
                new String[]{"application/json", "text/plain", "application/octet-stream"});
        startActivityForResult(intent, REQUEST_IMPORT_RULES);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQUEST_IMPORT_RULES || resultCode != RESULT_OK
                || data == null || data.getData() == null) return;
        Uri uri = data.getData();
        // 读文件与解析放后台线程，完成后回 UI 更新状态
        new Thread(() -> {
            try (InputStream in = getContentResolver().openInputStream(uri)) {
                String json = readAll(in);
                Rules.replace(json);
                persist(json);
                runOnUiThread(() -> {
                    updateRuleStatus();
                    Toast.makeText(this, getString(R.string.rules_imported, fileName(uri)),
                            Toast.LENGTH_LONG).show();
                });
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(this,
                        getString(R.string.rules_import_failed, String.valueOf(e)),
                        Toast.LENGTH_LONG).show());
            }
        }, "simpshare-import").start();
    }

    private void loadPersistedRules() {
        File file = new File(getFilesDir(), RULES_FILE);
        new Thread(() -> {
            try {
                if (file.exists()) {
                    Rules.replace(readAll(new java.io.FileInputStream(file)));
                } else {
                    Rules.load(getAssets());   // 主页先把内置规则加载起来，状态行才有数字
                }
            } catch (Exception e) {
                // 持久化文件损坏：删掉回退内置
                file.delete();
                try { Rules.reset(getAssets()); } catch (Exception ignored) { }
            }
            runOnUiThread(this::updateRuleStatus);
        }, "simpshare-rules-load").start();
    }

    private void resetRules() {
        File file = new File(getFilesDir(), RULES_FILE);
        if (file.exists()) file.delete();
        try {
            Rules.reset(getAssets());
            Toast.makeText(this, R.string.rules_reset_done, Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Toast.makeText(this, getString(R.string.rules_import_failed, String.valueOf(e)),
                    Toast.LENGTH_LONG).show();
        }
        updateRuleStatus();
    }

    /** 导入成功后落盘，下次启动自动生效 */
    private void persist(String json) throws Exception {
        try (FileOutputStream out = openFileOutput(RULES_FILE, MODE_PRIVATE)) {
            out.write(json.getBytes(StandardCharsets.UTF_8));
        }
    }

    private static String readAll(InputStream in) throws Exception {
        java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream();
        byte[] buf = new byte[8192];
        int n;
        try (InputStream cin = in) {
            while ((n = cin.read(buf)) > 0) out.write(buf, 0, n);
        }
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    private String fileName(Uri uri) {
        try (android.database.Cursor c = getContentResolver().query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String name = c.getString(idx);
                    if (name != null && !name.isEmpty()) return name;
                }
            }
        } catch (Exception e) { /* 忽略，退回 uri 名 */ }
        return uri.getLastPathSegment();
    }
}
