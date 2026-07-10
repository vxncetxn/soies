#!/usr/bin/env node
/**
 * Scrape an Expo/Metro terminal transcript for AGENT_DEBUG_NDJSON lines and
 * append the JSON payloads to the debug session log.
 *
 * Usage:
 *   node scrape-metro.mjs \
 *     --terminal /Users/…/terminals/1.txt \
 *     --log /Users/…/.cursor/debug-SESSION.log
 */
import fs from "node:fs";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const TERM = arg("--terminal", "");
const LOG = arg("--log", "");
const PREFIX = "AGENT_DEBUG_NDJSON ";

if (!TERM || !LOG) {
  console.error("Usage: node scrape-metro.mjs --terminal <path> --log <path>");
  process.exit(1);
}

let pos = 0;
try {
  pos = fs.statSync(TERM).size;
} catch {
  /* start at 0 when file appears */
}

console.log(`metro-scrape watching ${TERM} → ${LOG}`);

setInterval(() => {
  try {
    const st = fs.statSync(TERM);
    if (st.size < pos) pos = 0;
    if (st.size === pos) return;
    const fd = fs.openSync(TERM, "r");
    const len = st.size - pos;
    const buf = Buffer.alloc(len);
    fs.readSync(fd, buf, 0, len, pos);
    fs.closeSync(fd);
    pos = st.size;
    for (const line of buf.toString("utf8").split(/\n/)) {
      const idx = line.indexOf(PREFIX);
      if (idx === -1) continue;
      const json = line.slice(idx + PREFIX.length).trim();
      if (!json.startsWith("{")) continue;
      fs.appendFileSync(LOG, json + "\n");
      console.log("scraped", json.slice(0, 120));
    }
  } catch (err) {
    console.error(err);
  }
}, 500);
