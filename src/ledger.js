/**
 * Normalize ledger objects into the display model consumed by the HTTP layer.
 * This module is a pure function: it does not depend on MCP or HTTP and does not write files.
 */

/** Default track colors from the Everforest Light accent palette. */
const PALETTE = [
  "#8da101",
  "#3a94c5",
  "#df69ba",
  "#f57d26",
  "#35a77c",
  "#dfa000",
  "#f85552",
  "#829181",
];

/** All non-reserved block keys are preserved as content in their original order. */
const RESERVED = new Set(["id", "start", "end", "title"]);

export class LedgerError extends Error {
  constructor(message) {
    super(message);
    this.name = "LedgerError";
  }
}

/**
 * @param {unknown} input
 * @returns {{ title: string, axis: { min: number, max: number, step: number, ticks: Array<{at:number,label:string}>, label: string }, tracks: Array<{ id: string, name: string, color: string, blocks: Array<{ id: string, lane: number, start: number, end: number, title: string, content: Array<[string, unknown]> }> }>, stats: { tracks: number, blocks: number } }}
 */
export function normalizeLedger(input) {
  if (!isPlainObject(input)) {
    throw new LedgerError("The ledger must be a JSON object.");
  }

  const tracksIn = input.tracks;
  if (!Array.isArray(tracksIn) || tracksIn.length === 0) {
    throw new LedgerError("The ledger must contain a non-empty tracks array.");
  }

  const tracks = tracksIn.map((track, index) => normalizeTrack(track, index));
  assertUniqueTrackIds(tracks);
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  initializeReferencedTracks(tracks, tracksById);
  initializeBaseBlocks(tracks);
  assignLanesAndValidate(tracks);
  assertAcyclicReferences(tracks);
  const axis = normalizeAxis(input.axis, tracks);
  const title =
    typeof input.title === "string" && input.title.trim() ? input.title.trim() : "Time Ledger";
  const blockCount = tracks.reduce((sum, track) => sum + track.blocks.length, 0);

  return {
    title,
    axis,
    tracks,
    stats: { tracks: tracks.length, blocks: blockCount },
  };
}

function assertUniqueTrackIds(tracks) {
  const ids = new Set();
  for (const track of tracks) {
    if (ids.has(track.id)) throw new LedgerError(`Track ID "${track.id}" is not unique.`);
    ids.add(track.id);
  }
}

function normalizeTrack(track, index) {
  if (!isPlainObject(track)) {
    throw new LedgerError(`tracks[${index}] must be an object.`);
  }

  const id = requireId(track.id, `tracks[${index}].id`);
  const name = typeof track.name === "string" && track.name.trim() ? track.name.trim() : id;
  const color =
    typeof track.color === "string" && track.color.trim()
      ? track.color.trim()
      : PALETTE[index % PALETTE.length];

  if (!Array.isArray(track.blocks)) {
    throw new LedgerError(`tracks[${index}].blocks must be an array.`);
  }

  const blocks = track.blocks.map((block, bi) => normalizeBlock(block, `tracks[${index}].blocks[${bi}]`));
  return { id, name, color, blocks };
}

function normalizeBlock(block, path) {
  if (!isPlainObject(block)) {
    throw new LedgerError(`${path} must be an object.`);
  }

  const id = requireId(block.id, `${path}.id`);
  const start = toFinite(block.start, `${path}.start`);
  const end = block.end === undefined ? start : toFinite(block.end, `${path}.end`);

  const rawTitle = block.title;
  const title =
    typeof rawTitle === "string" ? rawTitle : rawTitle === undefined || rawTitle === null ? "" : String(rawTitle);

  const content = [];
  for (const key of Object.keys(block)) {
    if (RESERVED.has(key)) continue;
    content.push([key, sanitizeValue(block[key])]);
  }

  return {
    id,
    start: Math.min(start, end),
    end: Math.max(start, end),
    title,
    content,
  };
}

function initializeReferencedTracks(tracks, tracksById) {
  for (const track of [...tracks]) {
    for (const block of track.blocks) {
      if (block.id === track.id || tracksById.has(block.id)) continue;

      const generated = {
        id: block.id,
        name: block.title || block.id,
        color: PALETTE[tracks.length % PALETTE.length],
        blocks: [copyBaseBlock(block)],
      };
      tracks.push(generated);
      tracksById.set(generated.id, generated);
    }
  }
}

function initializeBaseBlocks(tracks) {
  for (const track of tracks) {
    if (track.blocks.some((block) => block.id === track.id)) continue;

    const firstReference = tracks
      .filter((candidate) => candidate !== track)
      .flatMap((candidate) => candidate.blocks)
      .find((block) => block.id === track.id);

    if (!firstReference) {
      throw new LedgerError(
        `Track "${track.id}" has no base block. Add a block with id "${track.id}" or reference it from another track.`,
      );
    }

    track.blocks.push(copyBaseBlock(firstReference));
  }
}

