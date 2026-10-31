# 参与 Codex Go

欢迎报告问题、改进文档和提交 Pull Request。项目当前处于预发布阶段，优先完善 Windows/Android 的实际使用与设备验收。

## 报告问题

在 [Issues](https://github.com/BichengiLi/codex-go/issues) 中先搜索已有问题，再提供：

- Codex Go 版本、操作系统版本、设备架构，以及使用的是远程还是手机本地模式。
- 复现步骤、预期结果、实际结果和安装错误原文。
- 已脱敏的截图或日志。删除 API Key、配对二维码、连接码、设备令牌和私人项目内容。

涉及凭据泄露或访问绕过等安全问题，请使用仓库的 [私密漏洞报告](https://github.com/BichengiLi/codex-go/security/advisories/new)，不要在公开 Issue 中贴出利用细节或秘密。

## 提交改动

1. Fork 本仓库并创建工作分支；较大的功能先开 Issue 讨论范围。
2. 阅读 [AGENT.md](AGENT.md) 和相关设计/使用文档，保持已有项目、会话和用户配置。
3. 完成改动，同步受影响文档。一般开发检查为 `npm test`、`npm run build`；纯文档改动检查链接和 `git diff --check` 即可。
4. 向 `main` 提交 Pull Request，说明解决的问题、最终行为、验证结果及尚未验证的范围。

不要提交 API Key、`.env`、本机路径配置、运行状态、签名私钥、依赖目录或大体积安装包。真实模型测试会产生 API 用量，请使用自己的测试项目和凭据；构建/测试命令见 [运行说明](docs/running.md) 与 [原生构建指南](docs/native-apps.md#构建)。

公开仓库的访问者可以查看、克隆、Fork、提 Issue 和提交 Pull Request，不能直接推送到本仓库。合并及发布由维护者控制；main 禁止强制推送和删除，普通贡献需经 Pull Request 与 CI。维护者保留管理权限。

## 版本与许可

后续应用更新交付需要递增版本名称/版本号，同步 Windows 版本、Android `versionName`/`versionCode`、包文件名、校验脚本和说明；本次 0.2.0 体验更新按既定例外保持版本。

提交原创贡献即表示同意按本仓库 [MIT License](LICENSE) 分发。引入第三方代码或资源时，记录来源和许可证，并保留必要声明；第三方运行环境不因本项目采用 MIT 而改变原许可。
