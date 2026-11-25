import { build, Platform, Arch } from "electron-builder";
import path from "node:path";
import { readFile } from "node:fs/promises";

const electronVersion = JSON.parse(
  await readFile("node_modules/electron/package.json", "utf8"),
).version;
const projectDir = path.resolve(`dist/native-macos-${process.arch}`);
await build({
  projectDir,
  targets: Platform.MAC.createTarget(["dmg"], Arch[process.arch]),
  publish: "never",
  config: {
    appId: "io.github.bichengili.codexgo",
    productName: "Codex Go",
    electronVersion,
    npmRebuild: false,
    directories: {
      output: path.resolve(process.env.CODEX_GO_RELEASE_DIR ?? ".local/releases"),
    },
    files: [
      "main.mjs",
      "preload.cjs",
      "index.html",
      "style.css",
      "renderer.js",
      "package.json",
    ],
    extraResources: [{ from: path.join(projectDir, "resources"), to: "." }],
    mac: {
      category: "public.app-category.developer-tools",
      identity: "-",
      notarize: false,
      hardenedRuntime: false,
      // Keep Cloudflare's original executable bytes for the launch-time hash check.
      signIgnore: ["/Contents/Resources/cloudflared$"],
      artifactName: "Codex-Go-${version}-macOS-${arch}.${ext}",
      extendInfo: {
        NSDocumentsFolderUsageDescription: "Codex Go 在文稿中保存你授权的项目。",
        NSLocalNetworkUsageDescription: "Codex Go 在局域网内连接已配对的移动设备。",
      },
    },
    dmg: { writeUpdateInfo: false },
  },
});
