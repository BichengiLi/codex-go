import { test } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter, once } from "node:events";
import { mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { get as httpGet, type IncomingMessage } from "node:http";
import { AppServer, RpcError } from "../src/host/rpc.js";
import { Pairing } from "../src/host/auth.js";
import { JsonStore } from "../src/host/storage.js";
import { Projects } from "../src/host/projects.js";
import { CodexService } from "../src/host/service.js";
import { createServer } from "../src/host/server.js";

const temp = () => mkdtemp(path.join(os.tmpdir(), "codex-go-test-"));
test("real stdio framing: initialize, notifications, callbacks, errors and process exit", async (t) => {
  const rpc = new AppServer({
    command: process.execPath,
    args: [path.resolve("tests/fixtures/app-server.mjs")],
    cwd: process.cwd(),
    timeout: 1000,
  });
  t.after(() => rpc.close());
  await rpc.start();
  assert.equal(rpc.online, true);
  assert.deepEqual(await rpc.call("echo", { x: "中文\nnext" }), {
    x: "中文\nnext",
  });
  const notice = once(rpc, "message");
  await rpc.call("notify", {});
  assert.equal((await notice)[0].params.value, 42);
  rpc.on("message", (m) => {
    if (m.id) rpc.respond(m.id, { decision: "decline" });
  });
  const decision = new Promise<any>((resolve) =>
    rpc.on("message", (m) => {
      if (m.method === "test/approvalResult") resolve(m.params);
    }),
  );
  await rpc.call("approval", { threadId: randomUUID() });
  assert.equal((await decision).decision, "decline");
  await assert.rejects(rpc.call("fail", {}), RpcError);
  await assert.rejects(rpc.call("hold", {}), /超时/);
  await assert.rejects(rpc.call("exit", {}), /退出/);
  assert.equal(rpc.online, false);
});

test("pairing is expiring, single-use, revocable and only hashes are persisted", async () => {
  const dir = await temp();
  let now = Date.now();
  const store = await new JsonStore(path.join(dir, "devices.json"), []).load();
  const pairing = new Pairing(store, () => now);
  const code = pairing.issue();
  const { token, device } = await pairing.pair(code, "phone");
  assert.equal(pairing.authenticate(token).id, device.id);
  assert.ok(
    !(await readFile(path.join(dir, "devices.json"), "utf8")).includes(token),
  );
  await assert.rejects(pairing.pair(code, "second"));
  await pairing.revoke(device.id);
  assert.throws(() => pairing.authenticate(token));
  const expired = pairing.issue();
  now += 300001;
  await assert.rejects(pairing.pair(expired, "phone"));
  pairing.issue();
  for (let i = 0; i < 10; i++)
    await assert.rejects(pairing.pair("wrong", "phone"));
  await assert.rejects(
    pairing.pair("wrong", "phone"),
    (e: any) => e.statusCode === 429,
  );
});

test("workspace boundaries reject traversal, prefix collisions, external junctions and reserved names", async () => {
  const base = await temp(),
    root = path.join(base, "root"),
    outside = path.join(base, "root-other");
  await mkdir(root);
  await mkdir(outside);
  await symlink(
    outside,
    path.join(root, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const p = new Projects();
  await p.init([root]);
  await assert.rejects(
    p.authorize(path.join(root, "..", "root-other")),
    (e: any) => e.statusCode === 403,
  );
  await assert.rejects(
    p.authorize(path.join(root, "escape")),
    (e: any) => e.statusCode === 403,
  );
  const list = await p.list();
  assert.equal(list.length, 1);
  for (const name of ["../outside", "CON", "LPT1.txt", "bad.", "a/b"])
    await assert.rejects(p.create(list[0].id, name));
  const project = await p.create(list[0].id, "正常-project");
  assert.equal(await p.resolve(project.id), project.path);
  await assert.rejects(
    p.create(list[0].id, "正常-project"),
    (e: any) => e.statusCode === 409,
  );
});

class FakeRpc extends EventEmitter {
  online = true;
  version = "fixture/1";
  starts = 0;
  responses: any[] = [];
  threadId = randomUUID();
  cwd = "";
  turns: any[] = [];
  unmaterialized = false;
  emptyLog = false;
  desktopProjects: any[] = [];
  effective = {
    approvalPolicy: "untrusted",
    sandbox: { type: "workspaceWrite", networkAccess: false },
  };
  resumes: any[] = [];
  settingsUpdates = 0;
  profilesAllowed = true;
  thread() {
    return {
      id: this.threadId,
      preview: "Test conversation",
      cwd: this.cwd,
      modelProvider: "fixture",
      updatedAt: 1,
      turns: this.turns,
      status: { type: "idle" },
    };
  }
  async call(method: string, params: any): Promise<any> {
    if (method === "project/list")
      return { data: this.desktopProjects, nextCursor: null };
    if (method === "permissionProfile/list")
      return {
        data: [":read-only", ":workspace", ":danger-full-access"].map((id) => ({
          id,
          allowed: this.profilesAllowed,
        })),
        nextCursor: null,
      };
    if (method === "thread/settings/update") {
      this.settingsUpdates++;
      this.effective = {
        approvalPolicy: params.approvalPolicy,
        sandbox: {
          type:
            params.permissions === ":read-only"
              ? "readOnly"
              : params.permissions === ":workspace"
                ? "workspaceWrite"
                : "dangerFullAccess",
          networkAccess: false,
        },
      };
      queueMicrotask(() =>
        this.emit("message", {
          method: "thread/settings/updated",
          params: {
            threadId: this.threadId,
            threadSettings: {
              approvalPolicy: this.effective.approvalPolicy,
              sandboxPolicy: this.effective.sandbox,
              activePermissionProfile: { id: params.permissions },
            },
          },
        }),
      );
      return {};
    }
    if (method === "config/read")
      return {
        config: {
          model: "test-model",
          model_provider: "test-provider",
          model_providers: { secret: "sk-secret" },
        },
      };
    if (method === "thread/list")
      return { data: [this.thread()], nextCursor: null };
    if (method === "thread/start") {
      this.cwd = params.cwd;
      return { thread: this.thread(), ...this.effective };
    }
    if (method === "thread/read" && this.emptyLog)
      throw new RpcError(
        -32603,
        "failed to read thread: rollout at test.jsonl is empty",
      );
    if (method === "thread/resume") this.resumes.push(params);
    if (method === "thread/read" || method === "thread/resume")
      return { thread: this.thread(), ...this.effective };
    if (method === "thread/turns/list" && this.unmaterialized)
      throw new RpcError(
        -32600,
        `thread ${this.threadId} is not materialized yet; thread/turns/list is unavailable before first user message`,
      );
    if (method === "thread/turns/list")
      return { data: this.turns, nextCursor: null };
    if (method === "turn/start") {
      this.starts++;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { turn: { id: randomUUID(), status: "inProgress", items: [] } };
    }
    return {};
  }
  respond(id: any, result: any) {
    this.responses.push({ id, result });
  }
  reject(id: any) {
    this.responses.push({ id, rejected: true });
  }
}
test("a newly created unmaterialized conversation is readable and ready for its first message", async (t) => {
  const { app, headers, projectId, rpc } = await setup();
  t.after(() => app.close());
  rpc.unmaterialized = true;
  const created = await app.inject({
    method: "POST",
    url: "/api/threads",
    headers,
    payload: { projectId, requestId: randomUUID() },
  });
  assert.equal(created.statusCode, 200);
  const read = await app.inject({
    url: `/api/threads/${rpc.threadId}`,
    headers,
  });
  assert.equal(read.statusCode, 200, read.body);
  assert.equal(read.json().attached, true);
  assert.deepEqual(read.json().thread.turns, []);
});
test("active first-turn events remain readable while the new rollout file is empty", async (t) => {
  const { app, headers, projectId, rpc } = await setup();
  t.after(() => app.close());
  await app.inject({
    method: "POST",
    url: "/api/threads",
    headers,
    payload: { projectId, requestId: randomUUID() },
  });
  const turnId = randomUUID();
  rpc.emit("message", {
    method: "turn/started",
    params: {
      threadId: rpc.threadId,
      turn: { id: turnId, status: "inProgress", items: [] },
    },
  });
  rpc.emit("message", {
    method: "item/started",
    params: {
      threadId: rpc.threadId,
      turnId,
      item: { id: "message-1", type: "agentMessage", text: "" },
    },
  });
  rpc.emit("message", {
    method: "item/agentMessage/delta",
    params: {
      threadId: rpc.threadId,
      turnId,
      itemId: "message-1",
      delta: "live output",
    },
  });
  rpc.emptyLog = true;
  const response = await app.inject({
    url: `/api/threads/${rpc.threadId}`,
    headers,
  });
  assert.equal(response.statusCode, 200, response.body);
  assert.equal(response.json().active, true);
  assert.equal(response.json().thread.turns[0].items[0].text, "live output");
});

test("resume token-usage notifications do not invent an empty active turn or replace completed history", async (t) => {
  const { app, projectId, rpc, service } = await setup();
  t.after(() => app.close());
  const turnId = randomUUID();
  rpc.turns = [
    {
      id: turnId,
      status: "completed",
      items: [{ id: "reply", type: "agentMessage", text: "completed output" }],
    },
  ];
  await service.list(projectId);
  await service.resume(rpc.threadId);
  rpc.emit("message", {
    method: "thread/tokenUsage/updated",
    params: { threadId: rpc.threadId, turnId, tokenUsage: {} },
  });
  const state = await service.read(rpc.threadId);
  assert.equal(state.active, false);
  assert.equal(state.thread.turns[0].status, "completed");
  assert.equal(state.thread.turns[0].items[0].text, "completed output");
});
async function setup() {
  const dir = await temp(),
    workspace = path.join(dir, "workspaces");
  await mkdir(workspace);
  const projects = new Projects();
  await projects.init(
    [workspace],
    await new JsonStore<any>(path.join(dir, "projects.json"), []).load(),
  );
  const rpc = new FakeRpc();
  rpc.cwd = workspace;
  const submissions = await new JsonStore<any>(
    path.join(dir, "submissions.json"),
    {},
  ).load();
  const service = new CodexService(
    rpc as unknown as AppServer,
    projects,
    submissions,
    await new JsonStore<any>(path.join(dir, "permissions.json"), {}).load(),
  );
  const pairing = new Pairing(
    await new JsonStore(path.join(dir, "devices.json"), []).load(),
  );
  const app = await createServer({
    service,
    pairing,
    origins: ["http://localhost:7331"],
    secure: false,
  });
  const pair = await app.inject({
    method: "POST",
    url: "/api/pair",
    headers: { host: "localhost:7331", origin: "http://localhost:7331" },
    payload: { code: pairing.issue(), name: "phone" },
  });
  assert.equal(pair.statusCode, 200, pair.body);
  const headers = {
    host: "localhost:7331",
    origin: "http://localhost:7331",
    cookie: pair.headers["set-cookie"]!.toString().split(";")[0],
  };
  return {
    dir,
    app,
    rpc,
    service,
    pairing,
    headers,
    projectId: (await projects.list())[0].id,
  };
}

test("paired owner imports a saved desktop project outside startup roots and authorization survives restart", async (t) => {
  const { app, headers, rpc, dir, service } = await setup();
  t.after(() => app.close());
  const saved = path.join(dir, "desktop-project");
  await mkdir(saved);
  rpc.desktopProjects = [
    { id: "desktop-id", name: "桌面里的名称", roots: [{ path: saved }] },
  ];
  const catalog = await app.inject({ url: "/api/projects/desktop", headers });
  assert.equal(catalog.statusCode, 200, catalog.body);
  assert.equal(catalog.json().data[0].name, "桌面里的名称");
  const imported = await app.inject({
    method: "POST",
    url: "/api/projects/import",
    headers,
    payload: { desktopId: "desktop-id", rootIndex: 0 },
  });
  assert.equal(imported.statusCode, 200, imported.body);
  assert.equal(imported.json().source, "desktop");
  assert.equal(imported.json().path, saved);
  const host = (await app.inject({ url: "/api/host", headers })).json();
  assert.ok(
    host.projects.some(
      (p: any) => p.id === imported.json().id && p.name === "桌面里的名称",
    ),
  );
  const list = await app.inject({
    url: `/api/threads?projectId=${imported.json().id}`,
    headers,
  });
  assert.equal(list.statusCode, 200);
  const denied = await app.inject({
    method: "POST",
    url: "/api/projects/import",
    headers,
    payload: { desktopId: "arbitrary", rootIndex: 0, path: dir },
  });
  assert.equal(denied.statusCode, 404);
  const restored = new Projects();
  await restored.init(
    service.projects.roots,
    await new JsonStore<any>(path.join(dir, "projects.json"), []).load(),
  );
  assert.equal(await restored.resolve(imported.json().id), saved);
});

test("project files download binary Unicode artifacts and reject unauthenticated, private and escaping paths", async (t) => {
  const { app, headers, service, projectId, dir } = await setup();
  t.after(() => app.close());
  const root = await service.projects.resolve(projectId);
  const content = Buffer.from([0, 255, 12, 10, 1]);
  await writeFile(path.join(root, "报告.pdf"), content);
  await writeFile(path.join(root, ".env"), "SECRET=do-not-send");
  await mkdir(path.join(root, ".runtime"));
  await writeFile(path.join(root, ".runtime", "devices.json"), "private");
  await symlink(
    dir,
    path.join(root, "escape"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const url = (file: string, download = true) =>
    `/api/files${download ? "/download" : ""}?projectId=${projectId}&path=${encodeURIComponent(file)}`;
  const files = await app.inject({ url: url("", false), headers });
  assert.equal(files.statusCode, 200, files.body);
  assert.deepEqual(
    files.json().entries.map((e: any) => e.name),
    ["报告.pdf"],
  );
  const file = await app.inject({ url: url("报告.pdf"), headers });
  assert.equal(file.statusCode, 200, file.body);
  assert.deepEqual(file.rawPayload, content);
  assert.match(
    file.headers["content-disposition"] as string,
    /attachment;.*filename\*=UTF-8''/,
  );
  const absolute = await app.inject({
    url: url(path.join(root, "报告.pdf")),
    headers,
  });
  assert.deepEqual(absolute.rawPayload, content);
  for (const file of [
    "../submissions.json",
    ".env",
    ".runtime/devices.json",
    "escape/submissions.json",
    "报告.pdf:stream",
  ])
    assert.ok(
      [400, 403, 404].includes(
        (await app.inject({ url: url(file), headers })).statusCode,
      ),
      file,
    );
  assert.equal(
    (
      await app.inject({
        url: url("报告.pdf"),
        headers: { host: headers.host },
      })
    ).statusCode,
    401,
  );
});

test("idle attached chat updates effective permissions, confirms full access and preserves choices on reconnect", async (t) => {
  const { app, headers, rpc, projectId, service, dir } = await setup();
  t.after(() => app.close());
  const url = `/api/threads/${rpc.threadId}/permissions`;
  const change = (payload: any) =>
    app.inject({ method: "POST", url, headers, payload });
  assert.equal(
    (await change({ mode: "read-only", approval: "on-request" })).statusCode,
    409,
  );
  await app.inject({
    method: "POST",
    url: "/api/threads",
    headers,
    payload: { projectId, requestId: randomUUID() },
  });
  const result = await change({ mode: "read-only", approval: "on-request" });
  assert.equal(result.statusCode, 200, result.body);
  assert.equal(result.json().sandbox.type, "readOnly");
  assert.equal(result.json().approvalPolicy, "on-request");
  const snapshot = await app.inject({
    url: `/api/threads/${rpc.threadId}`,
    headers,
  });
  assert.equal(snapshot.json().permissions.sandbox.type, "readOnly");
  assert.equal(
    (await change({ mode: "danger-full-access", approval: "never" }))
      .statusCode,
    400,
  );
  assert.equal(rpc.settingsUpdates, 1);
  const service2 = new CodexService(
    rpc as unknown as AppServer,
    service.projects,
    await new JsonStore<any>(
      path.join(dir, "other-submissions.json"),
      {},
    ).load(),
    await new JsonStore<any>(path.join(dir, "permissions.json"), {}).load(),
  );
  await service2.resume(rpc.threadId);
  assert.equal(rpc.resumes.at(-1).permissions, ":read-only");
  assert.equal(rpc.resumes.at(-1).approvalPolicy, "on-request");
  rpc.profilesAllowed = false;
  assert.equal(
    (
      await change({
        mode: "danger-full-access",
        approval: "never",
        fullAccessConfirmed: true,
      })
    ).statusCode,
    403,
  );
  assert.equal(rpc.settingsUpdates, 1);
  rpc.profilesAllowed = true;
  const full = await change({
    mode: "danger-full-access",
    approval: "never",
    fullAccessConfirmed: true,
  });
  assert.equal(full.statusCode, 200, full.body);
  assert.equal(full.json().sandbox.type, "dangerFullAccess");
  assert.equal(full.json().approvalPolicy, "never");
  rpc.emit("message", {
    method: "turn/started",
    params: {
      threadId: rpc.threadId,
      turn: { id: randomUUID(), status: "inProgress", items: [] },
    },
  });
  assert.equal(
    (await change({ mode: "workspace-write", approval: "untrusted" }))
      .statusCode,
    409,
  );
  assert.equal(rpc.settingsUpdates, 2);
});
test("HTTP boundary: auth, Origin/Host, redacted host info, input and revocation", async (t) => {
  const { app, headers } = await setup();
  t.after(() => app.close());
  for (const url of ["/%61pi/host", "/api//host", "/api/%2fhost"])
    assert.equal((await app.inject({ url, headers })).statusCode, 400, url);
  assert.equal(
    (
      await app.inject({
        url: "/api/host",
        headers: { host: "localhost:7331" },
      })
    ).statusCode,
    401,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/host",
        headers: { ...headers, origin: "https://evil.test" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        url: "/api/host",
        headers: { ...headers, host: "evil.test" },
      })
    ).statusCode,
    403,
  );
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/threads",
        headers: { host: headers.host, cookie: headers.cookie },
        payload: {},
      })
    ).statusCode,
    403,
  );
  const host = await app.inject({ url: "/api/host", headers });
  assert.equal(host.statusCode, 200);
  assert.ok(!host.body.includes("sk-secret"));
  assert.equal(host.json().model, "test-model");
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: "/api/threads",
        headers,
        payload: {},
      })
    ).statusCode,
    400,
  );
  const devices = (await app.inject({ url: "/api/devices", headers })).json();
  assert.equal(devices[0].hash, undefined);
  await app.inject({
    method: "DELETE",
    url: `/api/devices/${devices[0].id}`,
    headers,
  });
  assert.equal(
    (await app.inject({ url: "/api/host", headers })).statusCode,
    401,
  );
});
test("HTTP task submission is deduplicated concurrently and after service restart; changed payload conflicts", async (t) => {
  const { app, headers, projectId, rpc, dir, service } = await setup();
  t.after(() => app.close());
  const create = await app.inject({
    method: "POST",
    url: "/api/threads",
    headers,
    payload: { projectId, requestId: randomUUID() },
  });
  assert.equal(create.statusCode, 200);
  const payload = { requestId: randomUUID(), text: "Create a file" };
  const request = {
    method: "POST" as const,
    url: `/api/threads/${rpc.threadId}/turns`,
    headers,
    payload,
  };
  const responses = await Promise.all([
    app.inject(request),
    app.inject(request),
  ]);
  assert.equal(responses[0].statusCode, 200);
  assert.equal(responses[0].body, responses[1].body);
  assert.equal(rpc.starts, 1);
  assert.equal(
    (
      await app.inject({
        ...request,
        payload: { ...payload, text: "different" },
      })
    ).statusCode,
    409,
  );
  const reloaded = await new JsonStore<any>(
    path.join(dir, "submissions.json"),
    {},
  ).load();
  const restarted = new CodexService(
    rpc as unknown as AppServer,
    service.projects,
    reloaded,
  );
  await restarted.submit(
    payload.requestId,
    "turn/start",
    { threadId: rpc.threadId, text: payload.text },
    async () => {
      throw new Error("must not run");
    },
  );
  reloaded.data.unknown = { fingerprint: "x", state: "pending" }; // persisted unknown intent is never replayed
  const unknownId = randomUUID();
  await assert.rejects(
    service.submit(unknownId, "test", {}, async () => {
      throw new Error("transport exit");
    }),
  );
  await assert.rejects(
    service.submit(unknownId, "test", {}, async () => ({})),
    (e: any) => e.statusCode === 409,
  );
});
test("approvals route back to the original RPC id, stale approvals reject, and event gaps signal refresh", async (t) => {
  const { app, headers, projectId, rpc, service } = await setup();
  t.after(() => app.close());
  await service.list(projectId);
  rpc.emit("message", {
    id: 77,
    method: "item/commandExecution/requestApproval",
    params: {
      threadId: rpc.threadId,
      turnId: randomUUID(),
      command: "echo hello",
    },
  });
  const state = await service.read(rpc.threadId);
  assert.equal(state.approvals.length, 1);
  const approvalId = state.approvals[0].id;
  const response = await app.inject({
    method: "POST",
    url: `/api/approvals/${approvalId}`,
    headers,
    payload: { decision: "decline" },
  });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(rpc.responses[0], {
    id: 77,
    result: { decision: "decline" },
  });
  assert.equal(
    (
      await app.inject({
        method: "POST",
        url: `/api/approvals/${approvalId}`,
        headers,
        payload: { decision: "accept" },
      })
    ).statusCode,
    409,
  );
  assert.equal(service.events(0, "old-process").gap, true);
  const replay = service.events(0, service.epoch);
  assert.equal(replay.events.length, 2);
  for (let i = 0; i < 1002; i++)
    rpc.emit("message", {
      method: "item/agentMessage/delta",
      params: { threadId: rpc.threadId, delta: "x" },
    });
  assert.equal(service.events(0, service.epoch).gap, true);
  rpc.emit("offline");
  assert.equal(service.approvals.size, 0);
});

test("SSE authenticates, streams live notifications, closes immediately on device revocation and allows clean shutdown", async (t) => {
  const { app, headers, projectId, rpc, service } = await setup();
  t.after(() => app.close());
  await service.list(projectId);
  const base = await app.listen({ host: "127.0.0.1", port: 0 });
  const response = await new Promise<IncomingMessage>((resolve) =>
    httpGet(base + "/api/events", { headers }, resolve),
  );
  t.after(() => response.destroy());
  assert.equal(response.headers["content-type"], "text/event-stream");
  const [sync] = await once(response, "data");
  assert.match(sync.toString(), /event: sync/);
  const eventPromise = once(response, "data");
  rpc.emit("message", {
    method: "item/agentMessage/delta",
    params: {
      threadId: rpc.threadId,
      turnId: randomUUID(),
      itemId: "a",
      delta: "streamed",
    },
  });
  const [event] = await eventPromise;
  assert.match(event.toString(), /streamed/);
  const devices = (await app.inject({ url: "/api/devices", headers })).json();
  const ended = once(response, "end");
  await app.inject({
    method: "DELETE",
    url: `/api/devices/${devices[0].id}`,
    headers,
  });
  await ended;
});
