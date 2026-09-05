# SimpShare

把一条网页链接变成一张 21:9 的分享卡片：站点图标、标题、封面、简介、二维码，
一张图说清来源，扫码即可回到原页。

目前有两个版本，卡片版式一致，共用同一份站点规则文件：

**浏览器扩展**（Chrome / Edge）——网页右侧有个悬浮分享按钮，点开就地生成卡片，
一键复制到剪贴板，贴进微信、QQ、笔记应用都行。
代码在 [`extensions` 分支](https://github.com/nekoslio/SimpShare/tree/extensions)，
[Releases](https://github.com/nekoslio/SimpShare/releases) 可下载。

![B 站视频分享卡片](https://raw.githubusercontent.com/nekoslio/SimpShare/extensions/docs/screenshots/card-bilibili-dark.png)

**Android 应用**——不碰浏览器也能用。在任意应用里点"分享"、选 SimpShare，
它抓取链接的标题和封面生成卡片，然后直接唤起系统分享发出去。
代码在 [`android` 分支](https://github.com/nekoslio/SimpShare/tree/android)，
[Releases](https://github.com/nekoslio/SimpShare/releases) 可下载。

| GitHub 仓库 | 网易云音乐 |
| --- | --- |
| <img src="https://raw.githubusercontent.com/nekoslio/SimpShare/extensions/docs/screenshots/card-github-light.png" width="440"> | <img src="https://raw.githubusercontent.com/nekoslio/SimpShare/extensions/docs/screenshots/card-netease-light.png" width="440"> |

站点适配是声明式的：GitHub、B 站视频/专栏/动态、网易云音乐这类重点站点按页面数据精确提取
标题、封面和 UP 主 / 歌手信息；小米社区、闲鱼、京东、淘宝天猫、拼多多、百度网盘分享这类需要等跳转、渲染或登录态的
站点，两端各用无头 WebView / 隐藏标签页等链接完全重定向后再捕获；其余站点自动读页面
meta，拿不到封面就退回二维码模式，不会生成一张破图。所有规则都在一份 `rules.json` 里，
加站点不用写代码，两个端通用。

## 仓库结构

代码不在 main 分支上，按子项目拆成了两个分支。本地克隆后可以用 git worktree
把它们并排检出到目录里：

```bash
git clone https://github.com/nekoslio/SimpShare.git
cd SimpShare
git worktree add extensions extensions   # 浏览器扩展
git worktree add android android         # Android 应用
```

构建、测试和实现细节见各自分支的 README：
[扩展端](https://github.com/nekoslio/SimpShare/blob/extensions/README.md) ·
[Android 端](https://github.com/nekoslio/SimpShare/blob/android/README.md)。

## 协议

MIT（[LICENSE](https://github.com/nekoslio/SimpShare/blob/extensions/LICENSE)）。
内含的二维码库 [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
同为 MIT，版权归其作者所有。
