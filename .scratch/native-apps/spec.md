# Installed Windows and Android apps

Status: authorized. User selected Android first, with LAN and Internet connections.

## Problem

Daily use currently requires a terminal, an address and an external browser. The
phone cannot develop independently when the computer is unavailable.

## Result

The Windows application starts the existing host and shows a connection code.
The Android application accepts that code or starts its own local development
environment using the owner's API configuration. Both use the existing project,
chat, approvals, permissions and file-delivery behavior inside installed apps.

## Decisions

- Package the established React interface inside the installed applications;
  users do not open a browser. Keep the interface independent of where tasks run.
- The Windows app manages host startup/shutdown, workspace selection, connection
  code renewal, LAN endpoints and an optional HTTPS Internet tunnel. A code carries
  the destination and expiring pairing secret so no public code registry is needed.
- Offer Cloudflare's temporary tunnel for Internet connectivity, clearly identifying
  that transport in the app. A user-provided HTTPS address remains possible. Do not
  publish an unauthenticated App Server endpoint.
- Android owns its connection credentials and downloads. Local API credentials use
  Android Keystore encryption. Local projects belong to the Android app's storage.
- Bundle a pinned, verified Linux userspace, Node and Codex for ARM64. Run it through
  PRoot in a foreground service. Android's app boundary supplies the outer boundary;
  do not claim PRoot is an operating-system sandbox. Keep runtime installation
  transactional and preserve project files across restarts.
- Preserve the current CLI/web development entry while supplying installable builds.

## Verification

Retain HTTP/stdin protocol boundaries. Add connection-code expiry/validation tests
and test the packaged host lifecycle. Build the Windows distribution and signed
Android APK. Validate archive integrity, native-library inputs and local boot
configuration without executing foreign inputs on the build host. Record separately
which Android operations were built, emulated or verified on a physical device.

## Boundaries

Android first. No iOS or offline model inference. Switching execution hosts does not
silently migrate files or running tasks. Unavailable Android hardware and tunnel
network limitations must be reported using observed evidence.
