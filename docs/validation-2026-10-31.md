# 原型验证记录 · 2026-10-31

## 环境

- Windows 11 x64，Node.js 24.11.1。
- Codex CLI `0.166.0-alpha.5.1`，默认 stdio App Server。
- 复用用户在本轮明确选择的电脑现有配置：模型 `gpt-6.1-sol`，服务商标识 `custom`。服务地址、密钥及配置全文不进入记录。
- 生成的版本特定请求 Schema 位于 `protocol/`。

## 已验证

| 检查                   | 结果和证据                                                                                                                                                                                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 初始化与会话发现       | 独立进程完成 initialize / initialized，可列出历史。                                                                                                                                                                                                                        |
| 桌面历史读取           | 读取本项目初始化对话；originator 为 `codex_work_desktop`，source 为 `vscode`；工作目录与本仓库一致，返回持久化轮次。没有向该对话追加消息。                                                                                                                                 |
| 自定义服务上的真实开发 | 临时项目中通过模型工具创建 `probe.txt`，包含 `CODEX_GO_FIRST`；接收流式文本、文件工具及审批回调。                                                                                                                                                                          |
| 同一会话接续           | 关闭原 App Server，启动新进程，按原 threadId 恢复；第二轮未重新提供文件名，模型仍修改原文件，追加 `CODEX_GO_SECOND`，文件及两轮历史均通过断言。                                                                                                                            |
| 自动化边界行为         | 13 组测试通过，使用真实 stdio fixture、HTTP 和 SSE 网络连接验证：超时、退出、错误、审批往返、配对过期和撤销、Host/Origin、密钥响应裁剪、目录穿越/junction、重复提交与重启后的不确定意图、事件缺口，新会话未落盘/首轮空日志的状态恢复，以及接续时用量通知不影响已完成轮次。 |
| 浏览器闭环             | 本机浏览器在 390px 手机宽度下完成配对、读取桌面历史、创建 `mobile-smoke` 项目、新建会话、发送真实模型任务、点击文件审批；主机生成 `hello.txt`，内容断言为 `CODEX_GO_MOBILE_OK`。服务重启后凭据仍有效；修复首轮空日志边界后重新提交任务，无误报。                           |
| 代码质量               | TypeScript 检查和生产构建通过；npm 依赖审计无已知漏洞。CI 配置覆盖 Windows / Ubuntu，不依赖模型凭据。                                                                                                                                                                      |

本机原始探针结果在 `.local/desktop-read-probe.json`、`.local/model-probe.json`（不提交），真实测试项目与会话被保留供复查。上述成功不表示所有中转站兼容。

## 桌面集成补充验证

项目导入测试按真实路径比较，兼容 Windows CI 临时目录的 8.3 短路径别名；服务始终存储规范化后的项目目录。

- `project/list` 读取电脑上保存的 14 个项目，浏览器选择“论文”后显示原有会话；没有向这些会话追加测试消息。
- 真实模型在新建临时目录生成 `交付测试.txt`，HTTP 下载结果与磁盘内容逐字节一致。浏览器从原有回复下载 `论文.pdf`（55,754,351 字节），SHA-256 与项目副本一致。
- `thread/settings/update` 的真实通知确认只读与 workspace 模式切换；App Server 重启并按相同会话 ID 接续后保持只读。完全访问的确认和主机拒绝路径通过 HTTP fixture 验证，没有把用户会话切为完全访问。
- 390px 手机宽度下完成权限修改并显示“只读 · 严格审批”，项目文件弹窗可列出和下载文件。桌面项目目录也在浏览器中核对。
- 三组新增 HTTP 测试覆盖已保存项目导入与重启、Unicode/二进制下载及路径限制、权限变更和禁止条件。原始真实探针为 `.local/desktop-integration.json`，可用 `npm run probe:desktop -- --run` 复现。

## 0.2.0 双端安装包补充验证

