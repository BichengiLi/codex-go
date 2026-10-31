import { open, readdir, realpath, stat } from "node:fs/promises";
import path from "node:path";
import { Projects, inside } from "./projects.js";
import { HttpError } from "./errors.js";

const privatePart = (part: string) =>
  /^(?:\.git|\.codex|\.runtime|\.ssh|\.aws|\.env(?:\..*)?|auth\.json|credentials(?:\.json)?|.*\.(?:pem|key))$/i.test(
    part,
  );
const privatePath = (file: string) => file.split(/[\\/]/).some(privatePart);

export class ProjectFiles {
  private excluded: Promise<string[]>;
  constructor(
    private projects: Projects,
    excluded: string[] = [],
  ) {
    this.excluded = Promise.all(
      excluded.map((p) => realpath(p).catch(() => path.resolve(p))),
    );
  }
  private async resolve(root: string, requested: string) {
    if (requested.includes("\0")) throw new HttpError(400, "文件路径无效。");
    const target = path.resolve(root, requested);
    const relative = path.relative(root, target);
    if (!inside(root, target) || relative.includes(":"))
      throw new HttpError(403, "文件不在当前项目中。");
    if (privatePath(target))
      throw new HttpError(403, "此路径包含私有配置，不能下载。");
    const resolved = await realpath(target).catch(() => {
      throw new HttpError(404, "文件不存在或已被移动。");
    });
    if (
      !inside(root, resolved) ||
      privatePath(resolved) ||
      (await this.excluded).some((p) => inside(p, resolved))
    )
      throw new HttpError(403, "文件不在可下载范围内。");
    return { root, resolved };
  }
  async list(projectId: string, requested: string) {
    const root = await this.projects.resolve(projectId);
    const { resolved } = await this.resolve(root, requested);
    if (!(await stat(resolved)).isDirectory())
      throw new HttpError(400, "请选择目录。");
    const children = await readdir(resolved, { withFileTypes: true });
    const entries = [];
    for (const child of children.slice(0, 2000)) {
      if (privatePart(child.name)) continue;
      try {
        const relative = path.relative(root, path.join(resolved, child.name));
        const safe = await this.resolve(root, relative);
        const info = await stat(safe.resolved);
        if (!info.isFile() && !info.isDirectory()) continue;
        entries.push({
          name: child.name,
          path: relative,
          directory: info.isDirectory(),
          size: info.size,
        });
      } catch {
        /* Omit inaccessible paths and links outside this project. */
      }
    }
    entries.sort(
      (a, b) =>
        Number(b.directory) - Number(a.directory) ||
        a.name.localeCompare(b.name),
    );
    return {
      path: path.relative(root, resolved),
      entries,
      truncated: children.length > 2000,
    };
  }
  async download(projectId: string, requested: string) {
    const { resolved } = await this.resolve(
      await this.projects.resolve(projectId),
      requested,
    );
    if (!(await stat(resolved)).isFile())
      throw new HttpError(400, "只能下载普通文件。");
    const handle = await open(resolved, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile()) throw new HttpError(400, "只能下载普通文件。");
      if (info.size > 200 * 1024 * 1024)
        throw new HttpError(413, "单个文件最大支持 200 MB。");
      return {
        name: path.basename(resolved),
        size: info.size,
        stream: handle.createReadStream(),
      };
    } catch (error) {
      await handle.close();
      throw error;
    }
  }
}