function copyBaseBlock(block) {
  return {
    ...block,
    content: block.content.map(([key, value]) => [key, sanitizeValue(value)]),
  };
}

function assignLanesAndValidate(tracks) {
  for (const track of tracks) {
    const lanes = new Map();
    const blocksById = new Map();

    for (const block of track.blocks) {
      if (!lanes.has(block.id)) lanes.set(block.id, lanes.size);
      block.lane = lanes.get(block.id);

      const occurrences = blocksById.get(block.id) ?? [];
      occurrences.push(block);
      blocksById.set(block.id, occurrences);
    }

    for (const [id, blocks] of blocksById) {
      blocks.sort((a, b) => a.start - b.start || a.end - b.end);
      for (let index = 1; index < blocks.length; index += 1) {
        if (blocks[index].start <= blocks[index - 1].end) {
          throw new LedgerError(
            `Track "${track.id}" has overlapping blocks with id "${id}" at ${blocks[index].start}.`,
          );
        }
      }
    }
  }
}

function assertAcyclicReferences(tracks) {
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const visited = new Set();
  const visiting = [];

  function visit(id) {
    const cycleStart = visiting.indexOf(id);
    if (cycleStart !== -1) {
      throw new LedgerError(`Circular track reference: ${[...visiting.slice(cycleStart), id].join(" -> ")}.`);
    }
    if (visited.has(id)) return;

    visiting.push(id);
    const track = tracksById.get(id);
    for (const block of track.blocks) {
      if (block.id !== track.id) visit(block.id);
    }
    visiting.pop();
    visited.add(id);
  }

  for (const track of tracks) visit(track.id);
}

/**
 * Compose the active block layers for each track at a cursor coordinate.
 * The topmost sub-track wins field conflicts; referenced tracks are resolved recursively.
 */
export function composeTracksAt(tracks, cursor) {
  const tracksById = new Map(tracks.map((track) => [track.id, track]));
  const cache = new Map();
  const visiting = [];

  function composeTrack(id) {
    if (cache.has(id)) return cache.get(id);
    if (visiting.includes(id)) {
      throw new LedgerError(`Circular track reference while composing "${id}".`);
    }

    const track = tracksById.get(id);
    if (!track) throw new LedgerError(`Referenced track "${id}" does not exist.`);

    visiting.push(id);
    const activeBlocks = track.blocks
      .filter((block) => cursor >= block.start && cursor <= block.end)
      .sort((a, b) => b.lane - a.lane);
    const content = Object.create(null);
    const origins = Object.create(null);
    const sourceIds = new Set();
    let title = "";

    for (const block of activeBlocks) {
      const referenced =
        block.id === track.id ? null : composeTrack(block.id);
      const layer =
        referenced && referenced.sourceIds.length > 0
          ? referenced
          : directLayer(block);

      mergeContent(content, layer.content, layer.origins, block.id, [], origins);
      sourceIds.add(block.id);
      for (const sourceId of layer.sourceIds) sourceIds.add(sourceId);
      if (layer.title) title = layer.title;
    }

    visiting.pop();
    const composition = {
      title,
      content,
      origins,
      sourceIds: [...sourceIds],
      activeBlocks,
    };
    cache.set(id, composition);
    return composition;
  }

  for (const track of tracks) composeTrack(track.id);
  return cache;
}

function directLayer(block) {
  const content = Object.create(null);
  const origins = Object.create(null);
  for (const [key, value] of block.content) {
    content[key] = value;
    assignOrigins(value, [key], block.id, origins);
  }
  return { title: block.title, content, origins, sourceIds: [block.id] };
}

function mergeContent(target, source, sourceOrigins, fallbackId, path, targetOrigins) {
  for (const [key, value] of Object.entries(source)) {
    const childPath = [...path, key];
    const targetValue = target[key];

    if (isPlainObject(value) && isPlainObject(targetValue)) {
      mergeContent(targetValue, value, sourceOrigins, fallbackId, childPath, targetOrigins);
      continue;
    }

    target[key] = cloneJsonValue(value);
    clearOrigins(targetOrigins, childPath);
    copyOrigins(value, sourceOrigins, childPath, fallbackId, targetOrigins);
  }
}

