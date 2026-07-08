"""LAN relay for debug logs from a physical device.

The Cursor log server binds 127.0.0.1:7650, which a physical iPhone can't
reach (127.0.0.1 is the device's own loopback). This relay binds 0.0.0.0:7651
on the dev machine, accepts the same JSON POST the app would send, and appends
the body verbatim as an NDJSON line to the session log file. The app sends one
JSON object per POST, so each body becomes one NDJSON line.

Errors are written to stderr (visible in the relay terminal) instead of being
swallowed, so a failed log write is diagnosable.
"""
import http.server
import socketserver
import sys
import traceback

LOG_PATH = "/Users/vance/Documents/soies/.cursor/debug-43d026.log"


class Relay(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0") or "0")
        body = self.rfile.read(length) if length > 0 else b""
        try:
            line = body.decode("utf-8").rstrip()
        except Exception:
            line = ""
        try:
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception:
            sys.stderr.write("LOG WRITE FAILED:\n" + traceback.format_exc() + "\n")
            sys.stderr.flush()
        self.send_response(200)
        self.end_headers()

    def log_message(self, *args):
        pass


with socketserver.TCPServer(("0.0.0.0", 7651), Relay) as server:
    server.serve_forever()
