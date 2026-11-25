import { nativeRequest, nativeUpload } from "./native";
import {
  maxAttachments,
  maxUploadBytes,
  type Attachment,
} from "../shared/types";
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T = any>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    if (window.CodexNative) {
      const result = await nativeRequest("/api" + url, method, body);
      const data = JSON.parse(result.body);
      if (result.status < 200 || result.status >= 300)
        throw new ApiError(result.status, data.error ?? "连接失败。");
      return data;
    }
    response = await fetch("/api" + url, {
      method,
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      0,
      "与主机的连接中断。请求可能已到达，请刷新并核对任务历史。",
    );
  }
  const data = await response.json();
  if (!response.ok)
    throw new ApiError(response.status, data.error ?? "连接失败。");
  return data;
}
export function requestId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  // randomUUID requires a secure context; keep LAN development functional.
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 15) | 64;
  b[8] = (b[8] & 63) | 128;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
export async function uploadAttachments(
  threadId: string,
  remaining: number,
  files?: FileList,
): Promise<{ files: Attachment[]; error?: string }> {
  if (window.CodexNative) {
    const result = await nativeUpload(threadId, remaining);
    const data = JSON.parse(result.body);
    if (result.status !== 200)
      throw new ApiError(result.status, data.error || "上传失败。");
    return data;
  }
  const uploaded: Attachment[] = [];
  if (!files) return { files: uploaded };
  if (files.length > Math.min(remaining, maxAttachments))
    throw new ApiError(400, `每条消息最多添加 ${maxAttachments} 个附件。`);
  try {
    for (const file of Array.from(files)) {
      if (file.size > maxUploadBytes)
        throw new Error("单个附件最大支持 200 MB。");
      const response = await fetch(
        `/api/files/upload?${new URLSearchParams({ threadId, name: file.name })}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: file,
        },
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "上传失败。");
      uploaded.push(data);
    }
    return { files: uploaded };
  } catch (error) {
    return {
      files: uploaded,
      error: error instanceof Error ? error.message : "上传失败，请检查连接。",
    };
  }
}
