# 02: Installed Android remote client

**What to build:** enter a computer connection code, connect and develop using
the existing interface, with native credential storage and file downloads.

**Blocked by:** 01, connection-code contract.

**Status:** implemented and APK/lint passed; device acceptance pending (no device/emulator).

- [x] Build a signed APK containing a native host chooser and bundled UI.
- [x] Implement code parsing, pairing, Keystore credential storage and reconnect.
- [x] Route projects/chat/approvals and authenticated downloads to the chosen host; use polling over HTTPS tunnels that cannot stream SSE.
- [x] Keep host-owned projects distinct; switching does not submit tasks or migrate files.
- [ ] On-device acceptance: pair/reconnect, project/chat/approval flow, system file save and host switching.
