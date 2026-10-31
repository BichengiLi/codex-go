import { createHash } from "node:crypto";
import { mkdir, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { HttpError } from "./errors.js";
import type { Project } from "../shared/types.js";

const inside = (root: string, target: string) => {
  const rel = path.relative(root, target);
  return (
    rel === "" ||
    (!rel.startsWith(".." + path.sep) && rel !== ".." && !path.isAbsolute(rel))
  );
};
export class Projects {
  roots: string[] = [];
  async init(roots: string[]) {
    this.roots = await Promise.all(roots.map((r) => realpath(r)));
    for (const root of this.roots)
      if (!(await stat(root)).isDirectory())
        throw new Error("授权目录必须是目录。");
  }
  async authorize(target: string) {
    const resolved = await realpath(target).catch(() => {
      throw new HttpError(404, "工作目录不存在。");
    });
    if (!this.roots.some((root) => inside(root, resolved)))
      throw new HttpError(403, "工作目录不在授权范围内。");
    if (!(await stat(resolved)).isDirectory())
      throw new HttpError(400, "项目路径必须是目录。");
    return resolved;
  }
  describe(target: string): Project {
    return {
      id: createHash("sha256").update(target).digest("hex").slice(0, 16),
      name: path.basename(target),
      path: target,
    };
  }
  async list() {
    const targets = new Set(this.roots);
    for (const root of this.roots)
      for (const entry of await readdir(root, { withFileTypes: true })) {
        if (
          entry.name.startsWith(".") ||
          ["node_modules", "dist", "build"].includes(entry.name)
        )
          continue;
        if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
        try {
          targets.add(await this.authorize(path.join(root, entry.name)));
        } catch {
          /* inaccessible or escaping link */
        }
      }
    return [...targets].map((p) => this.describe(p));
  }
  async resolve(id: string) {
    const project = (await this.list()).find((p) => p.id === id);
    if (!project) throw new HttpError(404, "项目不存在。");
    return this.authorize(project.path);
  }
  async create(parentId: string, name: string) {
    if (
      !/^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(name) ||
      /[. ]$/.test(name) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
    )
      throw new HttpError(
        400,
        "项目名请使用 1–64 个文字、数字、点、下划线或短横线。",
      );
    const parent = await this.resolve(parentId);
    if (!this.roots.includes(parent))
      throw new HttpError(400, "请在授权根目录中创建项目。");
    const target = path.join(parent, name);
    try {
      await mkdir(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST")
        throw new HttpError(409, "项目已存在。");
      throw error;
    }
    return this.describe(await this.authorize(target));
  }
}