function assignOrigins(value, path, sourceId, origins) {
  if (isPlainObject(value) && Object.keys(value).length > 0) {
    for (const [key, child] of Object.entries(value)) {
      assignOrigins(child, [...path, key], sourceId, origins);
    }
    return;
  }

  if (Array.isArray(value) && value.length > 0) {
    value.forEach((child, index) => assignOrigins(child, [...path, index], sourceId, origins));
    return;
  }

  origins[JSON.stringify(path)] = sourceId;
}

function copyOrigins(value, sourceOrigins, sourcePath, fallbackId, targetOrigins) {
  const entries = Object.entries(sourceOrigins).filter(([encodedPath]) =>
    startsWithPath(JSON.parse(encodedPath), sourcePath),
  );

  if (entries.length === 0) {
    assignOrigins(value, sourcePath, fallbackId, targetOrigins);
    return;
  }

  for (const [encodedPath, sourceId] of entries) {
    targetOrigins[encodedPath] = sourceId;
  }
}

function clearOrigins(origins, path) {
  for (const encodedPath of Object.keys(origins)) {
    if (startsWithPath(JSON.parse(encodedPath), path)) delete origins[encodedPath];
  }
}

function startsWithPath(candidate, prefix) {
  return prefix.length <= candidate.length && prefix.every((part, index) => part === candidate[index]);
}

function cloneJsonValue(value) {
  if (Array.isArray(value)) return value.map(cloneJsonValue);
  if (!isPlainObject(value)) return value;

  const copy = Object.create(null);
  for (const [key, child] of Object.entries(value)) copy[key] = cloneJsonValue(child);
  return copy;
}

function normalizeAxis(axisIn, tracks) {
  const starts = [];
  const ends = [];
  for (const track of tracks) {
    for (const block of track.blocks) {
      starts.push(block.start);
      ends.push(block.end);
    }
  }

  let min = starts.length ? Math.min(...starts) : 0;
  let max = ends.length ? Math.max(...ends) : 10;

  const axis = isPlainObject(axisIn) ? axisIn : {};
  if (axis.min !== undefined) min = toFinite(axis.min, "axis.min");
  if (axis.max !== undefined) max = toFinite(axis.max, "axis.max");
  if (max < min) [min, max] = [max, min];
  if (max === min) {
    min -= 0.5;
    max += 0.5;
  }

  const step = niceStep(max - min, 8);
  const explicit = normalizeTicks(axis.ticks);
  const ticks = explicit.length ? explicit : autoTicks(min, max, step);
  const label = typeof axis.label === "string" ? axis.label.trim() : "";

  return { min, max, step, ticks, label };
}

function normalizeTicks(raw) {
  if (!Array.isArray(raw)) return [];

  const ticks = [];
  for (const item of raw) {
    if (typeof item === "number") {
      if (!Number.isFinite(item)) continue;
      const at = round(item);
      ticks.push({ at, label: formatNumber(at) });
      continue;
    }
    if (isPlainObject(item)) {
      const at = Number(item.at);
      if (!Number.isFinite(at)) continue;
      const value = round(at);
      ticks.push({
        at: value,
        label: item.label === undefined || item.label === null ? formatNumber(value) : String(item.label),
      });
    }
  }

  ticks.sort((a, b) => a.at - b.at);
  return ticks;
}

function autoTicks(min, max, step) {
  const ticks = [];
  const first = Math.ceil(min / step - 1e-9) * step;
  const count = Math.min(500, Math.floor((max - first) / step + 1e-9) + 1);
  for (let i = 0; i < count; i += 1) {
    const at = round(first + i * step);
    ticks.push({ at, label: formatNumber(at) });
  }
  return ticks;
}

function niceStep(span, target) {
  const raw = span / target;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / magnitude;
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
}

function toFinite(value, path) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return Number(value);
  }
  throw new LedgerError(`${path} must be a finite number; received ${JSON.stringify(value)}.`);
}

function requireId(value, path) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new LedgerError(`${path} must be a non-empty string.`);
  }
  return value.trim();
}

/**
 * Preserve JSON values so the page can render their original structure as a tree.
 * Values that JSON cannot represent are converted to text so the cache remains serializable.
 */
function sanitizeValue(value) {
  if (value === null) return null;

  const type = typeof value;
  if (type === "string" || type === "boolean") return value;
  if (type === "number") return Number.isFinite(value) ? value : String(value);
  if (type === "undefined") return "undefined";
  if (type !== "object") return String(value);

  if (Array.isArray(value)) return value.map((item) => sanitizeValue(item));

  const plain = Object.create(null);
  for (const key of Object.keys(value)) {
    plain[key] = sanitizeValue(value[key]);
  }
  return plain;
}

function round(value) {
  return Math.round(value * 1e9) / 1e9;
}

function formatNumber(value) {
  return Number.isInteger(value) ? String(value) : String(round(value));
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
