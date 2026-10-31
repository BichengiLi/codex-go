import { z } from "zod";
export const connectionSchema = z.object({
  version: z.literal(1),
  name: z.string().min(1).max(100),
  urls: z.array(z.string().url()).min(1).max(12),
  code: z.string().regex(/^\d{8}$/),
  expiresAt: z.number().int().positive(),
});
export type Connection = z.infer<typeof connectionSchema>;
export function validateConnection(
  value: unknown,
  now = Date.now(),
): Connection {
  const c = connectionSchema.parse(value);
  if (c.expiresAt < now || c.expiresAt > now + 360_000)
    throw new Error("连接码已过期，请在电脑 App 中刷新。");
  for (const address of c.urls) {
    const u = new URL(address);
    const lan =
      /^(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
        u.hostname,
      );
    if (
      (u.protocol !== "https:" && !(u.protocol === "http:" && lan)) ||
      u.username ||
      u.password ||
      u.pathname !== "/" ||
      u.search ||
      u.hash
    )
      throw new Error("连接码中的地址无效。");
  }
  return c;
}
export function encodeConnection(c: Connection) {
  return (
    "CG1." +
    Buffer.from(JSON.stringify(validateConnection(c))).toString("base64url")
  );
}
export function decodeConnection(code: string, now = Date.now()) {
  if (!/^CG1\.[A-Za-z0-9_-]{1,2048}$/.test(code.trim()))
    throw new Error("请输入电脑 App 显示的完整连接码。");
  return validateConnection(
    JSON.parse(Buffer.from(code.trim().slice(4), "base64url").toString("utf8")),
    now,
  );
}
