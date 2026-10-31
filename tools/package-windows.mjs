import { build, Platform, Arch } from "electron-builder";
import path from "node:path";
import { readFile } from "node:fs/promises";
const electronVersion = JSON.parse(
  await readFile("node_modules/electron/package.json", "utf8"),
).version;
await build({
  projectDir: path.resolve("dist/native"),
  targets: Platform.WINDOWS.createTarget(["nsis", "zip"], Arch.x64),
  config: {
    appId: "io.github.bichengili.codexgo",
    productName: "Codex Go",
    electronVersion,
    electronDist: path.resolve("node_modules/electron/dist"),
    directories: {
      output: path.resolve(
        process.env.CODEX_GO_RELEASE_DIR ?? ".local/releases",
      ),
    },
    files: [
      "main.mjs",
      "preload.cjs",
      "index.html",
      "style.css",
      "renderer.js",
      "package.json",
    ],
    extraResources: [{ from: path.resolve("dist/native/resources"), to: "." }],
    win: {
      signAndEditExecutable: false,
      artifactName: "Codex-Go-${version}-Windows-${arch}.${ext}",
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      createDesktopShortcut: true,
      deleteAppDataOnUninstall: false,
    },
    publish: null,
  },
});
