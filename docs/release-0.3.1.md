# Codex Go 0.3.1 · 附件、本地会话与实时任务进展

本次预发布包含自 0.2.0 以来的附件、手机本地会话及连接与流式显示更新。

## 更新内容

- 发送栏支持文件、图片和音频，每条消息最多 8 个附件、每个最多 200 MB。附件上传到当前会话的运行主机；图片作为视觉输入，其他文件交给该主机的工具处理。
- 手机连接电脑后，可在聊天页选择电脑会话或手机本地会话。手机本地复用原有 API 配置，并保留电脑配对；两种运行主机分别保存项目和会话。
- 手机扫码、粘贴连接码或恢复连接后使用已保存的凭据，不再重复显示八位码表单；连接失败时提供重试和返回首页。普通网页首次配对保留八位码。
- 回复、计划、工具状态与命令输出随任务进展更新。模型服务返回思考摘要时同步展示，阅读历史时暂停自动跟随输出。
- 修复迟到的历史响应覆盖流式文字，以及部分 CLI 后端不支持历史分页接口时无法读取会话的问题。

## 下载与升级

| 平台 | 安装包 |
| --- | --- |
| Windows x64 安装版 | [EXE](https://github.com/BichengiLi/codex-go/releases/download/v0.3.1/Codex-Go-0.3.1-Windows-x64.exe) |
| Windows x64 免安装版 | [ZIP](https://github.com/BichengiLi/codex-go/releases/download/v0.3.1/Codex-Go-0.3.1-Windows-x64.zip) |
| Android 8.0+ ARM64 | [APK](https://github.com/BichengiLi/codex-go/releases/download/v0.3.1/Codex-Go-0.3.1-Android-arm64.apk) |

请同时更新手机和电脑；Windows 更新前停止旧版后台连接，再启动新版。Android 本地环境建议预留至少 1.5 GB，升级时保留应用数据。Windows 包未配置代码签名，Android 为调试签名侧载包。

[SHA256SUMS.txt](https://github.com/BichengiLi/codex-go/releases/download/v0.3.1/SHA256SUMS.txt) 用于校验三个安装包；`release-manifest.json` 记录包内容检查。随附 [Usage-Guide.md](https://github.com/BichengiLi/codex-go/releases/download/v0.3.1/Usage-Guide.md)、LICENSE 和 NOTICE.md。

## 验证范围

27 项自动测试、2 项 Android 单元测试、Windows/Ubuntu/Android CI，以及双端构建、APK 签名和包内容/哈希检查均已通过。窄屏 SSE 与模拟手机轮询界面验证通过；真实模型收到 33 段回复和工具事件。本次服务未返回思考摘要，摘要展示另由 fixture 验证。

Android 扫码、PRoot 执行和前后台恢复仍待真机验收。音频转写取决于模型与可用工具；模型服务需兼容 Codex Responses 与工具调用。详情见 [0.3.1 验证记录](https://github.com/BichengiLi/codex-go/blob/v0.3.1/docs/validation-0.3.1.md)。

源码压缩包对应 v0.3.1 标签，应用源码与通过验证的 `ee4ee67` 一致；发布提交同步下载入口和说明。原创代码采用 MIT，第三方组件保留各自许可。
