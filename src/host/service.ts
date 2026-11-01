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
  DesktopProject,
  PermissionChoice,
  EffectivePermissions,
  PermissionProfile,
} from "../shared/types.js";

type Submission = {
  fingerprint: string;
  state: "pending" | "done";
  result?: Wire;
};
const profileId = (mode: PermissionChoice["mode"]) =>
  mode === "workspace-write" ? ":workspace" : `:${mode}`;
const deliveryInstructions =
  "You are connected through Codex Go. When delivering generated files, save them inside the chat working directory (for example in outputs/) and include a Markdown link with the absolute local file path in your reply so the user can download them. Avoid sandbox:/mnt/data links unless that is the real working directory.";
export class CodexService extends EventEmitter {
  readonly epoch = randomUUID();
  readonly approvals = new Map<string, Approval & { rpcId: string | number }>();
  async desktopProjects() {
    const data: DesktopProject[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: DesktopProject[]; nextCursor: string | null } =
        await this.rpc.call("project/list", { cursor, limit: 100 });
      data.push(
        ...page.data.map((p) => ({ id: p.id, name: p.name, roots: p.roots })),
      );
      cursor = page.nextCursor;
    } while (cursor);
    return { data };
  }
  async importProject(desktopId: string, rootIndex: number) {
    const project = (await this.desktopProjects()).data.find(
      (p) => p.id === desktopId,
    );
    const root = project?.roots[rootIndex];
    if (!project || !root)
      throw new HttpError(
        404,
        "Codex App 中未找到此项目目录，请刷新项目列表。",
      );
    return this.projects.importDesktop(
      root.path,
      project.roots.length > 1
        ? `${project.name} · ${rootIndex + 1}`
        : project.name,
    );
  }
  private allowed = new Set<string>();
  private attached = new Set<string>();
  private busy = new Set<string>();
  private metadata = new Map<string, Thread>();
  private liveTurns = new Map<string, Map<string, Turn>>();
  private inFlight = new Map<string, Promise<Wire>>();
  private ring: HostEvent[] = [];
  private sequence = 0;
  private permissions = new Map<string, EffectivePermissions>();
  private changingPermissions = new Set<string>();
  constructor(
    readonly rpc: AppServer,
    readonly projects: Projects,
    private submissions: JsonStore<Record<string, Submission>>,
    private permissionStore?: JsonStore<Record<string, PermissionChoice>>,
    private defaultPermissions: PermissionChoice = {
      mode: "workspace-write",
      approval: "untrusted",
    },
    private androidLocal = false,
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
    if (msg.method === "thread/settings/updated") {
      const settings = p.threadSettings;
      this.permissions.set(threadId, {
        approvalPolicy: settings.approvalPolicy,
        sandbox: settings.sandboxPolicy,
        profile: settings.activePermissionProfile?.id ?? null,
      });
    }
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
      if (data.some((t) => t.id === thread.id)) continue;
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
      permissions: this.permissions.get(id) ?? null,
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
    const result = await this.rpc.call<Wire & { thread: Thread }>(
      "thread/start",
      {
        cwd,
        approvalPolicy: this.defaultPermissions.approval,
        approvalsReviewer: "user",
        sandbox: this.defaultPermissions.mode,
        developerInstructions: deliveryInstructions,
      },
    );
    this.allowed.add(result.thread.id);
    this.metadata.set(result.thread.id, result.thread);
    this.attached.add(result.thread.id);
    this.capturePermissions(result.thread.id, result);
    return result;
  }
  async resume(id: string) {
    if (this.attached.has(id)) return this.read(id);
    const state = await this.read(id);
    if (state.active)
      throw new HttpError(409, "此会话正在本服务执行，请先等待或停止。");
    const saved = this.permissionStore?.data[id];
    const result = await this.rpc.call<Wire & { thread: Thread }>(
      "thread/resume",
      {
        threadId: id,
        cwd: state.thread.cwd,
        approvalPolicy: saved?.approval ?? this.defaultPermissions.approval,
        approvalsReviewer: "user",
        ...(saved
          ? { permissions: profileId(saved.mode) }
          : { sandbox: this.defaultPermissions.mode }),
        excludeTurns: true,
      },
    );
    this.attached.add(id);
    this.metadata.set(id, result.thread);
    this.capturePermissions(id, result);
    return result;
  }
  private capturePermissions(id: string, result: Wire) {
    if (result.sandbox && result.approvalPolicy)
      this.permissions.set(id, {
        approvalPolicy: result.approvalPolicy,
        sandbox: result.sandbox,
        profile: result.activePermissionProfile?.id ?? null,
      });
  }
  async permissionProfiles(id: string) {
    const state = await this.read(id);
    const data: PermissionProfile[] = [];
    let cursor: string | null = null;
    do {
      const page: { data: PermissionProfile[]; nextCursor: string | null } =
        await this.rpc.call("permissionProfile/list", {
          cwd: state.thread.cwd,
          cursor,
        });
      data.push(...page.data);
      cursor = page.nextCursor;
    } while (cursor);
    return {
      data: this.androidLocal
        ? data.map((p) => ({
            ...p,
            allowed: p.allowed && p.id === ":danger-full-access",
          }))
        : data,
      note: this.androidLocal
        ? "手机本地模式使用 Android App 隔离，可访问此 App 的全部项目；PRoot 不提供只读或项目沙箱。批准策略仍可调整。"
        : undefined,
    };
  }
  async changePermissions(id: string, choice: PermissionChoice) {
    if (!this.attached.has(id))
      throw new HttpError(409, "接续此对话后才能调整权限。");
    if (this.changingPermissions.has(id))
      throw new HttpError(409, "权限正在更新，请稍候。");
    this.changingPermissions.add(id);
    let cancel = () => {};
    try {
      const state = await this.read(id);
      if (
        state.active ||
        state.thread.status.type === "active" ||
        state.thread.turns.some((t) => t.status === "inProgress")
      )
        throw new HttpError(409, "请等待任务和审批结束后再调整权限。");
      const profiles = await this.permissionProfiles(id);
      if (
        !profiles.data.some((p) => p.id === profileId(choice.mode) && p.allowed)
      )
        throw new HttpError(403, "主机策略不允许此权限模式。");
      const confirmed = new Promise<EffectivePermissions | null>((resolve) => {
        const finish = (value: EffectivePermissions | null) => {
          clearTimeout(timer);
          this.off("event", listener);
          resolve(value);
        };
        const listener = (event: HostEvent) => {
          if (
            event.method === "thread/settings/updated" &&
            event.params.threadId === id
          )
            finish(this.permissions.get(id) ?? null);
        };
        const timer = setTimeout(() => finish(null), 5000);
        cancel = () => finish(null);
        this.on("event", listener);
      });
      await this.rpc.call("thread/settings/update", {
        threadId: id,
        approvalPolicy: choice.approval,
        permissions: profileId(choice.mode),
        approvalsReviewer: "user",
      });
      const effective = await confirmed;
      if (!effective)
        throw new HttpError(503, "尚未收到主机的权限确认，请刷新后核对。");
      if (this.permissionStore) {
        this.permissionStore.data[id] = choice;
        await this.permissionStore.save();
      }
      return effective;
    } finally {
      cancel();
      this.changingPermissions.delete(id);
    }
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
  async workingDirectory(id: string) {
    const thread =
      this.metadata.get(id) ??
      (
        await this.rpc.call<{ thread: Thread }>("thread/read", {
          threadId: id,
          includeTurns: false,
        })
      ).thread;
    return this.projects.authorize(thread.cwd);
  }
  async turn(id: string, text: string, images: string[] = []) {
    if (this.changingPermissions.has(id))
      throw new HttpError(409, "权限正在更新，请稍后发送。");
    if (!this.attached.has(id))
      throw new HttpError(409, "请先确认电脑端已停止操作，再接续此会话。");
    if (this.busy.has(id))
      throw new HttpError(409, "任务正在执行，请等待或停止后再发送。");
    this.busy.add(id);
    try {
      return await this.rpc.call("turn/start", {
        threadId: id,
        input: [
          { type: "text", text, text_elements: [] },
          ...images.map((image) => ({ type: "localImage", path: image })),
        ],
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
