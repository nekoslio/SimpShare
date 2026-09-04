package com.nekoslio.simpshare.rules;

import android.content.res.AssetManager;
import android.text.TextUtils;

import com.nekoslio.simpshare.net.Http;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 规则引擎：复用浏览器扩展端的 GKD 风格声明式规则（assets/rules.json，数据与主体分离）。
 * 本类负责：规则匹配（hosts 后缀 + path 正则 + 排除段 + 哈希路由）、
 * 元信息提取（重点站点结构化提取 + 全站 og: <meta> 兜底）、favicon 候选解析。
 */
public final class Rules {

    public static class Rule {
        public String id;
        public String label;
        public List<Match> alts = new ArrayList<>();
        public boolean containCover;
        public boolean hideDesc;
    }

    public static class Match {
        public String[] hosts;
        public Pattern path;
        public Pattern exclude;
        public boolean requireQueryVid;
        public boolean pathAndHash;
    }

    /** 提取结果 */
    public static class Meta {
        public String url;
        public String title = "";
        public String description = "";
        public String coverUrl;
        /** og 封面缺失或抓取失败时的备选直链（如 GitHub 的 opengraph.githubassets.com） */
        public String coverFallbackUrl;
        public List<String> faviconCandidates;
        public boolean hasCover;
        public boolean containCover;
        public boolean hideDesc;
        public String ruleId;
    }

    /** 卡片展示链接改写规则（redirect.rules，与扩展端订阅文件同构） */
    private static final class Redirect {
        final Pattern match;
        final String replace;
        final Pattern unmatch;
        final String unreplace;

        Redirect(Pattern match, String replace, Pattern unmatch, String unreplace) {
            this.match = match;
            this.replace = replace;
            this.unmatch = unmatch;
            this.unreplace = unreplace;
        }
    }

    /** 一次解析得到的完整规则集（先解析后替换，导入失败不影响当前规则） */
    private static final class Parsed {
        final List<Rule> rules = new ArrayList<>();
        final List<Redirect> redirects = new ArrayList<>();
        String name = "";
        String version = "";
    }

    private static final List<Rule> RULES = new ArrayList<>();
    private static final List<Redirect> REDIRECTS = new ArrayList<>();
    private static boolean customSource;
    private static String sourceName = "";
    private static String sourceVersion = "";

    private Rules() {
    }

    public static synchronized void load(AssetManager assets) throws Exception {
        if (!RULES.isEmpty()) return;
        install(parse(readText(assets.open("rules.json"))), false);
    }

    /** 导入规则订阅文件（扩展端同构 rules.json），解析成功才替换当前规则集 */
    public static synchronized void replace(String json) throws Exception {
        install(parse(json), true);
    }

    /** 丢弃导入的规则，恢复内置订阅 */
    public static synchronized void reset(AssetManager assets) throws Exception {
        install(parse(readText(assets.open("rules.json"))), false);
    }

    private static void install(Parsed p, boolean custom) {
        RULES.clear();
        RULES.addAll(p.rules);
        REDIRECTS.clear();
        REDIRECTS.addAll(p.redirects);
        customSource = custom;
        sourceName = p.name;
        sourceVersion = p.version;
    }

    /** 规则页状态文案 */
    public static synchronized String describe() {
        String label = customSource
                ? (sourceName.isEmpty() ? "自定义规则" : sourceName)
                : "内置订阅";
        StringBuilder sb = new StringBuilder("当前使用：").append(label);
        if (!sourceVersion.isEmpty()) sb.append(" v").append(sourceVersion);
        sb.append("\n").append(RULES.size()).append(" 个站点 · 链接改写 ")
                .append(REDIRECTS.size()).append(" 条");
        if (customSource) sb.append("\n来源：导入的规则文件");
        return sb.toString();
    }

    /**
     * 卡片展示链接改写（如 b23.tv/x → b23bb.tv/x）；只影响展示与二维码，未命中原样返回。
     */
    public static synchronized String applyRedirect(String url) {
        if (url == null) return null;
        for (Redirect r : REDIRECTS) {
            Matcher m = r.match.matcher(url);
            if (m.find()) return m.replaceFirst(r.replace);
        }
        return url;
    }

