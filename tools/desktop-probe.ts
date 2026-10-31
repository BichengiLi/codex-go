import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import { AppServer } from "../src/host/rpc.js";
import { Projects } from "../src/host/projects.js";
import { CodexService } from "../src/host/service.js";
import { Pairing } from "../src/host/auth.js";
import { JsonStore } from "../src/host/storage.js";
import { createServer } from "../src/host/server.js";
import type { PermissionChoice, Wire } from "../src/shared/types.js";

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    output: { type: "string" },
  },
});
const cwd = await mkdtemp(path.join(os.tmpdir(), "codex-go-desktop-"));
const projects = new Projects();
await projects.init([cwd]);
const projectId = (await projects.list())[0].id;
const permissionStore = await new JsonStore<Record<string, PermissionChoice>>(
  path.join(cwd, ".runtime", "permissions.json"),
  {},
).load();
const report: Wire = {
  date: new Date().toISOString(),
  modelRun: values.run,
  checks: {},
};
let rpc = new AppServer({ cwd });
let app: Awaited<ReturnType<typeof createServer>> | undefined;
let service: CodexService;
const connect = async () => {
  await rpc.start();
  service = new CodexService(
    rpc,
    projects,
    await new JsonStore<Wire>(
      path.join(cwd, ".runtime", "submissions.json"),
      {},
    ).load(),
    permissionStore,
  );
  const pairing = new Pairing(
    await new JsonStore(path.join(cwd, ".runtime", "devices.json"), []).load(),
  );
  app = await createServer({
    service,
    pairing,
    origins: ["http://localhost:7331"],
    secure: false,
  });
  const pair = await app.inject({
    method: "POST",
    url: "/api/pair",
    headers: { host: "localhost:7331", origin: "http://localhost:7331" },
    payload: { code: pairing.issue(), name: "integration-probe" },
  });
  return {
    host: "localhost:7331",
    origin: "http://localhost:7331",
    cookie: pair.headers["set-cookie"]!.toString().split(";")[0],
  };
};
try {
  let headers = await connect();
  report.version = rpc.version;
  const catalog = await app!.inject({ url: "/api/projects/desktop", headers });
  assert.equal(catalog.statusCode, 200, catalog.body);
  report.checks.desktopCatalog = true;
  report.savedProjectCount = catalog.json().data.length;
  const created = await app!.inject({
    method: "POST",
    url: "/api/threads",
    headers,
    payload: { projectId, requestId: randomUUID() },
  });
  assert.equal(created.statusCode, 200, created.body);
  const threadId = created.json().thread.id;
  const permissions = async (mode: PermissionChoice["mode"]) => {
    const response = await app!.inject({
      method: "POST",
      url: `/api/threads/${threadId}/permissions`,
      headers,
      payload: { mode, approval: "untrusted" },
    });
    assert.equal(response.statusCode, 200, response.body);
    return response.json();
  };
  assert.equal((await permissions("read-only")).sandbox.type, "readOnly");
  assert.equal(
    (await permissions("workspace-write")).sandbox.type,
    "workspaceWrite",
  );
  report.checks.effectivePermissions = true;
  if (values.run) {
    rpc.on("message", (message) => {
      if (message.id === undefined) return;
      for (const a of service.approvals.values())
        if (a.rpcId === message.id)
          void service.answer(
            a.id,
            message.method === "item/fileChange/requestApproval" &&
              (!message.params.grantRoot ||
                path.resolve(message.params.grantRoot) === cwd)
              ? "accept"
              : "decline",
          );
    });
    const finished = new Promise<Wire>((resolve, reject) => {
      const timer = setTimeout(() => {
        rpc.off("message", listener);
        reject(new Error("model task timed out"));
      }, 240000);
      const listener = (m: Wire) => {
        if (m.method === "turn/completed" && m.params.threadId === threadId) {
          clearTimeout(timer);
          rpc.off("message", listener);
          resolve(m.params.turn);
        }
      };
      rpc.on("message", listener);
    });
    const starting = app!.inject({
      method: "POST",
      url: `/api/threads/${threadId}/turns`,
      headers,
      payload: {
        requestId: randomUUID(),
        text: "Use apply_patch to create 交付测试.txt in the current working directory containing exactly CODEX_GO_FILE_DELIVERY_OK followed by a newline. Do not execute shell commands. Reply briefly in Chinese with a Markdown download link to the absolute path of the file.",
      },
    });
    const [turn, response] = await Promise.all([finished, starting]);
    assert.equal(response.statusCode, 200, response.body);
    assert.equal(turn.status, "completed", JSON.stringify(turn.error));
    assert.equal(
      (await readFile(path.join(cwd, "交付测试.txt"), "utf8")).trim(),
      "CODEX_GO_FILE_DELIVERY_OK",
    );
    const downloaded = await app!.inject({
      url: `/api/files/download?projectId=${projectId}&path=${encodeURIComponent("交付测试.txt")}`,
      headers,
    });
    assert.equal(downloaded.statusCode, 200);
    assert.deepEqual(
      downloaded.rawPayload,
      await readFile(path.join(cwd, "交付测试.txt")),
    );
    report.checks.modelFileDelivery = true;
    assert.equal((await permissions("read-only")).sandbox.type, "readOnly");
    await app!.close();
    app = undefined;
    await rpc.close();
    rpc = new AppServer({ cwd });
    headers = await connect();
    const resumed = await app!.inject({
      method: "POST",
      url: `/api/threads/${threadId}/resume`,
      headers,
      payload: { desktopIdleConfirmed: true },
    });
    assert.equal(resumed.statusCode, 200, resumed.body);
    assert.equal(resumed.json().sandbox.type, "readOnly");
    report.checks.permissionsAfterRestart = true;
  }
  report.success = true;
} finally {
  await app?.close();
  await rpc.close();
}
if (values.output)
  await writeFile(values.output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
