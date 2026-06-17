import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { openAnalyticsDatabase, queryEvents, queryFacets, querySummary } from "./lib/analytics-store.mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(MODULE_DIR, "..", "web");
const STATIC_FILES = new Map([
  ["/", "usage-analytics.html"],
  ["/usage-analytics.html", "usage-analytics.html"],
  ["/usage-analytics.css", "usage-analytics.css"],
  ["/usage-analytics.js", "usage-analytics.js"],
]);

function parseArgs(argv) {
  const args = { host: "127.0.0.1", port: 3210, dbPath: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (value === "--host") {
      args.host = argv[++i] ?? args.host;
    } else if (value === "--port") {
      args.port = Number(argv[++i] ?? args.port);
    } else if (value === "--db-path") {
      args.dbPath = argv[++i] ?? args.dbPath;
    }
  }
  return args;
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function readStaticFile(name) {
  return fs.readFileSync(path.join(WEB_DIR, name), "utf8");
}

function parseFilters(url) {
  const filters = {};
  if (url.searchParams.get("from")) filters.from = url.searchParams.get("from");
  if (url.searchParams.get("to")) filters.to = url.searchParams.get("to");
  if (url.searchParams.get("kind")) filters.kind = url.searchParams.get("kind");
  if (url.searchParams.get("decision")) filters.decision = url.searchParams.get("decision");
  if (url.searchParams.get("model")) filters.model = url.searchParams.get("model");
  if (url.searchParams.get("cwd")) filters.cwdContains = url.searchParams.get("cwd");
  if (url.searchParams.get("limit")) filters.limit = Number(url.searchParams.get("limit"));
  if (url.searchParams.get("offset")) filters.offset = Number(url.searchParams.get("offset"));
  return filters;
}

export function createAnalyticsServer(options = {}) {
  const { host = "127.0.0.1", port = 3210, dbPath = null } = options;
  const runtime = openAnalyticsDatabase({ dbPath });
  const { db } = runtime;

  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? `${host}:${port}`}`);

      if (req.method !== "GET") {
        sendText(res, 405, "method not allowed");
        return;
      }

      if (url.pathname === "/api/health") {
        sendJson(res, 200, { ok: true });
        return;
      }

      if (url.pathname === "/api/facets") {
        sendJson(res, 200, queryFacets(db));
        return;
      }

      if (url.pathname === "/api/summary") {
        sendJson(res, 200, querySummary(db, parseFilters(url)));
        return;
      }

      if (url.pathname === "/api/events") {
        sendJson(res, 200, queryEvents(db, parseFilters(url)));
        return;
      }

      const staticFile = STATIC_FILES.get(url.pathname);
      if (staticFile) {
        const contentType =
          staticFile.endsWith(".html")
            ? "text/html; charset=utf-8"
            : staticFile.endsWith(".css")
              ? "text/css; charset=utf-8"
              : "text/javascript; charset=utf-8";
        sendText(res, 200, readStaticFile(staticFile), contentType);
        return;
      }

      sendText(res, 404, "not found");
    } catch (error) {
      sendText(res, 500, error instanceof Error ? error.message : "internal server error");
    }
  });

  function listen() {
    return new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => {
        server.off("error", reject);
        const address = server.address();
        if (!address || typeof address === "string") {
          resolve({ server, url: `http://${host}:${port}`, db });
          return;
        }
        resolve({ server, url: `http://${address.address}:${address.port}`, db });
      });
    });
  }

  return {
    ...runtime,
    server,
    listen,
    close() {
      return new Promise((resolve) => {
        server.close(() => {
          try {
            db.close();
          } catch {
            // ignore
          }
          resolve();
        });
      });
    },
  };
}

async function main() {
  const { host, port, dbPath } = parseArgs(process.argv.slice(2));
  const app = createAnalyticsServer({ host, port, dbPath });
  const { url } = await app.listen();
  process.stdout.write(`${url}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
