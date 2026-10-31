# Windows 与 Android App

0.2.0 提供 Windows 安装程序、免安装 ZIP 和 ARM64 Android APK。日常使用直接打开 App。Android 需要 Android 8.0 或更新系统；本地环境约需 1.5 GB 可用空间。

## 连接电脑的完整流程

1. 安装 Windows 版 Codex Go 并打开。App 自动启动服务，默认项目目录为“文档/CodexGo”，直接复用当前 Windows 用户的 Codex 模型与登录配置。也可以“选择目录”后重新“启动服务”。
2. 安装并打开 Android APK。同一 Wi-Fi 时，复制电脑上的整段 `CG1.…` 连接码，粘贴到手机的“连接电脑”。连接码有效期 5 分钟，仅可配对一次；过期或另一台设备已使用时，在电脑点击“刷新”。配对后的设备凭据有效 7 天。
3. 手机不在同一网络时，先在电脑点击“开启外网”，等待成功后**重新复制**连接码。外网经 Cloudflare 临时 HTTPS 隧道转发，消息和审批通过每秒事件轮询更新。隧道地址会随重建变化，因此重启电脑 App 或重新开启隧道后，可能需要新码。电脑必须保持运行且不休眠。
4. 进入后，选择已有项目或点击“Codex App 项目”导入桌面保存的项目。选择一个空闲会话，确认桌面没有继续执行它，再接续；也可以创建新会话或空项目。
5. 在对话中下达开发任务。命令、文件修改、流式输出与执行审批都在同一界面。需要调整权限时，等任务空闲，点击当前权限，选择文件权限及批准策略，按界面确认后应用。
6. 获取文件时，点击回复中的文件链接、改动卡片或“项目文件”中的下载按钮。Android 会打开系统“保存到”窗口。单文件上限 200 MB。
7. 返回主机选择页后，可用“重新连接”恢复已配对电脑。也可进入手机本地。切换主机不会转移项目、迁移会话或重发任务。退出电脑 App 会停止电脑服务；已生成文件仍保存在电脑项目中。

若局域网不通，确认电脑与手机处于可互访网络、Windows 允许此 App 的网络访问；访客/校园 Wi-Fi 可能隔离设备，可改用外网连接。外网通道不要求路由器端口转发。

## 不连接电脑的流程

1. 在 Android 主页面的“手机本地”填写 HTTPS 模型服务地址、模型名和 API Key。服务需兼容 Codex 使用的 Responses 接口。已保存 Key 时，留空可继续使用。
2. 点击“启动手机本地”。首次使用会校验并解压随 APK 携带的 Linux、Node、Git 和 Codex；之后启动复用已有环境。运行状态在前台通知中显示，通知提供停止按钮。
3. 进入本地项目后，创建空项目、新建会话并开始开发。项目、会话和模型配置属于手机；模型调用仍需网络。
4. 按返回键或“切换主机”可以回到选择页，本地任务仍由前台服务管理。需要关闭时，使用主页或通知中的“停止”。再次启动保留项目与会话。卸载 App 或清除其数据会移除手机内的数据。

本地 Key 与设备凭据通过 Android Keystore AES-GCM 加密保存，Android 备份关闭。模型 Key 通过进程环境注入引擎，不进入网页存储或日志。远程电脑的 Key 不会复制到手机。

手机本地运行使用 Android App 的系统隔离。PRoot 提供 Linux 兼容环境，不提供 Codex 的只读或项目沙箱，因此本地仅启用整个 App 环境内访问，默认严格审批，批准策略可调。电脑会话保持其独立的权限设置。

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

运行环境输入固定在构建脚本及 `runtime/` 锁文件中，下载后校验哈希，APK 携带运行环境与原生库清单。安装先写入临时目录，验证和解压完成后切换，失败保留原环境；持久项目目录与运行环境分开。大体积二进制不提交 Git。

APK 中的压缩环境使用 `runtime.tgz`，避免 Android 资源合并器自动展开 `.gz` 后更名。构建配置保留压缩归档原字节，避免重复压缩造成构建堆内存不足。最终交付前，把 Windows 安装程序/ZIP 和 APK 放入 `.local/releases/0.2.0/`，APK 命名为 `Codex-Go-0.2.0-Android-arm64.apk`，执行 `python tools/verify-packages.py`。它校验实际包内文件、运行环境/原生库哈希、必要执行文件及归档 CRC，并输出 `release-manifest.json` 和 `SHA256SUMS.txt`。APK 签名另用 Android SDK 的 `apksigner verify --verbose` 检查。

```powershell
# 已打包的主机及真实模型验证（只创建隔离测试项目和新会话）
npx tsx tools/probe-native.ts
# 临时公网 HTTPS 配对及鉴权读取，结束后自动关闭测试隧道
npx tsx tools/probe-tunnel.ts
```

## 验证范围

当前已完成双端构建、Android lint、18 项 HTTP/协议/连接码/事件轮询测试、打包主机的真实模型回复，以及 Cloudflare 公网 HTTPS 地址的配对、鉴权读取与真实模型事件轮询。Windows 开发版已实际生成连接码；界面自动操作按用户 Esc 中止。

Cloudflare 临时隧道不支持 SSE，因此 HTTPS 手机连接和临时隧道网页使用相同序号/进程标识的 JSON 轮询协议；局域网和手机本地继续使用 SSE。事件缺口会触发历史补载，轮询不重新发送任务。依据见 [Quick Tunnels 限制](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/)。

本机未连接 Android 设备，也没有可用模拟器镜像。因此 Android 安装后的配对、文件保存窗口、PRoot 启动、工具执行、后台存活与恢复尚未完成设备验收。编译和静态归档校验不能替代这些结果。桌面 App 正在执行的任务接管、跨主机文件/会话迁移和 iOS 也不在本版已验证范围内。
