/** Authenticated SSE transport shared by React and browser-level contract tests. */
export type SSEFrame = { id: number; data: Record<string, unknown> };
const MAX_FRAME_CHARS = 1024 * 1024;

export function parseFrame(frame: string): SSEFrame | null {
  const lines = frame.replace(/\r/g, "").split("\n");
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).replace(/^ /, ""))
    .join("\n");
  if (!data) return null; // Heartbeats and comments carry no event or cursor.
  const rawId = lines
    .filter((line) => line.startsWith("id:"))
    .at(-1)
    ?.slice(3)
    .trim();
  if (!rawId || !/^\d+$/.test(rawId))
    throw new Error("运行事件流的事件编号无效");
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id < 1)
    throw new Error("运行事件流的事件编号超出安全范围");
  const value: unknown = JSON.parse(data);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("运行事件流的事件负载无效");
  }
  return { id, data: value as Record<string, unknown> };
}

export class SSEDecoder {
  private decoder = new TextDecoder();
  private buffer = "";

  push(chunk: Uint8Array): SSEFrame[] {
    this.buffer += this.decoder
      .decode(chunk, { stream: true })
      .replace(/\r/g, "");
    const frames: SSEFrame[] = [];
    let boundary: number;
    while ((boundary = this.buffer.indexOf("\n\n")) >= 0) {
      if (boundary > MAX_FRAME_CHARS)
        throw new Error("运行事件流的数据帧超出大小上限");
      const frame = parseFrame(this.buffer.slice(0, boundary));
      this.buffer = this.buffer.slice(boundary + 2);
      if (frame) frames.push(frame);
    }
    if (this.buffer.length > MAX_FRAME_CHARS)
      throw new Error("运行事件流的数据帧超出大小上限");
    return frames;
  }
}

export type StreamOptions = {
  headers: Record<string, string>;
  signal: AbortSignal;
  onEvent(frame: SSEFrame): void;
  onError?(message: string): void;
  onConnected?(): void;
  fetcher?: typeof fetch;
  maxReconnects?: number;
  retryDelayMs?: number;
};

function terminal(frame: SSEFrame): boolean {
  return (
    ["RUN_FINISHED", "RUN_ERROR"].includes(String(frame.data.type)) ||
    (frame.data.type === "CUSTOM" &&
      ["cancelled", "expired"].includes(String(frame.data.name)))
  );
}

function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const finish = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    signal.addEventListener("abort", finish, { once: true });
  });
}

/** Unexpected EOF reconnects with the last complete ID; terminal EOF does not. */
export async function readRunEvents(
  url: string,
  options: StreamOptions,
): Promise<void> {
  const { signal, onEvent, onError, onConnected, headers } = options;
  let cursor = 0;
  let lastWasTerminal = false;
  const fetcher = options.fetcher ?? fetch;
  for (
    let attempt = 0;
    attempt <= (options.maxReconnects ?? 6) && !signal.aborted;
    attempt++
  ) {
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let onAbort: (() => void) | undefined;
    try {
      const response = await fetcher(url, {
        headers: {
          ...headers,
          Accept: "text/event-stream",
          "Last-Event-ID": String(cursor),
        },
        signal,
      });
      if (signal.aborted) return;
      if ([401, 403, 404].includes(response.status)) {
        onError?.(
          `运行事件流不可用（HTTP ${response.status}）；请检查访问权限后重连`,
        );
        return;
      }
      if (
        !response.ok ||
        !response.body ||
        !response.headers.get("content-type")?.includes("text/event-stream")
      ) {
        throw new Error(`运行事件流不可用（HTTP ${response.status}）`);
      }
      onConnected?.();
      reader = response.body.getReader();
      onAbort = () => {
        void reader?.cancel().catch(() => undefined);
      };
      signal.addEventListener("abort", onAbort, { once: true });
      if (signal.aborted) return;
      const decoder = new SSEDecoder();
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (signal.aborted) return;
        if (done) {
          if (lastWasTerminal) return;
          throw new Error("运行事件流在完成前中断");
        }
        for (const frame of decoder.push(value)) {
          if (signal.aborted) return;
          if (frame.id <= cursor) continue;
          onEvent(frame);
          cursor = frame.id;
          lastWasTerminal = terminal(frame);
        }
      }
    } catch (cause) {
      if (signal.aborted) return;
      /*
       * The transport reports in the product's language. A message raised by the
       * environment rather than by this file (a failed fetch, a closed socket) is
       * passed through as it arrived: the alternative is replacing one untranslated
       * sentence with a sentence that no longer says what happened.
       */
      onError?.(cause instanceof Error ? cause.message : "运行事件流已断开");
    } finally {
      if (onAbort) signal.removeEventListener("abort", onAbort);
      if (reader) {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
      }
    }
    if (attempt < (options.maxReconnects ?? 6)) {
      await delay(
        Math.min((options.retryDelayMs ?? 500) * 2 ** attempt, 8000),
        signal,
      );
    }
  }
}