    /** 展示链接反向还原为源链接（抓取与规则匹配用），未命中原样返回 */
    public static synchronized String unRedirect(String url) {
        if (url == null) return null;
        for (Redirect r : REDIRECTS) {
            if (r.unmatch == null) continue;
            Matcher m = r.unmatch.matcher(url);
            if (m.find()) return m.replaceFirst(r.unreplace);
        }
        return url;
    }

    private static String readText(InputStream in) throws Exception {
        byte[] buf = new byte[1024];
        StringBuilder sb = new StringBuilder();
        int n;
        try (InputStream cin = in) {
            while ((n = cin.read(buf)) > 0) sb.append(new String(buf, 0, n, StandardCharsets.UTF_8));
        }
        return sb.toString();
    }

    private static Parsed parse(String json) throws Exception {
        Parsed p = new Parsed();
        JSONObject root = new JSONObject(json);
        JSONArray arr = root.getJSONArray("siteRules");
        p.name = root.optString("name", "");
        p.version = root.optString("version", "");
        for (int i = 0; i < arr.length(); i++) {
            JSONObject r = arr.getJSONObject(i);
            Rule rule = new Rule();
            rule.id = r.optString("id");
            rule.label = r.optString("label");
            JSONObject card = r.optJSONObject("card");
            if (card != null) {
                rule.containCover = card.optBoolean("containCover", false);
                rule.hideDesc = card.optBoolean("hideDesc", false);
            }
            JSONArray alts = r.has("matchAny") ? r.getJSONArray("matchAny") : null;
            if (alts == null && r.has("match")) {
                alts = new JSONArray().put(r.getJSONObject("match"));
            }
            if (alts != null) {
                for (int j = 0; j < alts.length(); j++) {
                    JSONObject m = alts.getJSONObject(j);
                    Match mm = new Match();
                    JSONArray hosts = m.optJSONArray("hosts");
                    if (hosts != null) {
                        mm.hosts = new String[hosts.length()];
                        for (int k = 0; k < hosts.length(); k++) mm.hosts[k] = hosts.getString(k);
                    }
                    String path = m.optString("path", null);
                    if (path != null) mm.path = Pattern.compile(path, Pattern.CASE_INSENSITIVE);
                    String excl = m.optString("pathExclude", null);
                    if (excl != null) mm.exclude = Pattern.compile(excl, Pattern.CASE_INSENSITIVE);
                    mm.requireQueryVid = m.optJSONObject("query") != null
                            && m.optJSONObject("query").has("vid");
                    mm.pathAndHash = "pathAndHash".equals(m.optString("pathSource"));
                    rule.alts.add(mm);
                }
            }
            p.rules.add(rule);
        }
        JSONObject redirect = root.optJSONObject("redirect");
        JSONArray rrs = redirect == null ? null : redirect.optJSONArray("rules");
        if (rrs != null) {
            for (int i = 0; i < rrs.length(); i++) {
                JSONObject r = rrs.getJSONObject(i);
                String match = r.optString("match", null);
                if (match == null) continue;
                String unmatch = r.optString("unmatch", null);
                p.redirects.add(new Redirect(
                        Pattern.compile(match),
                        r.optString("replace", ""),
                        unmatch == null ? null : Pattern.compile(unmatch),
                        r.optString("unreplace", "")));
            }
        }
        return p;
    }

    public static synchronized Rule match(String urlStr) {
        URL u = safeUrl(urlStr);
        if (u == null) return null;
        for (Rule rule : RULES) {
            for (Match m : rule.alts) {
                if (matchOne(m, u, urlStr)) return rule;
            }
        }
        return null;
    }

    private static boolean matchOne(Match m, URL u, String raw) {
        if (m.hosts != null) {
            boolean ok = false;
            for (String h : m.hosts) {
                if (u.getHost().equals(h) || u.getHost().endsWith("." + h)) { ok = true; break; }
            }
            if (!ok) return false;
        }
        String p = m.pathAndHash ? u.getPath() + hashPath(u) : u.getPath();
        if (m.path != null && !m.path.matcher(p).find()) return false;
        if (m.exclude != null && m.exclude.matcher(u.getPath()).find()) return false;
        if (m.requireQueryVid && !raw.contains("vid=")) return false;
        return true;
    }

