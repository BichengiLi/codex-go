"""Assemble the ARM64 phone userspace without executing foreign binaries.

Inputs are cached, checked before use, and recorded in the bundled manifest.
Requires Python 3.11+, curl and `npm run build && node tools/build-native.mjs`.
"""
import concurrent.futures, hashlib, io, json, os, pathlib, struct, subprocess, tarfile, zipfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
CACHE = ROOT / '.local/downloads'
ASSETS = ROOT / 'apps/android/app/src/main/assets'
LIBS = ROOT / 'apps/android/app/src/main/jniLibs/arm64-v8a'
for directory in (CACHE, ASSETS, LIBS): directory.mkdir(parents=True, exist_ok=True)
PINS = {
 'ubuntu': ('https://mirrors.tuna.tsinghua.edu.cn/ubuntu-cdimage/ubuntu-base/releases/24.04/release/ubuntu-base-24.04.5-base-arm64.tar.gz', 'a91d5a93010193712d346d761372b7c9db6dfcf093893161c64ca107f05914f2'),
 'node': ('https://nodejs.org/dist/v24.22.1/node-v24.22.1-linux-arm64.tar.xz', 'dbabf7a1cbf947e6059ffad2c27b80041db97dea1e553b62afdee7f13fca336e'),
}
TERMUX = {
 'proot': ('5.1.107.101', 'a28355e9be257e1f87f4e9294b3118470d4fd7a5442fed8b278f4443c83407d7'),
 'libtalloc': ('2.5.0', '556591f43bb773ad8777e1a29522640866a55f95dab71914418b94a8c58ad5a7'),
 'libandroid-shmem': ('0.7', '0da3a24d558b93c92bcf8d611e0826a99ff96e396b148e6cdf33b47c47c57ff6'),
}

def sha(file):
 with open(file,'rb') as stream: return hashlib.file_digest(stream,'sha256').hexdigest()

