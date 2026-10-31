import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const command = process.env.CODEX_BIN ?? "codex";
const temp = path.resolve(".local/protocol");
await mkdir(temp, { recursive: true });
const version = execFileSync(command, ["--version"], {
  encoding: "utf8",
  windowsHide: true,
}).trim();
execFileSync(
  command,
  ["app-server", "generate-json-schema", "--experimental", "--out", temp],
  {
    windowsHide: true,
  },
);
const wanted = [
  "ThreadStartParams",
  "ThreadResumeParams",
  "ThreadReadParams",
  "ThreadListParams",
  "ThreadTurnsListParams",
  "TurnStartParams",
  "TurnInterruptParams",
  "ProjectListParams",
  "ProjectListResponse",
  "ThreadSettingsUpdateParams",
  "ThreadSettingsUpdatedNotification",
  "PermissionProfileListParams",
  "PermissionProfileListResponse",
];
await mkdir("protocol/v2", { recursive: true });
for (const name of wanted)
  await writeFile(
    `protocol/v2/${name}.json`,
    await readFile(path.join(temp, "v2", `${name}.json`)),
  );
for (const name of [
  "CommandExecutionRequestApprovalParams",
  "CommandExecutionRequestApprovalResponse",
  "FileChangeRequestApprovalParams",
  "FileChangeRequestApprovalResponse",
])
  await writeFile(
    `protocol/${name}.json`,
    await readFile(path.join(temp, `${name}.json`)),
  );
await writeFile(
  "protocol/version.json",
  JSON.stringify(
    {
      version,
      generatedBy: "codex app-server generate-json-schema --experimental",
      contract: "v2",
      notes:
        "Committed subset includes experimental desktop projects and permission settings. Full schemas can be regenerated locally.",
    },
    null,
    2,
  ) + "\n",
);
console.log(`Saved protocol subset: ${version}`);
