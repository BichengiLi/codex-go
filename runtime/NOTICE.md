# Runtime inputs and sources

Original Codex Go code and documentation are licensed under the MIT License
in the repository root. Third-party software described below retains its own
copyright and license; the project's MIT license does not relicense it.

The build uses unmodified official Codex CLI npm artifacts (Apache-2.0), Node.js
Linux distributions (their included LICENSE), Ubuntu Base and a checksum-locked
Ubuntu package closure (individual package copyright files remain in the image),
and Termux PRoot, talloc and libandroid-shmem packages.

PRoot 5.1.107.101 is GPL-2.0. Its matching source ZIP and COPYING accompany the APK
in `assets/licenses/`; source URL and SHA-256 are in `tools/build-runtime.py`.
Termux's build recipe is available at
https://github.com/termux/termux-packages/tree/master/packages/proot . The local
build changes the DT_NEEDED/SONAME string `libtalloc.so.2` to `libtalloc.so` for
Android native-library packaging. The exact patch is in `patch_soname()`; it
does not change PRoot source. Dependency source repositories:

- https://github.com/termux/proot/tree/v5.1.107.101
- https://www.samba.org/ftp/talloc/ (talloc 2.5.0; LGPL)
- https://github.com/termux/libandroid-shmem (0.7; BSD-2-Clause)
- https://github.com/openai/codex (official npm version 0.166.0-alpha.5.1)
- https://nodejs.org/dist/v24.22.1/

The Ubuntu ARM64 package versions/hashes and the PRoot packaging approach were
cross-checked against dsh-Go by ccch1mneyyy, commit
`bf01594471e11d7c1dbfe743a304a02d66068b29`:
https://github.com/ccch1mneyyy/dsh-Go . That checkout's LICENSE is AGPL-3.0,
irrespective of repository metadata. This project ships its own runtime builder,
installer and lifecycle implementation; dsh-Go executable code is not bundled.
`ubuntu-arm64.lock.json` records Ubuntu package facts; the Ubuntu binaries retain
their individual upstream copyright/license files.

Cloudflared 2026.10.7 (Apache-2.0) accompanies the Windows app. Its official release
SHA-256 is fixed in `tools/build-native.mjs` and verified at build and launch.
Electron includes its own license and Chromium notices in the Windows distribution.

The Windows QR renderer bundles qrcode 1.5.4 (MIT), by Ryan Day and contributors:
https://github.com/soldair/node-qrcode . Its license accompanies the Windows app
in resources/licenses/qrcode-LICENSE.txt.

Android camera scanning uses ZXing Android Embedded 4.3.0 and ZXing Core,
licensed under Apache-2.0: https://github.com/journeyapps/zxing-android-embedded
and https://github.com/zxing/zxing . These libraries provide QR decoding; camera
frames stay on the phone.
