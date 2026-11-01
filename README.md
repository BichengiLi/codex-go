# Codex Go

**灵感在路上，开发也可以。**

在 Android 手机上连接自己的电脑，继续 Codex 项目与对话；也可以配置自己的 API，在手机本地运行开发环境。

[![Check](https://github.com/BichengiLi/codex-go/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/BichengiLi/codex-go/actions/workflows/check.yml)
[![Release](https://img.shields.io/github/v/release/BichengiLi/codex-go?include_prereleases)](https://github.com/BichengiLi/codex-go/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[下载安装](#下载与安装) · [快速上手](#快速上手) · [使用指南](docs/native-apps.md) · [反馈问题](https://github.com/BichengiLi/codex-go/issues)

## 功能

- **扫码连接电脑**：Windows 启动后自动开启 HTTPS 外网连接，下滑显示二维码，手机扫码配对。
- **关闭窗口后继续运行**：电脑后台独立运行，关闭控制界面或手机界面会保留配对；可主动断联或撤销设备。
- **手机本地开发**：Android 内置 ARM64 Linux、Node.js、Git 和官方 Codex CLI，不需要电脑保持在线。
- **自带模型服务**：填写服务地址和 API Key，获取可用模型、多选并设置当前模型；服务需兼容 Responses 与工具调用。
- **项目与会话**：选择授权目录、导入 Codex App 已保存的项目、创建空项目、新建或接续空闲会话。
- **任务与文件**：查看输出和文件改动、处理执行审批、调整会话权限、停止任务、下载生成文件。
- **消息附件（0.3.0 本地更新）**：发送文件、图片和音频到当前会话的运行主机；连接电脑后可直接选择电脑会话或手机本地会话，手机继续使用同一份 API 配置。见[本次验证范围](docs/validation-2026-11-01.md)。

当前为 **0.2.0 预发布版**。Windows 界面、后台连接和公网配对已验证；Android 已完成构建、单元测试和静态检查，扫码、本地执行及后台恢复仍待真机验收。详见[验证范围](docs/native-apps.md#验证范围)。

## 下载与安装

从 [GitHub Releases](https://github.com/BichengiLi/codex-go/releases) 下载完整安装包，无需安装 Node.js 或单独配置运行环境。

| 平台 | 下载 | 安装方法 |
| --- | --- | --- |
| Windows x64 安装版 | [Codex-Go-0.2.0-Windows-x64.exe](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/Codex-Go-0.2.0-Windows-x64.exe) | 运行安装程序，按提示完成安装 |
| Windows x64 免安装版 | [Codex-Go-0.2.0-Windows-x64.zip](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/Codex-Go-0.2.0-Windows-x64.zip) | 完整解压，运行 `Codex Go.exe` |
| Android ARM64 | [Codex-Go-0.2.0-Android-arm64.apk](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/Codex-Go-0.2.0-Android-arm64.apk) | Android 8.0+，允许浏览器或文件管理器安装此 APK |

Android 本地环境建议预留至少 1.5 GB 可用空间。当前 APK 使用调试签名、通过侧载安装；Windows 包尚未配置代码签名。仅从本仓库 Releases 获取安装包。

可使用发布页的 [SHA256SUMS.txt](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/SHA256SUMS.txt) 核对下载完整性：

```powershell
Get-FileHash .\Codex-Go-0.2.0-Windows-x64.exe -Algorithm SHA256
```

已有安装通常可以覆盖更新，不必先卸载。**卸载 Android App 或清除数据会删除手机上的项目、会话与 API 配置。** 如果出现签名不一致或安装失败，先保留数据并记录错误，参见[安装与升级](docs/native-apps.md#安装与升级)。

## 快速上手

### 连接电脑

1. 在电脑上打开 Codex Go，等待外网连接就绪，按“连接移动设备，请下滑”向下滚动，显示配对二维码。
2. 手机打开 Codex Go，点击 **连接电脑**，允许相机权限并扫描二维码；也可以粘贴电脑复制的 `CG1.…` 连接码。
3. 选择项目，创建对话；接续已有对话前，先确认电脑上的该会话已经空闲。
4. 输入需求，查看输出、处理审批或保存文件。电脑下方的 **连接与项目设置** 可更换授权目录或撤销设备。

电脑使用当前用户的 Codex 配置，需先配置可用的模型服务。默认项目目录为“文档/CodexGo”；模型 API Key 留在电脑上。二维码五分钟内有效且只能使用一次，配对后保存独立设备凭据。

关闭电脑窗口后后台继续运行，重新打开会复用现有连接。**电脑关机、休眠或主动断联期间无法访问**。Cloudflare 临时隧道没有固定域名，电脑重启或隧道重建后可能需要重新扫码；连接详情见[完整指南](docs/native-apps.md#连接电脑的完整流程)。

### 手机本地调用

1. 手机首页点击 **本地调用**。
2. 首次使用填写 HTTPS 模型服务地址（例如 `https://api.example.com/v1`）和 API Key，点击 **获取模型**。
3. 勾选可用模型、设置当前模型，点击 **保存并开始**。首次启动会校验并解压内置环境。
4. 进入聊天页，选择或创建项目后开始对话。之后点击“本地调用”会直接进入已配置的环境。

服务需要支持 `GET /models`，以及 Codex 使用的 Responses 流式输出与工具调用；能获取模型列表不代表所有模型都兼容。API Key 使用 Android Keystore 加密保存，可在聊天页的 **模型与 API 设置** 中修改。

手机本地执行使用手机的文件和工具，模型请求仍需联网发送到你配置的服务商。运行状态在前台通知中显示，系统强行停止或后台限制可能中断任务。

## 常见问题

**手机与电脑必须在同一个 Wi-Fi 下吗？**

外网 HTTPS 隧道就绪后可以跨网络使用，不需要手动映射路由器端口。外网不可用时可在同一 Wi-Fi 使用局域网回退；局域网直连使用 HTTP。

**能直接接管电脑上正在运行的 Codex 任务吗？**

可以查看已保存的项目与会话，接续时需确认会话空闲。其他进程中的活动任务接管、桌面与手机完整往返验收仍有待完善。

**支持哪些平台和模型服务？**

提供 Windows x64 和 Android ARM64 安装包。CLI/网页开发入口支持 Windows/Linux；iOS、跨主机项目迁移、仓库克隆和任务补充指令尚未提供。模型服务需兼容所固定 Codex CLI 的 Responses 协议，目前不提供 Chat Completions 转换或离线模型推理。

## 从源码运行

需要 Node.js 22.12+，以及 Codex CLI（当前固定验证版本 `0.166.0-alpha.5.1`）。安装版用户可以跳过本节。

```sh
git clone https://github.com/BichengiLi/codex-go.git
cd codex-go
npm ci
npm run build
mkdir workspace
npm start -- --workspace ./workspace
```

也可以把 `./workspace` 替换为已有的项目根目录。打开终端打印的本机地址，输入配对码。CLI 默认复用当前用户的 Codex 配置；自定义 API、远程部署及开发流程见[运行说明](docs/running.md)。

```sh
npm test
npm run build
```

原生安装包构建见[构建指南](docs/native-apps.md#构建)。CI 覆盖 Windows/Ubuntu 测试与构建、Android 客户端编译和 lint；完整 ARM64 运行环境需要单独打包。

## 文档

| 文档 | 内容 |
| --- | --- |
| [双端使用指南](docs/native-apps.md) | 安装升级、扫码连接、本地 API 配置、打包与验证范围 |
| [运行与开发](docs/running.md) | CLI/网页、自定义服务、HTTPS 部署与验证命令 |
| [产品说明](docs/product.md) | 使用场景、当前能力和后续需求 |
| [架构说明](docs/architecture.md) | 主机、协议、运行环境和权限边界 |
| [路线图](docs/roadmap.md) | 已完成能力与后续计划 |
| [验证记录](docs/validation-2026-10-31.md) | 自动测试、真实模型、设备验收的具体范围 |
| [开发交接](AGENT.md) / [术语表](GLOSSARY.md) | 二次开发入口与项目概念 |

## 反馈与贡献

欢迎通过 [Issues](https://github.com/BichengiLi/codex-go/issues) 报告问题或提出建议，请附上平台、版本、复现步骤与脱敏日志。贡献流程见 [CONTRIBUTING.md](CONTRIBUTING.md)。

公开仓库允许查看、克隆和 Fork；贡献者通过 Pull Request 提交改动，由维护者决定是否合并。公开访问不会授予本仓库写入权限。

## 许可证与致谢

本项目原创代码采用 [MIT License](LICENSE)。随包的 Codex CLI、Electron、PRoot、Ubuntu 等第三方组件遵循各自许可证，来源和随包许可说明见 [runtime/NOTICE.md](runtime/NOTICE.md)。

感谢 [OpenAI Codex](https://github.com/openai/codex) 提供 App Server 协议，以及 [dsh-Go](https://github.com/ccch1mneyyy/dsh-Go) 的产品与架构启发；本项目未引入 dsh-Go 的源码或素材。Codex Go 是独立社区项目，与 OpenAI 无隶属关系。
