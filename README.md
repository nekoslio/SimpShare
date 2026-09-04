# SimpShare Android

> 状态：**规划中** —— 本分支预留给 SimpShare 的 Android 客户端开发。

## 计划内容

把 SimpShare 的"网页 → 21:9 分享卡片"能力带到 Android 端：

- **系统分享面板接入**：在任何 App 中点击"分享"即可生成分享卡片
- **剪贴板链接监听**：检测到链接后一键生成卡片并保存 / 分享
- **共享规则订阅**：复用浏览器扩展端同款的声明式站点规则
  （`rules.json`，见 [`extensions` 分支](https://github.com/nekoslio/SimpShare/tree/extensions)），
  两个端共用一份站点适配规则
- **卡片渲染**：与扩展端一致的 21:9 版式（标题 + 封面 + 简介 + 二维码 + URL 标注）

## 浏览器扩展

当前已可用的浏览器扩展（Chrome / Edge，Manifest V3）位于
[`extensions` 分支](https://github.com/nekoslio/SimpShare/tree/extensions)。
