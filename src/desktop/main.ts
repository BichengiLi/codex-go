import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  session,
} from "electron";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { agentRequest, controlAddress } from "./control.js";

app.setName("Codex Go");
const primary = app.requestSingleInstanceLock();
if (!primary) app.quit();
let window: BrowserWindow;
let token = "",
  address = "";
let polling: ReturnType<typeof setInterval> | undefined;
const resources = app.isPackaged
  ? process.resourcesPath
  : path.resolve("dist/native/resources");
const request = (action: string, value?: string) =>
  agentRequest(address, token, action, value);

async function ensureAgent() {
  const directory = app.getPath("userData");
  address = controlAddress(directory);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, "agent.json");
  try {
    token = JSON.parse(await readFile(file, "utf8")).token;
  } catch {}
  if (token) {
    try {
      return await request("state");
    } catch {}
  }
  token ||= randomBytes(32).toString("hex");
  let workspace = path.join(app.getPath("documents"), "CodexGo");
  try {
    workspace =
      JSON.parse(await readFile(path.join(directory, "settings.json"), "utf8"))
        .workspace || workspace;
  } catch {}
  await writeFile(
    file,
    JSON.stringify({ directory, resources, workspace, token }),
    { mode: 0o600 },
  );
  const child = spawn(
    process.execPath,
    [path.join(resources, "agent.mjs"), file],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    },
  );
  let failed = false;
  child.once("error", () => {
    failed = true;
  });
  child.unref();
  for (let attempt = 0; attempt < 80; attempt++) {
    if (failed) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      return await request("state");
    } catch {}
  }
  throw new Error("后台服务未能启动，请检查安装文件。");
}

app.on("second-instance", () => {
  if (window && !window.isDestroyed()) {
    window.show();
    window.focus();
  }
});
if (primary)
  app.whenReady().then(async () => {
    window = new BrowserWindow({
      width: 1120,
      height: 840,
      minWidth: 760,
      minHeight: 640,
      backgroundColor: "#0c1012",
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
    const send = (state: unknown) => {
      if (!window.isDestroyed()) window.webContents.send("state", state);
    };
    ipcMain.handle("action", async (event, action: string, value?: string) => {
      if (event.sender !== window.webContents) throw new Error("无效窗口。");
      if (
        ![
          "state",
          "start",
          "stop",
          "workspace",
          "copy",
          "refresh",
          "internet",
          "chat",
          "revoke",
        ].includes(action)
      )
        throw new Error("未知操作。");
      if (!token) throw new Error("后台正在启动，请稍候。");
      if (action === "workspace") {
        const selected = await dialog.showOpenDialog(window, {
          properties: ["openDirectory", "createDirectory"],
          title: "选择允许手机访问的项目目录",
        });
        if (!selected.canceled)
          await request("workspace", selected.filePaths[0]);
      } else if (action === "copy") {
        let state = await request("state");
        if (!state.code) state = await request("refresh");
        if (!state.code) throw new Error("请先启动连接。");
        clipboard.writeText(state.code);
      } else if (action === "chat") {
        const paired = await request("chat");
        await session.defaultSession.cookies.set({
          url: paired.url,
          name: "codex_go_device",
          value: paired.token,
          httpOnly: true,
          sameSite: "strict",
          expirationDate: Date.now() / 1000 + 34560000,
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
          if (new URL(url).origin !== paired.url) e.preventDefault();
        });
        await chat.loadURL(paired.url);
      } else
        await request(action, typeof value === "string" ? value : undefined);
      return request("state");
    });
    await window.loadFile(path.join(import.meta.dirname, "index.html"));
    try {
      send(await ensureAgent());
    } catch (e) {
      send({ error: e instanceof Error ? e.message : "后台启动失败。" });
    }
    polling = setInterval(() => {
      void request("state")
        .then(send)
        .catch(() => send({ error: "后台服务不可用，请重新打开应用。" }));
    }, 1000);
    window.on("closed", () => clearInterval(polling));
  });
// The separate agent owns Codex and cloudflared; quitting this UI leaves both alive.
app.on("window-all-closed", () => app.quit());
