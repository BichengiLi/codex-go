# 运行首个原型

日常安装使用 Windows/Android App，见[完整 App 流程](native-apps.md)。下文保留 CLI/网页开发入口。

本文介绍 Windows 主机服务与网页开发入口。需要 Node.js 22.12+（本次使用 24.11.1），以及具有 v2 历史分页接口的 Codex CLI。本次验证版本为 `0.166.0-alpha.5.1`；请求 Schema 及版本记录保存在 `protocol/`。

## 电脑上启动

```powershell
npm ci
npm run build
npm start -- --workspace "D:\Projects"
```

`--workspace` 必须明确给出，可重复指定多个授权根目录。列表显示根目录和直接子目录；仓库的源码子目录不作为项目显示，但在网页新建的子项目会单独保留。新项目创建在第一个授权根目录内。服务默认地址为 `http://127.0.0.1:7331`。打开页面，输入终端的 8 位配对码；码在 5 分钟内有效且只能使用一次。已配对设备使用 7 天有效的 HttpOnly cookie，主机只保存凭据哈希。

默认使用当前运行用户的 Codex 配置与凭据，不修改用户的 `config.toml`。桌面 App 与主机服务必须使用同一个 Codex 数据目录，才能读取相同历史。浏览器只接收模型名和服务商标识。

找不到 CLI 时，在启动前设置原生可执行文件的路径：

```powershell
$env:CODEX_BIN = 'C:\path\to\codex.exe'
npm start -- --workspace "D:\Projects"
```

Windows 上请指向真正的 `codex.exe`，而非 npm 的 `codex.cmd` 包装脚本。Linux 环境使用 PATH 中的 `codex`。

## 手机连接

推荐通过自己已有的 HTTPS 私有网络反向代理访问。代理转发到 loopback 服务，并保留公开地址的 Host；关闭 SSE 缓冲，允许长连接。例如，若已配置 `https://my-pc.example` 转发到本机 7331：

```powershell
npm start -- --workspace "D:\Projects" --public-url "https://my-pc.example"
```

这条命令登记允许的浏览器来源，并不创建代理、TLS 证书、SSH 连接或穿透服务。HTTPS 模式使用 Secure cookie。不要把 App Server 的 stdio 转换成未鉴权的公网监听。

临时局域网验证可以显式允许 HTTP，地址需要换成本机真实的局域网 IP：

```powershell
npm start -- --workspace "D:\Projects" --host 0.0.0.0 --public-url "http://192.168.1.100:7331" --insecure-lan
```

手机与电脑位于同一网络后打开该地址。此开发模式不提供传输加密；正式使用走 HTTPS。没有自动修改防火墙、安装证书或配置公网路由。

## 自定义 Responses 服务

首选复用电脑当前配置。也可以仅对本服务的子进程设置服务商，不改动全局配置：

```powershell
$env:CODEX_GO_BASE_URL = 'https://your-provider.example/v1'
$env:CODEX_GO_MODEL = 'your-model-id'
# 从你的主机凭据管理方式注入 CODEX_GO_API_KEY；不要提交到 Git。
npm start -- --workspace "D:\Projects"
```

三个环境变量必须一起配置。模型密钥通过环境传给 App Server，不出现在命令行参数、HTTP 配置响应或运行状态文件中。当前要求 Responses 流式与工具协议，不提供 Chat Completions 转换。不要在浏览器输入模型密钥。

## 使用与恢复

1. 选择项目，新建对话；或打开已有会话阅读历史。
2. 接续旧会话前，先停止桌面上的执行，再点击“接续对话”并确认。原型无法确定另一个桌面进程是否正在执行。
3. 输入需求。输出、命令和文件修改会实时更新；需要审批时选择“允许本次”或“拒绝”。仅支持命令与文件修改审批，其他客户端回调返回不支持错误。
4. 客户端断网不会主动停止主机任务。重连刷新历史、任务状态和审批；事件缓存有缺口时显示提示。
5. 写操作具有持久化请求标识。超时或主机异常后不会自动重跑；请核对历史后再决定是否发起新操作。
6. “设备与连接”可撤销任意配对设备，撤销立即关闭该设备的事件连接。需要新配对码时重启服务；已配对设备在有效期内可继续连接。

服务停止会关闭其 App Server，正在执行的任务可能中断。重启后保留持久化历史与设备凭据，旧审批不复用；需要重新接续会话。主机异常退出时的任务提交可能处于“结果未知”，必须核对历史。运行数据位于 `.runtime/`（已忽略），可通过 `--state-dir` 指定；不要删除任务记录来重试一个结果未知的提交。

