import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { agentRequest, controlAddress } from "../src/desktop/control.js";
import type { Project } from "../src/shared/types.js";
import appPackage from "../package.json" with { type: "json" };

function run(command: string, ...args: string[]) {
  return execFileSync(command, args, { encoding: "utf8", timeout: 90_000 }).trim();
}

type AgentState = {
  pid: number;
  running: boolean;
  online: boolean;
  busy: boolean;
  error: string;
};

async function verifyHost(executable: string, directory: string) {
  const userData = path.join(directory, "state");
  const workspace = path.join(directory, "workspace");
  const codexHome = path.join(directory, "codex");
  await Promise.all([userData, codexHome].map((folder) => mkdir(folder)));
  await writeFile(path.join(userData, "settings.json"), JSON.stringify({ workspace }));
  const control = controlAddress(userData);
  let token = "";
  let agent: AgentState | undefined;
  const request = <T>(action: string) => agentRequest<T>(control, token, action);
  const gui = spawn(executable, [`--user-data-dir=${userData}`], {
    env: { ...process.env, CODEX_HOME: codexHome },
    stdio: ["ignore", "ignore", "inherit"],
  });
  let guiError: Error | undefined;
  let lastConnectionError = "";
  const closed = once(gui, "close").catch((error: Error) => { guiError = error; });
  try {
    for (let attempt = 0; attempt < 150; attempt++) {
      if (gui.exitCode !== null || gui.signalCode !== null) break;
      try {
        token ||= JSON.parse(await readFile(path.join(userData, "agent.json"), "utf8")).token;
        agent = await request<AgentState>("state");
        if (agent.online && !agent.busy) break;
      } catch (error) {
        lastConnectionError = error instanceof Error ? error.message : String(error);
      }
      await delay(200);
    }
    if (guiError) throw guiError;
    assert.ok(
      agent?.online && !agent.busy,
      `The packaged GUI did not start an online Codex host. ${agent?.error || lastConnectionError}`,
    );

    gui.kill();
    await closed;
    const remaining = await request<AgentState>("state");
    assert.equal(remaining.pid, agent.pid);
    assert.ok(remaining.running && remaining.online);

    const { url, token: desktopToken } = await request<{ url: string; token: string }>("chat");
    const cookie = `codex_go_device=${desktopToken}`;
    const local = await fetch(url + "/api/host", {
      headers: { cookie },
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(local.status, 200);
    const host = await local.json() as { projects: Project[] };
    const root = await realpath(workspace);
    const project = host.projects.find((candidate) => candidate.path === root);
    assert.ok(project, "The packaged host did not expose its configured project directory");
    const created = await fetch(url + "/api/projects", {
      method: "POST",
      headers: { cookie, origin: url, "content-type": "application/json" },
      body: JSON.stringify({ parentId: project.id, name: "macos-build-check", requestId: randomUUID() }),
      signal: AbortSignal.timeout(10_000),
    });
    assert.equal(created.status, 200);
    await created.json();
    assert.ok((await stat(path.join(root, "macos-build-check"))).isDirectory());
    console.log("Packaged GUI launched Codex; its background host kept serving the project after GUI exit.");
  } finally {
    gui.kill();
    await closed;
    if (agent) {
      await request("stop").catch(() => {});
      try { process.kill(agent.pid); } catch {}
    }
  }
}

const [image] = process.argv.slice(2);
assert.ok(process.platform === "darwin" && image, "Usage on macOS: npx tsx tools/verify-macos.ts <dmg>");
assert.equal(path.basename(image), `Codex-Go-${appPackage.version}-macOS-${process.arch}.dmg`);
const directory = await mkdtemp(path.join(os.tmpdir(), "codex-go-macos-"));
const mount = path.join(directory, "image");
const app = path.join(directory, "Codex Go.app");
try {
  console.log(run("hdiutil", "verify", image));
  await mkdir(mount);
  run("hdiutil", "attach", image, "-readonly", "-nobrowse", "-mountpoint", mount);
  try {
    run("ditto", path.join(mount, "Codex Go.app"), app);
  } finally {
    run("hdiutil", "detach", mount);
  }

  assert.equal(run("/usr/libexec/PlistBuddy", "-c", "Print :CFBundleShortVersionString", path.join(app, "Contents/Info.plist")), appPackage.version);
  run("codesign", "--verify", "--deep", "--strict", app);
  const executable = path.join(app, "Contents/MacOS/Codex Go");
  const codex = path.join(app, "Contents/Resources/codex/bin/codex");
  const tunnel = path.join(app, "Contents/Resources/cloudflared");
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  for (const binary of [executable, codex, tunnel])
    assert.equal(run("lipo", "-archs", binary), arch);
  console.log(run(codex, "--version"));
  console.log(run(tunnel, "--version"));
  await verifyHost(executable, directory);
} finally {
  await rm(directory, { recursive: true, force: true });
}
