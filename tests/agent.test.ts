import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { agentRequest, controlAddress } from "../src/desktop/control.js";
import { decodeConnection } from "../src/shared/connection.js";

test(
  "background host survives its launcher exit, authenticates control, renews consumed QR and revokes devices",
  { timeout: 30_000 },
  async (t) => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "codex-go-agent-"));
    const configFile = path.join(directory, "agent.json");
    const token = randomBytes(32).toString("hex");
    await writeFile(
      configFile,
      JSON.stringify({
        directory,
        token,
        resources: directory,
        workspace: path.join(directory, "workspace"),
        port: 0,
        internet: false,
        command: process.execPath,
        commandArgs: [path.resolve("tests/fixtures/app-server.mjs")],
      }),
    );
    const script = `import { spawn } from 'node:child_process';
    const child = spawn(process.execPath, ['--import', 'tsx', ${JSON.stringify(path.resolve("src/desktop/agent.ts"))}, ${JSON.stringify(configFile)}],
      { detached: true, stdio: 'ignore', windowsHide: true });
    process.stdout.write(String(child.pid)); child.unref();`;
    const launched = await promisify(execFile)(
      process.execPath,
      ["--input-type=module", "-e", script],
      { windowsHide: true },
    );
    const pid = Number(launched.stdout);
    const address = controlAddress(directory);
    const request = (action: string, value?: string) =>
      agentRequest(address, token, action, value);
    t.after(async () => {
      await request("stop").catch(() => {});
      try {
        process.kill(pid);
      } catch {}
    });
    let state: any;
    for (let i = 0; i < 100; i++) {
      try {
        state = await request("state");
        if (state.running && !state.busy) break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(state.running, true);
    assert.equal(state.pid, pid);
    assert.equal(state.online, true);
    await assert.rejects(agentRequest(address, "wrong-token", "stop"), /凭据/);
    const origin = state.urls.find((url: string) => url.includes("127.0.0.1"));
    const code = decodeConnection(state.code);
    const pair = await fetch(origin + "/api/pair", {
      method: "POST",
      headers: { Origin: origin, "Content-Type": "application/json" },
      body: JSON.stringify({ code: code.code, name: "fixture phone" }),
    });
    assert.equal(pair.status, 200);
    const cookie = pair.headers.get("set-cookie")!.split(";")[0];
    const device = (await pair.json()) as { id: string };
    const devices = await fetch(origin + "/api/devices", {
      headers: { cookie },
    });
    assert.equal(devices.status, 200);
    await devices.json();
    for (let i = 0; i < 25; i++) {
      state = await request("state");
      if (state.code && decodeConnection(state.code).code !== code.code) break;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.notEqual(decodeConnection(state.code).code, code.code);
    assert.equal(
      state.devices.find((d: any) => d.id === device.id).expiresAt,
      null,
    );
    await request("revoke", device.id);
    const revoked = await fetch(origin + "/api/devices", {
      headers: { cookie },
    });
    assert.equal(revoked.status, 401);
    await revoked.json();
    await request("stop");
    assert.equal((await request("state")).running, false);
    await request("start");
    assert.equal((await request("state")).running, true);
  },
);
