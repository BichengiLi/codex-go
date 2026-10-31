import { startHost } from "./runtime.js";
async function main() {
  const runtime = await startHost({
    workspaces: [process.env.CODEX_GO_WORKSPACE ?? "/root/workspace"],
    state: process.env.CODEX_GO_STATE ?? "/root/.codex-go",
    webRoot: "/opt/codex-go/web",
    port: 0,
    androidLocal: true,
    command: process.env.CODEX_BIN ?? "/opt/codex/bin/codex",
  });
  console.log(
    JSON.stringify({
      type: "ready",
      url: runtime.localUrl,
      code: runtime.code,
    }),
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await runtime.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
main().catch(() => {
  console.error("手机开发环境启动失败，请检查运行环境与模型设置。");
  process.exit(1);
});
