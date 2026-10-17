#!/usr/bin/env python3
"""Pathways — a small self-hosted server for studying biochemical pathways.

Standard library only. Serves the single-page app from ./static and the
pathway library from ./data as JSON:

  GET /api/pathways        -> [{id, name, summary}]
  GET /api/pathways/<id>   -> the full pathway
  GET /api/cofactors       -> the shared cofactor dictionary

Env: PORT (default 8000), HOST (default 0.0.0.0), PATHWAYS_DATA (default ./data).
"""
import json
import os
import re
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
DATA = Path(os.environ.get("PATHWAYS_DATA", ROOT / "data"))
PATHWAY_DIR = DATA / "pathways"
SAFE_ID = re.compile(r"^[a-z0-9][a-z0-9_-]*$")


def load_pathways():
    out = []
    for f in sorted(PATHWAY_DIR.glob("*.json")):
        p = json.loads(f.read_text())
        out.append({"id": p["id"], "name": p["name"], "summary": p.get("summary", "")})
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def send_json(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?", 1)[0]
        if path == "/api/pathways":
            return self.send_json(load_pathways())
        if path == "/api/cofactors":
            return self.send_json(json.loads((DATA / "cofactors.json").read_text()))
        if path.startswith("/api/pathways/"):
            pid = path.rsplit("/", 1)[1]
            f = PATHWAY_DIR / f"{pid}.json"
            if not SAFE_ID.match(pid) or not f.exists():
                return self.send_json({"error": "not found"}, 404)
            return self.send_json(json.loads(f.read_text()))
        if path.startswith("/api/"):
            return self.send_json({"error": "not found"}, 404)
        return super().do_GET()

    def end_headers(self):
        if not self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        if os.environ.get("PATHWAYS_QUIET") != "1":
            super().log_message(fmt, *args)


if __name__ == "__main__":
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    print(f"Pathways on http://{host}:{port}  (data: {DATA})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
