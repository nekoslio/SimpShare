# SimpShare — 网页分享卡片浏览器扩展

一键为当前网页生成 **21:9 分享卡片**：站点图标 + 标题、内容封面（或二维码）、简介、
链接二维码，复制到剪贴板即可粘贴到微信 / QQ / 笔记中分享。

Chrome / Edge（Chromium 内核）**Manifest V3** 扩展，最低要求 Chrome 111+。
浅蓝 Material 3 视觉，UI 与卡片配色自动跟随浏览器深色 / 浅色模式。

![预览](docs/screenshots/card-bilibili-dark.png)

## 安装

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`）
2. 打开右上角**开发者模式**
3. 点击**加载已解压的扩展程序**，选择本仓库根目录（含 `manifest.json` 的文件夹）
4. 固定到工具栏即可，全部交互在页面内完成

也可以从 [Releases](https://github.com/nekoslio/SimpShare/releases) 下载 `simpshare-x.y.z.zip`，
解压后按上述步骤加载解压出的文件夹。

## 使用

| 操作 | 说明 |
| --- | --- |
| 右上角分享按钮 | 点击打开分享面板 |
| 按住拖动 | 拖到屏幕最左 / 最右边缘自动吸附成小长条；悬停长条变宽出现箭头，点击恢复 |
| 复制图片 | 以高清版（2100×900）重新生成并写入剪贴板 |
| 修改链接 | 展开输入框，回车或点确认按钮提交，按新链接重新生成预览 |

## 分享卡片样式

```
┌────────────────────────────────────────────────────┐
│ [站点图标]  页面标题（加粗放大，超长省略）               │
│                                                    │
│ ┌────────────┐  简介（视频简介 / 歌手·专辑 /   ┌────┐ │
│ │  封面图     │  网页描述，自动换行省略）        │ 二 │ │
│ │  (自适应)   │                              │ 维 │ │
│ └────────────┘                              │ 码 │ │
│                                             └────┘ │
│              https://…（右下角 URL 标注，末端距边 48）  │
└────────────────────────────────────────────────────┘
```

- 规则内站点：展示内容封面（视频封面 / 歌曲封面 / 项目社交卡片），右下角为链接二维码
- 规则外站点或封面提取失败：封面位置改为链接二维码，右下角二维码取消，简介不变
- URL 标注：以链接文本末端（右下角顶点）距右 / 下边缘各 48 的固定距离为锚点右对齐；
  链接过长会与其他控件冲突时，自动改显示"url过长，请扫描二维码"
- GitHub 特例：官方社交卡片自带简介文字，因此不裁切封面、不绘制简介模块
- 二维码含 4 模块静区、纠错级别 M；预览为 1050×450，复制时以 2100×900 重新渲染

## 站点适配与复核结论

重点站点已通过真实扩展端到端测试（提取、封面下载、卡片渲染全链路）：

| 站点 | 提取方式 |
| --- | --- |
| bilibili.com（/video/BV…） | 页面内嵌状态 `__INITIAL_STATE__.videoData`：标题 / UP主 / 简介 / 原始封面 |
| music.163.com（/song?id=…） | 同源 Web API `/api/song/detail`：歌名 / 歌手 / 专辑 / 专辑图，另支持 album、playlist |
| github.com（/owner/repo） | og: 元信息；标题取 URL 的 `owner/repo`，简介去样板句 |

其余规则内站点逐站复核结果（封面均取自 og: 元信息，已用真实浏览器逐页验证，
并用 `node tools/review-sites.js` 验证封面直链可下载性）：

| 站点 | 结论 | 说明 |
| --- | --- | --- |
| YouTube、腾讯视频、优酷 | 通过 | og:image 封面；优酷规则兼容新版 `video?vid=` 链接 |
| Vimeo、Spotify、SoundCloud | 通过 | og:image |
| 微信公众号文章、知乎专栏、豆瓣条目 | 通过 | og:image；豆瓣图片有 Referer 防盗链，插件自动携带来源页 Referer |
| 掘金、Twitch、arXiv | 通过 | og:image 为官方 logo（站点未提供内容封面时的行为） |
| CSDN、少数派、简书、思否 | 通过 | og:image 正常 |
| GitLab、npm、PyPI、Stack Overflow、Steam | 通过 | og 可用；npm 与 Stack Overflow 对自动化访问有风控，真实浏览器正常 |
| 知乎问答、V2EX、B站直播 | 降级 | 无 og:image，标题可提取，自动转为二维码模式 |
| 爱奇艺、QQ音乐、酷狗 | 降级 | og:image 缺失（纯客户端渲染），标题与简介仍可提取 |
| 抖音、微博、小红书 | 受限 | 登录墙或风控；真实浏览器登录后一般有 og，未登录自动降级 |

降级是设计行为：封面拿不到时自动改为二维码模式，卡片不会破版。
封面抓取由后台 service worker 完成，并携带来源页 Referer 以通过防盗链。

## 规则订阅文件（GKD 风格）

站点规则全部声明在 `src/rules/rules.json`（规则是数据，主体是引擎），
由 `src/lib/rules.js` 的通用解释器执行——新增或修改站点不需要改任何 JS 代码。

```jsonc
{
  "siteRules": [
    {
      "id": "bilibili-video",
      "matchAny": [                                  // 多个匹配分支：hosts 后缀 + path 正则
        { "hosts": ["bilibili.com"], "path": "/video/" },
        { "hosts": ["b23.tv"] }
      ],
      "extract": {
        "og": true,                                  // head <meta> 兜底
        "state": {                                   // 页面全局状态声明式提取
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
    }
  ]
}
```

| 能力 | 说明 |
| --- | --- |
| `match` / `matchAny` | hosts（后缀匹配）+ `path` 正则 + `pathExclude` + `query` 参数 + `pathSource: "pathAndHash"`（兼容 `#/song?id=` 哈希路由） |
| `extract.og` | head `<meta>` 元信息兜底（og: → twitter: → itemprop） |
| `extract.state` | 页面全局对象按 JSON 路径提取：`a.b.0.c`、`thumbnails[-1]`（末元素）、`artists[*].name`（通配收集） |
| 模板 | `{路径}` 取值，修饰符 `|join '分隔符'`、`|fallback 路径`、`|clip 160`；占位符取不到值时整行丢弃 |
| `extract.api` | 声明式 Web API：URL 模板 `{id}`（query/hash 取参）+ 多分支 `whenPath` + JSON 路径字段映射 |
| `transforms` | `stripRegex`、`forceHttps`、`appendQuery`；`titleFromPath` 从 URL 捕获组组装标题 |
| `card` | 传给渲染器：`containCover`（封面不裁切）、`hideDesc`（不绘制简介） |
| `redirect.hostMap` | 域名改写：分享卡片与二维码展示改写后的 URL（如 `bilibili.com` → `bilibilibb.com`），目标站点自行去除追踪参数；提交/编辑时自动反向映射回源域名以匹配规则 |

未适配站点：`behavior.ogForUnmatchedSites: true` 时，不在规则内的站点也会读取 `<head>`
的 `<meta>` 标签获取封面，取到即用封面模式，取不到则降级二维码模式。

## 项目结构

```
manifest.json                     MV3 清单（content scripts 分 ISOLATED / MAIN 两个 world）
src/rules/rules.json              站点规则订阅文件（与应用主体分离，可独立更新）
src/lib/qrcode.js                 二维码生成器（qrcode-generator 1.4.4，MIT）
src/lib/rules.js                  规则解释器（匹配 / JSON 路径 / 模板 / 变换，无站点硬编码）
src/lib/render.js                 分享卡片 Canvas 渲染器（2100×900 设计稿，浅色/深色双主题）
src/content/main-world.js         MAIN world 通用状态桥（按规则声明的路径取页面全局状态）
src/content/content.js            UI（FAB / 吸附条 / 面板 / snackbar）+ 提取编排 + 复制流程
src/background/service-worker.js  图片抓取转 dataURL（带 Referer）、跨页提取、剪贴板兜底
src/background/offscreen.*        offscreen document 剪贴板兜底
src/assets/icons/                 扩展图标（node tools/make-icons.js 生成）
```

实现要点：UI 隔离在 Shadow DOM 中（adoptedStyleSheets 注入 M3 令牌，不受页面样式影响）；
封面 / favicon 由后台抓取转 dataURL，画布不被跨域污染；剪贴板先走内容脚本
`navigator.clipboard.write`，失败自动转 offscreen document；"修改链接"由后台按同一份
rules.json 完成抓取与提取。

## 本地测试与工具

```bash
node tools/make-icons.js             # 重新生成扩展图标
node tools/serve.js                  # 启动本地测试页 http://127.0.0.1:8123/test/page.html
node tools/review-sites.js           # 批量复核规则内站点（og 提取 + 封面直链下载）
node tools/e2e/run.js [url]          # 端到端：开面板、预览、拖拽吸附、恢复
node tools/e2e/export-live.js <url>  # 导出真实扩展链路生成的卡片（SIMPSHARE_THEME=dark 深色）
node tools/e2e/edit-link.js          # 端到端：修改链接、跨页提取、重新生成
```

测试页含 5 种卡片样例、二维码 jsQR 回读自检与 18 条站点规则匹配自检；运行产物输出到
`test/out/`（本地生成，不入库）。`tools/e2e/chrome/` 为 Chrome for Testing 136
（约 150MB；Chrome 137+ 的 headless 不再支持 `--load-extension`，故固定该版本），
不需要可直接删除。

## 已知限制

- 微博 / 小红书 / 抖音等强登录站点，未登录时 og 信息可能缺失（自动降级二维码模式）
- 部分站点的 favicon 受防盗链影响时会回退为站点首字母色块
- `chrome://` 等浏览器内部页面无法注入内容脚本
- 剪贴板需要页面处于聚焦状态；极少数严格 CSP 页面会自动走 offscreen 兜底通道

## 隐私

插件不收集、不上传任何数据；所有抓取仅发生在生成分享图的瞬间，用于读取公开的页面元信息与封面图。

## 协议

[MIT](LICENSE)。内含的二维码生成库 [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)（`src/lib/qrcode.js`）同为 MIT 协议，版权归其作者 Kazuhiko Arase 所有。
