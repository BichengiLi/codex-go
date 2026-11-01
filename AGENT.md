# Codex Go 二次开发交接

本文件是开发交接主文档，标准自动发现入口为 [AGENTS.md](AGENTS.md)。下面的状态基线为 **2026-10-31 / 0.2.0 双端体验更新**；开始新任务时以当前源码、锁文件、CI 和设备实测更新判断。

**2026-11-01 / 0.3.0 更新**：消息附件流式上传到当前会话运行主机，图片作为 `localImage`，音频和文件供工具读取。Android 聊天页内可选择电脑会话或手机本地会话，保留配对并复用手机本地 API。新入口见 `AttachmentUpload.java`、`ProjectFiles.upload/attachment` 与共享发送栏；验证范围见 [0.3.0 验证记录](docs/validation-2026-11-01.md)。

**2026-11-01 / 0.3.1 更新**：原生连接检查使用已保存凭据，不再显示网页八位码表单；`src/shared/live.ts` 共用实时摘要/计划/工具/回复投影，HTTP 快照按事件序号重放。历史分页遇到 CLI -32601 时回退到 `thread/read`。本轮验证与服务/设备边界见 [0.3.1 验证记录](docs/validation-0.3.1.md)。

## 先建立上下文

1. 查看 `git status --short --branch` 和最近提交，保留现有改动；当前工作从现有分支继续，新建分支默认使用 `codex/` 前缀。
2. 阅读 [README](README.md) 了解产品目标、[GLOSSARY](GLOSSARY.md) 对齐运行主机、项目、会话和接续的含义。
3. 按下表阅读任务相关文档，再进入对应代码。完成前同步受影响文档、运行适用检查，将代码与说明一起提交；用户要求推送时推送并核对远端提交。

| 要做的工作                       | 先读哪里                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------- |
| 调整架构、协议或跨端行为         | [架构](docs/architecture.md)、[版本协议](protocol/version.json)、`protocol/v2/`       |
| Windows/Android 启动、安装或打包 | [双端 App 指南](docs/native-apps.md)                                                  |
| CLI、网页开发、自定义服务与探针  | [运行说明](docs/running.md)                                                           |
| 判断哪些能力已验证、安排下一步   | [0.3.1 验证](docs/validation-0.3.1.md)、[早期验证](docs/validation-2026-10-31.md)、[路线图](docs/roadmap.md) |
| 扩展产品范围                     | [产品需求](docs/product.md)、[安装版规格](.scratch/native-apps/spec.md)及其 `issues/` |
| 修改运行环境或参考 dsh-Go        | [来源与许可证](runtime/NOTICE.md)、[参考源码分析](docs/references/dsh-go.md)          |

## 项目是什么，以及做到哪里

用户使用自己的 API 服务在手机上开发；手机既能连接电脑上已有的 Codex 项目和空闲会话，也有独立本地环境。模型服务需兼容 Codex 的 Responses 接口，当前没有 Chat Completions 转换或离线模型推理。

当前采用官方固定版本 Codex CLI 的 `app-server --listen stdio://`，没有维护 CLI 分叉。Windows Electron 控制页通过受鉴权本机管道管理独立后台主机，默认开启外网，窗口退出后后台继续；Android Java Activity 提供扫码和 API 模型选择，前台服务管理本地 Linux 用户态；两端共用 React 项目/会话界面，日常使用无需外部浏览器。

基线已验证：21 项主机/后台自动化测试、2 项 Android 模型配置单元测试、TypeScript/生产构建、Windows 安装程序/ZIP、Android APK 构建/lint/签名和包内容校验，真实模型多轮文件修改及恢复，公网 HTTPS 配对和模型事件轮询。Windows/Ubuntu/Android CI 通过。具体证据以验证记录为准。

**设备验收仍有缺口**：Android 配对、文件保存、PRoot 启动、工具执行和后台恢复尚未实机验证；新版 Windows 开发界面已检查首页、下滑二维码和界面退出后的公网配对；最终安装后全面验收仍待完成。原有桌面会话可发现和读取，但其他进程中的活动任务不能直接接管；桌面与手机交替写入同一会话的完整往返仍待验收。仓库克隆、任务补充指令、跨主机文件/会话迁移和 iOS 是后续工作。构建成功不能替代这些结论。

## 架构入口

```text
Windows Electron / Android 内置 React 界面
    → 鉴权 HTTP API + SSE / 事件轮询
    → CodexService → AppServer（stdio JSON-RPC）→ 官方 Codex CLI
                                                     → 项目文件、开发工具、模型服务
```

