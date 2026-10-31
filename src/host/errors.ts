export class HttpError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function publicError(error: unknown): string {
  if (error instanceof HttpError) return error.message;
  if (error instanceof Error && error.name === "RpcError") {
    // Upstream errors can embed credentials or entire requests. Never return them verbatim.
    return "Codex 请求失败。请检查主机的模型配置、凭据及协议兼容性。";
  }
  return "主机操作失败，请检查 Codex 是否可用并刷新状态。";
}
