import { test } from "node:test";
import assert from "node:assert/strict";
import { replayTurns, updateTurns } from "../src/shared/live.js";
import type { HostEvent, Turn } from "../src/shared/types.js";

test("public reasoning summaries, plans and tool output remain live before completion and stale snapshots replay once", () => {
  let seq = 0;
  const event = (method: string, params = {}): HostEvent => ({
    seq: ++seq,
    method,
    params: { threadId: "thread", turnId: "turn", ...params },
  });
  const events = [
    event("turn/started", {
      turn: { id: "turn", status: "inProgress", items: [] },
    }),
    event("item/reasoning/summaryTextDelta", {
      itemId: "reason",
      summaryIndex: 0,
      delta: "正在检查",
    }),
    event("item/reasoning/summaryTextDelta", {
      itemId: "reason",
      summaryIndex: 0,
      delta: "文件",
    }),
    event("turn/plan/updated", {
      plan: [{ step: "检查文件", status: "inProgress" }],
    }),
    event("item/started", {
      item: { id: "cmd", type: "commandExecution", command: "pwd" },
    }),
    event("item/commandExecution/outputDelta", {
      itemId: "cmd",
      delta: "/workspace",
    }),
    event("item/agentMessage/delta", { itemId: "reply", delta: "第一段" }),
  ];
  const turns = replayTurns([], events, 0);
  assert.equal(turns[0].status, "inProgress");
  assert.deepEqual(turns[0].items[0].summary, ["正在检查文件"]);
  assert.equal(turns[0].items[1].plan[0].step, "检查文件");
  assert.equal(turns[0].items[2].aggregatedOutput, "/workspace");
  assert.equal(turns[0].items[3].text, "第一段");
  const snapshot = structuredClone(turns);
  events.push(
    event("item/agentMessage/delta", { itemId: "reply", delta: "第二段" }),
  );
  const recovered = replayTurns(snapshot, events, 7);
  assert.equal(recovered[0].items[3].text, "第一段第二段");
  assert.equal(snapshot[0].items[3].text, "第一段");
  const completed = updateTurns(
    recovered,
    event("turn/completed", {
      turn: { id: "turn", status: "completed", items: [] },
    }),
  );
  assert.equal(completed[0].status, "completed");
  assert.equal(completed[0].items.length, 4);
  assert.ok(completed[0].items.every((item) => item.status === "completed"));
  const durableCompletion = updateTurns(
    turns,
    event("turn/completed", {
      turn: {
        id: "turn",
        status: "completed",
        items: [{ id: "reply", type: "agentMessage", text: "最终回复" }],
      },
    }),
  );
  assert.equal(durableCompletion[0].items[0].text, "最终回复");
  assert.equal(durableCompletion[0].items[1].type, "taskPlan");
});
