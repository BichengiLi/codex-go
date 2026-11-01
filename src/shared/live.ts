import type { HostEvent, Turn, Wire } from "./types.js";

// Project only public task progress; reasoning content is never a fallback for summaries.
export function updateTurn(
  previous: Turn | undefined,
  method: string,
  p: Wire,
): Turn | undefined {
  if (method === "turn/started" || method === "turn/completed") {
    let items = p.turn.items?.length ? p.turn.items : (previous?.items ?? []);
    if (p.turn.items?.length)
      items = [
        ...items,
        ...(previous?.items ?? []).filter(
          (item) =>
            item.type === "taskPlan" &&
            !items.some((saved: Wire) => saved.id === item.id),
        ),
      ];
    if (method === "turn/completed")
      items = items.map((item: Wire) => ({
        ...item,
        status:
          item.status && item.status !== "inProgress"
            ? item.status
            : "completed",
      }));
    return { ...previous, ...p.turn, items };
  }
  const types: Record<string, string> = {
    "item/agentMessage/delta": "agentMessage",
    "item/commandExecution/outputDelta": "commandExecution",
    "item/fileChange/outputDelta": "fileChange",
    "item/plan/delta": "plan",
    "item/reasoning/summaryTextDelta": "reasoning",
    "item/reasoning/summaryPartAdded": "reasoning",
    "turn/plan/updated": "taskPlan",
  };
  const lifecycle = method === "item/started" || method === "item/completed";
  if (!lifecycle && !types[method]) return previous;
  const turn: Turn = structuredClone(
    previous ?? { id: p.turnId, status: "inProgress", items: [] },
  );
  const id = lifecycle
    ? p.item.id
    : method === "turn/plan/updated"
      ? `plan:${p.turnId}`
      : p.itemId;
  let index = turn.items.findIndex((item) => item.id === id);
  if (lifecycle) {
    const item = {
      ...turn.items[index],
      ...p.item,
      status:
        p.item.status ??
        (method === "item/started" ? "inProgress" : "completed"),
    };
    if (index < 0) turn.items.push(item);
    else turn.items[index] = item;
    return turn;
  }
  if (index < 0) {
    turn.items.push({ id, type: types[method], status: "inProgress" });
    index = turn.items.length - 1;
  }
  const item = turn.items[index];
  if (method === "turn/plan/updated") {
    item.plan = p.plan;
    item.explanation = p.explanation;
  } else if (item.type === "reasoning") {
    if (
      !Number.isSafeInteger(p.summaryIndex) ||
      p.summaryIndex < 0 ||
      p.summaryIndex > 1000
    )
      return previous;
    item.summary ??= [];
    item.summary[p.summaryIndex] =
      (item.summary[p.summaryIndex] ?? "") + (p.delta ?? "");
  } else {
    const field =
      item.type === "commandExecution" || item.type === "fileChange"
        ? "aggregatedOutput"
        : "text";
    item[field] = (item[field] ?? "") + p.delta;
  }
  return turn;
}

export function updateTurns(turns: Turn[], event: HostEvent): Turn[] {
  const id = event.params.turnId ?? event.params.turn?.id;
  if (!id) return turns;
  const previous = turns.find((turn) => turn.id === id);
  const next = updateTurn(previous, event.method, event.params);
  if (!next || next === previous) return turns;
  return previous
    ? turns.map((turn) => (turn.id === id ? next : turn))
    : [...turns, next];
}

export function replayTurns(
  turns: Turn[],
  events: HostEvent[],
  after: number,
): Turn[] {
  return events.reduce(
    (value, event) => (event.seq > after ? updateTurns(value, event) : value),
    turns,
  );
}

export function activityLabel(turn?: Turn): string {
  const running = turn?.items.findLast((item) => item.status === "inProgress");
  if (running?.type === "reasoning") return "正在思考";
  if (running?.type === "commandExecution") return "正在执行命令";
  if (running?.type === "fileChange") return "正在修改文件";
  if (running?.type === "agentMessage") return "正在回复";
  if (running && !["taskPlan", "plan", "userMessage"].includes(running.type))
    return "正在调用工具";
  return "正在处理任务";
}
