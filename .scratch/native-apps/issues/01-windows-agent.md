# 01: Installed Windows connection agent

**What to build:** launch the host from a desktop application, select workspace,
copy an expiring connection code and optionally enable an HTTPS Internet tunnel.

**Blocked by:** None.

**Status:** implemented; built and protocol-verified; final UI acceptance stopped by user Escape.

- [x] Implement host lifecycle and generate runnable Windows installer/ZIP. Development UI started the host; final packaged UI acceptance remains limited.
- [x] Codes identify an endpoint and expiring pairing secret, and can be renewed.
- [x] LAN and optional Internet addresses participate in existing authorization; public pairing and real model events passed.
- [x] Preserve project/chat/file/permission APIs and pass their regression tests.
