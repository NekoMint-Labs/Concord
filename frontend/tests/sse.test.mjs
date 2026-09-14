import { test } from "node:test";
import assert from "node:assert/strict";
import { parseFrame, SSEDecoder, readRunEvents } from "../src/api/sse.ts";

const encode = (text) => new TextEncoder().encode(text);
const event = (id, type, extra = {}) =>
  `id: ${id}\ndata: ${JSON.stringify({ type, ...extra })}\n\n`;
const response = (text) =>
  new Response(text, { headers: { "Content-Type": "text/event-stream" } });

test("comments do not become events; multiline data and CRLF are preserved", () => {
  assert.equal(parseFrame(": keepalive"), null);
  assert.deepEqual(parseFrame('id: 2\r\ndata: {"a":\r\ndata: "value"}\r\n'), {
    id: 2,
    data: { a: "value" },
  });
});

test("arbitrary byte splits preserve Unicode and frame boundaries", () => {
  const decoder = new SSEDecoder();
  const bytes = encode(
    event(1, "CUSTOM", {
      name: "notice",
      text: "\u65bd\u5de5\ud83c\udfd7\ufe0f",
    }) + event(2, "RUN_FINISHED"),
  );
  const result = [...bytes].flatMap((byte) =>
    decoder.push(new Uint8Array([byte])),
  );
  assert.deepEqual(
    result.map((frame) => frame.id),
    [1, 2],
  );
  assert.equal(result[0].data.text, "\u65bd\u5de5\ud83c\udfd7\ufe0f");
});

for (const id of ["0", "-1", "NaN", "1.5", "9007199254740992", ""]) {
  test(`invalid event identity ${JSON.stringify(id)} is rejected`, () => {
    assert.throws(() => parseFrame(`id: ${id}\ndata: {"type":"CUSTOM"}`));
  });
}

test("non-object payloads and oversized unterminated frames fail closed", () => {
  assert.throws(() => parseFrame("id: 1\ndata: []"));
  assert.throws(() => parseFrame("id: 1\ndata: null"));
  assert.throws(() =>
    new SSEDecoder().push(encode("x".repeat(1024 * 1024 + 1))),
  );
});

test("unexpected EOF reconnects, resumes cursor, ignores replay, and reaches terminal event", async () => {
  const cursors = [],
    received = [],
    errors = [];
  await readRunEvents("/events", {
    headers: { Authorization: "Bearer test" },
    signal: new AbortController().signal,
    retryDelayMs: 1,
    onEvent: (frame) => received.push(frame.id),
    onError: (message) => errors.push(message),
    fetcher: async (_url, init) => {
      cursors.push(init.headers["Last-Event-ID"]);
      assert.equal(init.headers.Authorization, "Bearer test");
      return response(
        cursors.length === 1
          ? event(1, "RUN_STARTED") + "id: 2\ndata: {"
          : event(1, "RUN_STARTED") + event(2, "RUN_FINISHED"),
      );
    },
  });
  assert.deepEqual(cursors, ["0", "1"]);
  assert.deepEqual(received, [1, 2]);
  assert.equal(errors.length, 1);
});

test("cancellation is terminal and does not reconnect", async () => {
  let requests = 0;
  await readRunEvents("/events", {
    headers: {},
    signal: new AbortController().signal,
    onEvent() {},
    fetcher: async () => {
      requests++;
      return response(event(1, "CUSTOM", { name: "cancelled" }));
    },
  });
  assert.equal(requests, 1);
});

test("authentication errors do not cause a retry storm", async () => {
  let requests = 0;
  await readRunEvents("/events", {
    headers: {},
    signal: new AbortController().signal,
    onEvent() {},
    fetcher: async () => {
      requests++;
      return new Response("", { status: 401 });
    },
  });
  assert.equal(requests, 1);
});

test("retry budget is finite", async () => {
  let requests = 0;
  await readRunEvents("/events", {
    headers: {},
    signal: new AbortController().signal,
    onEvent() {},
    maxReconnects: 2,
    retryDelayMs: 1,
    fetcher: async () => {
      requests++;
      throw new Error("offline");
    },
  });
  assert.equal(requests, 3);
});

test("abort interrupts reconnect backoff immediately", async () => {
  const controller = new AbortController();
  let requests = 0;
  const reading = readRunEvents("/events", {
    headers: {},
    signal: controller.signal,
    onEvent() {},
    retryDelayMs: 8000,
    fetcher: async () => {
      requests++;
      throw new Error("offline");
    },
    onError: () => setTimeout(() => controller.abort(), 5),
  });
  await Promise.race([
    reading,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Abort did not interrupt backoff")),
        500,
      ).unref(),
    ),
  ]);
  assert.equal(requests, 1);
});

test("abort during a decoded batch cannot deliver frames to a superseded subscriber", async () => {
  const controller = new AbortController();
  const received = [];
  await readRunEvents("/events", {
    headers: {},
    signal: controller.signal,
    onEvent: (frame) => {
      received.push(frame.id);
      controller.abort();
    },
    fetcher: async () =>
      response(event(1, "RUN_STARTED") + event(2, "RUN_FINISHED")),
  });
  assert.deepEqual(received, [1]);
});

test("a late fetch result after abort does not reconnect or invoke callbacks", async () => {
  const controller = new AbortController();
  const callbacks = [];
  await readRunEvents("/events", {
    headers: {},
    signal: controller.signal,
    onEvent: () => callbacks.push("event"),
    onConnected: () => callbacks.push("connected"),
    onError: () => callbacks.push("error"),
    fetcher: async () => {
      controller.abort();
      return response(event(1, "RUN_FINISHED"));
    },
  });
  assert.deepEqual(callbacks, []);
});

test("abort releases a pending reader even when a custom fetcher ignores its signal", async () => {
  const controller = new AbortController();
  let cancelled = false;
  const reading = readRunEvents("/events", {
    headers: {},
    signal: controller.signal,
    onEvent() {},
    fetcher: async () =>
      new Response(
        new ReadableStream({
          start() {
            setTimeout(() => controller.abort(), 5);
          },
          cancel() {
            cancelled = true;
          },
        }),
        { headers: { "Content-Type": "text/event-stream" } },
      ),
  });
  await Promise.race([
    reading,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error("Pending read survived abort")),
        500,
      ).unref(),
    ),
  ]);
  assert.equal(cancelled, true);
});
