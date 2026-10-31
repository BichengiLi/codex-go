"""Check final APK/Windows ZIP contents and write local release hashes.

Run after both installers are built and the APK is copied to the release folder.
This verifies build artifacts; it does not run Android or claim device acceptance.
"""
from pathlib import Path
import datetime
import hashlib
import json
import sys
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parent.parent
RELEASE = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else ROOT / '.local/releases/0.2.0'
ASSETS = ROOT / 'apps/android/app/src/main/assets'


def digest(file):
    with file.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    manifest = json.loads((ASSETS / 'runtime.json').read_text(encoding='utf-8'))
    runtime = ASSETS / 'runtime.tgz'
    assert digest(runtime) == manifest['sha256'], 'Runtime checksum mismatch'
    with tarfile.open(runtime, 'r:gz') as archive:
        members = archive.getmembers()
        paths = {member.name: member for member in members}
        seen = set()
        for member in members:
            if member.isfile() or member.issym() or member.islnk():
                assert member.name not in seen, 'Duplicate archive member: ' + member.name
                seen.add(member.name)
            if member.islnk():
                assert member.linkname in paths and paths[member.linkname].isfile(), member.linkname
        for name in ['usr/local/bin/node', 'opt/codex/bin/codex', 'usr/bin/env',
                     'usr/bin/git', 'etc/ssl/certs/ca-certificates.crt', 'opt/codex-go/host.cjs']:
            assert name in paths, 'Missing runtime file: ' + name
        assert archive.extractfile('opt/codex-go/host.cjs').read() == (ROOT / 'dist/native/host.cjs').read_bytes()
        for name in ['usr/local/bin/node', 'opt/codex/bin/codex']:
            header = archive.extractfile(name).read(20)
            assert header[:4] == b'\x7fELF' and header[18:20] == b'\xb7\x00', 'Expected AArch64 ELF: ' + name
    with zipfile.ZipFile(RELEASE / 'Codex-Go-0.2.0-Android-arm64.apk') as apk:
        assert apk.testzip() is None, 'APK CRC error'
        assert json.loads(apk.read('assets/runtime.json')) == manifest
        # A .gz suffix would be expanded/renamed by Android's asset merger.
        # The installer must be able to open the exact compressed bytes by name.
        with apk.open('assets/runtime.tgz') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == manifest['sha256']
        assert apk.getinfo('assets/runtime.tgz').compress_type == zipfile.ZIP_STORED
        assert apk.read('assets/web/index.html') == (ROOT / 'dist/web/index.html').read_bytes()
        assert 'assets/licenses/PRoot-COPYING' in apk.namelist()
        assert 'assets/licenses/NOTICE.md' in apk.namelist()
        for name, expected in manifest['native'].items():
            assert hashlib.sha256(apk.read('lib/arm64-v8a/' + name)).hexdigest() == expected, name
    with zipfile.ZipFile(RELEASE / 'Codex-Go-0.2.0-Windows-x64.zip') as windows:
        assert windows.testzip() is None, 'Windows ZIP CRC error'
        for name in ['resources/web/index.html', 'resources/agent.mjs', 'resources/cloudflared.exe',
                     'resources/codex/bin/codex.exe', 'resources/THIRD_PARTY_NOTICES.md']:
            assert name in windows.namelist(), name
        assert windows.read('resources/web/index.html') == (ROOT / 'dist/web/index.html').read_bytes()
        assert windows.read('resources/agent.mjs') == (ROOT / 'dist/native/resources/agent.mjs').read_bytes()
        assert hashlib.sha256(windows.read('resources/cloudflared.exe')).hexdigest() == '2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343'
    names = ['Codex-Go-0.2.0-Windows-x64.exe', 'Codex-Go-0.2.0-Windows-x64.zip', 'Codex-Go-0.2.0-Android-arm64.apk']
    artifacts = [{'name': name, 'bytes': (RELEASE / name).stat().st_size,
                  'sha256': digest(RELEASE / name)} for name in names]
    report = {'version': '0.2.0', 'checkedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'artifacts': artifacts, 'runtimeSha256': manifest['sha256'],
              'archiveEntries': len(members), 'packageIntegrityVerified': True,
              'scope': 'Package content and checksums only; device testing is separate.'}
    (RELEASE / 'release-manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    (RELEASE / 'SHA256SUMS.txt').write_text(''.join(a['sha256'] + '  ' + a['name'] + '\n' for a in artifacts), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
