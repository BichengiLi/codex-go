import path from "node:path";
import os from "node:os";
import { AppServer } from "./rpc.js";
import { Projects } from "./projects.js";
import { Pairing } from "./auth.js";
import { JsonStore } from "./storage.js";
import { CodexService } from "./service.js";
import { createServer } from "./server.js";
import type { Project, PermissionChoice } from "../shared/types.js";
import { encodeConnection } from "../shared/connection.js";

export async function startHost(options: {
  workspaces: string[];
  state: string;
  webRoot?: string;
  host?: string;
  port?: number;
  publicUrl?: string;
  command?: string;
  commandArgs?: string[];
  env?: NodeJS.ProcessEnv;
  androidLocal?: boolean;
  persistentDevices?: boolean;
}) {
  if (!options.workspaces.length) throw new Error("请选择项目目录。");
  const projects = new Projects();
  await projects.init(
    options.workspaces,
    await new JsonStore<Project[]>(
      path.join(options.state, "projects.json"),
      [],
    ).load(),
  );
  const env = { ...process.env, ...options.env };
  const args = [...(options.commandArgs ?? []), "app-server", "--listen", "stdio://"];
  if (env.CODEX_GO_BASE_URL) {
    const url = new URL(env.CODEX_GO_BASE_URL);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error("模型地址必须是无凭据的 HTTP(S) 地址。");
    if (!env.CODEX_GO_MODEL || !env.CODEX_GO_API_KEY)
      throw new Error("请填写模型服务地址、模型和 API Key。");
    for (const [key, value] of Object.entries({
      model_provider: "codex_go",
      model: env.CODEX_GO_MODEL,
      "model_providers.codex_go.name": "Codex Go provider",
      "model_providers.codex_go.base_url": url.toString(),
      "model_providers.codex_go.env_key": "CODEX_GO_API_KEY",
      "model_providers.codex_go.wire_api": "responses",
    }))
      args.push("-c", `${key}=${JSON.stringify(value)}`);
  }
  const rpc = new AppServer({
    cwd: projects.roots[0],
    command: options.command,
    args,
    env,
  });
  let app: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    await rpc.start();
    const pairing = new Pairing(
      await new JsonStore(path.join(options.state, "devices.json"), []).load(),
      Date.now,
      options.persistentDevices,
    );
    await pairing.preserveDevices();
    const service = new CodexService(
      rpc,
      projects,
      await new JsonStore(
        path.join(options.state, "submissions.json"),
        {},
      ).load(),
      await new JsonStore<Record<string, PermissionChoice>>(
        path.join(options.state, "permissions.json"),
        {},
      ).load(),
      options.androidLocal
        ? { mode: "danger-full-access", approval: "untrusted" }
        : undefined,
      options.androidLocal,
    );
    const host = options.host ?? "127.0.0.1";
    const origins: string[] = [];
    app = await createServer({
      service,
      pairing,
      origins,
      secure: !!options.publicUrl?.startsWith("https:"),
      webRoot: options.webRoot,
      privatePaths: [options.state],
    });
    const server = app;
    await app.listen({ host, port: options.port ?? 7331 });
    const port = (app.server.address() as { port: number }).port;
    const localUrl = `http://127.0.0.1:${port}`;
    origins.push(localUrl, `http://localhost:${port}`);
    const urls: string[] = [];
    if (["0.0.0.0", "::"].includes(host))
      for (const entries of Object.values(os.networkInterfaces()))
        for (const entry of entries ?? []) {
          if (
            entry.family === "IPv4" &&
            !entry.internal &&
            /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)
          ) {
            const url = `http://${entry.address}:${port}`;
            origins.push(url);
            urls.push(url);
          }
        }
    const addPublicUrl = (address: string) => {
      const url = new URL(address);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error("外网地址必须使用无路径和凭据的 HTTPS 地址。");
      if (!origins.includes(url.origin)) origins.push(url.origin);
      if (!urls.includes(url.origin)) urls.unshift(url.origin);
    };
    const removePublicUrl = (address: string) => {
      for (const list of [origins, urls]) {
        const index = list.indexOf(address);
        if (index >= 0) list.splice(index, 1);
      }
    };
    if (options.publicUrl) addPublicUrl(options.publicUrl);
    let code = pairing.issue(),
      expiresAt = Date.now() + 300_000;
    const connection = () =>
      encodeConnection({
        version: 1,
        name: os.hostname(),
        urls: urls.length ? urls.slice(0, 12) : [localUrl],
        code,
        expiresAt,
      });
    return {
      app: server,
      rpc,
      service,
      pairing,
      port,
      localUrl,
      origins,
      addPublicUrl,
      removePublicUrl,
      connection,
      get code() {
        return code;
      },
      get expiresAt() {
        return expiresAt;
      },
      refreshCode() {
        code = pairing.issue();
        expiresAt = Date.now() + 300_000;
        return connection();
      },
      async close() {
        await Promise.all([server.close(), rpc.close()]);
      },
    };
  } catch (error) {
    await app?.close();
    await rpc.close();
    throw error;
  }
}
