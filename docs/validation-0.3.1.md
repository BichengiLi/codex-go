# 0.3.1 连接状态与实时任务进展验证

日期：2026-11-01。源码版本 0.3.1，Android versionCode 4。GitHub Releases 的 0.2.0 保持不变，本次安装包位于本机 `.local/releases/0.3.1/`。

## 行为

- 原生 App 使用已有凭据检查连接，等待或连接失败时显示连接状态、重试与返回首页；八位码表单只用于普通网页首次配对。
- 实时投影公开思考摘要、计划、工具状态/输出及回复增量。执行中的工具和摘要默认展开，任务活动文字即时更新；模型服务是否返回摘要独立于回复流式能力。
- HTTP 快照携带事件序号和进程标识，前端重放较新的事件；读取更早历史保留当前任务状态。用户阅读历史时暂停自动跟随。
- HTTPS 保持隧道兼容轮询，有事件/空闲时分别等待 200/700 ms 后再次请求；局域网及手机本地继续使用 SSE。
- 真实探针发现当前 CLI 会对 `thread/turns/list` 返回 -32601（`list_turns is not supported yet`），已回退到包含轮次的 `thread/read` 并本地分页。

## 自动化与共享界面

- `npm test`：27/27 通过，覆盖摘要/计划/工具/回复在完成前可读、快照事件重放、完成后保留计划并结束活动状态，以及缺少分页方法时的历史读取。
- `npm run build:native`：TypeScript、生产 React、Android 主机和 Windows 后台 bundle 通过。
- 390 × 844 隔离 Electron 窄屏共享界面分别经 SSE 和模拟原生轮询桥验证：延迟连接及原生 401 不显示码表单，摘要分两次可见、计划与工具输出在任务完成前可见、回复第一段早于第二段、完成后活动指示结束。无横向溢出或前端错误。证据：`.local/live-ui/result.json`、`result-polling.json`、`streaming.png`。这属于桌面渲染与桥接模拟。

## 真实模型

`npx tsx tools/probe-native.ts --stream` 通过打包主机和内置 Windows CLI，在隔离新会话中上传文本附件并让模型读取；模型回复包含附件指定内容。收到 33 个 `item/agentMessage/delta`，早于 `turn/completed`，同时观察到工具开始/结束及命令输出事件。

服务模型为 `gpt-6.1-sol`，本次返回的思考摘要增量为 0；真实验证确认了回复与工具流式事件，摘要显示由 fixture 验证。证据：`.local/native-probe/result.json`，会话 `01a196a4-6374-7911-9f46-6177627e7778`。

## 安装包

- `npm run build:runtime`、Android `:app:clean :app:assembleDebug :app:testDebugUnitTest :app:lintDebug` 通过，2 项原生模型配置单元测试通过；保留已有 Manifest/弃用 API 提示。
- `aapt` 确认 APK 的 versionName 0.3.1、versionCode 4，APK v2 签名校验通过。Windows NSIS 和 ZIP 构建完成，`app.asar` 应用元数据确认版本 0.3.1。
- `python tools/verify-packages.py` 通过 APK/ZIP CRC、ARM64 环境/原生库哈希、最终主机及前端入口一致性检查；额外核对全部 4 个当前前端资源在两个安装包中逐字节一致。生成 `release-manifest.json` 和 `SHA256SUMS.txt`。
- 最终 APK 为 274,523,508 字节，Windows 安装程序 261,239,577 字节，ZIP 340,423,037 字节。完整哈希保存在本机交付目录。

## 设备范围

`adb devices` 无设备。Android 系统安装、扫码与恢复连接、手机 PRoot 执行、跨主机会话选择和后台恢复仍待真机验收。未将安装包发布到 GitHub Releases。
