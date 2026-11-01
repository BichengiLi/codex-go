import {
  mkdir,
  mkdtemp,
  open,
  readdir,
  realpath,
  rmdir,
  stat,
  unlink,
} from "node:fs/promises";
import type { Readable } from "node:stream";
import path from "node:path";
import { maxUploadBytes, type Attachment } from "../shared/types.js";
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
  async upload(
    root: string,
    name: string,
    source: Readable,
  ): Promise<Attachment> {
    if (
      !name ||
      name.length > 180 ||
      /[\\/\x00-\x1f\x7f:<>"|?*]/.test(name) ||
      /[. ]$/.test(name) ||
      name === "." ||
      name === ".." ||
      privatePart(name) ||
      /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(name)
    )
      throw new HttpError(400, "文件名无效或属于私有配置，请重命名后上传。");
    await this.resolve(root, ".");
    const base = path.join(root, ".codex-go-uploads");
    await mkdir(base).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const safe = await this.resolve(root, ".codex-go-uploads");
    // Reject even in-project aliases: uploaded paths must retain their ownership.
    if (safe.resolved !== base || !(await stat(base)).isDirectory())
      throw new HttpError(403, "附件目录无效。");
    const directory = await mkdtemp(path.join(base, "file-"));
    const target = path.join(directory, name);
    try {
      const handle = await open(target, "wx", 0o600);
      try {
        let size = 0;
        for await (const chunk of source) {
          size += chunk.length;
          if (size > maxUploadBytes)
            throw new HttpError(413, "单个附件最大支持 200 MB。");
          await handle.writeFile(chunk);
        }
      } finally {
        await handle.close();
      }
      const { absolute: _absolute, ...attachment } = await this.attachment(
        root,
        path.relative(root, target).split(path.sep).join("/"),
      );
      return attachment;
    } catch (error) {
      await unlink(target).catch(() => {});
      await rmdir(directory).catch(() => {});
      throw error;
    }
  }
  async attachment(
    root: string,
    requested: string,
  ): Promise<Attachment & { absolute: string }> {
    if (!/^\.codex-go-uploads\/file-[A-Za-z0-9]+\/[^/\\]+$/.test(requested))
      throw new HttpError(400, "附件引用无效，请重新上传。");
    const { resolved } = await this.resolve(root, requested);
    if (resolved !== path.resolve(root, requested))
      throw new HttpError(403, "附件路径不能使用链接。");
    const handle = await open(resolved, "r");
    try {
      const info = await handle.stat();
      if (!info.isFile() || info.size > maxUploadBytes)
        throw new HttpError(400, "附件无效，请重新上传。");
      const header = Buffer.alloc(12);
      await handle.read(header, 0, 12, 0);
      const image =
        header
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
        header.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ||
        /^GIF8[79]a/.test(header.toString("ascii")) ||
        (header.toString("ascii", 0, 4) === "RIFF" &&
          header.toString("ascii", 8, 12) === "WEBP");
      return {
        path: requested,
        absolute: resolved,
        name: path.basename(resolved),
        size: info.size,
        kind: image
          ? "image"
          : /\.(mp3|wav|m4a|aac|ogg|opus|flac|amr)$/i.test(resolved)
            ? "audio"
            : "file",
      };
    } finally {
      await handle.close();
    }
  }
}
