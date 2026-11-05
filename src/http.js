/** Serve the local page and read-only ledger cache without writing files. */
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const PAGE_FILE = fileURLToPath(new URL("./web/index.html", import.meta.url));
const LEDGER_MODULE_FILE = fileURLToPath(new URL("./ledger.js", import.meta.url));
const HOST = "127.0.0.1";
const PORT_ATTEMPTS = 20;

let pageCache = null;
let ledgerModuleCache = null;
let origin = null;

/**
 * Start or reuse the HTTP server and return its origin.
 * @param {() => { version: number, ledger: object | null }} readState
 * @param {number} preferredPort
 */
export async function ensureServer(readState, preferredPort) {
  if (origin) return origin;

  for (let i = 0; i < PORT_ATTEMPTS; i += 1) {
    const port = preferredPort + i;
    try {
      await listen(port, createHandler(readState));
      origin = `http://${HOST}:${port}`;
      return origin;
    } catch (error) {
      if (error.code !== "EADDRINUSE") throw error;
    }
  }

  throw new Error(`All ${PORT_ATTEMPTS} ports starting at ${preferredPort} are already in use.`);
}

/** Open a URL in the system browser without waiting for it to exit. */
export function openBrowser(url) {
  const [command, args] =
    process.platform === "win32"
      ? ["cmd", ["/c", "start", "", url]]
      : process.platform === "darwin"
        ? ["open", [url]]
        : ["xdg-open", [url]];

  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function createHandler(readState) {
  return async (request, response) => {
    try {
      const { pathname } = new URL(request.url, `http://${HOST}`);

      if (pathname === "/" || pathname === "/index.html") {
        const html = await readPage();
        send(response, 200, "text/html; charset=utf-8", html);
        return;
      }

      if (pathname === "/ledger.js") {
        const module = await readLedgerModule();
        send(response, 200, "text/javascript; charset=utf-8", module);
        return;
      }

      if (pathname === "/api/ledger") {
        send(response, 200, "application/json; charset=utf-8", JSON.stringify(readState()));
        return;
      }

      send(response, 404, "text/plain; charset=utf-8", "not found");
    } catch (error) {
      send(response, 500, "text/plain; charset=utf-8", String(error && error.message ? error.message : error));
    }
  };
}

function listen(port, handler) {
  return new Promise((resolve, reject) => {
    const server = createServer(handler);
    server.once("error", reject);
    server.listen(port, HOST, () => {
      server.removeListener("error", reject);
      // The unref'ed server must not keep the process alive after stdio closes.
      server.unref();
      resolve(server);
    });
  });
}

async function readPage() {
  if (pageCache === null) {
    pageCache = await readFile(PAGE_FILE, "utf8");
  }
  return pageCache;
}

async function readLedgerModule() {
  if (ledgerModuleCache === null) {
    ledgerModuleCache = await readFile(LEDGER_MODULE_FILE, "utf8");
  }
  return ledgerModuleCache;
}

function send(response, status, contentType, body) {
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}
