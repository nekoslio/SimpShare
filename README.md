# SimpShare — 网页分享卡片浏览器插件

一键为当前网页生成 **21:9 精美分享卡片**：站点图标 + 标题、内容封面（或二维码）、简介、
当前链接二维码，**复制到剪贴板**即可粘贴到微信 / QQ / 笔记中分享。

Chrome / Edge（Chromium 内核）**Manifest V3** 扩展，最低要求 Chrome 111+。

- **浅蓝色 Material 3 视觉**（primary `#0B57D0` · primary-container `#D3E3FD`）
- **自动跟随浏览器深色 / 浅色模式**：面板 UI 与分享卡片配色都会自动切换
  （分享卡片深色模式为深底浅字，二维码始终保持白底黑码以确保识别率）

![预览](docs/screenshots/card-bilibili-dark.png)

| | |
| --- | --- |
| ![B站视频卡片](docs/screenshots/card-bilibili-dark.png) | ![GitHub 卡片](docs/screenshots/card-github-light.png) |
| ![网易云音乐卡片](docs/screenshots/card-netease-light.png) | ![未适配站点](docs/screenshots/card-unmatched-og.png) |
| ![浅色面板](docs/screenshots/panel-light.png) | ![深色面板](docs/screenshots/panel-dark.png) |

---

## 安装（开发者模式加载）

1. 打开 Chrome / Edge，地址栏输入 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 打开右上角 **开发者模式**
3. 点击 **加载已解压的扩展程序**，选择本项目根目录（含 `manifest.json` 的文件夹）
4. 固定到工具栏即可（插件无弹窗，全部交互在页面内完成）

## 使用方法

| 操作 | 说明 |
| --- | --- |
| 页面右上角的**浅蓝分享按钮** | 点击打开分享面板 |
| 按住拖动 | 自由拖拽；拖到屏幕**最左 / 最右边缘**自动吸附收纳成一个小长条 |
| 悬停吸附长条 | 长条变宽并出现 `<`（左侧吸附为 `>`）箭头，**点击**恢复按钮 |
| 面板 · 复制图片 | 以**高清版（2100×900）重新生成**并写入剪贴板 |
| 面板 · 修改链接 | 在按钮下方展开输入框；**回车**或右侧 **✔** 提交，插件按新链接重新生成预览，之后复制即为新图 |
| 深浅色模式 | 跟随浏览器（系统）设置自动切换，切换时已打开的预览实时重绘 |
| 位置记忆 | 按钮 / 吸附状态自动保存，下次打开保持原位 |

## 分享图样式（21:9，跟随浏览器深浅色）

```
┌────────────────────────────────────────────────────┐
│ [站点图标]  页面标题（加粗放大，超长省略）               │
│                                                    │
│ ┌────────────┐  简介（视频简介 / 歌手·专辑 /   ┌────┐ │
│ │  封面图     │  网页描述，自动换行省略）        │ 二 │ │
│ │  (自适应)   │                              │ 维 │ │
│ └────────────┘                              │ 码 │ │
│                              规则内站点 →     └────┘ │
│ 规则外站点：封面位改为二维码，右下角二维码取消            │
│              https://…（右下角 URL 标注，末端距边 48）  │
└────────────────────────────────────────────────────┘
```

- **规则内站点**：展示内容封面（视频封面 / 歌曲封面 / 项目社交卡片），右下角为链接二维码
- **规则外站点 / 封面提取失败**：封面位置改为当前链接二维码，右下角二维码取消，简介不变
- **URL 标注**：卡片右下角以链接文本末端（右下角顶点）距右/下边缘各 48 的固定距离为锚点
  右对齐绘制完整 URL；若链接过长、绘制会与其他控件冲突，则自动改显示"url过长，请扫描二维码"
- **GitHub 特例**：官方社交卡片图本身就印着仓库简介，因此 GitHub 卡片**不裁切封面、
  不绘制简介模块**（封面完整展示 + 右下角二维码）
- 二维码带 4 模块静区、纠错级别 M，实测可被 jsQR / 手机扫描识别
- 预览为 1050×450，复制时以 2100×900 重新渲染（高清，非放大预览图）

## 站点规则与逐站复核结论（2026-09）

三个**强制要求站点**已通过真实扩展端到端测试（提取字段、封面下载、卡片渲染全链路）：

| 站点 | 页面 | 提取方式 | 复核结论 |
| --- | --- | --- | --- |
| bilibili.com | /video/BV… | 页面内嵌状态 `__INITIAL_STATE__.videoData`（标题 / UP主 / 简介 / 原始封面） | ✅ 扩展 E2E 实测 |
| music.163.com | /song?id=…（含 `#/song` 哈希路由） | 同源 Web API `/api/song/detail`（歌名 / 歌手 / 专辑 / 1000px 专辑图）；另支持 album、playlist | ✅ 扩展 E2E 实测 |
| github.com | /owner/repo | og: 元信息；标题取 URL 的 `owner/repo`，简介去样板句；卡片不裁切封面、无简介模块 | ✅ 扩展 E2E 实测 |