授权根目录约束连接服务的项目与会话访问，不是操作系统沙箱。模型工具能访问哪些路径、网络和命令，取决于 Codex 的实际沙箱和审批实现；尤其不能把 Android PRoot 视作强隔离。

## 桌面项目、文件和权限

打开侧栏的“Codex App 项目”。它通过本机 App Server 的 `project/list` 读取桌面保存的项目，点选一个目录后授权此目录供当前配对客户端使用；多根项目逐根列出。已选择的项目记录在运行状态目录的 `projects.json`，重启继续有效。不会修改桌面项目注册表，也不接受客户端提交的任意导入路径。会话列表按实际工作目录查询；其他主机或独立 worktree 目录需要另外授权。

模型生成的普通文件可以从回复中的本地 Markdown 链接或文件改动下载卡片获取，也可通过“项目文件”进入子目录下载。新建对话会引导模型把交付文件保存在工作目录并返回本地链接；旧对话沿用原有开发指令。下载仅限当前项目内真实路径，支持 Unicode 文件名和二进制，最大 200 MB；目录、越界链接、私有配置（例如 `.env`、`.codex`、`.git`、运行状态目录、凭据和私钥）不会作为下载文件暴露。外部路径的历史链接需先把文件复制到当前项目，或切换到对应项目获取。

接续对话后，顶部权限按钮显示实际沙箱与批准策略。任务及待处理审批结束后可修改：

| 设置       | 含义                                              |
| ---------- | ------------------------------------------------- |
| 只读       | 内置只读权限；额外写入取决于批准策略与主机限制    |
| 项目内读写 | 内置 workspace 权限；外部路径和联网受主机策略限制 |
| 完全访问   | 取消项目沙箱限制；必须勾选明确确认                |
| 严格审批   | 不受信任的操作先请求批准                          |
| 按需审批   | 由 Codex 请求额外批准                             |
| 不询问     | 不发送审批；缺少权限时直接失败                    |

权限通过 `permissionProfile/list` 和 `thread/settings/update` 变更；等待 `thread/settings/updated` 后显示有效值。主机管理策略仍可拒绝设置。选择记录在 `permissions.json`，接续时恢复；不改全局 `config.toml`。新对话以及从未设置过的接续对话仍默认 workspace-write / untrusted。其他桌面进程占用的会话会提示先释放执行权。

## 开发和验证

```powershell
npm test
npm run build
npm run probe
# 显式调用真实模型，在新建临时目录中完成两次文件修改：
npm run probe -- --run --output .local/probe.json
# 可选只读检查桌面会话，不会接续或修改它：
npm run probe -- --thread YOUR_THREAD_UUID
# 桌面项目发现、有效权限、真实模型生成文件、下载和重启后权限：
npm run probe:desktop -- --run --output .local/desktop-integration.json
```

`--run` 会调用当前模型服务产生 API 用量。探针不读取其他项目文件，仅在打印的临时目录中写入 `probe.txt`；验证结束保留该目录和测试会话供检查。模型探针仅自动接受临时目录内的文件修改审批，拒绝 shell 执行审批。

`npm run protocol` 根据本机 CLI 重新生成本原型使用的请求 Schema。升级 CLI 时先检查协议差异，再运行探针。完整 Schema 保存在 `.local/protocol/`。

`npm run dev` 监视主机源码；前端修改后重新构建并刷新页面。也可运行 `npm run dev:web`，并在主机启动参数中登记 Vite 的来源 `--public-url http://127.0.0.1:5173`（本机开发用途）。

## Android 本地探针

安装版的 PRoot 安装器、前台服务和运行环境打包源码已经包含在仓库中；APK 和预制 rootfs 属于忽略的构建产物，构建方式见[双端 App 指南](native-apps.md)。下面是使用自备 Linux 用户态的独立协议探针，不代替安装版验证。先在 Android 内准备 Linux 用户态环境、Node.js 和对应架构的 Codex，进入本仓库执行：

```sh
npm ci
sh tools/android-probe.sh
# 配好该环境自己的 Codex 凭据后，显式运行真实文件/恢复测试：
npm run probe -- --run --output .local/android-probe.json
```

需另行验收：文件权限、工具执行、审批、前后台切换、系统挂起、停止与重启。当前 Android 本地模式已实现并打包，但没有设备执行证据；不能据此宣称已通过实机验收。
