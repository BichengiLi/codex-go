import { build } from "esbuild";
import { mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
async function download(url, file) {
  try {
    return await readFile(file);
  } catch {}
  execFileSync(
    process.platform === "win32" ? "curl.exe" : "curl",
    [
      "-fL",
      "--retry",
      "3",
      "--connect-timeout",
      "25",
      "--max-time",
      "600",
      "-o",
      file,
      url,
    ],
    { stdio: "pipe" },
  );
  return readFile(file);
}
const root = path.resolve("dist/native");
await mkdir(root, { recursive: true });
await build({
  entryPoints: ["src/desktop/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: root + "/main.mjs",
  external: ["electron"],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
await build({
  entryPoints: ["src/desktop/preload.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: root + "/preload.cjs",
  external: ["electron"],
});
await build({
  entryPoints: ["src/host/native-main.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: root + "/host.cjs",
});
await build({
  entryPoints: ["src/desktop/agent.ts"], bundle: true, platform: "node", format: "esm",
  outfile: root + "/resources/agent.mjs",
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
});
await build({ entryPoints: ["src/desktop/renderer.js"], bundle: true, platform: "browser", outfile: root + "/renderer.js" });
for (const name of ["index.html", "style.css"])
  await cp("src/desktop/" + name, root + "/" + name);
await cp("dist/web", root + "/resources/web", { recursive: true });
await cp("runtime/NOTICE.md", root + "/resources/THIRD_PARTY_NOTICES.md");
await mkdir(root + "/resources/licenses", { recursive: true });
await cp("node_modules/qrcode/license", root + "/resources/licenses/qrcode-LICENSE.txt");
await mkdir("apps/android/app/src/main/assets/licenses", { recursive: true });
await cp(
  "runtime/NOTICE.md",
  "apps/android/app/src/main/assets/licenses/NOTICE.md",
);
await cp("dist/web", "apps/android/app/src/main/assets/web", {
  recursive: true,
});
await writeFile(
  root + "/package.json",
  JSON.stringify({
    name: "codex-go-desktop",
    version: "0.2.0",
    main: "main.mjs",
    description: "Codex Go computer connection agent",
    author: "BichengiLi",
  }),
);
if (process.argv.includes("--windows")) {
  await mkdir(".local/downloads", { recursive: true });
  const pin = JSON.parse(await readFile("runtime/codex.lock.json", "utf8"))[
    "win32-x64"
  ];
  const archive = await download(pin.url, ".local/downloads/codex-win.tgz");
  const [algorithm, expected] = pin.integrity.split("-");
  if (createHash(algorithm).update(archive).digest("base64") !== expected)
    throw new Error("Codex integrity failed");
  const tar = ".local/downloads/codex-win.tgz";
  await writeFile(tar, archive);
  await mkdir(".local/downloads/codex-win", { recursive: true });
  execFileSync("tar", ["-xf", tar, "-C", ".local/downloads/codex-win"]);
  await cp(
    ".local/downloads/codex-win/package/vendor/x86_64-pc-windows-msvc",
    root + "/resources/codex",
    { recursive: true },
  );
  const cloudfile = root + "/resources/cloudflared.exe";
  const cloud = await download(
    "https://github.com/cloudflare/cloudflared/releases/download/2026.10.7/cloudflared-windows-amd64.exe",
    cloudfile,
  );
  if (
    createHash("sha256").update(cloud).digest("hex") !==
    "2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343"
  )
    throw new Error("cloudflared integrity failed");
  await writeFile(cloudfile, cloud);
}
console.log("Native sources built: " + root);
