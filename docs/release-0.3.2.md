# Codex Go 0.3.2 · 手机本地启动修复

修复 Android 点击“本地调用”后停留在启动页、只显示 `runtime-backup/.../runtime` 路径的问题。旧运行环境中的 PRoot 绑定占位目录可能为不可读权限，升级清理现在会先恢复应用所有者访问权限，再删除旧环境；项目和会话保留。

## 下载与升级

| 平台 | 安装包 |
| --- | --- |
| Windows x64 安装版 | [EXE](https://github.com/BichengiLi/codex-go/releases/download/v0.3.2/Codex-Go-0.3.2-Windows-x64.exe) |
| Windows x64 免安装版 | [ZIP](https://github.com/BichengiLi/codex-go/releases/download/v0.3.2/Codex-Go-0.3.2-Windows-x64.zip) |
| Android 8.0+ ARM64 | [APK](https://github.com/BichengiLi/codex-go/releases/download/v0.3.2/Codex-Go-0.3.2-Android-arm64.apk) |

Android versionName 为 0.3.2、versionCode 为 5。可直接覆盖安装，保留应用数据；不要先卸载或清除数据。Windows 应用版本同步为 0.3.2，更新前停止旧版后台连接，再启动新版。

随附 [SHA256SUMS.txt](https://github.com/BichengiLi/codex-go/releases/download/v0.3.2/SHA256SUMS.txt)、`release-manifest.json`、[Usage-Guide.md](https://github.com/BichengiLi/codex-go/releases/download/v0.3.2/Usage-Guide.md)、LICENSE 和 NOTICE.md。Windows 包未配置代码签名，Android 为调试签名侧载包。

## 验证

- 在非 root Linux 用户下复现旧代码的目录权限异常；修复后权限清理与符号链接保护两项回归测试通过。
- 27 项主机测试、双端构建、Android 单元测试/lint、APK v2 签名和最终包内容/哈希检查通过。
- API 36 的 ARM64 手机从 0.3.1 覆盖升级后，本地引擎和聊天页正常启动；对比确认原工作区文件、会话历史及其余稳定文件保留。用户拔下 USB 后再次确认可正常打开。

本次未执行手机本地模型任务，工具执行、文件保存和后台回收后的恢复仍待实测。该版继续按预发布交付，完整范围见 [0.3.2 验证记录](https://github.com/BichengiLi/codex-go/blob/v0.3.2/docs/validation-0.3.2.md)。

源码压缩包对应 v0.3.2 标签。原创代码采用 MIT，第三方组件保留各自许可。
