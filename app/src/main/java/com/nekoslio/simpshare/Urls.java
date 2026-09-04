package com.nekoslio.simpshare;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 从系统分享的文本中提取 URL。 */
final class Urls {

    private static final Pattern URL = Pattern.compile(
            "https?://[\\w\\-.(?:%3A%2F%2F)]+[\\w\\-/._?%&=+#:~!$'()*+,;=@\\]]+",
            Pattern.CASE_INSENSITIVE);

    private Urls() {
    }

    static String extract(String text) {
        if (text == null) return null;
        Matcher m = URL.matcher(text);
        if (m.find()) {
            String u = m.group();
            // 去掉常见尾部标点（中文引号/括号/句号等被分享文本带入的情况）
            return u.replaceAll("[。，、）》」』\"'\\)\\]\\}.,;:!?]+$", "");
        }
        return null;
    }
}
