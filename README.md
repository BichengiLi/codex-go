# Codex Go

面向个人使用的移动开发入口：在手机上使用自己的 API Key 和中转服务开发，并连接电脑上的 Codex，继续已有项目与对话，或创建新的项目与对话。

本项目为私人项目，与 OpenAI 官方无隶属关系。

## 为什么做

希望使用自己 API 服务的用户，需要一个适合手机的开发入口。电脑上的 Codex 使用 API Key 时，也需要方便的跨设备连接方式：离开电脑后，仍能查看任务进展、继续讨论、审阅改动并发起下一步工作。

Codex Go 希望把模型服务、开发运行环境和手机界面连接起来。

## 产品目标

- **自带 API**：配置服务地址、API Key 和模型，使用兼容的中转服务。
- **手机开发**：在手机上操作项目、发起任务、查看输出、审阅改动和处理执行审批。
- **连接电脑**：配对自己的电脑，访问授权的工作目录与 Codex 会话。
- **接续上下文**：进入已有对话时保留项目路径、历史上下文和任务状态。
- **随时新建**：直接创建新对话、创建空项目或克隆仓库。
- **不依赖个人电脑在线**：探索手机本地运行，并支持连接用户自己的常驻开发主机。

## 当前状态

**首个远程原型已实现：Node.js 主机服务 + 适配手机的 React 网页客户端。**

支持短时配对、设备撤销、授权项目、创建空项目、新建/接续会话、历史分页、流式输出、命令/文件审批、任务停止和断线状态恢复。任务提交使用持久化请求标识，结果未知时不会自动重跑。模型配置复用主机 Codex，或使用主机环境变量指定 Responses 服务。

已在真实自定义服务上完成文件修改、多轮上下文、App Server 重启后同一会话恢复；也已读取桌面 App 原有会话。Android 本地执行、桌面运行任务接管和真实手机跨网络使用仍待验证。详见[验证记录](docs/validation-2026-10-31.md)。

## 快速启动

需要 Node.js 22.12+ 和 Codex CLI。本次固定验证版本：`0.166.0-alpha.5.1`。

```powershell
npm ci
npm run build
npm start -- --workspace "D:\Projects"
```

打开终端打印的本机地址，输入 8 位配对码。`--workspace` 是明确授权的根目录，可重复指定。默认复用电脑当前 Codex 配置，密钥不发送到浏览器。手机远程访问需配置 HTTPS 私有网络/代理；[运行说明](docs/running.md)包含连接方式、自定义 API、开发和 Android 探针。

```powershell
npm test
npm run probe
# 显式使用当前服务调用模型，验证文件修改及恢复：
npm run probe -- --run --output .local/probe.json
```

## 初步方向

参考启发本项目的 [dsh-Go](https://github.com/ccch1mneyyy/dsh-Go)，采用“手机本地 + 远程主机”的产品方向，让同一套项目与会话界面适配不同运行环境。

当前使用网页作为远程验证入口，不能单独运行手机本地 CLI。Android 原生宿主与本地 Linux 用户态仍是后续方向；Flutter + Kotlin 为候选。仓库提供 Android/Linux 探针，但没有 APK 或运行时安装器。

电脑与常驻主机模式通过连接服务调用 Codex App Server；手机本地模式也优先探索同一协议。先验证公开接口能否满足需求，再决定是否需要维护 Codex CLI 的修改版本。

## 项目文档

- [产品需求](docs/product.md)：用户场景、功能范围与验收标准。
- [技术方案](docs/architecture.md)：连接方式、运行环境与待验证的能力。
- [推进路线](docs/roadmap.md)：先验证哪些问题，再实现哪些功能。
- [dsh-Go 实现分析](docs/references/dsh-go.md)：源码依据、可借鉴设计与 Codex 的差异。
- [运行说明](docs/running.md)：启动、配对、远程连接、自定义 API 和验证命令。
- [本次验证](docs/validation-2026-10-31.md)：真实协议、模型和浏览器结果，以及未验证范围。
- [术语表](GLOSSARY.md)：运行主机、项目、会话与接续的定义。

## 参考

- [Codex App Server](https://developers.openai.com/codex/app-server/)
- [Codex 高级配置与自定义服务商](https://developers.openai.com/codex/config-advanced/)

技术资料核对日期：2026-10-31。本文的方案选择为初步建议，功能是否可用以实际实现与验证为准。