    private static String hashPath(URL u) {
        String ref = u.getRef();
        if (ref != null && !ref.isEmpty()) return "/" + ref;
        return "";
    }

    /* ================= 元信息提取 ================= */

    public static Meta extract(String url) throws Exception {
        Rule rule = match(url);
        Meta meta = new Meta();
        meta.url = url;
        meta.ruleId = rule != null ? rule.id : null;
        if (rule != null) {
            meta.containCover = rule.containCover;
            meta.hideDesc = rule.hideDesc;
        }

        String html = null;
        if (rule != null && "bilibili-video".equals(rule.id)) {
            // 页面 HTML 会被 B 站 WAF 按 TLS 指纹拦截（返回 412），优先走开放 API
            if (!extractBilibiliApi(meta, url)) {
                html = Http.fetchText(url, null);
                extractBilibili(meta, html);
            }
        } else if (rule != null && "netease-music".equals(rule.id)) {
            extractNetease(meta, url);
        }

        if (meta.title.length() == 0 && meta.coverUrl == null) {
            if (html == null) html = Http.fetchText(url, null);
            extractOg(meta, html, url);
        }
        if (meta.title.length() == 0) meta.title = url;

        // GitHub：标题取 owner/repo，简介去官方样板句；
        // 封面备选直链（opengraph.githubassets.com 按 owner/repo 现生成，og 图抓取失败时重试）
        if (rule != null && "github".equals(rule.id)) {
            URL u = safeUrl(url);
            if (u != null) {
                java.util.regex.Matcher m = Pattern.compile("^/([^/]+)/([^/]+)")
                        .matcher(u.getPath());
                if (m.find()) {
                    meta.title = m.group(1) + "/" + m.group(2).replaceFirst("\\.git$", "");
                    meta.coverFallbackUrl = "https://opengraph.githubassets.com/1/"
                            + m.group(1) + "/" + m.group(2).replaceFirst("\\.git$", "");
                }
            }
            meta.description = meta.description
                    .replaceAll("\\s*Contribute to .*? on GitHub\\.?\\s*$", "").trim();
        }

        // 规则内且封面抓取条件满足 → 封面模式；未适配站点也允许 og 封面
        meta.hasCover = meta.coverUrl != null;

        // favicon 候选：结构化提取路径也补拉一次 HTML 以获得完整候选列表
        if (meta.faviconCandidates == null) {
            List<String> fb = new ArrayList<>();
            try {
                if (html == null) html = Http.fetchText(url, null);
                fb = faviconCandidates(html, url);
            } catch (Exception e) { /* ignore */ }
            if (fb.isEmpty()) {
                try { fb.add(new URL(new URL(url), "/favicon.ico").toString()); } catch (Exception e) { /* ignore */ }
            }
            meta.faviconCandidates = fb;
        }
        return meta;
    }

    /** og: / twitter: / itemprop / <title> 兜底提取（SW 同款正则策略） */
    private static void extractOg(Meta meta, String html, String baseUrl) {
        String ogTitle = getMeta(html, "og:title", "twitter:title");
        String desc = getMeta(html, "og:description", "twitter:description", "description");
        String cover = getMeta(html, "og:image", "og:image:secure_url", "twitter:image",
                "twitter:image:src", "image");
        if (ogTitle.length() == 0) {
            Matcher m = Pattern.compile("<title[^>]*>([\\s\\S]*?)</title>", Pattern.CASE_INSENSITIVE)
                    .matcher(html);
            if (m.find()) ogTitle = m.group(1).trim();
        }
        meta.title = cleanText(ogTitle);
        meta.description = cleanText(desc);
        if (cover.length() > 0) {
            try { meta.coverUrl = new URL(new URL(baseUrl), decodeEntities(cover)).toString(); }
            catch (Exception e) { meta.coverUrl = null; }
        }
        meta.faviconCandidates = faviconCandidates(html, baseUrl);
    }

