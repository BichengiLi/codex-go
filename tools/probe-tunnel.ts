import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startHost } from "../src/host/runtime.js";

const root = path.resolve(".local/tunnel-probe");
await mkdir(path.join(root, "workspace"), { recursive: true });
const host = await startHost({
  workspaces: [path.join(root, "workspace")],
  state: path.join(root, "state"),
  port: 0,
  command: path.resolve("dist/native/resources/codex/bin/codex.exe"),
});
const child = spawn(
  path.resolve("dist/native/resources/cloudflared.exe"),
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
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
try {
  const address = await new Promise<string>((resolve, reject) => {
    let address = "",
      registered = false;
    const timer = setTimeout(
      () =>
        reject(
          new Error(
            "Temporary Internet tunnel did not register within 55 seconds",
          ),
        ),
      55000,
    );
    const output = (data: Buffer) => {
      const text = data.toString();
      address =
        text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/)?.[0] ??
        address;
      if (text.includes("Registered tunnel connection")) registered = true;
      if (address && registered) {
        clearTimeout(timer);
        resolve(address);
      }
    };
    child.stdout.on("data", output);
    child.stderr.on("data", output);
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Error("Tunnel process failed"));
    });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Tunnel exited before registration"));
    });
  });
  host.addPublicUrl(address);
  const pair = await fetch(address + "/api/pair", {
    method: "POST",
    headers: { origin: address, "content-type": "application/json" },
    body: JSON.stringify({ code: host.code, name: "Internet boundary probe" }),
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(pair.status, 200);
  const cookie = pair.headers.get("set-cookie")!.split(";")[0];
  const response = await fetch(address + "/api/host", {
    headers: { origin: address, cookie },
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.equal(info.online, true);
  async function api(route: string, method = "GET", body?: unknown) {
    const response = await fetch(address + "/api" + route, {
      method,
      headers: { origin: address, cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    assert.equal(response.status, 200);
    return response.json();
  }
  const initial = await api("/event-poll");
  const { thread } = await api("/threads", "POST", {
    projectId: info.projects[0].id,
    requestId: randomUUID(),
  });
  await api(`/threads/${thread.id}/turns`, "POST", {
    text: "请只回复 native-tunnel-ok，不调用工具，不执行命令。",
    requestId: randomUUID(),
  });
  let after = initial.seq,
    epoch = initial.epoch,
    text = "",
    completed = false;
  const deadline = Date.now() + 120000;
  while (!completed && Date.now() < deadline) {
    const replay = await api(
      `/event-poll?after=${after}&epoch=${encodeURIComponent(epoch)}`,
    );
    assert.equal(replay.gap, false, "Probe unexpectedly lost event history");
    for (const event of replay.events) {
      if (event.params.threadId !== thread.id) continue;
      if (event.method === "item/agentMessage/delta")
        text += event.params.delta;
      if (event.method === "turn/completed") completed = true;
    }
    after = replay.seq;
    epoch = replay.epoch;
    if (!completed) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(
    completed && text.includes("native-tunnel-ok"),
    "Public polling did not deliver the model response",
  );
  const evidence = {
    registered: true,
    httpsPairing: true,
    authenticatedHostRead: true,
    eventPolling: true,
    realModelResponse: true,
    transport: "Cloudflare temporary tunnel",
    testedAt: new Date().toISOString(),
  };
  await writeFile(
    path.join(root, "result.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  child.kill();
  await host.close();
}
