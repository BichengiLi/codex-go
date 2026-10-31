import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

export function controlAddress(directory: string) {
  const id = createHash("sha256")
    .update(path.resolve(directory))
    .digest("hex")
    .slice(0, 24);
  return process.platform === "win32"
    ? `\\\\.\\pipe\\codex-go-${id}`
    : path.join(os.tmpdir(), `codex-go-${id}.sock`);
}

export function agentRequest<T = any>(
  address: string,
  token: string,
  action: string,
  value?: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(address);
    let response = "";
    socket.setTimeout(65_000, () =>
      socket.destroy(new Error("后台服务响应超时。")),
    );
    socket.once("connect", () =>
      socket.write(JSON.stringify({ token, action, value }) + "\n"),
    );
    socket.on("data", (chunk) => {
      response += chunk;
      if (response.length > 256 * 1024)
        socket.destroy(new Error("后台响应无效。"));
      if (!response.includes("\n")) return;
      try {
        const result = JSON.parse(response.split("\n")[0]);
        if (result.error) reject(new Error(result.error));
        else resolve(result.value);
      } catch {
        reject(new Error("后台响应无效。"));
      }
      socket.destroy();
    });
    socket.once("error", reject);
    socket.once("close", () => reject(new Error("后台控制连接已关闭。")));
  });
}
