import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import { createInterface } from "node:readline";
import type { Wire } from "../shared/types.js";

export class RpcError extends Error {
  name = "RpcError";
  constructor(
    public code: number,
    message: string,
  ) {
    super(message);
  }
}

export class AppServer extends EventEmitter {
  private child?: ChildProcessWithoutNullStreams;
  private nextId = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  online = false;
  version = "unknown";

  constructor(
    private options: {
      command?: string;
      args?: string[];
      cwd: string;
      env?: NodeJS.ProcessEnv;
      timeout?: number;
    },
  ) {
    super();
  }

  async start() {
    this.child = spawn(
      this.options.command ?? process.env.CODEX_BIN ?? "codex",
      this.options.args ?? ["app-server", "--listen", "stdio://"],
      {
        cwd: this.options.cwd,
        env: this.options.env ?? process.env,
        windowsHide: true,
        stdio: "pipe",
      },
    );
    this.child.stderr.resume(); // Never copy potentially sensitive upstream diagnostics into logs.
    const closed = (error: Error) => {
      const wasOnline = this.online;
      this.online = false;
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(error);
      }
      this.pending.clear();
      if (wasOnline) this.emit("offline");
    };
    this.child.on("error", () =>
      closed(new Error("无法启动 Codex。请检查 CODEX_BIN。")),
    );
    this.child.on("exit", () =>
      closed(new Error("Codex 进程已退出。提交结果可能未知，请先核对历史。")),
    );
    this.child.stdin.on("error", () =>
      closed(new Error("Codex 连接已关闭，提交结果可能未知。")),
    );
    const lines = createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      let msg: Wire;
      try {
        msg = JSON.parse(line);
      } catch {
        return;
      }
      if ("id" in msg && !msg.method) {
        const p = this.pending.get(msg.id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(msg.id);
        if (msg.error)
          p.reject(new RpcError(msg.error.code, msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method) this.emit("message", msg);
    });
    const result = await this.call("initialize", {
      clientInfo: { name: "codex_go", title: "Codex Go", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.version = result.userAgent ?? "unknown";
    this.notify("initialized", {});
    this.online = true;
  }

  call<T = any>(method: string, params: Wire): Promise<T> {
    if (!this.child || this.child.killed || this.child.exitCode !== null)
      return Promise.reject(new Error("Codex 未连接。"));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("Codex 响应超时。请先核对任务状态，不要重复发送。"));
      }, this.options.timeout ?? 45_000);
      this.pending.set(id, { resolve, reject, timer });
      this.write({ id, method, params });
    });
  }
  private write(message: Wire) {
    this.child?.stdin.write(JSON.stringify(message) + "\n", (error) => {
      if (error) this.emit("transportError");
    });
  }
  notify(method: string, params: Wire) {
    this.write({ method, params });
  }
  respond(id: string | number, result: Wire) {
    this.write({ id, result });
  }
  reject(id: string | number) {
    this.write({
      id,
      error: { code: -32601, message: "Unsupported client request" },
    });
  }
  async close() {
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolve) => {
      const finish = () => {
        clearTimeout(timer);
        child.stdout.destroy();
        child.stderr.destroy();
        resolve();
      };
      const timer = setTimeout(() => {
        child.kill();
        finish();
      }, 3000);
      if (child.exitCode !== null || child.killed) finish();
      else {
        child.once("exit", finish);
        child.stdin.end();
      }
    });
  }
}
