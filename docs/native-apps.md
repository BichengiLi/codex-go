# Windows 与 Android App

0.2.0 提供 Windows 安装程序、免安装 ZIP 和 ARM64 Android APK。日常使用直接打开 App。Android 需要 Android 8.0 或更新系统；本地环境约需 1.5 GB 可用空间。

## 安装与升级

从 [v0.2.0 发布页](https://github.com/BichengiLi/codex-go/releases/tag/v0.2.0) 下载：

- [Windows x64 安装程序](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/Codex-Go-0.2.0-Windows-x64.exe)：按提示安装，再打开 Codex Go。
- [Windows x64 ZIP](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/Codex-Go-0.2.0-Windows-x64.zip)：完整解压后运行 `Codex Go.exe`。
- [Android ARM64 APK](https://github.com/BichengiLi/codex-go/releases/download/v0.2.0/Codex-Go-0.2.0-Android-arm64.apk)：在 Android 8.0+ ARM64 手机上允许安装此来源的应用，完成侧载。

安装版已包含所需运行时，使用电脑模式前仍需为电脑当前用户配置可用的 Codex 模型服务。当前 Windows 包未配置代码签名，Android 包使用调试签名；校验文件与运行环境信息随发布页提供。

已有版本通常可以直接覆盖安装；Android 需保持应用 ID 和签名一致。不必预先卸载，卸载或清除数据会删除手机项目、会话与凭据。遇到签名不一致等错误时先记录原文并备份需要的项目，避免把卸载作为默认升级步骤。

Windows 更新前在旧版“连接与项目设置”中主动断开连接，再关闭控制界面，确保旧后台及其内置工具退出；新版启动后按需重新扫码。ZIP 版解压到新目录，停止旧版后再运行新版，避免混用两个版本的后台进程。

本次 v0.2.0 下载已同步体验更新，仍使用 0.2.0 版本标识；后续应用更新会递增版本名称/版本号。

## 连接电脑的完整流程

1. 打开 Windows 版 Codex Go。中央标题和标语依次渐入，服务和外网 HTTPS 隧道自动启动；看到“连接移动设备，请下滑”后向下滚动，显示二维码。默认授权目录仍为“文档/CodexGo”，使用电脑当前 Codex 配置。
2. 手机首页依次显示品牌、标语和“连接电脑 / 本地调用”。点击“连接电脑”进入摄像头扫码；拒绝相机权限或无法扫码时，可以粘贴电脑复制的 `CG1.…` 连接码。二维码有效 5 分钟、单次使用，过期或已配对后自动更新。
3. 外网连接准备期间先等待二维码。外网暂不可用时会自动重试，并可使用二维码中的同一 Wi-Fi 地址；局域网直连为 HTTP，外网为 HTTPS。外网依赖 Cloudflare Quick Tunnel，无需路由器端口转发。
4. 配对凭据加密保存在手机，电脑持久化其哈希。Windows App 配对不再按七天自动到期，升级时保留尚有效的旧凭据。关闭电脑窗口或退出 Electron 界面后，独立后台进程继续管理主机和隧道；再次打开控制页复用原进程及地址。关闭手机界面不撤销配对，回到首页点“继续连接”即可恢复，任务仍在电脑执行。
5. 进入后选择项目、空闲会话并接续，或创建新会话。调整权限、审批和文件保存流程保持一致；下载文件单个最多 200 MB。
6. 电脑下方“连接与项目设置”可选择目录、启动或断开连接、撤销单台设备；手机首页“断开此电脑”会在线撤销该手机凭据。主动停止、关机和休眠期间不能远程访问。切换目录会重新启动主机与隧道，需要重新扫码。

Cloudflare 负责已有隧道的网络重连；其进程异常退出时，后台会自动重建。Quick Tunnel 不提供固定地址，**电脑重启、后台进程结束或隧道地址重建后，可能需要重新扫码**。这里的持久连接指保留设备配对并让电脑服务独立于界面存活，不保证公网基础设施或操作系统永不中断。后台不会替用户阻止休眠，也不安装开机启动项或系统服务。

CLI/网页入口保持默认七天配对策略。电脑端长期设备凭据可随时撤销；模型 API Key 不发送给手机。

## 不连接电脑的流程

1. 手机首页点击“本地调用”。此前已保存服务地址、Key 和当前模型时直接启动已有本地环境，进入聊天起始页；已运行时直接打开。
2. 首次使用进入独立配置页，填写 HTTPS 模型服务地址（例如 `https://api.example.com/v1`）和 API Key，点击“获取模型”。App 以 Bearer 鉴权调用该地址下的 `GET /models`，显示模型列表供多选，再从已选模型中设置当前使用的模型。
3. 点击“保存并开始”。首次启动校验并解压内置 ARM64 运行环境；运行状态和停止操作在前台通知中显示。服务必须兼容 Responses；能列出模型并不代表每个模型都支持 Codex 工具调用。
4. 在聊天页可创建对话和项目；顶部“模型与 API 设置”可重新配置。正在运行时先停止本地环境，再保存变更；停止、重启保留项目与会话。修改地址或 Key 后必须重新获取模型，避免使用旧服务的列表。
5. 返回首页或关闭界面不停止本地前台服务。卸载 App 或清除数据会删除手机项目、会话和凭据。

本地 Key 与电脑配对凭据由 Android Keystore AES-GCM 加密保存，备份关闭；模型 Key 通过进程环境传给引擎，不进入网页存储或日志。获取模型不跟随重定向，摄像头帧只在手机上解析。

本地 PRoot 提供 Linux 兼容环境，隔离由 Android App 提供；本地仅支持环境内完全访问，默认严格审批。系统强行停止 App、厂商后台限制和设备重启会中断手机本地运行，真机行为仍待验收。

## 构建

需要 Node 22.12+、Python 3.11+、curl；Android 还需要 JDK 17、Android SDK 34，处理 Ubuntu deb 时需要 Python `zstandard`。生成物和机器路径已加入忽略规则。

```powershell
npm ci
npm run build:native
# Windows：下载并校验固定 CLI 与 cloudflared，生成安装程序和 ZIP
npm run build:windows
# Android：组装 ARM64 运行环境，再构建已签名的调试 APK
npm run build:runtime
cd apps/android
.\gradlew.bat :app:assembleDebug :app:lintDebug
```

SDK 位置通过 `ANDROID_HOME` 或本机 `apps/android/local.properties` 设置。APK 位于 `apps/android/app/build/outputs/apk/debug/app-debug.apk`，Windows 输出在 `.local/releases/`。调试签名用于个人安装，正式分发签名不在仓库中。Android 为允许应用私有目录内运行开发工具，使用 targetSdk 28；此包通过侧载安装，不是 Google Play 发布包。

CI 显式安装 platform-tools、Android 34 platform 与 Build Tools 34.0.0，不依赖已从 SDK 仓库移除的旧 `tools` 包；只编译/lint 原生客户端，完整 ARM64 环境在本地单独打包。

运行环境输入固定在构建脚本及 `runtime/` 锁文件中，下载后校验哈希，APK 携带运行环境与原生库清单。安装先写入临时目录，验证和解压完成后切换，失败保留原环境；持久项目目录与运行环境分开。大体积二进制不提交 Git。

APK 中的压缩环境使用 `runtime.tgz`，避免 Android 资源合并器自动展开 `.gz` 后更名。构建配置保留压缩归档原字节，避免重复压缩造成构建堆内存不足。最终交付前，把 Windows 安装程序/ZIP 和 APK 放入 `.local/releases/0.2.0/`，APK 命名为 `Codex-Go-0.2.0-Android-arm64.apk`，执行 `python tools/verify-packages.py`。它校验实际包内文件、运行环境/原生库哈希、必要执行文件及归档 CRC，并输出 `release-manifest.json` 和 `SHA256SUMS.txt`。APK 签名另用 Android SDK 的 `apksigner verify --verbose` 检查。

```powershell
# 已打包的主机及真实模型验证（只创建隔离测试项目和新会话）
npx tsx tools/probe-native.ts
# 临时公网 HTTPS 配对及鉴权读取，结束后自动关闭测试隧道
npx tsx tools/probe-tunnel.ts
```

## 验证范围

当前已完成双端构建、Android lint、21 项主机/后台/协议测试及 2 项 Android 模型配置单元测试、打包主机的真实模型回复，以及 Cloudflare 公网 HTTPS 地址的配对、鉴权读取与真实模型事件轮询。新版 Windows 开发版已检查渐入首页和下滑二维码，无控制台错误或横向溢出；窗口进程退出后，原 HTTPS 隧道完成真实配对、鉴权读取和设备撤销。

Cloudflare 临时隧道不支持 SSE，因此 HTTPS 手机连接和临时隧道网页使用相同序号/进程标识的 JSON 轮询协议；局域网和手机本地继续使用 SSE。事件缺口会触发历史补载，轮询不重新发送任务。依据见 [Quick Tunnels 限制](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。

本机未连接 Android 设备，也没有可用模拟器镜像。因此 Android 安装后的配对、文件保存窗口、PRoot 启动、工具执行、后台存活与恢复尚未完成设备验收。编译和静态归档校验不能替代这些结果。桌面 App 正在执行的任务接管、跨主机文件/会话迁移和 iOS 也不在本版已验证范围内。
