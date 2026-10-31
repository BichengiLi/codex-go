import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeConnection,
  decodeConnection,
  validateConnection,
} from "../src/shared/connection.js";

test("connection code round trips LAN and HTTPS endpoints, rejects expiry and credential-bearing URLs", () => {
  const now = Date.now();
  const connection = {
    version: 1 as const,
    name: "我的电脑",
    urls: ["https://example.trycloudflare.com", "http://192.168.1.4:7332"],
    code: "00001234",
    expiresAt: now + 300000,
  };
  const encoded = encodeConnection(connection);
  assert.deepEqual(decodeConnection("\n" + encoded + " ", now), connection);
  assert.throws(() => decodeConnection(encoded, now + 300001), /过期/);
  assert.throws(() => validateConnection(connection, now - 60001), /过期/);
  for (const url of [
    "http://example.com",
    "ftp://192.168.1.4",
    "https://user:secret@example.com",
    "https://example.com/path",
    "https://example.com/?token=secret",
    "https://example.com/#fragment",
  ])
    assert.throws(() => encodeConnection({ ...connection, urls: [url] }));
  for (const code of ["12345678", "CG1.not-json", "CG1." + "a".repeat(2049)])
    assert.throws(() => decodeConnection(code, now));
});
