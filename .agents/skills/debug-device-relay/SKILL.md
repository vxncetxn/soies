---
name: debug-device-relay
description: >-
  Sets up a LAN debug ingest relay so Cursor debug-mode instrumentation works
  on physical iOS/Android devices (127.0.0.1 is unreachable from the phone).
  Use when debugging on a real device, debug logs are empty, fetch to
  127.0.0.1:7650 fails, or the user mentions debug relay / device logging /
  AGENT_DEBUG_NDJSON.
---

# Debug device relay (physical devices)

Cursor's debug ingest listens on **localhost only** (`127.0.0.1:7650`). A
physical phone cannot reach that address. Use a LAN relay + Metro console
fallback whenever the user reproduces on a **real device**.

## When this is required

- Testing on a physical iPhone/Android (not Simulator/Emulator)
- Debug-mode NDJSON log file stays empty after reproduction
- Instrumentation uses `fetch('http://127.0.0.1:7650/ingest/...')`

Simulator/Emulator can keep using `127.0.0.1` directly.

## Steps (do these before asking the user to reproduce)

### 1. Resolve the Mac LAN IP

```bash
ipconfig getifaddr en0 || ipconfig getifaddr en1
```

Use the IP Metro already prints (e.g. `Metro: …url=http://172.20.10.3:8081`).
Phone and Mac must be on the same network (including iPhone Personal Hotspot).

### 2. Start the LAN relay

Run in the background (binds `0.0.0.0:7651`, forwards to Cursor ingest, mirrors
to the session log file):

```bash
node .agents/skills/debug-device-relay/scripts/relay.mjs \
  --log /Users/vance/Documents/soies/.cursor/debug-<SESSION>.log
```

Or paste the script from [scripts/relay.mjs](scripts/relay.mjs). Defaults:

- Listen: `0.0.0.0:7651`
- Upstream: `http://127.0.0.1:7650`
- Also appends each POST body as NDJSON to `--log`

Smoke-test from the Mac:

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  "http://<LAN_IP>:7651/ingest/<INGEST_UUID>" \
  -H "Content-Type: application/json" \
  -H "X-Debug-Session-Id: <SESSION>" \
  -d '{"sessionId":"<SESSION>","message":"relay-smoke","timestamp":1}'
```

Expect `204` (or `200`) and a new line in the debug log.

### 3. Point instrumentation at the device-reachable host

Do **not** hardcode only `127.0.0.1` in app code. Prefer:

1. Metro host from `NativeModules.SourceCode.scriptURL` or `Constants.expoConfig.hostUri`
2. Hardcoded LAN IP fallback matching the current session
3. Post to `http://<host>:7651/ingest/<uuid>` (relay port, not 7650)

Also mirror with:

```ts
console.log(`AGENT_DEBUG_NDJSON ${JSON.stringify(payload)}`);
```

### 4. Optional: scrape Metro for console fallback

If ATS still blocks cleartext HTTP until a native rebuild, scrape the Expo/Metro
terminal for `AGENT_DEBUG_NDJSON` and append JSON to the debug log (see
[scripts/scrape-metro.mjs](scripts/scrape-metro.mjs)).

### 5. ATS / cleartext (native rebuild)

For reliable `fetch` from device, ensure iOS allows local networking:

```json
"ios": {
  "infoPlist": {
    "NSAppTransportSecurity": {
      "NSAllowsLocalNetworking": true
    }
  }
}
```

Requires a **native rebuild** (`npx expo run:ios --device`). JS reload alone is
not enough for Info.plist changes. Until then, rely on the Metro console scrape.

## Instrumentation checklist (debug mode)

1. Start relay (step 2) before reproduction
2. Clear **only** this session's log file via Delete tool
3. Use relay URL + `AGENT_DEBUG_NDJSON` console mirror
4. Ask user to **Reload** JS so new logger code is on device
5. After Proceed, read the log path from the debug-mode system reminder

## Common failures

| Symptom | Cause | Fix |
|---------|--------|-----|
| Empty log, no Metro `AGENT_DEBUG` lines | Bundle not reloaded / code path not hit | Reload app; add mount heartbeat log |
| Metro shows `AGENT_DEBUG` but log empty | Scrape not running / wrong terminal file | Start scrape-metro.mjs on the Expo terminal |
| `curl` to LAN:7651 fails | Relay dead / wrong IP / firewall | Restart relay; re-check `en0` IP |
| fetch fails, console works | ATS blocking HTTP | Use scrape until native rebuild with `NSAllowsLocalNetworking` |
