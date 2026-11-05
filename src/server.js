#!/usr/bin/env node
/** Register show, open, and help tools. Ledger data is cached only in process memory. */
import path from "node:path";
import { readFile } from "node:fs/promises";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { LedgerError, normalizeLedger } from "./ledger.js";
import { HELP_TEXT_EN, HELP_TEXT_ZH } from "./help.js";
import { ensureServer, openBrowser } from "./http.js";

const PREFERRED_PORT = Number(process.env.LEDGER_PORT) || 7317;

const cache = { version: 0, ledger: null };

let httpPromise = null;

function ensureHttp() {
  if (httpPromise === null) {
    httpPromise = ensureServer(() => cache, PREFERRED_PORT);
  }
  return httpPromise;
}

async function resolveLedger(input) {
  if (typeof input === "object" && input !== null && !Array.isArray(input)) {
    return input;
  }

  if (typeof input !== "string") {
    throw new LedgerError("The ledger argument must be an object or a string containing a file path or JSON text.");
  }

  const text = input.trim();
  if (text === "") {
    throw new LedgerError("The ledger argument cannot be empty.");
  }

  if (text.startsWith("{")) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new LedgerError(`The ledger text is not valid JSON: ${error.message}`);
    }
  }

  const file = path.resolve(process.cwd(), text);
  let raw;
  try {
    raw = await readFile(file, "utf8");
  } catch (error) {
    throw new LedgerError(`Could not read ${file}: ${error.message}`);
  }

  try {
    return JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch (error) {
    throw new LedgerError(`${file} does not contain valid JSON: ${error.message}`);
  }
}

function ok(text) {
  return { content: [{ type: "text", text }] };
}

function fail(error) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text", text: `Ledger was not loaded: ${message}` }] };
}

const server = new McpServer({ name: "time-ledger", version: "1.0.0" });

server.registerTool(
  "show",
  {
    title: "Load ledger",
    description:
      "Load a ledger and replace the in-memory cache. Data is never written to disk. ledger may be an object, a JSON file path, or JSON text; relative paths use the server process working directory.",
    inputSchema: {
      ledger: z
        .union([z.string(), z.record(z.string(), z.any())])
        .describe("A ledger object, JSON file path, or JSON text."),
    },
  },
  async ({ ledger }) => {
    try {
      const raw = await resolveLedger(ledger);
      const normalized = normalizeLedger(raw);

      cache.version += 1;
      cache.ledger = normalized;

      const url = await ensureHttp();
      const summary = `${normalized.stats.tracks} tracks · ${normalized.stats.blocks} blocks · axis ${normalized.axis.min}–${normalized.axis.max}`;
      return ok(`Loaded version ${cache.version}: ${normalized.title}\n${summary}\n${url}`);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "open",
  {
    title: "Open page",
    description: "Open the local ledger page in the system browser. The page polls for the latest show result.",
    inputSchema: {},
  },
  async () => {
    try {
      const url = await ensureHttp();
      openBrowser(url);
      return ok(url);
    } catch (error) {
      return fail(error);
    }
  },
);

server.registerTool(
  "help",
  {
    title: "Format reference",
    description: "Return the complete ledger JSON format, axis rules, and display behavior. Pass language: zh for the Chinese version.",
    inputSchema: {
      language: z.enum(["en", "zh"]).optional().describe("Help language; defaults to English."),
    },
  },
  async ({ language = "en" } = {}) => ok(language === "zh" ? HELP_TEXT_ZH : HELP_TEXT_EN),
);

await server.connect(new StdioServerTransport());
console.error(`Time Ledger MCP server started over stdio; HTTP ports start at ${PREFERRED_PORT}.`);
