import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";

const root = path.resolve(".local/native-probe");
await mkdir(path.join(root, "workspace"), { recursive: true });
const child = spawn(process.execPath, [path.resolve("dist/native/host.cjs")], {
  env: {
    ...process.env,
    CODEX_BIN: path.resolve("dist/native/resources/codex/bin/codex.exe"),
    CODEX_GO_WORKSPACE: path.join(root, "workspace"),
    CODEX_GO_STATE: path.join(root, "state"),
  },
  stdio: ["pipe", "pipe", "ignore"],
  windowsHide: true,
});
let url = "",
  cookie = "";
try {
  const ready = await new Promise<any>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Native host startup timed out")),
      55000,
    );
    const lines = createInterface({ input: child.stdout });
    child.once("exit", () => {
      clearTimeout(timer);
      reject(new Error("Native host exited during startup"));
    });
    lines.on("line", (line) => {
      try {
        const data = JSON.parse(line);
        if (data.type === "ready") {
          clearTimeout(timer);
          resolve(data);
        }
      } catch {}
    });
  });
  url = ready.url;
  const paired = await fetch(url + "/api/pair", {
    method: "POST",
    headers: { origin: url, "content-type": "application/json" },
    body: JSON.stringify({ code: ready.code, name: "native bundle probe" }),
  });
  assert.equal(paired.status, 200);
  cookie = paired.headers.get("set-cookie")!.split(";")[0];
  async function api(route: string, method = "GET", body?: unknown) {
    const response = await fetch(url + "/api" + route, {
      method,
      headers: { origin: url, cookie, "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    assert.equal(response.status, 200, await response.clone().text());
    return response.json();
  }
  const host = await api("/host");
  assert.equal(host.online, true);
  const { thread } = await api("/threads", "POST", {
    projectId: host.projects[0].id,
    requestId: randomUUID(),
  });
  const attached = await api(`/threads/${thread.id}`);
  assert.equal(attached.permissions.sandbox.type, "dangerFullAccess");
  const profiles = await api(`/threads/${thread.id}/permissions`);
  assert.ok(profiles.note.includes("Android"));
  assert.ok(
    profiles.data
      .filter((p: any) => p.id !== ":danger-full-access")
      .every((p: any) => !p.allowed),
  );
  const attachmentResponse = await fetch(
    url +
      `/api/files/upload?threadId=${thread.id}&name=${encodeURIComponent("附件口令.txt")}`,
    {
      method: "POST",
      headers: {
        origin: url,
        cookie,
        "content-type": "application/octet-stream",
      },
      body: "The required reply token is native-bundle-attachment-ok.",
    },
  );
  assert.equal(
    attachmentResponse.status,
    200,
    await attachmentResponse.clone().text(),
  );
  const attachment = await attachmentResponse.json();
  await api(`/threads/${thread.id}/turns`, "POST", {
    text: "请只读取附件的文本，不修改文件，只回复文件中指定的 reply token。",
    attachments: [attachment.path],
    requestId: randomUUID(),
  });
  let snapshot: any;
  const deadline = Date.now() + 120000;
  do {
    await new Promise((resolve) => setTimeout(resolve, 800));
    snapshot = await api(`/threads/${thread.id}`);
    for (const approval of snapshot.approvals ?? [])
      await api(`/approvals/${approval.id}`, "POST", { decision: "accept" });
    if (snapshot.thread.turns.some((t: any) => t.status === "completed")) break;
  } while (Date.now() < deadline);
  const text = snapshot.thread.turns
    .flatMap((t: any) => t.items)
    .filter((i: any) => i.type === "agentMessage")
    .map((i: any) => i.text)
    .join("\n");
  assert.ok(
    text.includes("native-bundle-attachment-ok"),
    "Uploaded attachment was not read",
  );
  const evidence = {
    bundledHost: true,
    authenticatedHttp: true,
    model: host.model,
    provider: host.provider,
    localDefaultPermissions: attached.permissions,
    modelReplied: true,
    uploadedAttachmentReadByModel: true,
    threadId: thread.id,
  };
  await writeFile(
    path.join(root, "result.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  child.kill("SIGTERM");
}
