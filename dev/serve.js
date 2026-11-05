import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { normalizeLedger } from "../src/ledger.js";
import { ensureServer } from "../src/http.js";

const inputFile = process.argv[2]
  ? path.resolve(process.cwd(), process.argv[2])
  : fileURLToPath(new URL("../examples/example.json", import.meta.url));
const raw = JSON.parse(await readFile(inputFile, "utf8"));
const state = { version: 1, ledger: normalizeLedger(raw) };
const origin = await ensureServer(() => state, 7392);

console.log(`Preview URL: ${origin}`);
console.log("Press Ctrl+C to stop the preview.");
process.stdin.resume();