def download(name, url, expected=None):
 destination=CACHE/name
 if destination.exists() and (not expected or sha(destination)==expected): return destination
 partial=destination.with_suffix(destination.suffix+'.partial')
 subprocess.run(['curl.exe' if os.name=='nt' else 'curl','-fL','--retry','3','--connect-timeout','30','--max-time','600','-o',str(partial),url],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 if expected and sha(partial)!=expected: raise RuntimeError(f'{name}: SHA256 mismatch')
 partial.replace(destination)
 return destination

def deb_members(file):
 raw=file.read_bytes(); assert raw[:8]==b'!<arch>\n'
 offset=8
 while offset+60<=len(raw):
  name=raw[offset:offset+16].decode().strip().rstrip('/');size=int(raw[offset+48:offset+58]);data=raw[offset+60:offset+60+size];offset+=60+size+(size%2)
  if name.startswith('data.tar'):
   if name.endswith('.zst'):
    import zstandard
    data=zstandard.ZstdDecompressor().stream_reader(io.BytesIO(data)).read()
   return tarfile.open(fileobj=io.BytesIO(data),mode='r:*')
 raise RuntimeError('No deb payload')

def patch_soname(data):
 data=bytearray(data)
 assert data[:5]==b'\x7fELF\x02' and struct.unpack_from('<H',data,18)[0]==183
 shoff=struct.unpack_from('<Q',data,40)[0];size,count,index=struct.unpack_from('<HHH',data,58)
 def section(i): return struct.unpack_from('<IIQQQQIIQQ',data,shoff+i*size)
 names=section(index);strings=data[names[4]:names[4]+names[5]]
 for i in range(count):
  item=section(i);end=strings.find(0,item[0]);name=strings[item[0]:end]
  if name==b'.dynstr':
   start,length=item[4:6];old=b'libtalloc.so.2\x00';offset=data.find(old,start,start+length)
   if offset<0: raise RuntimeError('Missing libtalloc DT_NEEDED/SONAME')
   data[offset:offset+len(old)]=b'libtalloc.so\x00'+b'\x00'*(len(old)-len(b'libtalloc.so\x00'))
   return bytes(data)
 raise RuntimeError('No ELF dynstr')

def main():
 # Resolve the pinned package filenames through the repository's current index.
 package_index=download('termux-Packages','https://packages.termux.dev/apt/termux-main/dists/stable/main/binary-aarch64/Packages').read_text(encoding='utf-8')
 for name,(version,expected) in TERMUX.items():
  matches=[]
  for block in package_index.split('\n\n'):
   fields=dict(line.split(': ',1) for line in block.splitlines() if ': ' in line and not line.startswith(' '))
   if fields.get('Package')==name and fields.get('Version')==version:matches.append(fields)
  if not matches: raise RuntimeError(f'{name} {version} absent from repository; review pins explicitly')
  package=matches[0]
  if package['SHA256']!=expected: raise RuntimeError(f'{name} repository hash changed')
  PINS[name]=('https://packages.termux.dev/apt/termux-main/'+package['Filename'],expected)
 with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
  futures={name:pool.submit(download,name+('.deb' if name in TERMUX else '.tar'),url,digest) for name,(url,digest) in PINS.items()}
  files={name:future.result() for name,future in futures.items()}
 codex_pin=json.loads((ROOT/'runtime/codex.lock.json').read_text(encoding='utf-8'))['linux-arm64']
 version=codex_pin['version']
 archive=download('codex-arm64.tgz',codex_pin['url'])
 import base64
 algo,expected=codex_pin['integrity'].split('-',1)
 if base64.b64encode(hashlib.new(algo,archive.read_bytes()).digest()).decode()!=expected:raise RuntimeError('Codex npm integrity mismatch')
 PINS['codex']=(codex_pin['url'],sha(archive))
 extras=json.loads((ROOT/'runtime/ubuntu-arm64.lock.json').read_text(encoding='utf-8'))['packages']
 with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
  futures={p['package']:pool.submit(download,p['filename'].rsplit('/',1)[1],'https://mirrors.tuna.tsinghua.edu.cn/ubuntu-ports/'+p['filename'],p['sha256']) for p in extras}
  extra_files={name:future.result() for name,future in futures.items()}
 extra_paths={};certificates=[]
 for name,file in extra_files.items():
  with deb_members(file) as incoming:
   for member in incoming:
    target=member.name.lstrip('./')
    if not member.isdir():extra_paths[target]=name
    if target.startswith('usr/share/ca-certificates/') and target.endswith('.crt'):certificates.append(incoming.extractfile(member).read())
 if not certificates:raise RuntimeError('No pinned CA certificates')
 source=download('proot-v5.1.107.101.zip','https://codeload.github.com/termux/proot/zip/refs/tags/v5.1.107.101','a66743f50c7b0bac1913b83bf55e139d679c80a0ca2808eec76432a65640017f')
 license_dir=ASSETS/'licenses';license_dir.mkdir(exist_ok=True)
 import shutil
 shutil.copy2(source,license_dir/source.name)
 with zipfile.ZipFile(source) as sources:
  copying=next(name for name in sources.namelist() if name.endswith('/COPYING'))
  (license_dir/'PRoot-COPYING').write_bytes(sources.read(copying))
 # Package the bionic PRoot launcher with names that Android extracts as executables.
 wanted={
 'proot':{'bin/proot':'libproot.so','libexec/proot/loader':'libproot-loader.so'},
 'libtalloc':{'lib/libtalloc.so.2.5.0':'libtalloc.so'},
 'libandroid-shmem':{'lib/libandroid-shmem.so':'libandroid-shmem.so'}}
 for name,mapping in wanted.items():
  with deb_members(files[name]) as deb:
   for suffix,dest in mapping.items():
    member=next((m for m in deb.getmembers() if m.name.lstrip('./')=='data/data/com.termux/files/usr/'+suffix),None)
    if member is None:raise RuntimeError('Missing '+suffix)
    data=deb.extractfile(member).read()
    if name in ('proot','libtalloc') and suffix!='libexec/proot/loader':data=patch_soname(data)
    (LIBS/dest).write_bytes(data)
 # Android's asset merger transparently expands files ending in .gz. Keep the
 # gzip bytes under .tgz so the APK retains the exact verified payload.
 output=ASSETS/'runtime.tgz'
 with tarfile.open(output,'w:gz',compresslevel=6,format=tarfile.PAX_FORMAT) as out:
  def append(source,transform):
   with (source if isinstance(source,tarfile.TarFile) else tarfile.open(source,'r:*')) as incoming:
    for member in incoming:
     new=transform(member.name.lstrip('./'))
     if new is None:continue
     member.name=new
     if member.islnk():member.linkname=transform(member.linkname.lstrip('./'))
     if member.ischr() or member.isblk() or member.isfifo():continue
     out.addfile(member,incoming.extractfile(member) if member.isfile() else None)
  overrides={'etc/resolv.conf','etc/hosts','etc/ssl/certs/ca-certificates.crt'}
  append(files['ubuntu'],lambda name:name if name and name not in overrides and name not in extra_paths else None)
  for owner,file in extra_files.items():
   append(deb_members(file),lambda name:name if name and name not in overrides and (name not in extra_paths or extra_paths[name]==owner) else None)
  append(files['node'],lambda name:'usr/local/'+name.split('/',1)[1] if '/' in name else None)
  append(archive,lambda name:'opt/codex/'+name.split('/',3)[3] if name.startswith('package/vendor/') and len(name.split('/',3))==4 else None)
  def entry(name,content,mode=0o644):
   data=content.encode() if isinstance(content,str) else content;info=tarfile.TarInfo(name);info.size=len(data);info.mode=mode;out.addfile(info,io.BytesIO(data))
  entry('etc/ssl/certs/ca-certificates.crt',b'\n'.join(certificates))
  entry('etc/resolv.conf','nameserver 1.1.1.1\nnameserver 8.8.8.8\n')
  entry('etc/hosts','127.0.0.1 localhost\n::1 localhost\n')
  entry('opt/codex-go/host.cjs',(ROOT/'dist/native/host.cjs').read_bytes())
  # Empty bind targets exist before PRoot starts.
  for name in ['root','root/workspace','tmp','dev','proc','sys','system','apex','dev/shm']:
   info=tarfile.TarInfo(name);info.type=tarfile.DIRTYPE;info.mode=0o755;out.addfile(info)
 manifest={'version':1,'arch':'arm64','codex':version,'sha256':sha(output),'bytes':output.stat().st_size,'inputs':{name:{'url':url,'sha256':digest} for name,(url,digest) in PINS.items()},'ubuntuPackages':extras,'native':{p.name:sha(p) for p in LIBS.glob('*.so')}}
 (ASSETS/'runtime.json').write_text(json.dumps(manifest,indent=2)+'\n')
 print(json.dumps({'runtime':str(output),'MB':round(output.stat().st_size/1024/1024),'native':manifest['native']},indent=2))

if __name__=='__main__':main()
