#!/usr/bin/env sh
# Run INSIDE a user-provided Linux userspace on Android (for example a Termux
# proot-distro installation). This does not install a runtime or weaken a sandbox.
set -eu
printf 'Android/Linux runtime probe\n'
uname -srm
if [ -r /proc/version ]; then cat /proc/version; fi
command -v node >/dev/null || { printf 'Node.js >=22.12 is required inside this Linux environment.\n'; exit 1; }
command -v codex >/dev/null || { printf 'Install a Linux Codex CLI matching this environment first.\n'; exit 1; }
node --version
codex --version
printf '\nChecking CLI startup and stdio handshake without a model request…\n'
npm run probe
printf '\nFor an explicit paid model/file test, configure Codex credentials in this environment,\nthen run: npm run probe -- --run --output .local/android-probe.json\n'
printf 'Also test foreground/background suspension, interruption, restart and file permissions on the device.\n'
