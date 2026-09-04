package com.nekoslio.simpshare;

import android.content.Context;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import com.google.android.material.card.MaterialCardView;

/** 程序化构建的 Material 3 操作流程 / 加载 / 错误视图（无布局 XML，控制体积）。 */
final class FlowView {

    private FlowView() {
    }

    /** 桌面入口看到的操作流程页 */
    static View instructions(Context c) {
        LinearLayout root = column(c);
        root.setPadding(dp(c, 24), dp(c, 32), dp(c, 24), dp(c, 32));

        TextView title = new TextView(c);
        title.setText(R.string.app_name);
        title.setTextSize(TypedValue.COMPLEX_UNIT_SP, 30);
        title.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        title.setTextColor(attrColor(c, com.google.android.material.R.attr.colorPrimary));
        root.addView(title);

        TextView subtitle = new TextView(c);
        subtitle.setText(R.string.tagline);
        subtitle.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        subtitle.setTextColor(attrColor(c, com.google.android.material.R.attr.colorOnSurfaceVariant));
        root.addView(subtitle, margin(0, dp(c, 4), 0, dp(c, 20)));

        MaterialCardView card = new MaterialCardView(c);
        LinearLayout.LayoutParams cardLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        cardLp.setMargins(0, 0, 0, dp(c, 20));
        card.setLayoutParams(cardLp);
        card.setRadius(dp(c, 24));
        card.setCardElevation(0);
        card.setCardBackgroundColor(attrColor(c, com.google.android.material.R.attr.colorSurfaceContainerLow));

        LinearLayout inner = column(c);
        int pad = dp(c, 20);
        inner.setPadding(pad, pad, pad, pad);
        card.addView(inner);

        TextView head = new TextView(c);
        head.setText(R.string.flow_title);
        head.setTextSize(TypedValue.COMPLEX_UNIT_SP, 17);
        head.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        head.setTextColor(attrColor(c, com.google.android.material.R.attr.colorOnSurface));
        inner.addView(head, margin(0, 0, 0, dp(c, 16)));

        inner.addView(step(c, "1", R.string.flow_step1));
        inner.addView(step(c, "2", R.string.flow_step2), margin(0, dp(c, 14), 0, 0));
        inner.addView(step(c, "3", R.string.flow_step3), margin(0, dp(c, 14), 0, 0));

        root.addView(card);

        TextView foot = new TextView(c);
        foot.setText(R.string.flow_footer);
        foot.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        foot.setTextColor(attrColor(c, com.google.android.material.R.attr.colorOnSurfaceVariant));
        root.addView(foot);

        return wrapInScroll(root);
    }

    /** 分享处理中的加载页：居中的 M3 圆角卡片，内含加载动画与文案 */
    static View loading(Context c) {
        FrameLayout root = new FrameLayout(c);

        MaterialCardView card = new MaterialCardView(c);
        FrameLayout.LayoutParams cardLp = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT, FrameLayout.LayoutParams.WRAP_CONTENT,
                Gravity.CENTER);
        cardLp.setMargins(dp(c, 24), dp(c, 24), dp(c, 24), dp(c, 24));
        card.setLayoutParams(cardLp);
        card.setRadius(dp(c, 28));
        card.setCardElevation(dp(c, 3));
        card.setCardBackgroundColor(attrColor(c, com.google.android.material.R.attr.colorSurfaceContainerHigh));

        LinearLayout inner = column(c);
        inner.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(c, 32);
        inner.setPadding(pad, pad, pad, pad);

        com.google.android.material.progressindicator.CircularProgressIndicator bar =
                new com.google.android.material.progressindicator.CircularProgressIndicator(c);
        // 程序化创建时 indeterminate 动画可能不自动播放：挂载后做一次可见性切换触发
        bar.setVisibility(View.INVISIBLE);
        inner.addView(bar);
        bar.post(() -> bar.setVisibility(View.VISIBLE));

        TextView t = new TextView(c);
        t.setText(R.string.generating);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        t.setTextColor(attrColor(c, com.google.android.material.R.attr.colorOnSurface));
        t.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams tLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        tLp.setMargins(0, dp(c, 20), 0, 0);
        t.setLayoutParams(tLp);
        inner.addView(t);

        card.addView(inner);
        root.addView(card);
        return root;
    }

    /** 生成失败：流程 + 错误信息 */
    static View error(Context c, String message) {
        LinearLayout root = (LinearLayout) instructions(c);
        MaterialCardView card = new MaterialCardView(c);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(0, dp(c, 20), 0, 0);
        card.setLayoutParams(lp);
        card.setRadius(dp(c, 16));
        card.setCardElevation(0);
        card.setCardBackgroundColor(attrColor(c, com.google.android.material.R.attr.colorErrorContainer));
        TextView err = new TextView(c);
        err.setText(c.getString(R.string.error_title) + "\n" + message);
        err.setTextSize(TypedValue.COMPLEX_UNIT_SP, 14);
        err.setTextColor(attrColor(c, com.google.android.material.R.attr.colorOnErrorContainer));
        int pad = dp(c, 16);
        err.setPadding(pad, pad, pad, pad);
        card.addView(err);
        root.addView(card, root.getChildCount() - 1, lp);
        return wrapInScroll(root);
    }

    /* ---------- 内部 ---------- */

    private static View step(Context c, String no, int textRes) {
        LinearLayout row = new LinearLayout(c);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);

        TextView badge = new TextView(c);
        badge.setText(no);
        badge.setTextSize(TypedValue.COMPLEX_UNIT_SP, 16);
        badge.setTypeface(Typeface.create(Typeface.DEFAULT, Typeface.BOLD));
        badge.setTextColor(attrColor(c, com.google.android.material.R.attr.colorOnPrimaryContainer));
        badge.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(attrColor(c, com.google.android.material.R.attr.colorPrimaryContainer));
        badge.setBackground(bg);
        rootLayoutParams(badge, dp(c, 36), dp(c, 36));

        TextView t = text(c, textRes, 15, attrColor(c, com.google.android.material.R.attr.colorOnSurface));
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f);
        lp.setMargins(dp(c, 16), 0, 0, 0);
        t.setLayoutParams(lp);

        row.addView(badge);
        row.addView(t);
        return row;
    }

    private static TextView text(Context c, int res, float sp, int color) {
        TextView t = new TextView(c);
        t.setText(res);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
    }

    private static LinearLayout column(Context c) {
        LinearLayout l = new LinearLayout(c);
        l.setOrientation(LinearLayout.VERTICAL);
        return l;
    }

    private static ScrollView wrapInScroll(View content) {
        ScrollView s = new ScrollView(content.getContext());
        s.setFillViewport(true);
        s.addView(content);
        return s;
    }

    private static void rootLayoutParams(View v, int w, int h) {
        v.setLayoutParams(new LinearLayout.LayoutParams(w, h));
    }

    private static LinearLayout.LayoutParams margin(int l, int t, int r, int b) {
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT);
        lp.setMargins(l, t, r, b);
        return lp;
    }

    private static int attrColor(Context c, int attr) {
        TypedValue tv = new TypedValue();
        c.getTheme().resolveAttribute(attr, tv, true);
        return tv.data;
    }

    private static int dp(Context c, int v) {
        return (int) TypedValue.applyDimension(
                TypedValue.COMPLEX_UNIT_DIP, v, c.getResources().getDisplayMetrics());
    }

}