其余**规则内站点**逐站复核结果（封面提取方式均为 og: 元信息，已用真实浏览器逐页验证，
另用 `node tools/review-sites.js` 验证了封面图的无 Referer 直链可下载性）：

| 站点 | 复核结论 | 说明 |
| --- | --- | --- |
| YouTube | ✅ 封面模式 | og:image（maxres 缩略图） |
| 腾讯视频 | ✅ 封面模式 | og:image 封面 + og:description |
| 优酷 | ✅ 封面模式 | og:image；规则兼容新版 `video?vid=` 链接（会重定向回 /v_show/） |
| Vimeo / Spotify / SoundCloud | ✅ 封面模式 | og:image（本环境经系统代理验证） |
| 微信公众号文章 | ✅ 封面模式 | og:image 文章头图（经搜狗微信跳转实测） |
| 知乎专栏 | ✅ 封面模式 | og:image 文章封面 |
| 豆瓣条目 | ✅ 封面模式 | og:image 海报；图片有 Referer 防盗链，插件已自动携带来源页 Referer |
| 掘金 | ✅ 封面模式 | og:image 为站点 logo（文章未设封面时的官方行为） |
| CSDN / 少数派 / 简书 / 思否 | ✅ 封面模式 | og:image 正常 |
| GitLab / npm / PyPI / Stack Overflow / arXiv | ✅ 封面模式 | og 可用（npm 与 SO 对自动化访问有 Cloudflare 风控，真实浏览器正常；arXiv og:image 为官方 logo） |
| Steam | ✅ 封面模式 | og:image 游戏头图 |
| Twitch | ✅ 封面模式 | og:image（未设置封面时为官方 logo） |
| 知乎问答 | ⚠️ 降级二维码 | 标题可提取，问答页无 og:image |
| B站直播 / 专栏 | ⚠️ 降级二维码 | 实测直播页无 og:image（标题可用）；专栏未取得稳定样本 |
| 爱奇艺 / QQ音乐 / 酷狗 | ⚠️ 降级二维码 | 实测 og:image 缺失（纯客户端渲染 / 未吐 og）；标题与简介仍可提取 |
| 抖音 / 微博 / 小红书 | ⚠️ 登录相关 | 自动化环境被登录墙或风控拦截；真实浏览器登录后一般有 og，未登录自动降级 |
| V2EX | ⚠️ 降级二维码 | 带图话题有 og:image，纯文字话题无（标题可用） |

> 规则定义在 `src/lib/rules.js`。降级是设计行为：封面拿不到时自动改为二维码模式，卡片不会破版。
> 封面抓取由后台 service worker 完成，并自动携带来源页 Referer 以通过豆瓣等站的防盗链。

## 项目结构

```
manifest.json                     MV3 清单（content scripts 分 ISOLATED / MAIN 两个 world）
src/rules/rules.json              ★ 站点规则订阅文件（GKD 风格，与应用主体分离，可独立更新）
src/lib/qrcode.js                 二维码生成器（qrcode-generator 1.4.4，MIT）
src/lib/rules.js                  规则解释器（匹配 / JSON 路径 / 模板 / 变换，无任何站点硬编码）
src/lib/render.js                 分享卡片 Canvas 渲染器（2100×900 设计稿，浅色/深色双主题）
src/content/main-world.js         MAIN world 通用状态桥（按规则声明的路径取页面全局状态）
src/content/content.js            UI（FAB / 吸附条 / 面板 / snackbar）+ 提取编排 + 复制流程
src/background/service-worker.js  图片抓取转 dataURL（带 Referer 防盗链）、跨页提取、剪贴板兜底
src/background/offscreen.*        offscreen document 剪贴板兜底
src/assets/icons/                 扩展图标（node tools/make-icons.js 生成，浅蓝配色）
```

## 规则订阅文件（GKD 风格）

站点规则全部声明在 **`src/rules/rules.json`**（参考 GKD 的订阅思想：规则是数据，主体是引擎），
由 `src/lib/rules.js` 的通用解释器执行——**新增/修改站点不需要改任何 JS 代码**。

```jsonc
{
  "name": "SimpShare 站点规则订阅",
  "version": 4,
  "behavior": { "ogForUnmatchedSites": true },
  "siteRules": [
    {
      "id": "bilibili-video",
      "label": "哔哩哔哩视频",
      "matchAny": [                                     // 多个匹配分支（hosts 后缀匹配 + path 正则）
        { "hosts": ["bilibili.com"], "path": "/video/" },
        { "hosts": ["b23.tv"] }
      ],
      "extract": {
        "og": true,                                     // head <meta> 兜底
        "state": {                                      // 页面全局状态声明式提取
          "source": "__INITIAL_STATE__",
          "requirePath": "videoData.title",
          "fields": {
            "title": "{videoData.title}",
            "cover": "{videoData.pic}",
            "descLines": ["UP主：{videoData.owner.name}", "{videoData.desc}"]
          }
        }
      },
      "transforms": [{ "field": "cover", "forceHttps": true }]
    },
    {
      "id": "github",
      "card": { "containCover": true, "hideDesc": true },   // 卡片渲染提示
      "titleFromPath": { "pattern": "^/([^/]+)/([^/]+)", "template": "{1}/{2}" },
      "transforms": [{ "field": "description", "stripRegex": "\\s*Contribute to .*? on GitHub\\.?\\s*$", "flags": "i" }]
    }
  ]
}
```

