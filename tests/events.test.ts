import { test } from "node:test";
import assert from "node:assert/strict";

test(
  "Quick Tunnel client replays events, resets a changed epoch and stops polling on close",
  { timeout: 6000 },
  async (t) => {
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    const originalFetch = globalThis.fetch;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        location: {
          href: "https://example.trycloudflare.com/",
          hostname: "example.trycloudflare.com",
        },
      },
    });
    const queries: URLSearchParams[] = [];
    globalThis.fetch = async (input) => {
      const query = new URL(String(input), "https://example.trycloudflare.com")
        .searchParams;
      queries.push(query);
      const responses = [
        {
          gap: false,
          epoch: "one",
          seq: 5,
          events: [{ seq: 5, method: "item/agentMessage/delta" }],
        },
        { gap: true, epoch: "two", seq: 10, events: [] },
        {
          gap: false,
          epoch: "two",
          seq: 12,
          events: [
            { seq: 11, method: "bridge/approval" },
            { seq: 12, method: "turn/completed" },
          ],
        },
      ];
      assert.ok(
        queries.length <= responses.length,
        "closed stream must not request again",
      );
      return Response.json(responses[queries.length - 1]);
    };
    t.after(() => {
      globalThis.fetch = originalFetch;
      if (originalWindow)
        Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    });
    const { eventStream } = await import("../src/web/native.js");
    const stream = eventStream("/api/events?after=4&epoch=one");
    t.after(() => stream.close());
    const syncs: any[] = [],
      events: any[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.onerror = () => reject(new Error("Unexpected polling failure"));
      stream.addEventListener("sync", (event) =>
        syncs.push(JSON.parse((event as MessageEvent).data)),
      );
      stream.addEventListener("codex", (event) => {
        const data = JSON.parse((event as MessageEvent).data);
        events.push(data);
        if (data.seq === 12) {
          stream.close();
          resolve();
        }
      });
    });
    assert.deepEqual(
      events.map((e) => e.seq),
      [5, 11, 12],
    );
    assert.deepEqual(
      syncs.map((e) => [e.epoch, e.gap]),
      [
        ["one", false],
        ["two", true],
      ],
    );
    assert.deepEqual(
      queries.map((q) => [q.get("after"), q.get("epoch")]),
      [
        ["4", "one"],
        ["5", "one"],
        ["10", "two"],
      ],
    );
    await new Promise((resolve) => setTimeout(resolve, 1100));
    assert.equal(queries.length, 3);
  },
);
