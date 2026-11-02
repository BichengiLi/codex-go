# 0.3.2 Android 运行环境升级修复

日期：2026-11-02。源码与 Windows 应用版本 0.3.2，Android versionName 0.3.2、versionCode 5。本地交付目录 `.local/releases/0.3.2/`，公开下载见 [v0.3.2 发布页](https://github.com/BichengiLi/codex-go/releases/tag/v0.3.2)。

## 故障证据与修改

手机从 0.3.1 的“本地调用”进入启动页后，只显示 `runtime-backup/data/user/0/io.github.bichengili.codexgo/files/runtime` 路径。通过 USB 调试，以应用自身身份确认该路径是权限为 `000` 的目录，读取返回 `Permission denied`；持久项目保存在独立的 `files/home`，手机剩余空间约 26 GB。

旧运行环境包含 PRoot 创建的不可读绑定占位目录，升级清理备份时 `Files.newDirectoryStream` 无法进入。清理现在先恢复待删除目录的应用所有者读、写和执行权限，再递归删除。符号链接继续按链接本身删除，不跟随至持久项目或其他目录。清理失败显示可读的错误说明，并保留底层异常供诊断。

## 验证

- `RuntimeInstallerTest`：在非 root Linux 用户下，对 HEAD 的旧清理实现运行新增测试，复现相同深层目录的 `AccessDeniedException`；换成修复实现后 2/2 通过。符号链接测试同时确认持久项目内容不变。证据：`.local/diagnostics/runtime-linux/baseline-results.txt`、`fixed-results.txt`。
- Windows Gradle `:app:assembleDebug :app:testDebugUnitTest :app:lintDebug` 通过。原有模型配置测试 2 项通过；新增的 POSIX 权限/符号链接测试因 Windows 文件系统限制跳过，另由上述 Linux 测试覆盖。Android CI 已加入单元测试步骤；发布提交的远端 CI 结果链接记录在发布页。
- `npm test` 27/27 通过；`npm run build:native` 和 `npm run build:windows` 通过。
- 最终 APK 的 versionName 0.3.2、versionCode 5、APK v2 签名已校验；Windows `app.asar` 应用版本为 0.3.2。`python tools/verify-packages.py .local/releases/0.3.2` 通过最终 APK/ZIP CRC、运行环境及原生库哈希、内置主机与共享界面一致性检查，并生成校验清单。

## 手机实测

设备为 MBH-AN10，系统 API 36。用户授权 USB 覆盖安装后，以 `adb install -r` 从 0.3.1 更新到 0.3.2。安装前将应用的 `files/home` 备份到本地忽略目录，没有清除应用数据。

点击“本地调用”后成功完成运行环境更新，界面进入“当前运行主机：手机本地”，并显示“localhost 主机已连接”。PRoot、Node、Codex 三个进程均在运行；安装标记等于随包运行环境哈希，`runtime-backup` 与 `runtime-staging` 均已清理。

对比启动前后备份，5,501 个稳定文件均存在且内容哈希一致，包含原有工作区文件和会话历史。排除正常启动会更新的 CLI 日志数据库、配对设备记录及临时锁文件。证据：`.local/diagnostics/phone-upgrade-preservation.json`；完整备份只保存在本机忽略目录，不进入 Git。

用户拔下 USB 后再次确认手机本地模式能够打开。本次未发送手机本地模型任务，未验证工具执行、文件保存或系统后台回收后的恢复；电脑当前运行的已安装版本没有被替换。