支持的能力：

| 能力 | 说明 |
| --- | --- |
| `match` / `matchAny` | hosts（后缀匹配）+ `path` 正则 + `pathExclude` + `query` 参数 + `pathSource: "pathAndHash"`（兼容 `#/song?id=` 哈希路由） |
| `extract.og` | head `<meta>` 元信息兜底（og: → twitter: → itemprop） |
| `extract.state` | 从页面全局对象按 JSON 路径提取：`a.b.0.c`、`thumbnails[-1]`（末元素）、`artists[*].name`（通配收集） |
| 模板 | `{路径}` 取值 + 修饰符 `|join '分隔符'`、`|fallback 路径`、`|clip 160`；占位符取不到值时整行自动丢弃 |
| `extract.api` | 声明式 Web API：URL 模板 `{id}`（支持 query/hash 取参）+ 多分支 `whenPath` + JSON 路径字段映射 |
| `transforms` | `stripRegex`（去样板句）、`forceHttps`、`appendQuery`（如网易云 `param=1000y1000`） |
| `titleFromPath` | 从 URL 路径正则捕获组组装标题（GitHub `owner/repo`） |
| `card` | 传给渲染器：`containCover`（封面不裁切）、`hideDesc`（不绘制简介） |

**未适配站点**：`behavior.ogForUnmatchedSites: true` 时，不在规则内的站点也会读取
`<head>` 里的 `<meta>` 标签（og:image / twitter:image 等）获取封面图，取到即用封面模式，
取不到则降级为二维码模式。meta 选择器优先级由 `metaTags` 字段声明。

### 关键实现说明

- **规则即数据**：解释器与站点解耦，MAIN world 状态桥也是通用的（内容脚本把规则声明的
  `source + paths` 发进页面，按路径取回白名单字段）
- **Shadow DOM + adoptedStyleSheets**：全部 UI 隔离在 shadow root 中，M3 浅蓝令牌
  （primary `#0B57D0`、primary-container `#D3E3FD`、圆角 28/16/全圆、状态层、M3 阴影与缓动）
  不受页面样式影响；`prefers-color-scheme: dark` 时整体切换深色令牌
- **图片全部走 dataURL**：后台 service worker 抓取封面 / favicon（带 `referrer` 选项）转 base64，
  画布不会被跨域污染，`toBlob` / `toDataURL` 始终可用
- **剪贴板双保险**：内容脚本 `navigator.clipboard.write` → 失败时走 offscreen document（MV3 官方模式）
- **跨页提取**："修改链接"提交任意 URL 后，由后台按同一份 rules.json 完成抓取与提取

## 测试与工具

```bash
node tools/make-icons.js             # 重新生成扩展图标（浅蓝配色）
node tools/serve.js                  # 启动本地测试页 http://127.0.0.1:8123/test/page.html
node tools/review-sites.js           # 批量复核规则内站点（og 提取 + 封面直链下载）
node tools/e2e/run.js [url]          # 端到端：开面板 → 预览 → 拖拽吸附 → 恢复
node tools/e2e/export-live.js <url>  # 导出真实扩展链路生成的卡片（SIMPSHARE_THEME=dark 深色）
node tools/e2e/edit-link.js          # 端到端：修改链接 → 跨页提取 → 重新生成
```

- 测试页 `test/page.html` 含 5 种卡片 × 浅/深双主题渲染样例、**二维码 jsQR 回读自检**、
  18 条站点规则匹配自检（运行后结果输出到 `test/out/`，为本地生成产物、不入库；
  对外展示的截图存于 `docs/screenshots/`）
- `tools/e2e/` 内含 puppeteer-core 依赖与 Chrome for Testing 136（约 150MB，Chrome 137+ 的 headless
  不再支持 `--load-extension`，故固定该版本跑自动化；不需要可直接删除 `tools/e2e/chrome/`）

## 开源协议

[MIT](LICENSE)。内含的二维码生成库 [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（`src/lib/qrcode.js`）同为 MIT 协议，版权归其作者 Kazuhiko Arase 所有。

## 已知限制

- 微博 / 小红书 / 抖音等强登录站点，未登录时 og 信息可能缺失（自动降级二维码模式）
- 部分站点的 favicon 受防盗链影响时会回退为站点首字母色块
- `chrome://` 等浏览器内部页面无法注入内容脚本，插件不生效
- 剪贴板需要页面处于聚焦状态；极少数严格 CSP 页面会自动走 offscreen 兜底通道

## 隐私

插件不收集、不上传任何数据；所有抓取仅发生在生成分享图的瞬间，用于读取公开的页面元信息与封面图。
