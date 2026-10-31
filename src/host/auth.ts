import {
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { JsonStore } from "./storage.js";
import { HttpError } from "./errors.js";
import { EventEmitter } from "node:events";

type Device = {
  id: string;
  name: string;
  hash: string;
  createdAt: number;
  expiresAt: number | null;
};
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class Pairing extends EventEmitter {
  private code = "";
  private expiresAt = 0;
  private failures = 0;
  constructor(
    private store: JsonStore<Device[]>,
    private now = Date.now,
    private persistentDevices = false,
  ) { super(); }
  async preserveDevices() {
    const valid = this.store.data.filter(d => d.expiresAt !== null && d.expiresAt > this.now());
    if (!this.persistentDevices || !valid.length) return;
    for (const device of valid) device.expiresAt = null;
    await this.store.save();
  }
  issue() {
    this.code = randomInt(0, 100_000_000).toString().padStart(8, "0");
    this.expiresAt = this.now() + 300_000;
    this.failures = 0;
    return this.code;
  }
  async pair(code: string, name: string) {
    if (++this.failures > 10)
      throw new HttpError(429, "配对尝试过多，请在主机重启服务以生成新码。");
    if (
      !this.code ||
      this.now() > this.expiresAt ||
      !timingSafeEqual(Buffer.from(hash(code)), Buffer.from(hash(this.code)))
    )
      throw new HttpError(401, "配对码错误或已过期。");
    this.code = ""; // single-use
    const token = randomBytes(32).toString("base64url");
    const device: Device = {
      id: randomBytes(12).toString("hex"),
      name,
      hash: hash(token),
      createdAt: this.now(),
      expiresAt: this.persistentDevices ? null : this.now() + 7 * 86400_000,
    };
    this.store.data.push(device);
    await this.store.save();
    return { token, device };
  }
  authenticate(token: string | undefined) {
    const digest = hash(token ?? "");
    const device = this.store.data.find(
      (d) =>
        (d.expiresAt === null || d.expiresAt > this.now()) &&
        timingSafeEqual(Buffer.from(d.hash), Buffer.from(digest)),
    );
    if (!device) throw new HttpError(401, "请先配对这台主机。");
    return device;
  }
  list() {
    return this.store.data
      .filter((d) => d.expiresAt === null || d.expiresAt > this.now())
      .map(({ hash: _, ...device }) => device);
  }
  async revoke(id: string) {
    this.store.data = this.store.data.filter((d) => d.id !== id);
    await this.store.save();
    this.emit("revoked", id);
  }
  get codeAvailable() {
    return !!this.code && this.expiresAt > this.now();
  }
}
