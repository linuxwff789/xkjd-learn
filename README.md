# 键道练习 · Android App

星空键道6（键道6）学习 App 的 Android 壳：**Java + WebView**，加载 `app/src/main/assets/www/`
里的离线网页应用（同一套 HTML/CSS/JS，见 `~/xkjd-learn`）。

- 包名 `com.xkjd.practice`，minSdk 26 / targetSdk 34，竖屏
- 无任何权限（连网络权限都不要），完全离线
- 自签名 release（`release.keystore`，口令都是 `xkjdlearn`），可直接覆盖安装

## 编译

本机（Termux）没有 Android SDK，编译走 **GitHub Actions**：

- push 到 `main` → 自动编译，产物在 Actions 的 Artifacts 里（`xkjd-learn-apk`）
- 打 tag（`git tag v1.0.1 && git push --tags`）→ 自动发 Release，附 APK

## 改网页内容后重新打包

```sh
sh sync-web.sh          # 把 ~/xkjd-learn 同步进 app/src/main/assets/www
git add -A && git commit -m "update web app" && git push
```

## 技术路线说明

| 方案 | 取舍 |
|---|---|
| **Java + WebView 壳**（本方案） | 网页逻辑一行不用改，APK 7~8MB，纯离线；改内容 = 换 assets 重新编译 |
| 纯原生 Kotlin 重写 | 键盘/候选/提示/码表索引全部重写，工作量大且要重跑一遍数据链 |
| Capacitor / Cordova | 多一层 Node 构建链，CI 更复杂，收益（插件）这里用不到 |
| PWA / TWA | 需要公网 HTTPS 站点 + 数字资产链接，本地 App 不适合 |

## 目录

```
xkjd-app/
├── app/
│   ├── build.gradle
│   └── src/main/
│       ├── AndroidManifest.xml
│       ├── java/com/xkjd/practice/MainActivity.java    WebView 壳
│       ├── res/                                       图标(vector)/主题/字符串
│       └── assets/www/                                网页 App（由 sync-web.sh 生成）
├── .github/workflows/build.yml                        Actions 编译 + 发 Release
├── sync-web.sh
├── release.keystore
├── build.gradle / settings.gradle / gradle.properties
```
