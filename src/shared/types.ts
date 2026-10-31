// Deliberately small UI projection of the pinned App Server v2 wire protocol.
// CLI-generated schemas under protocol/ are the authority for upstream fields.
export type Wire = Record<string, any>;
export type Item = Wire & { id: string; type: string };
export type Turn = {
  id: string;
  status: string;
  items: Item[];
  error?: Wire | null;
};
export type Thread = {
  id: string;
  cwd: string;
  name?: string | null;
  preview: string;
  modelProvider: string;
  model?: string | null;
  updatedAt: number;
  source?: unknown;
  status: { type: string };
  turns: Turn[];
};
export type Project = {
  id: string;
  name: string;
  path: string;
  source?: "desktop" | "local";
};
export type DesktopProject = {
  id: string;
  name: string;
  roots: { path: string }[];
};
export type PermissionChoice = {
  mode: "read-only" | "workspace-write" | "danger-full-access";
  approval: "untrusted" | "on-request" | "never";
};
export type EffectivePermissions = {
  approvalPolicy: string | Wire;
  sandbox: Wire;
  profile?: string | null;
};
export type PermissionProfile = {
  id: string;
  allowed: boolean;
  description?: string | null;
};
export type Approval = { id: string; method: string; params: Wire };
export type HostEvent = { seq: number; method: string; params: Wire };
export type HostInfo = {
  name: string;
  version: string;
  model: string | null;
  provider: string | null;
  online: boolean;
  projects: Project[];
  deviceId: string;
};
