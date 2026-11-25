import { build } from "esbuild";
import { chmod, mkdir, cp, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import codexInputs from "../runtime/codex.lock.json" with { type: "json" };
import tunnelInputs from "../runtime/cloudflared.lock.json" with { type: "json" };

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
async function stageDesktopRuntime(target, resources) {
  const macos = target.startsWith("darwin-");
  const cache = path.resolve(".local/downloads");
  const codex = codexInputs[target];
  const codexArchive = path.join(cache, macos ? `${target}/codex.tgz` : "codex-win.tgz");
  const extracted = path.join(cache, macos ? target : "codex-win");
  await mkdir(extracted, { recursive: true });
  const codexBytes = await download(codex.url, codexArchive);
  const [algorithm, expected] = codex.integrity.split("-");
  if (createHash(algorithm).update(codexBytes).digest("base64") !== expected)
    throw new Error(`Codex integrity failed for ${target}`);
  execFileSync("tar", ["-xf", codexArchive, "-C", extracted]);
  await cp(path.join(extracted, "package/vendor", codex.vendor), path.join(resources, "codex"), {
    recursive: true,
  });

  const tunnel = tunnelInputs[target];
  const binary = path.join(resources, macos ? "cloudflared" : "cloudflared.exe");
  const archive = macos ? path.join(extracted, "cloudflared.tgz") : binary;
  const tunnelBytes = await download(tunnel.url, archive);
  if (createHash("sha256").update(tunnelBytes).digest("hex") !== tunnel.sha256)
    throw new Error(`cloudflared integrity failed for ${target}`);
  if (!macos) return tunnel.sha256;

  execFileSync("tar", ["-xf", archive, "-C", extracted]);
  await cp(path.join(extracted, "cloudflared"), binary);
  await chmod(binary, 0o755);
  return createHash("sha256").update(await readFile(binary)).digest("hex");
}

const macos = process.argv.includes("--macos");
const target = macos ? `darwin-${process.arch}` : process.argv.includes("--windows") ? "win32-x64" : undefined;
if (macos && (process.platform !== "darwin" || !codexInputs[target]))
  throw new Error("Build the macOS package on an arm64 or x64 Mac.");
const root = path.resolve(macos ? `dist/native-macos-${process.arch}` : "dist/native");
await mkdir(root, { recursive: true });
const resources = path.join(root, "resources");
await mkdir(resources, { recursive: true });
const cloudflaredSha256 = target
  ? await stageDesktopRuntime(target, resources)
  : tunnelInputs["win32-x64"].sha256;
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
  define: { BUNDLED_CLOUDFLARED_SHA256: JSON.stringify(cloudflaredSha256) },
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
    version: JSON.parse(await readFile("package.json", "utf8")).version,
    main: "main.mjs",
    description: "Codex Go computer connection agent",
    author: "BichengiLi",
  }),
);
console.log("Native sources built: " + root);
