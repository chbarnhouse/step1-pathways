#!/usr/bin/env python3
"""STEP 1 Pathways — self-hosted server for studying biochemical pathways.

Standard library only. Serves the app from ./static plus:

  GET /bundle.js           built-in pathways + cofactors, generated live from ./data
  GET /api/state           your edits and answer history (data/user/state.json)
  PUT /api/state           replace it (single user, LAN only — no auth)

The same front end also runs with no server at all: build.py inlines everything into
dist/pathways.html, which keeps its state in the browser instead.

Env: PORT (default 8000), HOST (default 0.0.0.0), PATHWAYS_DATA (default ./data),
     PATHWAYS_USER_STATE (default ./data/user/state.json — keep it outside the code on a server).
"""
import json
import os
import shutil
import tempfile
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = Path(os.environ.get("PATHWAYS_DATA", ROOT / "data"))
STATE = Path(os.environ.get("PATHWAYS_USER_STATE", DATA / "user" / "state.json"))
MAX_STATE = 8 * 1024 * 1024


def bundle():
    """The built-in library as one object: {cofactors, pathways: {id: pathway}}."""
    pathways = {}
    for f in sorted((DATA / "pathways").glob("*.json")):
        p = json.loads(f.read_text())
        pathways[p["id"]] = p
    renames = json.loads((DATA / "renames.json").read_text()) if (DATA / "renames.json").exists() else {}
    return {"cofactors": json.loads((DATA / "cofactors.json").read_text()), "pathways": pathways, "renames": renames}


def bundle_js():
    return "window.PATHWAYS_BUNDLE = " + json.dumps(bundle(), ensure_ascii=False) + ";\n"


BACKUPS_KEPT = 30


def keep_daily_backup():
    """Before the first write of each day, copy state.json to backups/state-YYYY-MM-DD.json (the last 30 days are kept)."""
    folder = STATE.parent / "backups"
    folder.mkdir(exist_ok=True)
    today = folder / f"state-{time.strftime('%Y-%m-%d')}.json"
    if not today.exists():
        shutil.copy2(STATE, today)
        for old in sorted(folder.glob("state-*.json"))[:-BACKUPS_KEPT]:
            old.unlink()


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def send_body(self, body, ctype, status=200):
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, obj, status=200):
        self.send_body(json.dumps(obj, ensure_ascii=False).encode(), "application/json; charset=utf-8", status)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/bundle.js":
            return self.send_body(bundle_js().encode(), "text/javascript; charset=utf-8")
        if path == "/api/state":
            return self.send_json(json.loads(STATE.read_text()) if STATE.exists() else {})
        if path.startswith("/api/"):
            return self.send_json({"error": "not found"}, 404)
        return super().do_GET()

    def do_PUT(self):
        if self.path.split("?", 1)[0] != "/api/state":
            return self.send_json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_STATE:
            return self.send_json({"error": "bad size"}, 413)
        try:
            obj = json.loads(self.rfile.read(n))
            assert isinstance(obj, dict)
        except Exception:
            return self.send_json({"error": "bad json"}, 400)
        STATE.parent.mkdir(parents=True, exist_ok=True)
        if STATE.exists():
            try:
                old_schema = int(json.loads(STATE.read_text()).get("schema") or 0)
            except Exception:
                old_schema = 0
            # An older copy of the app (a tab left open across an update) must not overwrite newer data.
            if int(obj.get("schema") or 0) < old_schema:
                return self.send_json({"error": "data is newer than this page; reload"}, 409)
            keep_daily_backup()
        fd, tmp = tempfile.mkstemp(dir=STATE.parent, suffix=".tmp")
        with os.fdopen(fd, "w") as f:
            json.dump(obj, f, ensure_ascii=False)
        os.replace(tmp, STATE)  # atomic
        return self.send_json({"ok": True})

    def end_headers(self):
        if not self.path.startswith("/api/") and self.path != "/bundle.js":
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("PATHWAYS_QUIET") != "1":
            super().log_message(fmt, *args)


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    print(f"STEP 1 Pathways on http://{host}:{port}  (data: {DATA})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