| 位置                                                           | 职责与修改入口                                                                                                                                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/host/main.ts` / `runtime.ts` / `native-main.ts`           | 分别为 CLI 启动、可嵌入的主机生命周期、Android 本地入口。CLI 与 App 初始化目前各有实现；修改鉴权、模型配置或默认权限时核对两条路径。                                                             |
| `src/host/rpc.ts`                                              | App Server 进程、请求/通知/审批回调、超时和退出。Windows 的 `CODEX_BIN` 要指向真正的 `codex.exe`。                                                                                               |
| `src/host/service.ts`                                          | 会话创建/接续、任务去重、实时轮次与持久历史合并、事件序号/进程标识、审批与有效权限。                                                                                                             |
| `src/host/server.ts`、`auth.ts`                                | HTTP/SSE/轮询、Host/Origin 检查、短时配对、设备凭据及撤销。                                                                                                                                      |
| `src/host/projects.ts`、`files.ts`、`storage.ts`               | realpath 项目授权、桌面项目导入、鉴权文件交付与 JSON 状态存储。                                                                                                                                  |
| `src/shared/`                                                  | 跨端业务类型与 `CG1.…` 连接码格式。Android 的 `HostConnection.java` 也实现连接码解析，改格式时同步。                                                                                             |
| `src/web/main.tsx`、`panels.tsx`、`api.ts`、`native.ts`        | 共享界面与权限/文件面板、HTTP 或原生请求桥、SSE/事件轮询。                                                                                                                                       |
| `src/desktop/main.ts`、`agent.ts`、`control.ts`、`renderer.js`             | Electron 控制页、独立后台进程、带随机凭据的本机控制管道和二维码。渲染进程保持隔离及 sandbox。                                                                                                                              |
| `apps/android/app/src/main/java/io/github/bichengili/codexgo/` | `MainActivity`：主机选择及可信 WebView 桥；`ScanActivity`：原生扫码；`ModelProvider`：HTTPS 模型发现；`HostConnection`：网络/凭据；`Vault`：Keystore；`EngineService`：前台进程生命周期；`RuntimeInstaller`：校验/事务安装；`Compat`：旧 Android API 兼容。 |
| `tools/`、`runtime/`、`protocol/`                              | 构建/真实探针/包校验、下载输入锁与来源、固定 CLI 生成的协议子集。版本事实读取对应文件。                                                                                                          |

## 最小开发与验证

仓库根目录执行命令。Node 要求见 `package.json`（当前 22.12+，CI 用 24）；先用 lockfile 安装。仅做文档修改时检查文档链接与 `git diff --check`，无需重新打包或调用模型。

```powershell
npm ci
npm test
npm run build
```

`npm test` 使用本地 fixture/HTTP/SSE，无需模型密钥。主机行为修改重点覆盖 `tests/host.test.ts`，连接码覆盖 `tests/connection.test.ts`，轮询客户端覆盖 `tests/events.test.ts`，实时通知和快照重放覆盖 `tests/live.test.ts`。验证应覆盖行为边界，不为简单文字或样式改动添加镜像测试。

启动 CLI/网页原型时用隔离工作目录：

```powershell
npm start -- --workspace "D:\Projects\codex-go-dev" --state-dir .local/dev-state
```

CLI 默认端口 **7331**，Windows App 默认 **7332**，Android 本地主机使用 loopback 随机端口。先检查已有进程和端口；清理时只停止本任务拥有的进程。前端改动需要 `npm run build` 后刷新，其他开发方式见运行说明。

### 按改动选择真实验证

| 命令                                                                      | 用途和前提                                                                                                |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `npm run probe`                                                           | 检查本机 CLI 的初始化、配置投影和历史协议，默认不发起模型任务。                                           |
| `npm run probe -- --run --output .local/probe.json`                       | 真实模型在临时项目中修改文件，并验证重启后同一会话恢复。                                                  |
| `npm run probe:desktop -- --run --output .local/desktop-integration.json` | 桌面项目发现、真实文件交付、下载和权限恢复。                                                              |
| `npx tsx tools/probe-native.ts`                                           | 验证已生成的 `dist/native/host.cjs` 与内置 Windows CLI；按 Android 本地入口检查默认权限，并调用真实模型。 |
| `npx tsx tools/probe-native.ts --stream`                                  | 同上，额外核对回复增量早于任务完成，记录工具事件及公开摘要增量数量。 |
| `npx tsx tools/probe-tunnel.ts`                                           | 使用内置 cloudflared 创建临时公网隧道，配对并通过轮询接收真实模型回复，结束后关闭测试服务。               |

后三类模型探针及 `--run` 会产生 API 用量，使用当前任务已获授权的服务配置；用隔离目录和新会话，保留可复查证据。现有用户对话仅做必要的只读检查，不向其发送测试消息。真实服务配置、密钥和响应中的敏感内容不写入仓库或日志。

## 原生构建顺序与陷阱

**版本更新约定**：用户要求今后每次更新交付都递增版本名称/版本号。同步更新 Windows 应用版本、Android `versionName` 与递增的 `versionCode`，以及构建脚本、安装包文件名、校验脚本和对应使用说明中的版本；交付前核对双端包内版本与文件名一致。本次已交付的 0.2.0 保持不变，下次更新起执行。

完整命令和产物路径以 [App 指南](docs/native-apps.md) 为准，关键顺序如下：

1. `npm run build:native` 先检查 TS、构建 React，再生成 Electron 和 Android 主机 bundle，复制内置界面。
2. Windows：`npm run build:windows` 校验并复制固定 CLI/cloudflared，再生成 NSIS 与 ZIP。可用 `CODEX_GO_RELEASE_DIR` 指定新输出目录，避免覆盖正在运行的 unpacked App。仅运行测试/CI 时可用 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`；打包和运行桌面 App 需要实际 Electron 二进制。
3. Android：先完成第 1 步，再执行 `npm run build:runtime`，最后在 `apps/android/` 执行 `./gradlew :app:assembleDebug :app:lintDebug`（PowerShell 使用 `.\gradlew.bat`）。需要 Python 3.11+、`zstandard`、curl、JDK 17、SDK 34。SDK 用 `ANDROID_HOME` 或忽略的 `local.properties`，不要提交机器绝对路径。
4. 修改主机 bundle 后重新组装 Android runtime；修改 React 后重新复制 assets 并构建 APK。CI 只构建/lint 客户端，不生成完整 ARM64 环境，因此 CI APK 不能替代完整安装包。
5. 完整交付执行 `python tools/verify-packages.py`，并用 SDK 的 `apksigner verify --verbose` 检查签名；文件命名和目录约定见 App 指南。校验脚本可接收交付目录参数，产物版本从根目录 package.json 读取，升级时同步 Android 原生版本字段。