- Windows：Electron 45.2.1，内置固定版本官方 Codex CLI 与 cloudflared 2026.10.7，生成 x64 NSIS 安装程序及 ZIP。开发版曾实际启动主机并显示 LAN 连接码，界面自动操作按用户 Esc 停止；最终包未继续界面验收。
- Android：JDK 17、Gradle 8.2、AGP 8.2.0、SDK 34，ARM64、minSdk 26、targetSdk 28。调试签名 APK 构建及 lint 通过，包含校验锁定的 Ubuntu/Node/Git/Codex 与 PRoot 原生库；目标 SDK 的侧载原因见[使用指南](native-apps.md)。
- 自动化测试增至 18 项，新增连接码 URL/过期边界、动态隧道来源、Android 权限可用性、事件轮询中的回复/审批、进程更换和关闭后的停止行为。
- 本轮生产依赖审计为 0 个已知漏洞；完整依赖审计报告 12 个 moderate 项，均经 Electron 打包工具链的 minimatch 依赖传播，不进入应用主机运行包。未采用审计建议中会降级 electron-builder 的破坏性自动修复。
- `npx tsx tools/probe-native.ts` 运行实际打包的 `host.cjs` 与内置官方 Windows CLI，在隔离测试项目和新会话中获得 `native-bundle-ok`。模型为用户授权复用的 `gpt-6.1-sol/custom`，没有改动原有用户会话或全局配置。也验证 Android 本地默认整个 App 环境内访问、严格审批及禁用不支持的 Linux 沙箱选项；这是 Windows 上的配置验证，不是 Android 执行验证。
- `npx tsx tools/probe-tunnel.ts` 经真实 Cloudflare 临时公网地址完成 HTTPS 配对、鉴权读取、创建新会话和真实模型请求，事件轮询接收到 `native-tunnel-ok` 与完成事件。结果时间为 `2026-10-31T06:20:12.601Z`。测试隧道已关闭；未以物理手机的独立网络完成此测试。
- Cloudflare Quick Tunnels 明确[不支持 SSE](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。客户端在 HTTPS Android 连接与临时隧道网页上使用每秒 JSON 事件轮询，共用 SSE 的序号/进程标识和历史补载语义。LAN 和手机本地仍使用 SSE。
- 本机原始记录位于 `.local/native-probe/result.json`、`.local/tunnel-probe/result.json`。最终安装包、SHA-256 清单和使用指南位于 `.local/releases/0.2.0/`，不提交大体积构建产物。
- 最终包校验通过 `python tools/verify-packages.py` 检查 APK 实际资源名、完整压缩环境、原生库哈希、必要 ARM64 ELF、Windows ZIP 及 CRC。此检查发现并修复 Android 自动展开 `.gz` 资源的问题，改用保留原字节的 `.tgz`；APK 通过 v2 签名验证。

## 尚未验证及限制

- 没有向原有桌面对话追加测试消息。桌面 App → 手机网页 → 桌面 App 的完整交替写入验收尚未完成。
- 当前连接服务启动独立 App Server；不能可靠观察或控制其他桌面进程中的运行任务。接续前由用户确认桌面空闲。
- 手机网页响应式检查不能代替真实手机上的网络、后台和触摸验收。公网 HTTPS 协议已验证，手机跨网络使用待验收。
- `adb devices -l` 没有返回已连接设备，也没有可用模拟器镜像。Android APK 中的配对、系统文件保存、PRoot 启动、工具执行、前台服务存活及重启恢复均未实测。
- 原型的任意工具权限由当前会话选择的 Codex 沙箱、批准策略及实际平台实现决定，项目授权列表不是工具沙箱。
- Windows/Android 安装包、原生主机切换与 Android 加密模型配置已实现。仓库克隆、跨主机文件/会话迁移、补充指令、完整差异审阅、模型服务错误分类和 iOS 尚未实现。

官方协议依据：[App Server](https://developers.openai.com/codex/app-server/)、[高级配置](https://developers.openai.com/codex/config-advanced/)。实际实现以本机生成的协议为准。

## 双端体验与后台连接更新

- 21 项 Node 测试通过，新增启动者退出后的后台存活、控制管道鉴权、消费后的二维码更新、持久设备凭据、升级延续与撤销；原有 HTTP/SSE、权限、文件与防重复提交测试保持通过。
- Android 新增 2 项 JUnit 测试，验证模型 API 地址、重复/无效模型过滤与错误响应；`testDebugUnitTest / assembleDebug / lintDebug` 通过。
- Windows 新版开发界面完成实际 Electron 渲染检查：外网自动就绪、二维码可见、无横向溢出、无控制台错误，渲染后的二维码经 ZXing 实际解码为 CG1。390px 共享聊天起始页无横向溢出或控制台错误。退出 Electron 窗口后，独立后台通过原公网 HTTPS 地址完成新手机配对（200）、鉴权读取（200），撤销后读取返回 401；没有发送模型任务。
- 本机原始检查记录：`.local/experience-ui-result.json`、`.local/experience-lifecycle-result.json`，截图位于 `.local/experience-desktop-*.png`。这些运行产物不提交。
- Windows 打包版主界面进程结束后，后台仍在线，进程 ID 和原 HTTPS 地址保持不变；独立状态目录记录于 `.local/experience-packaged-result.json`。测试后台与隧道均已清理。
- 新安装包输出在 `.local/releases/experience-refresh/`，保留之前交付目录。EXE、ZIP、APK 的内容、运行环境与主机 bundle 一致性、CRC、哈希检查通过；APK v2 签名验证通过。该目录保存 `release-manifest.json` 和 `SHA256SUMS.txt`。
- 未连接 Android 设备；相机扫码、厂商后台策略、PRoot 执行和休眠恢复仍需真机验收。模型发现只有本地响应解析测试，未使用用户真实 Key 访问 `/models`，不据此宣称所有 API 服务或模型兼容。
