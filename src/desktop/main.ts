import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  session,
} from "electron";
import path from "node:path";
import os from "node:os";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { startHost } from "../host/runtime.js";

app.setName("Codex Go");
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => {
  if (window && !window.isDestroyed()) {
    window.show();
    window.focus();
  }
});

let window: BrowserWindow;
let runtime: Awaited<ReturnType<typeof startHost>> | undefined;
let tunnel: ChildProcess | undefined;
let internet = "";
let busy = false;
let workspace = "";
let stopping = false;
let lastError = "";
const resources = app.isPackaged
  ? process.resourcesPath
  : path.resolve("dist/native/resources");
const state = () => ({
  running: !!runtime,
  online: runtime?.rpc.online ?? false,
  busy,
  workspace,
  internet,
  error: lastError,
  code: runtime && runtime.expiresAt > Date.now() ? runtime.connection() : "",
  expiresAt: runtime?.expiresAt,
  urls: runtime?.origins.filter((x) => !x.includes("localhost")) ?? [],
});
const changed = () => {
  if (window && !window.isDestroyed())
    window.webContents.send("state", state());
};

async function stop() {
  tunnel?.kill();
  tunnel = undefined;
  internet = "";
  const host = runtime;
  runtime = undefined;
  await host?.close();
  changed();
}
async function start() {
  if (runtime) return;
  await mkdir(workspace, { recursive: true });
  runtime = await startHost({
    workspaces: [workspace],
    state: path.join(app.getPath("userData"), "host"),
    host: "0.0.0.0",
    port: 7332,
    command:
      process.env.CODEX_BIN ??
      path.join(resources, "codex", "bin", "codex.exe"),
    webRoot: path.join(resources, "web"),
  });
  runtime.rpc.on("offline", changed);
  changed();
}
async function enableInternet() {
  if (!runtime) throw new Error("请先启动电脑服务。");
  if (tunnel) return;
  const binary = path.join(resources, "cloudflared.exe");
  const digest = createHash("sha256")
    .update(await readFile(binary))
    .digest("hex");
  if (
    digest !==
    "2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343"
  )
    throw new Error("外网组件校验失败，请重新安装。");
  const host = runtime;
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      binary,
      [
        "--no-autoupdate",
        "tunnel",
        "--url",
        host.localUrl,
        "--http-host-header",
        `127.0.0.1:${host.port}`,
        "--protocol",
        "http2",
      ],
      { windowsHide: true },
    );
    tunnel = child;
    let pending = true;
    let address = "";
    let registered = false;
    const timer = setTimeout(() => fail(), 50_000);
    function fail() {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
      child.kill();
      if (tunnel === child) tunnel = undefined;
      reject(new Error("外网隧道未就绪，请检查网络后重试。"));
    }
    const output = (data: Buffer) => {
      const text = data.toString();
      address =
        text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0] ??
        address;
      registered ||= text.includes("Registered tunnel connection");
      if (!pending || !address || !registered) return;
      pending = false;
      clearTimeout(timer);
      internet = address;
      host.addPublicUrl(address);
      host.refreshCode();
      changed();
      resolve();
    };
    child.stderr?.on("data", output);
    child.stdout?.on("data", output);
    child.once("error", fail);
    child.once("exit", () => {
      fail();
      if (tunnel === child) {
        host.removePublicUrl(internet);
        tunnel = undefined;
        internet = "";
        lastError = "外网隧道已断开，请重新开启并复制连接码。";
        changed();
      }
    });
  });
}

app.whenReady().then(async () => {
  workspace = path.join(app.getPath("documents"), "CodexGo");
  try {
    workspace =
      JSON.parse(
        await readFile(
          path.join(app.getPath("userData"), "settings.json"),
          "utf8",
        ),
      ).workspace || workspace;
  } catch {}
  window = new BrowserWindow({
    width: 980,
    height: 780,
    minWidth: 760,
    minHeight: 640,
    backgroundColor: "#101310",
    title: "Codex Go",
    webPreferences: {
      preload: path.join(import.meta.dirname, "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
    },
  });
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event) => event.preventDefault());
  ipcMain.handle("action", async (event, action: string) => {
    if (event.sender !== window.webContents) throw new Error("无效窗口。");
    if (action === "state") return state();
    if (busy) throw new Error("请等待当前操作完成。");
    busy = true;
    changed();
    try {
      if (action === "start") await start();
      else if (action === "stop") await stop();
      else if (action === "workspace") {
        const selected = await dialog.showOpenDialog(window, {
          properties: ["openDirectory", "createDirectory"],
          title: "选择允许手机访问的项目目录",
        });
        if (!selected.canceled) {
          await stop();
          workspace = selected.filePaths[0];
          await writeFile(
            path.join(app.getPath("userData"), "settings.json"),
            JSON.stringify({ workspace }),
          );
        }
      } else if (action === "refresh") runtime?.refreshCode();
      else if (action === "copy") {
        if (!runtime) throw new Error("请先启动。");
        if (runtime.expiresAt <= Date.now()) runtime.refreshCode();
        clipboard.writeText(runtime.connection());
      } else if (action === "internet") await enableInternet();
      else if (action === "chat") {
        if (!runtime) throw new Error("请先启动。");
        const paired = await runtime.pairing.pair(
          runtime.pairing.issue(),
          "Windows 本机",
        );
        runtime.refreshCode();
        await session.defaultSession.cookies.set({
          url: runtime.localUrl,
          name: "codex_go_device",
          value: paired.token,
          httpOnly: true,
          sameSite: "strict",
          expirationDate: Date.now() / 1000 + 604800,
        });
        const chat = new BrowserWindow({
          width: 1280,
          height: 860,
          title: "Codex Go · 项目",
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
          },
        });
        chat.setMenuBarVisibility(false);
        chat.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
        chat.webContents.on("will-navigate", (e, url) => {
          if (new URL(url).origin !== runtime?.localUrl) e.preventDefault();
        });
        await chat.loadURL(runtime.localUrl);
      } else throw new Error("未知操作。");
    } finally {
      busy = false;
      changed();
    }
    return state();
  });
  await window.loadFile(path.join(import.meta.dirname, "index.html"));
  busy = true;
  changed();
  try {
    await start();
  } catch {
    lastError = "服务启动失败，请检查 Codex 配置及端口 7332，或重新选择目录。";
  } finally {
    busy = false;
    changed();
  }
});
app.on("window-all-closed", () => app.quit());
app.on("before-quit", (event) => {
  if (!stopping) {
    event.preventDefault();
    stopping = true;
    stop().finally(() => app.quit());
  }
});
