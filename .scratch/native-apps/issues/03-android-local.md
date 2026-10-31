# 03: Android independent development environment

**What to build:** initialize the phone runtime, configure a model service and
develop in phone-owned projects without a computer connection.

**Blocked by:** 02, installed client and native lifecycle.

**Status:** implemented and bundled; device execution pending (no device/emulator).

- [x] Bundle hash-verified Linux/Node/Git/Codex inputs and PRoot native libraries in the ARM64 APK.
- [x] Implement transactional installation and Keystore AES-GCM credentials.
- [x] Implement foreground boot/stop and separate persistent projects from the replaceable runtime.
- [x] Record build/static validation separately from missing physical/emulator results.
- [ ] On-device acceptance: initial install, local API/tool task, stop/restart and persistent history/files.
