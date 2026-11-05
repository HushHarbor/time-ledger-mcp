import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { composeTracksAt, normalizeLedger } from "../src/ledger.js";

const serverFile = fileURLToPath(new URL("../src/server.js", import.meta.url));
const exampleFile = fileURLToPath(new URL("../examples/example.json", import.meta.url));
const sequenceFile = fileURLToPath(new URL("../examples/sequence-ledger.json", import.meta.url));
const dateFile = fileURLToPath(new URL("../examples/date-ledger.json", import.meta.url));
const probe = createServer();
const preferredPort = await new Promise((resolve, reject) => {
  probe.once("error", reject);
  probe.listen(0, "127.0.0.1", () => resolve(probe.address().port));
});
await new Promise((resolve, reject) => {
  probe.close((error) => (error ? reject(error) : resolve()));
});
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverFile],
  env: { ...process.env, LEDGER_PORT: String(preferredPort) },
});
const client = new Client({ name: "time-ledger-check", version: "1.0.0" });
let connected = false;

function textOf(result, operation) {
  assert.notEqual(
    result?.isError,
    true,
    `${operation} failed: ${result?.content?.[0]?.text ?? "No error details were returned."}`,
  );
  assert.equal(result?.content?.[0]?.type, "text", `${operation} should return text.`);
  return result.content[0].text;
}

function checkLedgerComposition() {
  const ledger = normalizeLedger({
    tracks: [
      {
        id: "target",
        blocks: [
          { id: "overlay", start: 2, end: 8, title: "Overlay" },
          {
            id: "target",
            start: 0,
            end: 10,
            title: "Target",
            style: { color: "blue", opacity: 0.8 },
            items: ["base"],
          },
        ],
      },
      {
        id: "overlay",
        blocks: [
          {
            id: "overlay",
            start: 0,
            end: 10,
            title: "Overlay source",
            style: { opacity: 0.4, blur: 2 },
            items: ["overlay"],
          },
        ],
      },
      {
        id: "host",
        blocks: [
          { id: "target", start: 4, end: 6, title: "Target reference" },
          { id: "host", start: 0, end: 10, title: "Host", state: "active" },
        ],
      },
    ],
  });

  const target = composeTracksAt(ledger.tracks, 5).get("target");
  assert.deepEqual(JSON.parse(JSON.stringify(target.content.style)), {
    color: "blue",
    opacity: 0.4,
    blur: 2,
  });
  assert.deepEqual(target.content.items, ["overlay"], "The higher layer should replace arrays.");
  assert.equal(target.origins['["style","color"]'], "target");
  assert.equal(target.origins['["style","opacity"]'], "overlay");

  const host = composeTracksAt(ledger.tracks, 5).get("host");
  assert.deepEqual(JSON.parse(JSON.stringify(host.content.style)), {
    color: "blue",
    opacity: 0.4,
    blur: 2,
  });
  assert.equal(host.content.state, "active", "Non-conflicting lower-layer fields should remain.");
  assert.ok(host.sourceIds.includes("overlay"), "Nested global references should be reported.");

  const initialized = normalizeLedger({
    tracks: [
      {
        id: "host",
        blocks: [
          { id: "host", start: 0, end: 10, title: "Host" },
          { id: "light", start: 2, end: 6, title: "Light", color: "warm" },
        ],
      },
    ],
  });
  const lightTrack = initialized.tracks.find((track) => track.id === "light");
  assert.ok(lightTrack, "The first reference should initialize a global track.");
  assert.equal(lightTrack.blocks[0].start, 2);
  assert.equal(lightTrack.blocks[0].end, 6);
  assert.equal(lightTrack.blocks[0].content[0][0], "color");

  const mappedBase = normalizeLedger({
    tracks: [
      {
        id: "host",
        blocks: [
          { id: "host", start: 0, end: 10, title: "Host" },
          { id: "asset", start: 2, end: 6, title: "Asset base" },
        ],
      },
      {
        id: "asset",
        blocks: [{ id: "overlay", start: 3, end: 5, title: "Overlay" }],
      },
    ],
  });
  assert.ok(
    mappedBase.tracks.find((track) => track.id === "asset").blocks.some((block) => block.id === "asset"),
    "An explicit track without a base should initialize it from its first external reference.",
  );

  assert.throws(
    () =>
      normalizeLedger({
        tracks: [
          {
            id: "same",
            blocks: [
              { id: "same", start: 0, end: 2 },
              { id: "same", start: 2, end: 4 },
            ],
          },
        ],
      }),
    /overlapping blocks/,
    "Same-ID blocks sharing an endpoint should be rejected.",
  );

  const overlappingLayers = normalizeLedger({
    tracks: [
      {
        id: "layers",
        blocks: [
          { id: "lower", start: 1, end: 4 },
          { id: "upper", start: 2, end: 5 },
          { id: "layers", start: 0, end: 6 },
        ],
      },
    ],
  });
  assert.equal(overlappingLayers.tracks.length, 3, "Different IDs should be allowed to overlap.");

  assert.throws(
    () =>
      normalizeLedger({
        tracks: [
          {
            id: "orphan",
            blocks: [{ id: "decoration", start: 0, end: 1 }],
          },
        ],
      }),
    /has no base block/,
    "A track with no base and no external reference should be rejected.",
  );

  assert.throws(
    () =>
      normalizeLedger({
        tracks: [
          {
            id: "A",
            blocks: [
              { id: "B", start: 1, end: 3 },
              { id: "A", start: 0, end: 4 },
            ],
          },
          {
            id: "B",
            blocks: [
              { id: "A", start: 1, end: 3 },
              { id: "B", start: 0, end: 4 },
            ],
          },
        ],
      }),
    /Circular track reference/,
    "Circular global references should be rejected.",
  );
}

