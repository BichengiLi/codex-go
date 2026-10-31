import { parseArgs } from "node:util";
import path from "node:path";
import { AppServer } from "./rpc.js";
import { Projects } from "./projects.js";
import { Pairing } from "./auth.js";
import { JsonStore } from "./storage.js";
import { CodexService } from "./service.js";
import { createServer } from "./server.js";

const { values } = parseArgs({
  options: {
    workspace: { type: "string", multiple: true },
    host: { type: "string", default: "127.0.0.1" },
    port: { type: "string", default: "7331" },
    "public-url": { type: "string" },
    "state-dir": { type: "string", default: ".runtime" },
    "insecure-lan": { type: "boolean", default: false },
  },
});
const roots = values.workspace?.map((p) => path.resolve(p));
if (!roots?.length) {
  console.error('请明确授权项目目录：npm start -- --workspace "D:\\Projects"');
  process.exit(1);
}
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("端口必须为 1–65535。");
const local = ["127.0.0.1", "localhost", "::1"].includes(values.host!);
const publicUrl = values["public-url"]
  ? new URL(values["public-url"]).origin
  : undefined;
if (!local && !publicUrl?.startsWith("https://") && !values["insecure-lan"])
  throw new Error(
    "远程访问需要 --public-url https://…；临时局域网测试需显式 --insecure-lan。",
  );
const origin = `http://${values.host === "::1" ? "[::1]" : values.host}:${port}`;
const origins = [
  origin,
  `http://localhost:${port}`,
  ...(publicUrl ? [publicUrl] : []),
];
const state = path.resolve(values["state-dir"]!);
const projects = new Projects();
await projects.init(roots);
const rpcEnv = { ...process.env };
const args = ["app-server", "--listen", "stdio://"];
if (process.env.CODEX_GO_BASE_URL) {
  const url = new URL(process.env.CODEX_GO_BASE_URL);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error("模型地址必须是无凭据的 HTTP(S) 地址。");
  if (!process.env.CODEX_GO_API_KEY || !process.env.CODEX_GO_MODEL)
    throw new Error("自定义服务需要 CODEX_GO_API_KEY 和 CODEX_GO_MODEL。");
  for (const [key, value] of Object.entries({
    model_provider: "codex_go",
    model: process.env.CODEX_GO_MODEL,
    "model_providers.codex_go.name": "Codex Go provider",
    "model_providers.codex_go.base_url": url.toString(),
    "model_providers.codex_go.env_key": "CODEX_GO_API_KEY",
    "model_providers.codex_go.wire_api": "responses",
  }))
    args.push("-c", `${key}=${JSON.stringify(value)}`);
}
const rpc = new AppServer({ cwd: projects.roots[0], args, env: rpcEnv });
try {
  await rpc.start();
} catch {
  rpc.close();
  console.error(
    "无法启动 Codex App Server。请检查 CODEX_BIN、版本和主机配置。",
  );
  process.exit(1);
}
const pairing = new Pairing(
  await new JsonStore(path.join(state, "devices.json"), []).load(),
);
const service = new CodexService(
  rpc,
  projects,
  await new JsonStore(path.join(state, "submissions.json"), {}).load(),
);
const app = await createServer({
  service,
  pairing,
  origins,
  secure: !!publicUrl?.startsWith("https://"),
  webRoot: path.resolve("dist/web"),
});
try {
  await app.listen({ host: values.host, port });
  console.log(
    `\nCodex Go · ${publicUrl ?? origin}\n配对码：${pairing.issue()}（5 分钟内有效，单次使用）\n授权目录：${projects.roots.join(", ")}\n保持此进程运行；Ctrl+C 停止服务。\n`,
  );
} catch {
  rpc.close();
  console.error("监听失败，请检查地址和端口。");
  process.exit(1);
}
let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await app.close();
  await rpc.close();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
