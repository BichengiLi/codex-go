import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { AppServer, RpcError } from "./rpc.js";
import { Projects } from "./projects.js";
import { JsonStore } from "./storage.js";
import { HttpError } from "./errors.js";
import type {
  Approval,
  HostEvent,
  Thread,
  Turn,
  Wire,
} from "../shared/types.js";

type Submission = {
  fingerprint: string;
  state: "pending" | "done";
  result?: Wire;
};
export class CodexService extends EventEmitter {
  readonly epoch = randomUUID();
  readonly approvals = new Map<string, Approval & { rpcId: string | number }>();
  private allowed = new Set<string>();
  private attached = new Set<string>();
  private busy = new Set<string>();
  private metadata = new Map<string, Thread>();
  private liveTurns = new Map<string, Map<string, Turn>>();
  private inFlight = new Map<string, Promise<Wire>>();
  private ring: HostEvent[] = [];
  private sequence = 0;
  constructor(
    readonly rpc: AppServer,
    readonly projects: Projects,
    private submissions: JsonStore<Record<string, Submission>>,
  ) {
    super();
    rpc.on("message", (msg: Wire) => this.receive(msg));
    rpc.on("offline", () => {
      this.approvals.clear();
      this.attached.clear();
      this.busy.clear();
      this.publish("bridge/offline", {});
    });
  }
  private publish(method: string, params: Wire) {
    const event = { seq: ++this.sequence, method, params };
    this.ring.push(event);
    if (this.ring.length > 1000) this.ring.shift();
    this.emit("event", event);
  }
  private receive(msg: Wire) {
    const p = msg.params ?? {};
    const threadId = p.threadId ?? p.thread?.id;
    if (msg.id !== undefined) {
      if (!this.allowed.has(threadId)) {
        this.rpc.reject(msg.id);
        return;
      }
      if (
        [
          "item/commandExecution/requestApproval",
          "item/fileChange/requestApproval",
        ].includes(msg.method)
      ) {
        const id = randomUUID();
        this.approvals.set(id, {
          id,
          rpcId: msg.id,
          method: msg.method,
          params: p,
        });
        this.publish("bridge/approval", { threadId });
      } else {
        // Unsupported elicitation must not hang a model task indefinitely.
        this.rpc.reject(msg.id);
        this.publish("bridge/unsupported", { threadId, method: msg.method });
      }
      return;
    }
    if (msg.method === "serverRequest/resolved") {
      for (const [key, a] of this.approvals)
        if (a.rpcId === p.requestId) this.approvals.delete(key);
    }
    if (!threadId || !this.allowed.has(threadId)) return;
    const turns = this.liveTurns.get(threadId) ?? new Map<string, Turn>();
    this.liveTurns.set(threadId, turns);
    if (msg.method === "turn/started" || msg.method === "turn/completed") {
      const previous = turns.get(p.turn.id);
      turns.set(p.turn.id, {
        ...p.turn,
        items: p.turn.items?.length ? p.turn.items : (previous?.items ?? []),
      });
      // This cache only bridges notifications and durable history, not all history.
      if (turns.size > 30) turns.delete(turns.keys().next().value!);
    } else if (
      p.turnId &&
      [
        "item/started",
        "item/completed",
        "item/agentMessage/delta",
        "item/commandExecution/outputDelta",
      ].includes(msg.method)
    ) {
      const turn: Turn = turns.get(p.turnId) ?? {
        id: p.turnId,
        status: "inProgress",
        items: [],
      };
      turns.set(p.turnId, turn);
      if (msg.method === "item/started" || msg.method === "item/completed") {
        const index = turn.items.findIndex((i) => i.id === p.item.id);
        if (index < 0) turn.items.push(p.item);
        else turn.items[index] = p.item;
      } else if (
        msg.method === "item/agentMessage/delta" ||
        msg.method === "item/commandExecution/outputDelta"
      ) {
        let item = turn.items.find((i) => i.id === p.itemId);
        const field = msg.method.includes("agentMessage")
          ? "text"
          : "aggregatedOutput";
        if (!item) {
          item = {
            id: p.itemId,
            type: field === "text" ? "agentMessage" : "commandExecution",
          };
          turn.items.push(item);
        }
        item[field] = (item[field] ?? "") + p.delta;
      }
    }
    if (msg.method === "turn/started") this.busy.add(threadId);
    if (msg.method === "turn/completed") {
      this.busy.delete(threadId);
      for (const [key, a] of this.approvals)
        if (a.params.threadId === threadId) this.approvals.delete(key);
    }
    this.publish(msg.method, p);
  }
  events(after: number, epoch: string | undefined) {
    const gap =
      epoch !== this.epoch ||
      after > this.sequence ||
      (this.ring.length > 0 && after < this.ring[0].seq - 1);
    return {
      gap,
      epoch: this.epoch,
      seq: this.sequence,
      events: gap ? [] : this.ring.filter((e) => e.seq > after),
    };
  }
  async config() {
    const { config } = await this.rpc.call("config/read", {});
    return {
      model: config.model ?? null,
      provider: config.model_provider ?? null,
    };
  }
  async list(projectId: string, cursor?: string) {
    const cwd = await this.projects.resolve(projectId);
    const result = await this.rpc.call<{
      data: Thread[];
      nextCursor: string | null;
    }>("thread/list", {
      cwd,
      cursor,
      limit: 40,
      sortKey: "updated_at",
      modelProviders: [],
    });
    const data: Thread[] = [];
    for (const thread of result.data) {
      try {
        await this.projects.authorize(thread.cwd);
        this.allowed.add(thread.id);
        data.push(thread);
      } catch {
        /* don't expose escaped history */
      }
    }
    return { data, nextCursor: result.nextCursor };
  }
  async read(id: string, cursor?: string) {
    const cached = this.metadata.get(id);
    const { thread } = await this.rpc
      .call<{ thread: Thread }>("thread/read", {
        threadId: id,
        includeTurns: false,
      })
      .catch((error: unknown) => {
        if (cached && this.isEmptyRollout(error)) return { thread: cached };
        throw error;
      });
    await this.projects.authorize(thread.cwd);
    this.metadata.set(id, thread);
    this.allowed.add(id);
    const history = await this.rpc
      .call<{
        data: Turn[];
        nextCursor: string | null;
      }>("thread/turns/list", {
        threadId: id,
        cursor,
        limit: 20,
        sortDirection: "desc",
        itemsView: "full",
      })
      .catch((error: unknown) => {
        // Codex 0.166 accepts thread/read for a loaded empty conversation, but
        // refuses pagination until its first user message materializes the log.
        if (this.isEmptyRollout(error)) return { data: [], nextCursor: null };
        throw error;
      });
    const combined = new Map(
      history.data
        .slice()
        .reverse()
        .map((turn) => [turn.id, turn]),
    );
    if (!cursor)
      for (const [turnId, live] of this.liveTurns.get(id) ?? []) {
        const persisted = combined.get(turnId);
        if (
          !persisted ||
          live.status === "inProgress" ||
          persisted.status === "inProgress"
        )
          combined.set(turnId, live);
        else this.liveTurns.get(id)?.delete(turnId);
      }
    if (
      !cursor &&
      this.attached.has(id) &&
      thread.status.type === "idle" &&
      ![...combined.values()].some((t) => t.status === "inProgress")
    )
      this.busy.delete(id);
    return {
      thread: { ...thread, turns: structuredClone([...combined.values()]) },
      nextCursor: history.nextCursor,
      attached: this.attached.has(id),
      active: this.busy.has(id),
      approvals: this.pending(id),
    };
  }
  private isEmptyRollout(error: unknown) {
    return (
      error instanceof RpcError &&
      ((error.code === -32600 &&
        error.message.includes("is not materialized yet")) ||
        (error.code === -32603 && /rollout at .+ is empty/.test(error.message)))
    );
  }
  private pending(id: string) {
    return [...this.approvals.values()]
      .filter((a) => a.params.threadId === id)
      .map(({ rpcId: _, ...a }) => a);
  }
  async create(projectId: string) {
    const cwd = await this.projects.resolve(projectId);
    const result = await this.rpc.call<{ thread: Thread }>("thread/start", {
      cwd,
      approvalPolicy: "untrusted",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
    });
    this.allowed.add(result.thread.id);
    this.metadata.set(result.thread.id, result.thread);
    this.attached.add(result.thread.id);
    return result;
  }
  async resume(id: string) {
    const state = await this.read(id);
    if (state.active)
      throw new HttpError(409, "此会话正在本服务执行，请先等待或停止。");
    const result = await this.rpc.call<{ thread: Thread }>("thread/resume", {
      threadId: id,
      cwd: state.thread.cwd,
      approvalPolicy: "untrusted",
      approvalsReviewer: "user",
      sandbox: "workspace-write",
      excludeTurns: true,
    });
    this.attached.add(id);
    this.metadata.set(id, result.thread);
    return result;
  }
  async submit(
    requestId: string,
    action: string,
    payload: Wire,
    run: () => Promise<Wire>,
  ) {
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ action, payload }))
      .digest("hex");
    const previous = this.submissions.data[requestId];
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new HttpError(409, "请求标识已用于其他操作。");
      if (previous.state === "done") return previous.result!;
      const running = this.inFlight.get(requestId);
      if (running) return running;
      throw new HttpError(409, "该请求结果未知。请核对历史后再发起新的操作。");
    }
    if (Object.keys(this.submissions.data).length >= 10000)
      throw new HttpError(409, "请求记录已满，请在主机维护运行数据。");
    this.submissions.data[requestId] = { fingerprint, state: "pending" };
    const promise = (async () => {
      await this.submissions.save(); // durable intent BEFORE any model-side mutation
      const result = await run();
      this.submissions.data[requestId] = { fingerprint, state: "done", result };
      await this.submissions.save();
      return result;
    })();
    this.inFlight.set(requestId, promise);
    try {
      return await promise;
    } finally {
      this.inFlight.delete(requestId);
    }
  }
  async turn(id: string, text: string) {
    if (!this.attached.has(id))
      throw new HttpError(409, "请先确认电脑端已停止操作，再接续此会话。");
    if (this.busy.has(id))
      throw new HttpError(409, "任务正在执行，请等待或停止后再发送。");
    this.busy.add(id);
    try {
      return await this.rpc.call("turn/start", {
        threadId: id,
        input: [{ type: "text", text, text_elements: [] }],
      });
    } catch (error) {
      if (error instanceof RpcError) this.busy.delete(id);
      throw error;
    }
  }
  async interrupt(id: string, turnId: string) {
    if (!this.attached.has(id))
      throw new HttpError(409, "此任务不由本服务控制。");
    return this.rpc.call("turn/interrupt", { threadId: id, turnId });
  }
  async answer(id: string, decision: "accept" | "decline") {
    const approval = this.approvals.get(id);
    if (!approval) throw new HttpError(409, "审批已结束或失效，请刷新。");
    this.rpc.respond(approval.rpcId, { decision });
    this.approvals.delete(id);
    this.publish("bridge/approval", { threadId: approval.params.threadId });
    return { ok: true };
  }
}
