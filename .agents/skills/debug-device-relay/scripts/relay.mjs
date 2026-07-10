#!/usr/bin/env node
/**
 * LAN debug ingest relay for physical devices.
 *
 * Listens on 0.0.0.0:7651, forwards to Cursor's localhost:7650 ingest, and
 * mirrors each POST body as NDJSON into the session log file.
 *
 * Usage:
 *   node relay.mjs --log /path/to/debug-SESSION.log
 *   node relay.mjs --log ./debug.log --port 7651 --upstream http://127.0.0.1:7650
 */
import fs from "node:fs";
import http from "node:http";

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  if (i === -1 || i + 1 >= process.argv.length) return fallback;
  return process.argv[i + 1];
}

const PORT = Number(arg("--port", "7651"));
const UPSTREAM = arg("--upstream", "http://127.0.0.1:7650");
const LOG = arg("--log", "");

if (!LOG) {
  console.error("Missing --log /path/to/debug-SESSION.log");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Debug-Session-Id");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    try {
      const text = body.toString("utf8").trim();
      if (text) fs.appendFileSync(LOG, text + "\n");
    } catch (err) {
      console.error("log write failed", err);
    }

    const upstream = http.request(
      `${UPSTREAM}${req.url}`,
      {
        method: req.method,
        headers: {
          "Content-Type": req.headers["content-type"] || "application/json",
          "Content-Length": body.length,
          "X-Debug-Session-Id": req.headers["x-debug-session-id"] || "",
        },
      },
      (up) => {
        const out = [];
        up.on("data", (c) => out.push(c));
        up.on("end", () => {
          res.writeHead(up.statusCode || 200, {
            "Access-Control-Allow-Origin": "*",
            "Content-Type": up.headers["content-type"] || "application/json",
          });
          res.end(Buffer.concat(out));
        });
      },
    );
    upstream.on("error", (err) => {
      res.writeHead(200, {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      });
      res.end(JSON.stringify({ ok: true, relay: "file-only", error: String(err.message) }));
    });
    upstream.end(body);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`debug-relay listening on 0.0.0.0:${PORT} -> ${UPSTREAM} + ${LOG}`);
});
