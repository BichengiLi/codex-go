import React, { useCallback, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { api, ApiError, requestId } from "./api";
import type {
  Approval,
  HostEvent,
  HostInfo,
  Item,
  Thread,
  Turn,
} from "../shared/types";
import "./style.css";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    code: (
      <>
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-2-16-4 20" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    folder: <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z" />,
    arrow: <path d="M12 19V5m-6 6 6-6 6 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    monitor: (
      <>
        <rect x="3" y="4" width="18" height="13" rx="2" />
        <path d="M8 21h8m-4-4v4" />
      </>
    ),
    menu: <path d="M4 6h16M4 12h16M4 18h16" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    check: <path d="m5 12 4 4L19 6" />,
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M6 7a7 7 0 0 1 12-2l2 3M4 16l2 3a7 7 0 0 0 12-2" />
      </>
    ),
    stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.code}
    </svg>
  );
}
type Snapshot = {
  thread: Thread;
  nextCursor: string | null;
  attached: boolean;
  active: boolean;
  approvals: Approval[];
};

function App() {
  const [host, setHost] = useState<HostInfo>();
  const [paired, setPaired] = useState<boolean | undefined>();
  const [code, setCode] = useState("");
  const [deviceName, setDeviceName] = useState("我的手机");
  const [project, setProject] = useState("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [listCursor, setListCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState("connecting");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sidebar, setSidebar] = useState(false);
  const [modal, setModal] = useState<"project" | "devices" | "resume" | null>(
    null,
  );
  const [projectName, setProjectName] = useState("");
  const [devices, setDevices] = useState<
    { id: string; name: string; createdAt: number }[]
  >([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const projectRef = useRef(project);
  projectRef.current = project;
  const hostRef = useRef(host);
  hostRef.current = host;
  const readGeneration = useRef(0);
  const listGeneration = useRef(0);
  const bottom = useRef<HTMLDivElement>(null);
  const pendingSubmission = useRef<{
    threadId: string;
    text: string;
    id: string;
  } | null>(null);

  const report = useCallback((e: unknown) => {
    if (e instanceof ApiError && e.status === 401) {
      setPaired(false);
      setHost(undefined);
      setThreads([]);
      setSnapshot(undefined);
      setSelected("");
    }
    setError(e instanceof Error ? e.message : "操作失败。");
  }, []);
  const loadHost = useCallback(async () => {
    const info = await api<HostInfo>("/host");
    setHost(info);
    setPaired(true);
    setProject((current) => current || info.projects[0]?.id || "");
    return info;
  }, []);
  const loadList = useCallback(async (projectId: string, cursor?: string) => {
    if (!projectId) return;
    const generation = ++listGeneration.current;
    const result = await api<{ data: Thread[]; nextCursor: string | null }>(
      `/threads?projectId=${encodeURIComponent(projectId)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
    );
    if (
      generation !== listGeneration.current ||
      projectRef.current !== projectId
    )
      return;
    setThreads((old) =>
      cursor
        ? [
            ...old,
            ...result.data.filter((t) => !old.some((o) => o.id === t.id)),
          ]
        : result.data,
    );
    setListCursor(result.nextCursor);
  }, []);
  const loadThread = useCallback(
    async (threadId: string, older = false, cursor?: string) => {
      if (!threadId) return;
      const generation = ++readGeneration.current;
      const result = await api<Snapshot>(
        `/threads/${threadId}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      if (
        selectedRef.current !== threadId ||
        generation !== readGeneration.current
      )
        return;
      setSnapshot((old) =>
        older && old
          ? {
              ...result,
              thread: {
                ...result.thread,
                turns: [
                  ...result.thread.turns,
                  ...old.thread.turns.filter(
                    (t) => !result.thread.turns.some((n) => n.id === t.id),
                  ),
                ],
              },
            }
          : result,
      );
    },
    [],
  );
  async function work(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      report(e);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    loadHost().catch((e) => {
      if (e instanceof ApiError && e.status === 401) setPaired(false);
      else report(e);
    });
  }, [loadHost, report]);
  useEffect(() => {
    setThreads([]);
    setSelected("");
    setSnapshot(undefined);
    if (paired && project) loadList(project).catch(report);
  }, [project, paired, loadList, report]);
  useEffect(() => {
    setSnapshot(undefined);
    setDraft("");
    if (selected) loadThread(selected).catch(report);
  }, [selected, loadThread, report]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [snapshot?.thread.turns.length, selected]);
  useEffect(() => {
    if (!paired) return;
    let stream: EventSource | undefined,
      timer: ReturnType<typeof setTimeout> | undefined,
      refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false,
      after = 0,
      epoch = "";
    function refresh() {
      if (refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined;
        if (selectedRef.current) loadThread(selectedRef.current).catch(report);
        loadList(projectRef.current).catch(report);
      }, 250);
    }
    function connect() {
      stream = new EventSource(
        `/api/events?after=${after}&epoch=${encodeURIComponent(epoch)}`,
      );
      stream.addEventListener("sync", (raw) => {
        const sync = JSON.parse((raw as MessageEvent).data);
        epoch = sync.epoch;
        if (sync.gap) {
          after = sync.seq;
          setNotice("已同步主机状态。断线期间的输出将从会话历史补载。");
        }
        setNetwork("online");
        loadHost().catch(report);
        refresh();
      });
      stream.addEventListener("codex", (raw) => {
        const event: HostEvent = JSON.parse((raw as MessageEvent).data);
        if (event.seq <= after) return;
        after = event.seq;
        if (event.method === "bridge/offline") {
          setNetwork("offline");
          setNotice("Codex 进程已退出。请重启主机服务后核对历史。");
          return;
        }
        if (event.params.threadId !== selectedRef.current) return;
        if (
          event.method === "item/agentMessage/delta" ||
          event.method === "item/commandExecution/outputDelta"
        ) {
          setSnapshot((old) => {
            if (!old) return old;
            const turns = structuredClone(old.thread.turns);
            let turn = turns.find((t) => t.id === event.params.turnId);
            if (!turn) {
              turn = {
                id: event.params.turnId,
                status: "inProgress",
                items: [],
              };
              turns.push(turn);
            }
            let item = turn.items.find((i) => i.id === event.params.itemId);
            if (!item) {
              item = {
                id: event.params.itemId,
                type: event.method.includes("agentMessage")
                  ? "agentMessage"
                  : "commandExecution",
                text: "",
                aggregatedOutput: "",
              };
              turn.items.push(item);
            }
            const field = event.method.includes("agentMessage")
              ? "text"
              : "aggregatedOutput";
            item[field] = (item[field] ?? "") + event.params.delta;
            return { ...old, active: true, thread: { ...old.thread, turns } };
          });
        } else if (event.method === "bridge/unsupported")
          setNotice("任务请求了当前原型尚不支持的交互，主机已返回错误。");
        else refresh();
      });
      stream.onerror = () => {
        stream?.close();
        setNetwork("offline");
        loadHost().catch(report); // distinguish expired/revoked credentials from a dropped stream
        if (!stopped) timer = setTimeout(connect, 2500);
      };
    }
    connect();
    return () => {
      stopped = true;
      stream?.close();
      clearTimeout(timer);
      clearTimeout(refreshTimer);
    };
  }, [paired, loadHost, loadThread, loadList, report]);

  const currentProject = host?.projects.find((p) => p.id === project);
  const currentThread = snapshot?.thread;
  const activeTurn = currentThread?.turns.findLast(
    (t) => t.status === "inProgress",
  );
  const active = snapshot?.active || !!activeTurn;
  const title =
    currentThread?.name || currentThread?.preview || "新的可能，从这里开始";
  const canSend =
    !!snapshot?.attached &&
    !active &&
    !busy &&
    network === "online" &&
    !!host?.online;
  async function createThread() {
    await work(async () => {
      const { thread } = await api<{ thread: Thread }>("/threads", "POST", {
        projectId: project,
        requestId: requestId(),
      });
      await loadList(project);
      setSelected(thread.id);
      setSidebar(false);
    });
  }
  async function send() {
    if (!draft.trim() || !canSend) return;
    const text = draft;
    if (
      !pendingSubmission.current ||
      pendingSubmission.current.threadId !== selected ||
      pendingSubmission.current.text !== text
    )
      pendingSubmission.current = { threadId: selected, text, id: requestId() };
    const submissionId = pendingSubmission.current.id;
    await work(async () => {
      await api(`/threads/${selected}/turns`, "POST", {
        text,
        requestId: submissionId,
      });
      pendingSubmission.current = null;
      setDraft("");
      await loadThread(selected);
    });
  }

  if (paired !== true)
    return (
      <div className="pair-page">
        <div className="pair-art">
          <div className="brand">
            <span className="brand-mark">
              <Icon name="code" size={24} />
            </span>
            Codex <span>Go</span>
          </div>
          <div className="pair-pitch">
            <span className="eyebrow">YOUR WORKSPACE, WITH YOU</span>
            <h1>
              灵感在路上，
              <br />
              开发也可以。
            </h1>
            <p>
              连接自己的电脑，
              <br />
              继续未完成的想法。
            </p>
            <div className="orbit">
              <Icon name="code" size={100} />
            </div>
          </div>
          <span className="pair-foot">自己的 API · 自己的项目 · 随时接续</span>
        </div>
        <main className="pair-form">
          <span className="eyebrow">CONNECT YOUR HOST</span>
          <h2>让工作，随你而行</h2>
          <p className="muted">输入电脑端显示的配对码，连接你的开发环境。</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              work(async () => {
                await api("/pair", "POST", { code, name: deviceName });
                await loadHost();
                setError("");
              });
            }}
          >
            <label>
              设备名称
              <input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                required
                maxLength={40}
                autoComplete="off"
              />
            </label>
            <label>
              8 位配对码
              <input
                className="code-input"
                aria-label="8 位配对码"
                value={code}
                onChange={(e) =>
                  setCode(e.target.value.replace(/\D/g, "").slice(0, 8))
                }
                inputMode="numeric"
                pattern="[0-9]{8}"
                placeholder="0000 0000"
                required
                autoComplete="off"
              />
            </label>
            <button className="primary" disabled={busy || paired === undefined}>
              {busy
                ? "正在连接…"
                : paired === undefined
                  ? "检查连接…"
                  : "连接主机"}
              <Icon name="chevron" size={17} />
            </button>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="pair-note">
            <Icon name="shield" size={18} />
            <span>配对码在 5 分钟内有效。模型密钥由运行主机保管。</span>
          </div>
        </main>
      </div>
    );

  return (
    <div className="app-shell">
      {sidebar && (
        <button
          className="scrim"
          aria-label="关闭侧栏"
          onClick={() => setSidebar(false)}
        />
      )}
      <aside className={`sidebar ${sidebar ? "is-open" : ""}`}>
        <a className="brand" href="/">
          <span className="brand-mark">
            <Icon name="code" size={22} />
          </span>
          Codex <span>Go</span>
          <span className="alpha">PREVIEW</span>
        </a>
        <button
          className="host-card"
          onClick={() => {
            setModal("devices");
            api("/devices").then(setDevices).catch(report);
          }}
        >
          <span className="host-icon">
            <Icon name="monitor" />
          </span>
          <span>
            <strong>{host?.name}</strong>
            <small>
              <i
                className={
                  network === "online" && host?.online ? "dot" : "dot off"
                }
              />
              {network === "online" && host?.online
                ? "主机已连接"
                : "连接已断开"}
            </small>
          </span>
          <Icon name="chevron" size={14} />
        </button>
        <div className="side-label">
          工作空间{" "}
          <button aria-label="创建项目" onClick={() => setModal("project")}>
            <Icon name="plus" size={16} />
          </button>
        </div>
        <label className="project-select">
          <Icon name="folder" size={17} />
          <select
            aria-label="选择项目"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            {host?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <button
          className="new-thread"
          onClick={createThread}
          disabled={busy || !project}
        >
          <Icon name="plus" size={17} />
          新建对话<span>↗</span>
        </button>
        <div className="side-label history-label">
          最近对话
          <button
            aria-label="刷新会话"
            onClick={() => work(() => loadList(project))}
          >
            <Icon name="refresh" size={14} />
          </button>
        </div>
        <nav className="thread-list" aria-label="项目对话">
          {threads.map((t) => (
            <button
              key={t.id}
              className={`thread-link ${selected === t.id ? "selected" : ""}`}
              onClick={() => {
                setSelected(t.id);
                setSidebar(false);
              }}
            >
              <span className="thread-bullet" />
              <span>{t.name || t.preview || "新对话"}</span>
              <small>
                {new Date(t.updatedAt * 1000).toLocaleDateString("zh-CN", {
                  month: "numeric",
                  day: "numeric",
                })}
              </small>
            </button>
          ))}
          {!threads.length && (
            <p className="side-empty">
              这个工作空间还没有对话。
              <br />
              开始你的第一个想法。
            </p>
          )}
          {listCursor && (
            <button
              className="load-more"
              onClick={() => work(() => loadList(project, listCursor))}
            >
              加载更多对话
            </button>
          )}
        </nav>
        <div className="side-bottom">
          <span className="api-badge">
            <span className="dot" />
            API 已由主机配置
          </span>
          <small>
            {host?.provider || "默认服务商"}
            <br />
            {host?.model || "使用主机模型"}
          </small>
          <button
            onClick={() => {
              setModal("devices");
              api("/devices").then(setDevices).catch(report);
            }}
          >
            <Icon name="shield" size={15} />
            设备与连接
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              className="mobile-menu"
              aria-label="打开侧栏"
              onClick={() => setSidebar(true)}
            >
              <Icon name="menu" />
            </button>
            <Icon name="folder" size={17} />
            <span>{currentProject?.name || "工作空间"}</span>
            <Icon name="chevron" size={13} />
            <span className="breadcrumb-end">{selected ? "对话" : "概览"}</span>
          </div>
          <div className="top-actions">
            <span className="connection">
              <i className={network === "online" ? "dot" : "dot off"} />
              {network === "online" ? "实时连接" : "重连中"}
            </span>
            <button
              aria-label="刷新状态"
              onClick={() =>
                work(async () => {
                  await loadHost();
                  await loadList(project);
                  if (selected) await loadThread(selected);
                })
              }
            >
              <Icon name="refresh" size={17} />
            </button>
          </div>
        </header>
        {error && (
          <div className="alert error" role="alert">
            <span>{error}</span>
            <button aria-label="关闭错误" onClick={() => setError("")}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {notice && (
          <div className="alert notice">
            <span>{notice}</span>
            <button aria-label="关闭提示" onClick={() => setNotice("")}>
              <Icon name="close" size={16} />
            </button>
          </div>
        )}
        {!selected ? (
          <div className="welcome">
            <div className="welcome-inner">
              <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
              <div className="welcome-symbol">
                <Icon name="code" size={42} />
              </div>
              <h1>
                你的开发现场，
                <br />
                <span>现在就在手边。</span>
              </h1>
              <p>
                接上电脑里的思路，或者从一个新想法出发。
                <br />
                项目、上下文和工具，都在你的主机上。
              </p>
              <button
                className="primary start-button"
                onClick={createThread}
                disabled={busy || !project}
              >
                <Icon name="plus" size={18} />
                开始新对话
                <Icon name="chevron" size={16} />
              </button>
              <div className="welcome-cards">
                <div>
                  <span>01 / CONTINUE</span>
                  <h3>接续一个想法</h3>
                  <p>
                    从左侧选择已有对话，
                    <br />
                    带着原来的上下文继续。
                  </p>
                </div>
                <div>
                  <span>02 / BUILD</span>
                  <h3>开辟一片新空间</h3>
                  <p>
                    创建空项目，
                    <br />
                    让下一件作品从这里开始。
                  </p>
                  <button onClick={() => setModal("project")}>
                    创建项目 ↗
                  </button>
                </div>
              </div>
            </div>
            <div className="workspace-footer">
              <Icon name="monitor" size={14} />
              <span title={currentProject?.path}>{currentProject?.path}</span>
              <span className="footer-label">REMOTE WORKSPACE</span>
            </div>
          </div>
        ) : (
          <>
            <div className="conversation-head">
              <div>
                <span className="eyebrow">
                  {snapshot?.attached
                    ? "CONNECTED CONVERSATION"
                    : "SAVED CONVERSATION"}
                </span>
                <h2>{title}</h2>
                <small>
                  {currentThread?.model || host?.model} <span>·</span>{" "}
                  {currentThread?.modelProvider || host?.provider}
                </small>
              </div>
              <span className={`state-tag ${active ? "running" : ""}`}>
                {active ? "执行中" : snapshot?.attached ? "已接续" : "历史阅读"}
              </span>
            </div>
            <div className="messages" aria-live="polite">
              {snapshot?.nextCursor && (
                <button
                  className="history-more"
                  disabled={busy}
                  onClick={() =>
                    work(() => loadThread(selected, true, snapshot.nextCursor!))
                  }
                >
                  加载更早的记录
                </button>
              )}
              {!snapshot && <p className="muted loading">正在读取会话…</p>}
              {snapshot && !currentThread?.turns.length && (
                <div className="empty-chat">
                  <Icon name="code" size={32} />
                  <h3>说说你想做什么</h3>
                  <p>让一个想法，在这个工作空间落地。</p>
                </div>
              )}
              {currentThread?.turns.map((turn) => (
                <div className="turn" key={turn.id}>
                  {turn.items.map((item) => (
                    <Message key={item.id} item={item} />
                  ))}
                  {turn.error && (
                    <p className="error">
                      任务失败：{turn.error.message || "请检查模型服务。"}
                    </p>
                  )}
                  {turn.status === "interrupted" && (
                    <p className="muted">任务已停止</p>
                  )}
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {!!snapshot?.approvals.length && (
              <div className="approvals">
                {snapshot.approvals.map((a) => (
                  <div className="approval" key={a.id}>
                    <div>
                      <Icon name="shield" size={18} />
                      <strong>
                        {a.method.includes("commandExecution")
                          ? "执行操作需要确认"
                          : "文件修改需要确认"}
                      </strong>
                    </div>
                    <p>{a.params.reason || "请检查操作后决定是否允许。"}</p>
                    {a.params.command && <pre>{a.params.command}</pre>}
                    {a.params.cwd && <small>目录：{a.params.cwd}</small>}
                    {a.params.grantRoot && (
                      <small>请求写入：{a.params.grantRoot}</small>
                    )}
                    <div className="approval-buttons">
                      <button
                        disabled={busy}
                        onClick={() =>
                          work(async () => {
                            await api(`/approvals/${a.id}`, "POST", {
                              decision: "decline",
                            });
                            await loadThread(selected);
                          })
                        }
                      >
                        拒绝
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={() =>
                          work(async () => {
                            await api(`/approvals/${a.id}`, "POST", {
                              decision: "accept",
                            });
                            await loadThread(selected);
                          })
                        }
                      >
                        <Icon name="check" size={16} />
                        允许本次
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {snapshot && !snapshot.attached ? (
              <div className="resume-bar">
                <div>
                  <strong>继续这段对话</strong>
                  <p>保留原会话和工作目录。请先让电脑端停止操作。</p>
                </div>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => setModal("resume")}
                >
                  接续对话
                  <Icon name="chevron" size={16} />
                </button>
              </div>
            ) : (
              <form
                className="composer-area"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <div className="composer">
                  <textarea
                    aria-label="开发指令"
                    placeholder="描述需求，或者继续你的想法…"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={2}
                    disabled={!canSend}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <div className="composer-tools">
                    <span>
                      <Icon name="folder" size={14} />
                      {currentProject?.name}
                    </span>
                    {active ? (
                      <button
                        className="stop-button"
                        type="button"
                        disabled={busy || !activeTurn}
                        onClick={() =>
                          work(async () => {
                            await api(
                              `/threads/${selected}/interrupt`,
                              "POST",
                              { turnId: activeTurn!.id },
                            );
                            await loadThread(selected);
                          })
                        }
                      >
                        <Icon name="stop" size={15} />
                        停止
                      </button>
                    ) : (
                      <button
                        className="send-button"
                        aria-label="发送指令"
                        disabled={!canSend || !draft.trim()}
                      >
                        <Icon name="arrow" size={19} />
                      </button>
                    )}
                  </div>
                </div>
                <div className="composer-caption">
                  <span>在你的主机上执行 · {currentThread?.cwd}</span>
                  <span>⌘ / Ctrl + Enter</span>
                </div>
              </form>
            )}
          </>
        )}
      </main>
      {modal && (
        <div
          className="modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "project"
                ? "创建项目"
                : modal === "resume"
                  ? "接续确认"
                  : "设备与连接"
            }
          >
            <button
              className="modal-close"
              aria-label="关闭弹窗"
              onClick={() => setModal(null)}
            >
              <Icon name="close" />
            </button>
            {modal === "project" ? (
              <>
                <span className="eyebrow">NEW WORKSPACE</span>
                <h2>给下一个想法一个家</h2>
                <p className="muted">在授权根目录创建一个空项目。</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    work(async () => {
                      const root = host!.projects[0];
                      const created = await api("/projects", "POST", {
                        parentId: root.id,
                        name: projectName,
                        requestId: requestId(),
                      });
                      const info = await loadHost();
                      if (info.projects.some((p) => p.id === created.id))
                        setProject(created.id);
                      setProjectName("");
                      setModal(null);
                    });
                  }}
                >
                  <label>
                    项目名称
                    <input
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      required
                      maxLength={64}
                      autoFocus
                      placeholder="my-next-idea"
                    />
                  </label>
                  <small className="muted">{host?.projects[0]?.path}</small>
                  <button className="primary" disabled={busy}>
                    创建项目
                    <Icon name="plus" size={16} />
                  </button>
                </form>
              </>
            ) : modal === "resume" ? (
              <>
                <span className="eyebrow">CONTINUE WHERE YOU LEFT OFF</span>
                <h2>准备好接续了吗？</h2>
                <p>请确认电脑端此会话已停止执行，并且不会同时发送指令。</p>
                <p className="muted">
                  当前连接服务使用独立的 Codex
                  进程，无法可靠判断或接管桌面进程中的活动任务。
                </p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    work(async () => {
                      await api(`/threads/${selected}/resume`, "POST", {
                        desktopIdleConfirmed: true,
                      });
                      await loadThread(selected);
                      setModal(null);
                    })
                  }
                >
                  已确认，接续对话
                  <Icon name="chevron" size={16} />
                </button>
              </>
            ) : (
              <>
                <span className="eyebrow">YOUR HOST</span>
                <h2>设备与连接</h2>
                <p className="muted">
                  {host?.name} · {host?.provider}
                </p>
                <div className="device-list">
                  {devices.map((d) => (
                    <div key={d.id}>
                      <Icon name="monitor" size={18} />
                      <span>
                        {d.name}
                        {d.id === host?.deviceId ? "（当前设备）" : ""}
                        <small>
                          {new Date(d.createdAt).toLocaleDateString()}
                        </small>
                      </span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          work(async () => {
                            await api(`/devices/${d.id}`, "DELETE");
                            if (d.id === host?.deviceId) {
                              setPaired(false);
                              setHost(undefined);
                              setSnapshot(undefined);
                              setThreads([]);
                              setSelected("");
                              setModal(null);
                            } else setDevices(await api("/devices"));
                          })
                        }
                      >
                        撤销
                      </button>
                    </div>
                  ))}
                </div>
                <p className="muted modal-note">
                  设备凭据 7 天后过期。重新配对需使用主机生成的新码。
                </p>
              </>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Message({ item }: { item: Item }) {
  if (item.type === "userMessage")
    return (
      <article className="message user">
        <span className="avatar">你</span>
        <div>
          <div className="message-label">你</div>
          <p>
            {(item.content ?? [])
              .map(
                (c: any) =>
                  c.text || (c.type?.includes("Image") ? "[图片]" : ""),
              )
              .join("\n")}
          </p>
        </div>
      </article>
    );
  if (item.type === "agentMessage")
    return (
      <article className="message assistant">
        <span className="avatar">
          <Icon name="code" size={16} />
        </span>
        <div>
          <div className="message-label">
            Codex <span>{item.phase === "commentary" ? "进展" : ""}</span>
          </div>
          <div className="prose">{item.text}</div>
        </div>
      </article>
    );
  if (item.type === "commandExecution")
    return (
      <details className="tool-item">
        <summary>
          <Icon name="code" size={15} />
          <span>{item.command || "执行命令"}</span>
          <small>
            {item.status === "completed"
              ? "完成"
              : item.status === "failed"
                ? "失败"
                : "执行中"}
          </small>
        </summary>
        <pre>{item.aggregatedOutput || "等待输出…"}</pre>
      </details>
    );
  if (item.type === "fileChange")
    return (
      <details className="tool-item">
        <summary>
          <Icon name="folder" size={15} />
          <span>文件修改 · {item.changes?.length ?? 0} 个文件</span>
        </summary>
        {item.changes?.map((c: any, i: number) => (
          <div key={i}>
            <strong>{c.path}</strong>
            <pre>{c.diff}</pre>
          </div>
        ))}
      </details>
    );
  if (item.type === "plan")
    return (
      <div className="plan">
        <span className="eyebrow">PLAN</span>
        <div className="prose">{item.text}</div>
      </div>
    );
  if (item.type === "reasoning") return null;
  return (
    <details className="tool-item">
      <summary>
        <Icon name="code" size={15} />
        <span>{item.tool || item.type}</span>
        <small>{item.status}</small>
      </summary>
      <pre>{JSON.stringify(item, null, 2)}</pre>
    </details>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