    /**
     * B站开放 API 提取（x/web-interface/view，仅要求 UA，不受 WAF 指纹拦截）。
     * 返回 false 表示未取到，由调用方回退页面 HTML 提取。
     */
    private static boolean extractBilibiliApi(Meta meta, String url) {
        try {
            // b23.tv 短链先解析跳转：封面图床拒绝 b23.tv Referer（403），favicon 也不在短链域上
            String pageUrl = url;
            String id = videoIdFromPath(pageUrl);
            if (id == null) {
                try {
                    URL u = new URL(url);
                    String host = u.getHost() == null ? "" : u.getHost().toLowerCase();
                    if (host.equals("b23.tv") || host.endsWith(".b23.tv")) {
                        pageUrl = Http.resolve(url);
                        id = videoIdFromPath(pageUrl);
                    }
                } catch (Exception e) { /* ignore */ }
            }
            if (id == null) return false;
            String q = id.regionMatches(true, 0, "av", 0, 2)
                    ? "aid=" + id.substring(2) : "bvid=" + id;
            JSONObject root = new JSONObject(Http.fetchText(
                    "https://api.bilibili.com/x/web-interface/view?" + q,
                    "https://www.bilibili.com/"));
            if (root.optInt("code", -1) != 0) return false;
            JSONObject v = root.optJSONObject("data");
            if (v == null) return false;
            meta.url = pageUrl;
            meta.title = v.optString("title");
            String desc = v.optString("desc");
            JSONObject owner = v.optJSONObject("owner");
            String author = owner == null ? "" : owner.optString("name");
            meta.description = TextUtils.isEmpty(author) ? desc : "UP主：" + author + "\n" + desc;
            String pic = v.optString("pic");
            meta.coverUrl = pic.startsWith("http://")
                    ? pic.replaceFirst("^http://", "https://")
                    : (pic.isEmpty() ? null : pic);
            // API 路径不再回抓 HTML（会被 WAF 拒），favicon 直接用站点默认图标
            List<String> fb = new ArrayList<>();
            try { fb.add(new URL(new URL(pageUrl), "/favicon.ico").toString()); } catch (Exception e) { /* ignore */ }
            meta.faviconCandidates = fb;
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private static String videoIdFromPath(String url) {
        try {
            String p = new URL(url).getPath();
            if (p == null) return null;
            Matcher m = Pattern.compile("/video/(BV[0-9A-Za-z]{10}|[Aa][Vv]\\d+)").matcher(p);
            return m.find() ? m.group(1) : null;
        } catch (Exception e) {
            return null;
        }
    }

    /** B站：页面内嵌 __INITIAL_STATE__.videoData */
    private static void extractBilibili(Meta meta, String html) {
        String json = extractAssignedObject(html, "__INITIAL_STATE__");
        if (json == null) return;
        try {
            JSONObject v = new JSONObject(json).optJSONObject("videoData");
            if (v == null) return;
            meta.title = v.optString("title");
            meta.description = v.optString("desc");
            JSONObject owner = v.optJSONObject("owner");
            String author = owner == null ? "" : owner.optString("name");
            if (!TextUtils.isEmpty(author)) meta.description = "UP主：" + author + "\n" + meta.description;
            String pic = v.optString("pic");
            meta.coverUrl = pic.startsWith("http://") ? pic.replaceFirst("^http://", "https://") : pic;
        } catch (Exception e) {
            // 解析失败退回 og
        }
    }

    /** 网易云音乐：同源 Web API（song / album / playlist） */
    private static void extractNetease(Meta meta, String url) throws Exception {
        URL u = new URL(url);
        String path = u.getPath() == null ? "" : u.getPath();
        if (u.getRef() != null && !u.getRef().isEmpty()) path += "/" + u.getRef();
        String id = paramOf(url, "id");
        if (id == null) return;
        String json;
        try {
            if (path.contains("album") && !path.contains("song")) {
                json = Http.fetchText("https://music.163.com/api/album/" + id, null);
                JSONObject root = new JSONObject(json);
                JSONObject al = root.has("product") ? root.getJSONObject("product") : root;
                meta.title = al.optString("name");
                StringBuilder sb = new StringBuilder();
                JSONArray artists = al.optJSONArray("artists");
                if (artists == null) artists = al.optJSONArray("singer");
                if (artists != null && artists.length() > 0) {
                    sb.append("歌手：").append(joinNames(artists));
                }
                meta.description = sb.toString();
                meta.coverUrl = withParam(al.optString("picUrl"), "param=1000y1000");
                return;
            }
            if (path.contains("playlist")) {
                json = Http.fetchText("https://music.163.com/api/playlist/detail?id=" + id, null);
                JSONObject p = new JSONObject(json).getJSONObject("result");
                meta.title = p.optString("name");
                JSONObject creator = p.optJSONObject("creator");
                String desc = p.optString("description").replaceAll("\\s+", " ").trim();
                if (desc.length() > 160) desc = desc.substring(0, 160) + "…";
                String line1 = creator != null && creator.optString("nickname").length() > 0
                        ? "创建者：" + creator.optString("nickname") : "";
                String line2 = "共 " + p.optInt("trackCount") + " 首";
                meta.description = (line1 + "\n" + line2 + "\n" + desc)
                        .replaceAll("^[\\n]+", "").trim();
                meta.coverUrl = withParam(p.optString("coverImgUrl"), "param=1000y1000");
                return;
            }
            // song
            json = Http.fetchText(
                    "https://music.163.com/api/song/detail/?id=" + id + "&ids=%5B" + id + "%5D", null);
            JSONArray songs = new JSONObject(json).getJSONArray("songs");
            if (songs.length() == 0) return;
            JSONObject s = songs.getJSONObject(0);
            meta.title = s.optString("name");
            JSONArray artists = s.optJSONArray("artists");
            JSONObject album = s.optJSONObject("album");
            String line1 = artists != null && artists.length() > 0 ? "歌手：" + joinNames(artists) : "";
            String line2 = album != null && album.optString("name").length() > 0
                    ? "专辑：《" + album.optString("name") + "》" : "";
            meta.description = (line1 + "\n" + line2).replaceAll("^[\\n]+", "").trim();
            if (album != null) meta.coverUrl = withParam(album.optString("picUrl"), "param=1000y1000");
        } catch (Exception e) {
            // API 失败退回 og
        }
    }

    /* ================= favicon ================= */

    public static List<String> faviconCandidates(String html, String baseUrl) {
        // 候选按质量打分排序：URL 含 favicon 优先，其次 link[sizes] 声明的尺寸
        List<String> urls = new ArrayList<>();
        List<int[]> scored = new ArrayList<>();   // [score, index]
        Matcher tags = Pattern.compile("<link\\b[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
        while (tags.find() && urls.size() < 8) {
            String tag = tags.group();
            String rel = attrOf(tag, "rel");
            if (rel == null) continue;
            String relLow = rel.toLowerCase();
            if (!relLow.contains("icon") && !relLow.contains("apple-touch")) continue;
            String href = attrOf(tag, "href");
            if (href == null || href.isEmpty()) continue;
            String abs;
            try { abs = new URL(new URL(baseUrl), decodeEntities(href)).toString(); }
            catch (Exception e) { continue; }
            if (urls.contains(abs)) continue;
            int score = 0;
            if (abs.toLowerCase().contains("favicon")) score += 2000;
            String sizes = attrOf(tag, "sizes");
            if (sizes != null) {
                if (sizes.toLowerCase().contains("any")) score += 600;
                Matcher m = Pattern.compile("(\\d+)x(\\d+)", Pattern.CASE_INSENSITIVE).matcher(sizes);
                int best = 0;
                while (m.find()) {
                    best = Math.max(best, Math.min(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2))));
                }
                score += Math.min(best, 512);
            }
            urls.add(abs);
            scored.add(new int[]{score, urls.size() - 1});
        }
        try { urls.add(new URL(new URL(baseUrl), "/favicon.ico").toString()); } catch (Exception e) { /* ignore */ }
        scored.sort((a, b) -> Integer.compare(b[0], a[0]));
        List<String> out = new ArrayList<>();
        for (int[] s : scored) out.add(urls.get(s[1]));
        for (int i = scored.size(); i < urls.size(); i++) out.add(urls.get(i));
        return out;
    }

    /* ================= 工具 ================= */

    /** meta 文本清洗：部分站点（如 MediaWiki 系）的 og:title 自带 HTML 标记，解码实体后需剥离标签并压平空白 */
    private static String cleanText(String s) {
        if (s == null) return "";
        return decodeEntities(s).replaceAll("<[^>]*>", "").replaceAll("\\s+", " ").trim();
    }

    private static String getMeta(String html, String... keys) {
        Matcher tags = Pattern.compile("<meta\\b[^>]*>", Pattern.CASE_INSENSITIVE).matcher(html);
        while (tags.find()) {
            String tag = tags.group();
            String k = firstNonEmpty(attrOf(tag, "property"), attrOf(tag, "name"), attrOf(tag, "itemprop"));
            if (k == null) continue;
            for (String key : keys) {
                if (k.equalsIgnoreCase(key)) {
                    String v = attrOf(tag, "content");
                    if (v != null && !v.isEmpty()) return v;
                }
            }
        }
        return "";
    }

    private static String attrOf(String tag, String name) {
        Matcher m = Pattern.compile(name + "\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", Pattern.CASE_INSENSITIVE)
                .matcher(tag);
        return m.find() ? (m.group(2) != null ? m.group(2) : m.group(3)) : null;
    }

    /** 提取 `varName = {...}` 的 JSON 文本（平衡花括号扫描） */
    private static String extractAssignedObject(String html, String varName) {
        int i = html.indexOf(varName);
        if (i < 0) return null;
        int start = html.indexOf('{', i);
        if (start < 0) return null;
        int depth = 0, end = -1;
        boolean inStr = false, esc = false;
        for (int j = start; j < html.length() && j - start < 4_000_000; j++) {
            char ch = html.charAt(j);
            if (esc) { esc = false; continue; }
            if (inStr) {
                if (ch == '\\') esc = true;
                else if (ch == '"') inStr = false;
                continue;
            }
            if (ch == '"') inStr = true;
            else if (ch == '{') depth++;
            else if (ch == '}') { depth--; if (depth == 0) { end = j + 1; break; } }
        }
        return end > 0 ? html.substring(start, end) : null;
    }

    private static String joinNames(JSONArray arr) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < arr.length(); i++) {
            JSONObject o = arr.optJSONObject(i);
            String name = o != null ? o.optString("name") : arr.optString(i);
            if (name.isEmpty()) continue;
            if (sb.length() > 0) sb.append(" / ");
            sb.append(name);
        }
        return sb.toString();
    }

    private static String withParam(String url, String query) {
        if (url == null || url.isEmpty()) return null;
        return url.contains("?") ? url : url + "?" + query;
    }

    private static String paramOf(String urlStr, String name) {
        try {
            URL u = new URL(urlStr);
            String q = u.getQuery();
            if (q != null) {
                for (String pair : q.split("&")) {
                    int eq = pair.indexOf('=');
                    if (eq > 0 && pair.substring(0, eq).equals(name)) return pair.substring(eq + 1);
                }
            }
            String ref = u.getRef();
            if (ref != null) {
                Matcher m = Pattern.compile("[?&]" + name + "=(\\w+)").matcher(ref);
                if (m.find()) return m.group(1);
            }
        } catch (Exception e) { /* ignore */ }
        return null;
    }

    private static String decodeEntities(String s) {
        if (s == null) return "";
        return s.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
                .replace("&quot;", "\"").replace("&#39;", "'").replace("&nbsp;", " ")
                .replace("&hellip;", "…").replace("&middot;", "·");
    }

    private static String firstNonEmpty(String... vals) {
        for (String v : vals) if (v != null && !v.isEmpty()) return v;
        return null;
    }

    private static URL safeUrl(String s) {
        try {
            URL u = new URL(s);
            if (!"http".equals(u.getProtocol()) && !"https".equals(u.getProtocol())) return null;
            return u;
        } catch (Exception e) { return null; }
    }
}
