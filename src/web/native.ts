// The bridge exists only in the APK's bundled, trusted UI. Credentials stay native.
type Bridge = {
  useEventPolling(): boolean;
  request(id: string, path: string, method: string, body: string): void;
  subscribe(id: string, path: string): void;
  unsubscribe(id: string): void;
  download(path: string): void;
  upload(id: string, threadId: string, remaining: number): void;
  home(): void;
  openLink(address: string): void;
};
declare global {
  interface Window {
    CodexNative?: Bridge;
    codexGoResult?: (id: string, status: number, body: string) => void;
    codexGoEvent?: (id: string, type: string, data: string) => void;
  }
}
let next = 0;
const pending = new Map<string, (status: number, body: string) => void>();
const streams = new Map<string, NativeStream>();
window.codexGoResult = (id, status, body) => pending.get(id)?.(status, body);
window.codexGoEvent = (id, type, data) => {
  const stream = streams.get(id);
  if (!stream) return;
  if (type === "error") stream.onerror?.(new Event("error"));
  else stream.dispatchEvent(new MessageEvent(type, { data }));
};
export function nativeRequest(path: string, method: string, body?: unknown) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const id = String(++next);
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("主机响应超时。"));
    }, 50_000);
    pending.set(id, (status, text) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ status, body: text });
    });
    window.CodexNative!.request(
      id,
      path,
      method,
      body === undefined ? "" : JSON.stringify(body),
    );
  });
}
export function nativeUpload(threadId: string, remaining: number) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const id = String(++next);
    // Includes time spent in the system document picker and transferring files.
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error("附件上传超时，请检查项目文件后重试。"));
    }, 15 * 60_000);
    pending.set(id, (status, body) => {
      clearTimeout(timer);
      pending.delete(id);
      resolve({ status, body });
    });
    window.CodexNative!.upload(id, threadId, remaining);
  });
}
class NativeStream extends EventTarget {
  onerror: ((event: Event) => unknown) | null = null;
  private id = String(++next);
  constructor(path: string) {
    super();
    streams.set(this.id, this);
    window.CodexNative!.subscribe(this.id, path);
  }
  close() {
    streams.delete(this.id);
    window.CodexNative!.unsubscribe(this.id);
  }
}
class PollingStream extends EventTarget {
  onerror: ((event: Event) => unknown) | null = null;
  private stopped = false;
  private timer?: ReturnType<typeof setTimeout>;
  private abort = new AbortController();
  private query: URLSearchParams;
  private first = true;
  constructor(path: string) {
    super();
    this.query = new URL(path, window.location.href).searchParams;
    void this.poll();
  }
  private async poll() {
    try {
      const path = `/api/event-poll?${this.query}`;
      let status: number, body: string;
      if (window.CodexNative)
        ({ status, body } = await nativeRequest(path, "GET"));
      else {
        const response = await fetch(path, { signal: this.abort.signal });
        status = response.status;
        body = await response.text();
      }
      if (this.stopped) return;
      if (status !== 200) throw new Error("Event polling failed");
      const replay = JSON.parse(body);
      if (this.first || replay.gap) {
        this.dispatchEvent(
          new MessageEvent("sync", {
            data: JSON.stringify({
              epoch: replay.epoch,
              seq: replay.seq,
              gap: replay.gap,
            }),
          }),
        );
      }
      this.first = false;
      for (const event of replay.events) {
        if (this.stopped) return;
        this.dispatchEvent(
          new MessageEvent("codex", { data: JSON.stringify(event) }),
        );
      }
      this.query.set("after", String(replay.seq));
      this.query.set("epoch", replay.epoch);
      if (!this.stopped) this.timer = setTimeout(() => void this.poll(), 1000);
    } catch {
      if (!this.stopped) this.onerror?.(new Event("error"));
    }
  }
  close() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.abort.abort();
  }
}
export const eventStream = (
  path: string,
): EventSource | NativeStream | PollingStream => {
  if (
    window.CodexNative?.useEventPolling() ||
    window.location.hostname.endsWith(".trycloudflare.com")
  )
    return new PollingStream(path);
  return window.CodexNative ? new NativeStream(path) : new EventSource(path);
};
if (window.CodexNative) {
  document.addEventListener("click", (event) => {
    const anchor = (event.target as Element).closest?.("a");
    if (!anchor) return;
    const url = new URL(anchor.href);
    if (url.pathname === "/api/files/download") {
      event.preventDefault();
      window.CodexNative!.download(url.pathname + url.search);
    } else if (url.protocol === "https:" || url.protocol === "http:") {
      event.preventDefault();
      if (url.hostname !== "codex-go.local")
        window.CodexNative!.openLink(url.href);
    }
  });
}
