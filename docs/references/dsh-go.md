# dsh-Go 实现分析

参考项目：[ccch1mneyyy/dsh-Go](https://github.com/ccch1mneyyy/dsh-Go)。

分析日期：2026-10-31。核对版本：[`bf01594471e11d7c1dbfe743a304a02d66068b29`](https://github.com/ccch1mneyyy/dsh-Go/tree/bf01594471e11d7c1dbfe743a304a02d66068b29)。

依据为该提交的 README、使用指南和下列源码，未安装 APK、执行项目脚本或实测远程服务。本项目目前仅参考设计，未引入其源码和素材。

## 关键结论

dsh-Go 的产品结构非常接近 Codex Go 的目标：在同一手机界面中，选择手机本地引擎、SSH 主机或远程中继主机，再管理该主机上的项目与会话。它的“本地运行”指在手机执行 Agent 和工具，模型请求仍发送给配置的服务商。

最有价值的参考是三个边界：运行环境可切换、传输可以替换、会话业务共用。同一主机上的不同客户端通过引擎的会话接口工作；跨主机切换则不会自动迁移项目和会话。

## 实现与源码依据

| 部分 | 在参考项目中如何实现 | 源码依据 |
| --- | --- | --- |
| 手机界面 | Flutter / Dart 界面，Android Kotlin 平台实现。 | [README 目录与构建说明](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/README.md)、[app/pubspec.yaml](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/pubspec.yaml) |
| 主机模型 | `HostKind` 明确区分 `local`、`ssh`、`relay`，主机身份由种类和 ID 组成。 | [hosts_state.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/lib/state/hosts_state.dart#L25) |
| 手机本地引擎 | 打包 Ubuntu 用户态、Node.js 和 DSH；默认通过 PRoot 启动 `dsh web`，另有可选直接启动路径。 | [build-runtime.sh](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/runtime/build-runtime.sh)、[DshProcess.kt](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/android/app/src/main/kotlin/io/github/ccch1mneyyy/dsh_app/runtime/DshProcess.kt) |
| 后台宿主 | Android Service 管理运行环境，并使用前台服务通知承载运行状态。 | [DshService.kt](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/android/app/src/main/kotlin/io/github/ccch1mneyyy/dsh_app/runtime/DshService.kt) |
| SSH 远程 | 验证主机指纹，启动或复用远端 `dsh web`，将回环地址服务经 SSH 转发到手机，再创建同一种会话客户端。 | [ssh_link.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/lib/remote/ssh/ssh_link.dart)、[remote_bootstrap.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/lib/remote/ssh/remote_bootstrap.dart)、[local_forward.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/lib/remote/ssh/local_forward.dart) |
| Remote 连接 | 账号发现主机，核对身份指纹；代码支持 WebRTC 路径及中继回落，并使用 Noise IK 安全通道。实际路径依赖服务端和主机能力。 | [dsh_remote_backend.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/lib/remote/relay/dsh_remote_backend.dart)、[secure_channel.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/packages/dsh_remote/lib/src/channel/secure_channel.dart)、[主机指南](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/docs/guide/zh/03-engine-hosts.md) |
| 统一客户端 | `DshCarrier` 抽象普通调用和流式连接；HTTP 与加密隧道位于该接口下方，上方共用 RPC、Mux、会话和审批 API。 | [carrier.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/packages/dsh_client/lib/src/carrier.dart)、[dsh_client.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/packages/dsh_client/lib/dsh_client.dart) |
| 流式恢复 | Mux 管理连接代次、重连和待处理请求；会话跟随支持基线恢复及缺口处理。 | [mux.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/packages/dsh_client/lib/src/mux.dart)、[session_api.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/packages/dsh_client/lib/src/session_api.dart) |
| 自定义 API | 区分 Completions、Responses、Anthropic 协议；设置引用密钥名，密钥通过凭据接口单独保存。 | [providers_api.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/packages/dsh_client/lib/src/providers_api.dart) |
| 连接凭据 | SSH 密码、私钥和远程设备凭据使用 `flutter_secure_storage`，与普通主机设置分开。 | [secret_store.dart](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/app/lib/remote/secret_store.dart) |

## 对 Codex Go 的方案调整

1. **保留手机本地运行的目标。** 原生 Android 宿主值得优先验证；PWA 适合验证远程交互，无法独立运行本地 CLI 和完整开发工具链。
2. **统一主机与会话模型。** 项目和会话使用主机身份定位，切换连接方式不重写聊天业务，切换主机不混入上一主机的状态。
3. **优先使用 Codex 的官方协议。** 将 DSH 的 Web API 位置替换为 Codex App Server 适配层，先验证 `thread/*`、`turn/*`、事件和审批，再评估 CLI 修改。
4. **先完成简单的远程连接。** SSH / 私有网络可先验证核心场景；账号体系、P2P、TURN 和中继可在实际需要时扩展。
5. **按实际能力显示功能。** 历史可读、会话可续、运行中可控分别判断；连上主机不表示所有功能都可用。
6. **把重连视为状态恢复。** 重建连接后刷新会话和审批状态，再允许操作；不能将重连等同于自动重发最后一条指令。

## 需要单独解决的差异

| 问题 | 为什么不能直接沿用 |
| --- | --- |
| Codex 桌面 App 的已有会话 | DSH 通过自己的引擎 API 管理会话；Codex App 的会话来源、数据目录、执行进程及项目界面信息仍需逐项验证。 |
| 手机本地 Codex | DSH 的 Node.js 运行条件与 Codex 的 Rust 运行时、可执行文件及沙箱条件不同。Linux 用户态环境可用不等于 Codex 完整能力可用。 |
| 中转服务协议 | DSH 适配层列出的多种协议不代表 Codex 也支持同样范围；优先验证 Codex 使用的 Responses、流式事件和工具调用。 |
| Windows 主机启动 | 参考项目 SSH 启动脚本使用 POSIX shell、`nohup` 和 Unix 进程命令；Windows 原生与 WSL 需要分别设计和验证。 |
| 正在执行的任务交接 | 读取同一会话的历史，不等于可控制另一进程中的运行任务；必须验证连接归属、审批归属与执行权交接。 |
| 远程网络基础设施 | 参考项目的账号、主机目录、TURN 和中继服务不自动成为 Codex Go 的可用基础设施。 |

## 源码与素材使用边界

参考项目源码采用 AGPL-3.0，README 另说明 `sdk/` 和 `examples/` 使用 MIT；品牌与吉祥物有独立使用条款。当前仅整理架构与实现机制，没有复制源码或素材。以后若决定直接引入组件，应记录具体文件及其许可；仓库可见性和本项目的 MIT 许可均不替代第三方组件授权判断。

依据：[LICENSE](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/LICENSE)、[ASSETS.md](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/ASSETS.md)、[README](https://github.com/ccch1mneyyy/dsh-Go/blob/bf01594471e11d7c1dbfe743a304a02d66068b29/README.md)。