checkLedgerComposition();

try {
  await client.connect(transport);
  connected = true;

  const sequenceLedger = normalizeLedger(JSON.parse(await readFile(sequenceFile, "utf8")));
  assert.equal(sequenceLedger.axis.label, "Step");
  assert.equal(sequenceLedger.tracks.length, 4);
  const dateLedger = normalizeLedger(JSON.parse(await readFile(dateFile, "utf8")));
  assert.equal(dateLedger.axis.label, "Date (UTC; epoch days)");
  assert.equal(dateLedger.axis.ticks[0].label, "Oct 26");
  assert.equal(dateLedger.axis.ticks.at(-1).label, "Nov 3");

  const { tools } = await client.listTools();
  assert.deepEqual(
    tools.map(({ name }) => name).sort(),
    ["help", "open", "show"],
    "The MCP server should expose help, open, and show tools.",
  );

  const help = textOf(await client.callTool({ name: "help", arguments: {} }), "help");
  assert.match(help, /## Tracks, IDs, and blocks/);
  assert.match(help, /## Numeric axis/);
  assert.match(help, /Practical ID-composition recipe/);
  assert.match(help, /Date-labeled axes/);
  assert.match(help, /local storage/);
  assert.match(help, /globally unique/);
  assert.match(help, /circular references are rejected/);
  assert.doesNotMatch(help, /\p{Script=Han}/u, "English help must be English-only");
  const chineseHelp = textOf(
    await client.callTool({ name: "help", arguments: { language: "zh" } }),
    "help (Chinese)",
  );
  assert.match(chineseHelp, /## \p{Script=Han}/u);

  const shown = textOf(
    await client.callTool({ name: "show", arguments: { ledger: exampleFile } }),
    "show (file path)",
  );
  const origin = shown.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
  assert.ok(origin, "show should return a local page URL.");

  const pageResponse = await fetch(`${origin}/`);
  assert.equal(pageResponse.status, 200, "The page should be available.");
  const page = await pageResponse.text();
  assert.match(page, /id="timeline"/, "The page should contain the timeline.");
  assert.match(page, /<html lang="en">/, "The page should use English.");
  assert.match(page, /id="language-select"/, "The page should provide a language selector.");
  assert.match(page, /id="theme-select"/, "The page should provide an appearance selector.");
  assert.match(page, /time-ledger\.language/, "The selected language should persist in browser storage.");
  assert.match(page, /time-ledger\.theme/, "The selected appearance should persist in browser storage.");
  assert.match(page, /:root\[data-theme="dark"\]/, "The page should define a dark palette.");
  assert.match(page, /prefers-color-scheme: dark/, "Auto appearance should follow the system color scheme.");
  const moduleResponse = await fetch(`${origin}/ledger.js`);
  assert.equal(moduleResponse.status, 200, "The page should be able to load the composition module.");
  assert.match(await moduleResponse.text(), /export function composeTracksAt/);

  const apiResponse = await fetch(`${origin}/api/ledger`);
  assert.equal(apiResponse.status, 200, "The ledger API should be available.");
  const fileState = await apiResponse.json();
  assert.equal(fileState.version, 1);
  assert.equal(fileState.ledger.title, "Reusable Lighting Effects");
  assert.equal(fileState.ledger.stats.tracks, 4);
  assert.equal(fileState.ledger.stats.blocks, 7);
  assert.deepEqual(
    fileState.ledger.tracks[0].blocks[1].content.map(([key]) => key),
    ["pose"],
  );
  assert.equal(fileState.ledger.tracks[0].blocks[0].id, "lighting");
  assert.equal(fileState.ledger.tracks[0].blocks[0].lane, 0);

  textOf(
    await client.callTool({
      name: "show",
      arguments: {
        ledger: {
          title: "Object Ledger",
          tracks: [
            {
              id: "object-ledger",
              name: "Object Ledger",
              blocks: [{ id: "object-ledger", start: 2, end: 4, note: "Loaded from an object" }],
            },
          ],
        },
      },
    }),
    "show (object)",
  );
  const objectState = await fetch(`${origin}/api/ledger`).then((response) => response.json());
  assert.equal(objectState.version, 2);
  assert.equal(objectState.ledger.title, "Object Ledger");
  assert.equal(objectState.ledger.tracks[0].blocks[0].content[0][0], "note");

  const invalid = await client.callTool({
    name: "show",
    arguments: { ledger: { tracks: [] } },
  });
  assert.equal(invalid.isError, true, "Invalid ledger input should return a tool error.");
  assert.match(invalid.content[0].text, /non-empty tracks array/);

  const unchanged = await fetch(`${origin}/api/ledger`).then((response) => response.json());
  assert.equal(unchanged.version, 2, "A failed load must not replace the valid cache.");

  console.log("Passed: ID-based composition, initialization, validation, bilingual help, MCP tools, page, and cache API.");
} finally {
  if (connected) {
    await client.close();
  } else {
    await transport.close();
  }
}
