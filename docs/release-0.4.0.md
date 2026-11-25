Codex Go 现在可以在 Mac 上作为运行主机。打开桌面应用后，Android 手机可沿用原有扫码流程连接 Mac，查看项目和接续空闲会话。关闭桌面窗口后后台继续运行。

## 下载安装

- **Apple 芯片**下载 `Codex-Go-0.4.0-macOS-arm64.dmg`。
- **Intel 处理器**下载 `Codex-Go-0.4.0-macOS-x64.dmg`。

打开 DMG，将 Codex Go 拖入“应用程序”。安装包自带运行时、Codex CLI 和外网连接组件。电脑上的模型服务使用当前用户的 Codex 配置。

本版使用临时签名，尚未经过 Apple 公证。首次启动若被系统拦截，先对照 `SHA256SUMS.txt` 核对安装包。确认来源后可在“系统设置 → 隐私与安全性”中选择“仍要打开”。[Apple 支持](https://support.apple.com/zh-cn/102445)

## 验证范围

GitHub Actions 在两种架构的 macOS 上检查 DMG、应用签名和版本、内置工具架构、Codex 启动、应用退出后的后台连接及项目创建。实际手机跨网扫码和使用真实模型的往返需另行验收。

Windows 与 Android 用户可继续使用 [v0.3.2 安装包](https://github.com/BichengiLi/codex-go/releases/tag/v0.3.2)。
