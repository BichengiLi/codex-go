# 03: Android independent development environment

**What to build:** initialize the phone runtime, configure a model service and
develop in phone-owned projects without a computer connection.

**Blocked by:** 02, installed client and native lifecycle.

**Status:** ready-for-agent

- [ ] Verified runtime inputs are bundled with the ARM64 APK.
- [ ] Runtime installation is transactional and credentials are encrypted at rest.
- [ ] A foreground service owns boot/stop and preserves projects across restarts.
- [ ] Build and physical/emulator validation results are recorded independently.
