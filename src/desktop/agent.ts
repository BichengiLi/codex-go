// Independent Node process: closing Electron must never own the host lifetime.
import net from "node:net";
import path from "node:path";
import { readFile, mkdir, writeFile, chmod, unlink } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { startHost } from "../host/runtime.js";
import { controlAddress } from "./control.js";

type Config = {
  directory: string;
  resources: string;
  workspace: string;
  token: string;
  port?: number;
  command?: string;
  commandArgs?: string[];
  internet?: boolean;
};
const config: Config = JSON.parse(await readFile(process.argv[2], "utf8"));
const address = controlAddress(config.directory);
let runtime: Awaited<ReturnType<typeof startHost>> | undefined;
let tunnel: ChildProcess | undefined;
let internet = "",
  error = "",
  busy = false,
  quitting = false;
let retry: ReturnType<typeof setTimeout> | undefined;
const state = () => ({
  running: !!runtime,
  online: runtime?.rpc.online ?? false,
  busy,
  workspace: config.workspace,
  internet,
  error,
  pid: process.pid,
  code:
    runtime?.pairing.codeAvailable &&
    (internet || error || config.internet === false)
      ? runtime.connection()
      : "",
  expiresAt: runtime?.expiresAt,
  devices: runtime?.pairing.list() ?? [],
  urls: runtime?.origins.filter((x) => !x.includes("localhost")) ?? [],
});

async function stop() {
  clearTimeout(retry);
  const child = tunnel;
  tunnel = undefined;
  child?.kill();
  internet = "";
  const host = runtime;
  runtime = undefined;
  await host?.close();
}
async function start() {
  if (runtime) return;
  error = "";
  await mkdir(config.workspace, { recursive: true });
  runtime = await startHost({
    workspaces: [config.workspace],
    state: path.join(config.directory, "host"),
    host: "0.0.0.0",
    port: config.port ?? 7332,
    command:
      config.command ??
      process.env.CODEX_BIN ??
      path.join(config.resources, "codex/bin/codex.exe"),
    commandArgs: config.commandArgs,
    webRoot: path.join(config.resources, "web"),
    persistentDevices: true,
  });
}
async function enableInternet() {
  if (!runtime || tunnel) return;
  const host = runtime;
  const binary = path.join(config.resources, "cloudflared.exe");
  if (
    createHash("sha256")
      .update(await readFile(binary))
      .digest("hex") !==
    "2493dbc168923bb3e59e5e7716f71deced92992eea9acd6e9d74f84ac7751343"
  )
    throw new Error("外网组件校验失败，请重新安装。");
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
    let pending = true,
      url = "",
      registered = false,
      buffer = "";
    const timer = setTimeout(() => fail(), 50_000);
    function fail() {
      if (!pending) return;
      pending = false;
      clearTimeout(timer);
      if (tunnel === child) tunnel = undefined;
      child.kill();
      reject(new Error("外网连接暂未就绪，正在自动重试。"));
    }
    const output = (data: Buffer) => {
      buffer = (buffer + data.toString()).slice(-16384);
      url =
        buffer.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0] ?? url;
      registered ||= buffer.includes("Registered tunnel connection");
      if (!pending || !url || !registered) return;
      pending = false;
      clearTimeout(timer);
      internet = url;
      host.addPublicUrl(url);
      host.refreshCode();
      error = "";
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
        error = "外网连接已中断，正在重新连接。";
        scheduleInternet();
      }
    });
  });
}
function scheduleInternet() {
  clearTimeout(retry);
  if (!runtime || quitting || config.internet === false) return;
  retry = setTimeout(() => {
    void enableInternet().catch(() => {
      error = "外网暂不可用，正在自动重试。也可以使用同一 Wi-Fi 连接。";
      scheduleInternet();
    });
  }, 5000);
}
async function connectInternet() {
  if (config.internet === false) return;
  try {
    await enableInternet();
  } catch (e) {
    error = e instanceof Error ? e.message : "外网连接失败。";
    scheduleInternet();
  }
}
async function action(name: string, value?: string) {
  if (name === "state") return state();
  if (busy) throw new Error("请等待当前操作完成。");
  busy = true;
  error = "";
  try {
    if (name === "start") {
      await start();
      void connectInternet();
    } else if (name === "stop") await stop();
    else if (name === "refresh") runtime?.refreshCode();
    else if (name === "internet") await connectInternet();
    else if (name === "workspace" && value) {
      await stop();
      config.workspace = path.resolve(value);
      await writeFile(
        path.join(config.directory, "settings.json"),
        JSON.stringify({ workspace: config.workspace }),
      );
      await start();
      void connectInternet();
    } else if (name === "revoke" && value) await runtime?.pairing.revoke(value);
    else if (name === "chat" && runtime) {
      const paired = await runtime.pairing.pair(
        runtime.pairing.issue(),
        "Windows 本机",
      );
      runtime.refreshCode();
      return { url: runtime.localUrl, token: paired.token };
    } else throw new Error("未知操作。");
    return state();
  } finally {
    busy = false;
  }
}

const server = net.createServer((socket) => {
  let buffer = "",
    handled = false;
  socket.setTimeout(10_000, () => socket.destroy());
  socket.on("error", () => {});
  socket.on("data", (chunk) => {
    if (handled) return;
    buffer += chunk;
    if (buffer.length > 8192) {
      socket.destroy();
      return;
    }
    if (!buffer.includes("\n")) return;
    handled = true;
    socket.setTimeout(70_000);
    void (async () => {
      try {
        const input = JSON.parse(buffer.split("\n")[0]);
        const digest = (v: string) => createHash("sha256").update(v).digest();
        if (
          typeof input.token !== "string" ||
          !timingSafeEqual(digest(input.token), digest(config.token))
        )
          throw new Error("后台控制凭据无效。");
        socket.end(
          JSON.stringify({ value: await action(input.action, input.value) }) +
            "\n",
        );
      } catch (e) {
        socket.end(
          JSON.stringify({
            error: e instanceof Error ? e.message : "后台操作失败。",
          }) + "\n",
        );
      }
    })();
  });
});
server.once("error", () => {
  void stop().finally(() => process.exit(1));
});
server.listen(address, async () => {
  if (process.platform !== "win32") await chmod(address, 0o600);
  busy = true;
  try {
    await start();
  } catch {
    error = "服务启动失败，请检查 Codex 配置、端口或项目目录。";
  } finally {
    busy = false;
  }
  void connectInternet();
});
const refresh = setInterval(() => {
  if (runtime && !runtime.pairing.codeAvailable) runtime.refreshCode();
}, 1000);
async function shutdown() {
  quitting = true;
  clearInterval(refresh);
  await stop();
  server.close();
  if (process.platform !== "win32") await unlink(address).catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
