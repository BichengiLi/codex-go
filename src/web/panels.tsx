import React, { useEffect, useState } from "react";
import { api } from "./api";
import type {
  DesktopProject,
  EffectivePermissions,
  PermissionChoice,
  PermissionProfile,
  Project,
} from "../shared/types";

const errorText = (e: unknown) =>
  e instanceof Error ? e.message : "操作失败。";
export const permissionLabel = (p?: EffectivePermissions | null) =>
  !p
    ? "接续后可设置"
    : `${({ readOnly: "只读", workspaceWrite: "项目内读写", dangerFullAccess: "完全访问", externalSandbox: "外部沙箱" } as Record<string, string>)[p.sandbox.type] ?? "自定义权限"} · ${{ untrusted: "严格审批", "on-request": "按需审批", never: "不询问" }[String(p.approvalPolicy)] ?? "自定义审批"}`;

export function DesktopProjects({
  onSelect,
}: {
  onSelect: (p: Project) => Promise<void>;
}) {
  const [projects, setProjects] = useState<DesktopProject[]>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<{ data: DesktopProject[] }>("/projects/desktop")
      .then((r) => setProjects(r.data))
      .catch((e) => setError(errorText(e)));
  }, []);
  return (
    <>
      <span className="eyebrow">FROM YOUR DESKTOP</span>
      <h2>Codex App 项目</h2>
      <p className="muted">选择电脑上已有的项目，查看并接续它的对话。</p>
      {!projects && !error && <p>正在读取电脑项目…</p>}
      {projects?.length === 0 && <p>当前 Codex 配置下没有保存的本地项目。</p>}
      <div className="catalog-list">
        {projects?.flatMap((p) =>
          p.roots.map((root, index) => (
            <button
              key={`${p.id}-${index}`}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError("");
                try {
                  const selected = await api<Project>(
                    "/projects/import",
                    "POST",
                    { desktopId: p.id, rootIndex: index },
                  );
                  await onSelect(selected);
                } catch (e) {
                  setError(errorText(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <strong>
                {p.name}
                {p.roots.length > 1 ? ` · ${index + 1}` : ""}
              </strong>
              <small>{root.path}</small>
              <span>选择项目 ↗</span>
            </button>
          )),
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export const fileUrl = (projectId: string, file: string) =>
  `/api/files/download?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(file)}`;
function localPath(target: string, cwd: string): string | null {
  let file = target.replace(/^<|>$/g, "");
  try {
    file = decodeURIComponent(file);
  } catch {
    return null;
  }
  if (
    /^(?:https?:|mailto:|#|javascript:|data:|codex:|app:|thread:)/i.test(file)
  )
    return null;
  if (file.startsWith("sandbox:")) file = file.slice(8);
  if (file.startsWith("file://")) file = file.replace(/^file:\/\/\/?/i, "");
  file = file.replace(/:\d+(?:-\d+)?$/, "").replace(/#L\d+(?:-L?\d+)?$/, "");
  if (/^[a-z][a-z\d+.-]*:/i.test(file) && !/^[a-z]:[\\/]/i.test(file))
    return null;
  return /^(?:[a-z]:[\\/]|\/)/i.test(file) ? file : `${cwd}/${file}`;
}
export function AssistantText({
  text,
  projectId,
  cwd,
}: {
  text: string;
  projectId: string;
  cwd: string;
}) {
  const parts: React.ReactNode[] = [];
  const links = /\[([^\]\n]+)\]\((<[^>\n]+>|[^)\n]+)\)/g;
  let end = 0;
  for (const match of text.matchAll(links)) {
    parts.push(text.slice(end, match.index));
    const file = localPath(match[2], cwd);
    const web = /^https?:\/\//i.test(match[2]);
    parts.push(
      file ? (
        <a
          className="file-link"
          key={match.index}
          href={fileUrl(projectId, file)}
          download
          target="_blank"
          rel="noreferrer"
        >
          ↓ {match[1]}
        </a>
      ) : web ? (
        <a key={match.index} href={match[2]} target="_blank" rel="noreferrer">
          {match[1]}
        </a>
      ) : (
        match[0]
      ),
    );
    end = match.index! + match[0].length;
  }
  parts.push(text.slice(end));
  return <div className="prose">{parts}</div>;
}
export function FileLink({
  projectId,
  file,
  cwd,
}: {
  projectId: string;
  file: string;
  cwd: string;
}) {
  const target = localPath(file, cwd);
  return target ? (
    <a
      className="file-link"
      href={fileUrl(projectId, target)}
      download
      target="_blank"
      rel="noreferrer"
    >
      ↓ 下载 {file.split(/[\\/]/).at(-1)}
    </a>
  ) : null;
}

type FileList = {
  path: string;
  entries: { name: string; path: string; directory: boolean; size: number }[];
  truncated: boolean;
};
export function FileBrowser({ projectId }: { projectId: string }) {
  const [listing, setListing] = useState<FileList>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load(file: string) {
    setBusy(true);
    setError("");
    try {
      setListing(
        await api<FileList>(
          `/files?projectId=${encodeURIComponent(projectId)}&path=${encodeURIComponent(file)}`,
        ),
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    load("");
  }, [projectId]);
  return (
    <>
      <span className="eyebrow">PROJECT FILES</span>
      <h2>项目文件</h2>
      <p className="muted">
        打开文件夹，或下载 Codex 生成的文件。单个文件最多 200 MB。
      </p>
      <div className="file-toolbar">
        <button
          disabled={busy || !listing?.path}
          onClick={() =>
            load(listing!.path.split(/[\\/]/).slice(0, -1).join("/"))
          }
        >
          ← 上一级
        </button>
        <button disabled={busy} onClick={() => load(listing?.path ?? "")}>
          刷新
        </button>
      </div>
      <code className="file-location">/{listing?.path}</code>
      {busy && <p className="muted">读取文件…</p>}
      <div className="file-list">
        {listing?.entries.map((file) =>
          file.directory ? (
            <button
              key={file.path}
              disabled={busy}
              onClick={() => load(file.path)}
            >
              <span>▸ {file.name}</span>
              <small>文件夹</small>
            </button>
          ) : (
            <a
              key={file.path}
              href={fileUrl(projectId, file.path)}
              download
              target="_blank"
              rel="noreferrer"
            >
              <span>↓ {file.name}</span>
              <small>
                {file.size < 1024
                  ? `${file.size} B`
                  : `${(file.size / 1024).toFixed(1)} KB`}
              </small>
            </a>
          ),
        )}
      </div>
      {listing && !listing.entries.length && (
        <p className="muted">这个目录还没有可下载的文件。</p>
      )}
      {listing?.truncated && (
        <p className="muted">当前目录只显示前 2000 项，请进入子目录查找。</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}

export function Permissions({
  threadId,
  effective,
  onSave,
}: {
  threadId: string;
  effective: EffectivePermissions | null;
  onSave: () => Promise<void>;
}) {
  const [mode, setMode] = useState<PermissionChoice["mode"]>(
    effective?.sandbox.type === "readOnly"
      ? "read-only"
      : effective?.sandbox.type === "dangerFullAccess"
        ? "danger-full-access"
        : "workspace-write",
  );
  const [approval, setApproval] = useState<PermissionChoice["approval"]>(
    ["untrusted", "on-request", "never"].includes(
      String(effective?.approvalPolicy),
    )
      ? (effective!.approvalPolicy as PermissionChoice["approval"])
      : "untrusted",
  );
  const [profiles, setProfiles] = useState<PermissionProfile[]>();
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    api<{ data: PermissionProfile[]; note?: string }>(
      `/threads/${threadId}/permissions`,
    )
      .then((r) => {
        setProfiles(r.data);
        setNote(r.note ?? "");
      })
      .catch((e) => setError(errorText(e)));
  }, [threadId]);
  return (
    <>
      <span className="eyebrow">CHAT PERMISSIONS</span>
      <h2>权限与审批</h2>
      {note && <p className="muted">{note}</p>}
      <p className="muted">
        当前生效：{permissionLabel(effective)}。修改用于此对话接下来的任务。
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(`/threads/${threadId}/permissions`, "POST", {
              mode,
              approval,
              fullAccessConfirmed: confirmed,
            });
            await onSave();
          } catch (e) {
            setError(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          文件与网络权限
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as PermissionChoice["mode"]);
              setConfirmed(false);
            }}
          >
            {(
              [
                ["read-only", ":read-only", "只读"],
                ["workspace-write", ":workspace", "项目内读写"],
                ["danger-full-access", ":danger-full-access", "完全访问"],
              ] as const
            ).map(([value, id, label]) => (
              <option
                key={value}
                value={value}
                disabled={!profiles?.some((p) => p.id === id && p.allowed)}
              >
                {label}
                {profiles && !profiles.some((p) => p.id === id && p.allowed)
                  ? "（主机不允许）"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="muted">
          {mode === "read-only"
            ? "可读取文件；写入和联网需要额外授权。"
            : mode === "workspace-write"
              ? "可修改当前项目；访问外部路径或网络时可能请求审批。"
              : "可以访问主机上的文件和网络，执行操作不受项目沙箱限制。"}
        </p>
        <label>
          批准策略
          <select
            value={approval}
            onChange={(e) =>
              setApproval(e.target.value as PermissionChoice["approval"])
            }
          >
            <option value="untrusted">严格审批：不受信任的操作先询问</option>
            <option value="on-request">按需审批：由 Codex 请求批准</option>
            <option value="never">不询问：权限不足时直接失败</option>
          </select>
        </label>
        {mode === "danger-full-access" && (
          <label className="confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              required
            />
            我允许此对话完全访问运行主机
          </label>
        )}
        <button
          className="primary"
          disabled={
            busy || !profiles || (mode === "danger-full-access" && !confirmed)
          }
        >
          {busy ? "正在确认主机设置…" : "应用到此对话"}
        </button>
      </form>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
