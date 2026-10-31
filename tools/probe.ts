import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { AppServer } from "../src/host/rpc.js";
import type { Wire } from "../src/shared/types.js";

const { values } = parseArgs({
  options: {
    run: { type: "boolean", default: false },
    thread: { type: "string" },
    output: { type: "string" },
  },
});
const workspace = await mkdtemp(path.join(os.tmpdir(), "codex-go-probe-"));
const result: Wire = {
  date: new Date().toISOString(),
  platform: `${process.platform}/${process.arch}`,
  workspace,
  paidModelRun: values.run,
  checks: {},
};
let rpc: AppServer;
const connect = async () => {
  rpc = new AppServer({ cwd: workspace, timeout: 90_000 });
  await rpc.start();
  result.version = rpc.version;
  rpc.on("message", (message: Wire) => {
    if (message.id !== undefined) {
      // The probe only ever writes inside its own newly-created temporary workspace.
      const params = message.params ?? {};
      if (
        [
          "item/commandExecution/requestApproval",
          "item/fileChange/requestApproval",
        ].includes(message.method)
      ) {
        if (message.method.includes("commandExecution"))
          rpc.respond(message.id, { decision: "decline" });
        else
          rpc.respond(message.id, {
            decision:
              params.grantRoot && path.resolve(params.grantRoot) !== workspace
                ? "decline"
                : "accept",
          });
        result.checks.approvalCallback = true;
      } else rpc.reject(message.id);
    }
  });
};
async function runTurn(threadId: string, text: string) {
  const completed = new Promise<Wire>((resolve, reject) => {
    const timer = setTimeout(() => {
      rpc.off("message", listener);
      reject(new Error("turn timed out"));
    }, 240_000);
    function listener(message: Wire) {
      if (message.params?.threadId !== threadId) return;
      if (message.method === "item/agentMessage/delta")
        result.checks.streaming = true;
      if (
        message.method === "item/completed" &&
        message.params.item?.type === "fileChange"
      )
        result.checks.fileTool = true;
      if (message.method === "turn/completed") {
        clearTimeout(timer);
        rpc.off("message", listener);
        resolve(message.params.turn);
      }
    }
    rpc.on("message", listener);
  });
  const starting = rpc.call("turn/start", {
    threadId,
    input: [{ type: "text", text, text_elements: [] }],
    effort: "low",
  });
  const [turn] = await Promise.all([completed, starting]);
  assert.equal(turn.status, "completed", JSON.stringify(turn.error));
}
try {
  await connect();
  const config = await rpc!.call("config/read", {});
  result.model = config.config.model;
  result.provider = config.config.model_provider;
  const list = await rpc!.call("thread/list", {
    limit: 10,
    modelProviders: [],
  });
  result.checks.list = Array.isArray(list.data);
  result.visibleThreadCount = list.data.length;
  if (values.thread) {
    const { thread } = await rpc!.call("thread/read", {
      threadId: values.thread,
      includeTurns: false,
    });
    const history = await rpc!.call("thread/turns/list", {
      threadId: values.thread,
      limit: 1,
      itemsView: "full",
    });
    result.checks.existingDesktopHistory = history.data.length > 0;
    result.existingThread = {
      id: thread.id,
      originator: thread.originator,
      source: thread.source,
      cwdMatchesRepository: thread.cwd === process.cwd(),
    };
  }
  if (values.run) {
    const { thread } = await rpc!.call("thread/start", {
      cwd: workspace,
      approvalPolicy: "untrusted",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
    });
    result.threadId = thread.id;
    console.log(
      "Running first file-change turn in the isolated probe workspace…",
    );
    await runTurn(
      thread.id,
      "Use apply_patch to create probe.txt in the working directory with exactly the text CODEX_GO_FIRST and a newline. Do not run shell commands. Then reply FIRST_DONE. This is a temporary integration test.",
    );
    assert.equal(
      (await readFile(path.join(workspace, "probe.txt"), "utf8")).trim(),
      "CODEX_GO_FIRST",
    );
    result.checks.fileCreated = true;
    await rpc!.close();
    await connect();
    const resumed = await rpc!.call("thread/resume", {
      threadId: thread.id,
      cwd: workspace,
      approvalPolicy: "untrusted",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      excludeTurns: true,
    });
    assert.equal(resumed.thread.id, thread.id);
    result.checks.sameIdAfterRestart = true;
    console.log("Running resumed turn after restarting the App Server…");
    await runTurn(
      thread.id,
      "Use apply_patch to append exactly CODEX_GO_SECOND as a new line in the same file you just created. Preserve the first line. Do not run shell commands. Then reply SECOND_DONE.",
    );
    assert.equal(
      (await readFile(path.join(workspace, "probe.txt"), "utf8"))
        .trim()
        .replace(/\r/g, ""),
      "CODEX_GO_FIRST\nCODEX_GO_SECOND",
    );
    result.checks.multiTurnContext = true;
    const history = await rpc!.call("thread/turns/list", {
      threadId: thread.id,
      limit: 10,
      itemsView: "full",
    });
    assert.equal(history.data.length, 2);
    result.checks.persistedTurns = true;
  }
  result.success = true;
} catch (error) {
  result.success = false;
  // Keep reports free of raw upstream errors (which can contain secrets).
  result.failure =
    error instanceof assert.AssertionError
      ? "Probe assertion failed"
      : "Protocol or model operation failed";
  process.exitCode = 1;
} finally {
  await rpc!?.close();
  if (values.output)
    await writeFile(values.output, JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
}
