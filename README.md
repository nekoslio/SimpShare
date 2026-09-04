# SimpShare Android

SimpShare 的 Android 端：**不打开应用也能用**——在任意应用里点击"分享"，选择 SimpShare，
它会抓取网页元信息、生成与浏览器扩展端同款版式的 21:9 分享卡片图片，并自动唤起系统分享发出去。

桌面图标打开应用只有一个页面：上半部分说明操作流程，下半部分管理站点规则订阅。

- 纯 Java + Material 3（`com.google.android.material`），浅蓝视觉与浅色/深色模式跟随系统
- 站点规则与浏览器扩展共用同一份订阅文件，也可以在应用内直接导入新的规则文件
- R8 代码收缩 + 资源收缩，Release APK 约 2 MB
- 全程命令行 Gradle 构建，不需要 Android Studio

## 使用流程

1. 在任意应用中打开网页，点击"分享"
2. 在系统分享面板中选择"SimpShare"
3. 自动生成卡片图片，并唤起系统分享发送给好友

失败时（无网络 / 页面无法访问）会在错误页给出具体原因，不影响原应用。

B 站视频的标题、UP主、简介和封面走 B 站开放 API 提取（页面 HTML 会被 B 站 WAF
按客户端指纹拦截，API 不会）；其他站点抓取页面 `<meta>` 元信息兜底。

## 分享链接的改写（b23）

规则订阅文件里带 `redirect.rules` 时，卡片上展示的链接和二维码会按规则改写。
内置规则把 B 站链接指向镜像域名：

- `bilibili.com/video/BV…` → `bilibilibb.com/video/BV…`
- `b23.tv/BV…` → `b23bb.tv/BV…`

改写只影响卡片上展示的内容；抓取标题封面仍然用原始链接。反过来，如果分享进来的
本身就是镜像域名的链接，会先还原成源站链接再做匹配和抓取。

## 导入规则文件

打开应用，在"站点规则订阅"里点"导入规则文件"，从文件管理器选一份规则 JSON 即可，
格式与扩展端的 `src/rules/rules.json` 完全一致。导入后立即生效，重启应用也保持；
点"恢复内置"回到应用自带的规则。页面上的状态行会显示当前规则的名字、版本和
站点数，方便确认导入是否成功。

自己维护规则时只需要关心 `siteRules`（站点怎么匹配、提取什么）和 `redirect.rules`
（展示链接怎么改写），字段说明见扩展端 README 的"规则订阅文件"一节。安卓端目前
用到的是匹配条件、`card` 标记、`redirect.rules` 和 og 兜底；`extract.state` /
`extract.api` 这类依赖浏览器环境的提取方式由端内实现代替（B 站走 API，网易云走
同源 Web API），导入的规则不会因此失效。

## 构建（无需 Android Studio）

前置：JDK 17、Android SDK（通过 commandline-tools 安装 `platforms;android-34`、
`build-tools;34.0.0`）。

```bash
# 1. 指向 SDK（local.properties 不入库）
echo "sdk.dir=/path/to/android-sdk" > local.properties

# 2. 构建 Release APK（R8 + 资源收缩，存在本地 release.keystore 时自动签名；
#    否则回退 debug 签名，构建不会失败）
./gradlew :app:assembleRelease

# 产物：app/build/outputs/apk/release/app-release.apk
```

生成发布签名密钥（建议放在仓库外或被忽略的本地目录）：

```bash
keytool -genkeypair -keystore .build-tools/release.keystore -alias simpshare \
  -keyalg RSA -keysize 2048 -validity 10000 -storepass 你的密码 -keypass 你的密码
# 密码写入 local.properties：simpshare.storePassword / simpshare.keyPassword
```

## 工程结构

```
settings.gradle / build.gradle / gradle.properties
app/build.gradle                  minSdk 26 · R8 + shrinkResources · 发布签名配置
app/src/main/AndroidManifest.xml  桌面入口 + ACTION_SEND 分享入口 + FileProvider
app/src/main/java/.../
  MainActivity.java               桌面入口：操作流程 + 规则导入 / 恢复
  ShareActivity.java              分享入口：取链接 → 生成卡片 → 唤起系统分享
  FlowView.java                   程序化构建的 M3 流程 / 加载 / 错误视图（无布局 XML）
  card/CardRenderer.java          2100×900 卡片渲染器（与扩展端 render.js 同版式）
  card/Qr.java                    zxing 二维码（纠错级别 M，白底黑码）
  rules/Rules.java                规则解析与匹配、链接改写、导入替换、B站 API / 网易云 / og 提取
  net/Http.java                   抓取 HTML 与图片（UA / Referer 防盗链 / 手动重定向）
app/src/main/assets/rules.json    内置规则，与 extensions 分支共享同一份订阅文件
```

## 与 extensions 分支的关系

浏览器扩展（Chrome / Edge）在
[`extensions` 分支](https://github.com/nekoslio/SimpShare/tree/extensions)。
两端共用一套规则订阅文件格式和 21:9 卡片版式。扩展端更新了 `rules.json` 后，
把新文件同步到本分支 assets，或者直接把文件导入应用即可，不用重新打包。

## 隐私

应用不申请危险权限（仅网络），不收集、不上传数据；仅在生成卡片的瞬间抓取目标页面的
公开元信息与封面图，生成结果保存在应用私有缓存目录并通过系统分享送出。导入的规则
文件保存在应用私有存储，不离开设备。
