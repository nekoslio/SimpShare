# SimpShare

为网页生成 21:9 分享卡片的开源项目。仓库按分支划分两个子项目，本地目录通过
git worktree 与分支一一对应：

| 分支 | 本地目录 | 子项目 |
| --- | --- | --- |
| [`extensions`](https://github.com/nekoslio/SimpShare/tree/extensions) | `extensions/` | 浏览器扩展（Chrome / Edge，Manifest V3） |
| [`android`](https://github.com/nekoslio/SimpShare/tree/android) | `android/` | Android 客户端（系统分享进出，Java + Material 3） |

两个子项目共用一份声明式站点规则 `rules.json`（扩展端位于 `src/rules/`，
Android 端位于 `app/src/main/assets/`）与同一套 21:9 卡片版式。

## 本地目录说明

- `extensions/`、`android/`：git worktree，分别检出一个分支，互不影响
- `.build-tools/`：本地构建工具链与签名密钥（Android SDK / JDK / Gradle、扩展打包密钥），不入库
- 在子项目目录内正常使用 `git` / `./gradlew` 即可，改动会提交到对应分支

## 常用命令

```bash
git worktree list          # 查看分支与目录的对应关系
git fetch origin && git branch -f extensions origin/extensions   # 更新某个子项目
```
