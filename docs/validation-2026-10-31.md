# 原型验证记录 · 2026-10-31

## 环境

- Windows 11 x64，Node.js 24.11.1。
- Codex CLI `0.166.0-alpha.5.1`，默认 stdio App Server。
- 复用用户在本轮明确选择的电脑现有配置：模型 `gpt-6.1-sol`，服务商标识 `custom`。服务地址、密钥及配置全文不进入记录。
- 生成的版本特定请求 Schema 位于 `protocol/`。

## 已验证

| 检查 | 结果和证据 |
| --- | --- |
| 初始化与会话发现 | 独立进程完成 initialize / initialized，可列出历史。 |
| 桌面历史读取 | 读取本项目初始化对话；originator 为 `codex_work_desktop`，source 为 `vscode`；工作目录与本仓库一致，返回持久化轮次。没有向该对话追加消息。 |
| 自定义服务上的真实开发 | 临时项目中通过模型工具创建 `probe.txt`，包含 `CODEX_GO_FIRST`；接收流式文本、文件工具及审批回调。 |
| 同一会话接续 | 关闭原 App Server，启动新进程，按原 threadId 恢复；第二轮未重新提供文件名，模型仍修改原文件，追加 `CODEX_GO_SECOND`，文件及两轮历史均通过断言。 |
| 自动化边界行为 | 10 组测试通过，使用真实 stdio fixture、HTTP 和 SSE 网络连接验证：超时、退出、错误、审批往返、配对过期和撤销、Host/Origin、密钥响应裁剪、目录穿越/junction、重复提交与重启后的不确定意图、事件缺口，新会话未落盘/首轮空日志的状态恢复，以及接续时用量通知不影响已完成轮次。 |
| 浏览器闭环 | 本机浏览器在 390px 手机宽度下完成配对、读取桌面历史、创建 `mobile-smoke` 项目、新建会话、发送真实模型任务、点击文件审批；主机生成 `hello.txt`，内容断言为 `CODEX_GO_MOBILE_OK`。服务重启后凭据仍有效；修复首轮空日志边界后重新提交任务，无误报。 |
| 代码质量 | TypeScript 检查和生产构建通过；npm 依赖审计无已知漏洞。CI 配置覆盖 Windows / Ubuntu，不依赖模型凭据。 |

本机原始探针结果在 `.local/desktop-read-probe.json`、`.local/model-probe.json`（不提交），真实测试项目与会话被保留供复查。上述成功不表示所有中转站兼容。

## 尚未验证及限制

- 没有向原有桌面对话追加测试消息。桌面 App → 手机网页 → 桌面 App 的完整交替写入验收尚未完成。
- 当前连接服务启动独立 App Server；不能可靠观察或控制其他桌面进程中的运行任务。接续前由用户确认桌面空闲。
- 手机网页响应式检查不能代替真实手机上的网络、后台和触摸验收。公网 HTTPS 代理与跨网络连接未部署。
- `adb devices -l` 没有返回已连接设备；Android 本地运行、沙箱与后台能力均未实测，只有可执行探针。
- 原型的任意工具权限由 Codex 自身的 workspace-write / untrusted 策略及实际平台实现决定，项目授权列表不是工具沙箱。
- 仓库克隆、原生客户端安装器、跨主机切换、补充指令、完整差异审阅、模型服务错误分类和密钥管理界面尚未实现。

官方协议依据：[App Server](https://developers.openai.com/codex/app-server/)、[高级配置](https://developers.openai.com/codex/config-advanced/)。实际实现以本机生成的协议为准。