运行环境必须保持 **`runtime.tgz`**：Android 资源合并器会展开 `.gz` 并改名，曾导致安装器找不到文件。`androidResources.noCompress` 保留 `.tgz` 原字节，也避免重复压缩造成 Gradle 堆内存不足。不要只检查源码 assets，要检查 APK 内实际文件名和哈希。

Android 当前为 ARM64、minSdk 26、targetSdk 28 的侧载包。较低 targetSdk 用于私有目录中的可执行工具，升级前需要验证执行策略，不能直接按 Play 上架要求修改。PRoot 提供 Linux 兼容性，隔离边界由 Android App 提供；手机本地仅提供环境内完全访问、默认严格审批。持久 `/root` 项目与可替换 runtime 分开，安装/升级/停止流程必须保留项目和会话。

下载输入必须匹配 `runtime/` 锁和构建脚本中的校验值，升级时明确核对来源与完整性。参考项目 dsh-Go 为 AGPL-3.0；复用其代码前先核对许可，当前实现及随包来源说明见 `runtime/NOTICE.md`。

## 必须保持的行为边界

- **连接**：Cloudflare Quick Tunnels 不支持 SSE；Android HTTPS 和临时隧道网页使用 JSON 事件轮询，LAN/手机本地使用 SSE。两者共用序号、进程标识、缺口补载及凭据撤销语义。LAN 默认 HTTP，外网通道 HTTPS，说明中准确区分。
- **提交与恢复**：持久化请求标识防重复执行；提交结果未知时核对历史，不自动重发，也不通过删除状态记录强行重试。新会话尚未落盘、首轮空日志和接续用量通知的边界已有回归测试。
- **会话归属**：每个主机服务管理自己的 App Server。接续旧会话需用户确认桌面空闲；切换主机不移动项目或会话，不提交任务。
- **权限**：目录授权约束连接服务访问，不等于工具沙箱。主机确认有效权限后再更新界面；完全访问需明确确认，遵从主机策略；不修改用户全局 Codex 配置。
- **文件**：上传和下载限制当前项目真实路径，排除私有状态/配置和越界 symlink/junction，单文件最多 200 MB；每条消息最多 8 个附件，图片内容校验后进入视觉输入。生成 HTML 等按附件交付，保持 Unicode/二进制支持。
- **凭据与桥接**：模型 Key 留在执行主机；Android 用 Keystore 加密，子进程环境注入。原生桥仅暴露给 APK 内置可信页面，外部链接使用系统浏览器。保持 Electron context isolation/sandbox 和 Host/Origin 校验。
- **产物**：`.local/`、`.runtime/`、`dist/`、Gradle 输出、rootfs、APK/EXE、密钥及本机配置保持忽略。协议或版本变更同步对应 Schema/锁文件、平台版本号、验证记录和使用说明。

## 完成与交接

公开项目入口为 [GitHub main](https://github.com/BichengiLi/codex-go)，安装包发布在 [Releases](https://github.com/BichengiLi/codex-go/releases)。README 面向使用者维护下载、安装、操作和兼容范围；贡献说明见 [CONTRIBUTING.md](CONTRIBUTING.md)，安全问题走 [SECURITY.md](SECURITY.md)。原创代码采用根目录 MIT LICENSE，第三方许可保留在 `runtime/NOTICE.md` 及随包声明中。

发布时核对标签源码、实际安装包、校验文件和使用指南对应同一次交付。2026-10-31 的 0.2.0 体验更新按用户明确允许的例外同步同名发布；后续更新必须递增版本，避免再次替换已发布版本。main 启用 PR/CI 保护并禁止强推/删除，维护者保留管理权限。

记录改了什么、适用检查及结果、设备/服务验证的实际范围。执行 `git diff --check` 并核对待提交文件，确认没有凭据、生成物和无关改动。提交代码与对应文档；用户要求推送时核对远端 SHA。最终说明明确区分自动测试、构建/静态校验、真实模型和设备实测，未执行的检查写清原因。
