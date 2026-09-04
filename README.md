# SimpShare Android

SimpShare 的 Android 端：**不打开应用也能用**——在任意应用里点击"分享"，选择 SimpShare，
它会抓取网页元信息、生成与浏览器扩展端同款版式的 21:9 分享卡片图片，并自动唤起系统分享发出去。

应用本体只有一个界面：桌面图标打开时显示操作流程，没有其他功能页。

- 纯 Java + Material 3（`com.google.android.material`），浅蓝视觉与浅色/深色模式跟随系统
- 声明式站点规则与浏览器扩展共用（`app/src/main/assets/rules.json`，来自 `extensions` 分支）
- R8 代码收缩 + 资源收缩，控制 Release APK 体积（约 2 MB）
- 全程命令行 Gradle 构建，不需要 Android Studio

## 使用流程

1. 在任意应用中打开网页，点击"分享"
2. 在系统分享面板中选择"SimpShare"
3. 自动生成卡片图片，并唤起系统分享发送给好友

失败时（无网络 / 页面无法访问）会显示错误原因，不影响原应用。

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
  MainActivity.java               桌面入口：仅显示操作流程
  ShareActivity.java              分享入口：取链接 → 生成卡片 → 唤起系统分享
  FlowView.java                   程序化构建的 M3 流程 / 加载 / 错误视图（无布局 XML）
  card/CardRenderer.java          2100×900 卡片渲染器（与扩展端 render.js 同版式）
  card/Qr.java                    zxing 二维码（纠错级别 M，白底黑码）
  rules/Rules.java                规则匹配 + 结构化提取（B站状态 / 网易云 API）+ og 兜底
  net/Http.java                   抓取 HTML 与图片（UA / Referer 防盗链 / 手动重定向）
app/src/main/assets/rules.json    与 extensions 分支共享的声明式站点规则
```

## 与 extensions 分支的关系

浏览器扩展（Chrome / Edge）在
[`extensions` 分支](https://github.com/nekoslio/SimpShare/tree/extensions)。
两端共用一份 `rules.json` 站点规则与同一套 21:9 卡片版式；扩展端的新站点适配
更新后，把 `rules.json` 同步到本分支 assets 即可。

## 隐私

应用不申请危险权限（仅网络），不收集、不上传数据；仅在生成卡片的瞬间抓取目标页面的
公开元信息与封面图，生成结果保存在应用私有缓存目录并通过系统分享送出。
