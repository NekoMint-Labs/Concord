/** Operator-owned stdin protocol. No request-selected URL, program or browser binary. */
import { readFile, stat, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { resolve, extname, sep } from "node:path";
function stable(value) {
  if (Array.isArray(value))
    return (
      "[" +
      value
        .map((item) => (item === undefined ? "null" : stable(item)))
        .join(",") +
      "]"
    );
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => JSON.stringify(key) + ":" + stable(value[key]))
        .join(",") +
      "}"
    );
  if (typeof value === "number" && !Number.isFinite(value))
    throw new Error("Engine output contains non-finite values");
  return JSON.stringify(value);
}
const MAX_OUTPUT = 8 * 1024 * 1024;
let input = "";
for await (const chunk of process.stdin) {
  input += chunk;
  if (Buffer.byteLength(input) > 96 * 1024 * 1024)
    throw new Error("Trusted input protocol limit exceeded");
}
let browser, server;
async function close() {
  await browser?.close();
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
}
process.once("SIGTERM", () => {
  void close().finally(() => process.exit(1));
});
process.once("SIGINT", () => {
  void close().finally(() => process.exit(1));
});

try {
  const request = JSON.parse(input);
  const { normalize, validateOptions, runtimeVersion } =
    await import("./dist/mapper/normalization.mjs");
  validateOptions(request.kind, request.options);
  let result;
  if (request.mode === "normalize") result = await normalize(request);
  else if (request.mode === "execute") {
    const require = createRequire(import.meta.url);
    const pkg = require("@playwright/test/package.json");
    if (!runtimeVersion.startsWith(`playwright@${pkg.version}/`))
      throw new Error("Pinned Playwright runtime version mismatch");
    const { chromium } = await import("@playwright/test");
    const root = await realpath(
      fileURLToPath(new URL("./dist/web/", import.meta.url)),
    );
    const mime = {
      ".html": "text/html",
      ".js": "text/javascript",
      ".mjs": "text/javascript",
      ".json": "application/json",
      ".wasm": "application/wasm",
      ".css": "text/css",
      ".png": "image/png",
    };
    const token = (await import("node:crypto")).randomBytes(24).toString("hex");
    server = createServer(async (req, res) => {
      if (
        req.method !== "GET" ||
        !req.headers.cookie?.split("; ").includes(`concord_worker=${token}`)
      ) {
        res.writeHead(403).end();
        return;
      }
      try {
        const url = new URL(req.url, "http://localhost");
        const path = await realpath(
          resolve(
            root,
            "." +
              decodeURIComponent(
                url.pathname === "/" ? "/index.html" : url.pathname,
              ),
          ),
        );
        if (!path.startsWith(root + sep) || !(await stat(path)).isFile()) {
          res.writeHead(404).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": mime[extname(path)] ?? "application/octet-stream",
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(await readFile(path));
      } catch {
        res.writeHead(404).end();
      }
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    browser = await chromium.launch({ headless: true });
    if (
      runtimeVersion !==
      `playwright@${pkg.version}/chromium@${browser.version()}`
    )
      throw new Error("Pinned Chromium runtime version mismatch");
    const context = await browser.newContext({
      serviceWorkers: "block",
      acceptDownloads: false,
    });
    await context.addCookies([
      {
        name: "concord_worker",
        value: token,
        url: origin,
        httpOnly: true,
        sameSite: "Strict",
      },
    ]);
    const external = [];
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (url.startsWith("blob:") || new URL(url).origin === origin)
        await route.continue();
      else {
        external.push(url);
        await route.abort("blockedbyclient");
      }
    });
    const page = await context.newPage();
    page.setDefaultTimeout(125000);
    await page.goto(origin);
    await page.waitForFunction(
      () => typeof window.executeTrustedComparison === "function",
    );
    let timeout;
    try {
      result = await Promise.race([
        page.evaluate(
          (value) => window.executeTrustedComparison(value),
          request,
        ),
        new Promise((_, reject) => {
          timeout = setTimeout(
            () => reject(new Error("Trusted browser execution timed out")),
            130000,
          );
        }),
      ]);
    } finally {
      clearTimeout(timeout);
    }
    if (external.length)
      throw new Error("Comparison attempted an external runtime request");
    await context.close();
  } else throw new Error("Unsupported trusted worker mode");
  const output = stable(result);
  if (!output || Buffer.byteLength(output) > MAX_OUTPUT)
    throw new Error("Trusted result exceeds 8 MiB");
  process.stdout.write(output);
} catch (error) {
  process.stderr.write(
    error instanceof Error ? error.message : "Trusted comparison failed",
  );
  process.exitCode = 1;
} finally {
  await close();
}
