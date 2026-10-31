import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class JsonStore<T> {
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private file: string,
    public data: T,
  ) {}
  async load() {
    try {
      this.data = JSON.parse(await readFile(this.file, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    return this;
  }
  save() {
    const content = JSON.stringify(this.data);
    const next = this.queue.then(async () => {
      await mkdir(path.dirname(this.file), { recursive: true, mode: 0o700 });
      await writeFile(this.file + ".tmp", content, { mode: 0o600 });
      await rename(this.file + ".tmp", this.file);
    });
    this.queue = next.catch(() => {});
    return next;
  }
}
