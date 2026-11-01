# 0.3.0 手机附件与内置本地会话验证

日期：2026-11-01。源码版本 0.3.0，Android versionCode 3。公开 Releases 的 0.2.0 保持不变，本次安装包在本机 `.local/releases/0.3.0/`。

## 行为

- 发送栏支持多选文件、图片和音频，每条消息最多 8 个附件、每个最多 200 MB，可移除待发送引用、仅发送附件；上传失败保留已经成功的文件。
- 电脑和手机本地主机共用二进制流上传 API。附件保存在当前会话工作目录内独立路径，同名不覆盖；发送时重新校验所属项目。识别的栅格图片作为 `localImage`，其他文件提供可供工具读取的路径。
- Android 聊天页内提供电脑会话和手机本地会话入口，保留电脑配对，手机本地继续使用既有 API 配置和前台引擎。

## 自动化与构建

- `npm test`：24/24 通过。新增两种运行模式的 Unicode/二进制上传下载、超过原 128 KB 请求限制的 1 MB 文件、同名不覆盖、图片与音频分类、图片输入、附件任务去重（包括首次执行后文件被删除）、跨项目引用拒绝、鉴权和 Origin、文件名与私有路径、越界 junction、超限请求和上传中断清理。
- `npm run build:native`：TypeScript、生产 React 和主机/桌面 bundle 通过。
- `:app:testDebugUnitTest :app:lintDebug`：2 项模型配置单元测试和 lint 通过；保留已有 Manifest/弃用 API 提示。
- `npm run build:runtime` 和 `:app:assembleDebug`：包含新主机与共享界面的完整 ARM64 APK 构建通过。`aapt` 确认 0.3.0/versionCode 3；APK v2 签名检查通过。
- Windows NSIS/ZIP 构建完成，包内应用元数据为 0.3.0。`python tools/verify-packages.py` 通过 APK/ZIP CRC、ARM64 运行环境和原生库哈希、包内主机与前端一致性检查；已生成 `release-manifest.json` 与 `SHA256SUMS.txt`。最终 APK 274,129,710 字节，Windows 安装程序 260,943,102 字节，ZIP 340,096,928 字节。另核对 APK 内每个当前前端资源均匹配最终构建。

## 共享界面与真实模型

- 390 × 844 窄屏共享界面在隔离 fixture 主机上验证选择文件、上传、移除、仅附件发送；无横向溢出和前端错误，检查了暗色主题下的附件文字可读性。证据：`.local/mobile-attachments-ui/result.json` 和 `composer.png`。这是桌面浏览器渲染验证。
- `npx tsx tools/probe-native.ts`：在隔离项目、新会话中通过打包主机上传文本附件，真实模型使用工具读取并返回文件内指定的口令。证据：`.local/native-probe/result.json`。该探针复用电脑当前模型服务，使用 Android 本地入口的默认权限；不代表 ARM64 设备实测。

## 设备范围

`adb devices` 无设备。Android 系统文件选择器、手机与电脑会话入口的完整往返、手机 PRoot 执行和后台恢复仍需真机验收。真实模型验证了文本文件读取；图片已验证传入 App Server 的输入结构，未单独验收视觉识别。音频上传与路径交付已验证，语音转写取决于模型及主机可用工具。未发布安装包到 GitHub。
