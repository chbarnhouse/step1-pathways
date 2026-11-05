#!/usr/bin/env python3
"""Step 1 Pathways — self-hosted server for studying biochemical pathways.

Standard library only. Serves the app from ./static plus:

  GET /bundle.js           built-in pathways + cofactors, generated live from ./data
  GET /api/state           your edits and answer history (data/user/state.json)
  PUT /api/state           replace it (single user, LAN only — no auth)
  GET /api/feedback        the two form-response tabs (issue reports, shared pathways), through the Apps Script
                           bridge in tools/feedback-bridge.gs; {configured: false} until feedback.json exists
  POST /api/feedback/done  {tab, row, done}: mark a response done (or not)
  GET /api/analytics       ?days=7|30|90: the public site's usage counts, read through an Umami share link;
                           {configured: false} until analytics.json exists

The same front end also runs with no server at all: build.py inlines everything into
dist/pathways.html, which keeps its state in the browser instead.

Env: PORT (default 8000), HOST (default 0.0.0.0), PATHWAYS_DATA (default ./data),
     PATHWAYS_USER_STATE (default ./data/user/state.json — keep it outside the code on a server).
     The feedback bridge reads feedback.json beside the state file: {"url": "<web app URL>", "token": "<its TOKEN>"}.
     Analytics reads analytics.json beside it: {"share": "<the ID at the end of the Umami share link>"}.
"""
import json
import os
import shutil
import tempfile
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
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
    classes = json.loads((DATA / "drug-classes.json").read_text()) if (DATA / "drug-classes.json").exists() else {}
    return {"cofactors": json.loads((DATA / "cofactors.json").read_text()), "pathways": pathways, "renames": renames, "drugClasses": classes}


def bundle_js():
    return "window.PATHWAYS_BUNDLE = " + json.dumps(bundle(), ensure_ascii=False) + ";\n"


BACKUPS_KEPT = 30

FEEDBACK = STATE.parent / "feedback.json"
_feedback_cache = {"at": 0, "data": None}


def feedback_config():
    try:
        c = json.loads(FEEDBACK.read_text())
        return c if c.get("url") and c.get("token") else None
    except Exception:
        return None


def feedback(tab=None, row=None, done=None):
    """The responses from the bridge (cached 30 s); with tab/row, first marks that row done or not."""
    c = feedback_config()
    if not c:
        return {"configured": False}
    if tab is None and _feedback_cache["data"] and time.time() - _feedback_cache["at"] < 30:
        return _feedback_cache["data"]
    if tab is None:
        req = urllib.request.Request(c["url"] + "?" + urllib.parse.urlencode({"token": c["token"]}))
    else:  # Apps Script answers a POST with a redirect; urllib follows it with a GET, which returns the result
        body = json.dumps({"token": c["token"], "tab": tab, "row": row, "done": bool(done)}).encode()
        req = urllib.request.Request(c["url"], data=body, headers={"Content-Type": "text/plain"})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            data = json.loads(r.read().decode())
    except Exception as e:
        return {"configured": True, "ok": False, "error": f"couldn't reach the sheet: {e}"}
    data["configured"] = True
    if data.get("ok"):
        _feedback_cache.update(at=time.time(), data=data)
    return data


ANALYTICS = STATE.parent / "analytics.json"
UMAMI_API = "https://gateway-us.umami.is"
_analytics_cache = {}


def umami_get(path, token=None):
    headers = {"User-Agent": "step1-pathways"}
    if token:
        headers.update({"x-umami-share-token": token, "x-umami-share-context": "1"})
    with urllib.request.urlopen(urllib.request.Request(UMAMI_API + path, headers=headers), timeout=20) as r:
        return json.loads(r.read().decode())


def analytics(days):
    """The last `days` days of usage counts (cached 60 s). The share link stays here; the page gets only the numbers."""
    try:
        share = json.loads(ANALYTICS.read_text())["share"]
    except Exception:
        return {"configured": False}
    hit = _analytics_cache.get(days)
    if hit and time.time() - hit["at"] < 60:
        return hit["data"]
    end = int(time.time() * 1000)
    span = urllib.parse.urlencode({"startAt": end - days * 86400000, "endAt": end})
    try:
        s = umami_get(f"/api/share/{urllib.parse.quote(share)}")
        site = f"/api/websites/{s['websiteId']}"
        calls = {"stats": f"/stats?{span}", "daily": f"/pageviews?{span}&unit=day&timezone=America/Chicago"}
        calls.update({k: f"/metrics?{span}&type={t}&limit=10" for k, t in
                      (("pages", "path"), ("events", "event"), ("devices", "device"), ("countries", "country"))})
        calls.update({k: f"/event-data/values?{span}&event=quiz-start&propertyName={p}" for k, p in (("pathways", "pathway"), ("modes", "mode"))})
        with ThreadPoolExecutor(len(calls)) as pool:
            got = dict(zip(calls, pool.map(lambda u: umami_get(site + u, s["token"]), calls.values())))
    except Exception as e:
        return {"configured": True, "ok": False, "error": f"couldn't reach Umami: {e}"}
    data = {"configured": True, "ok": True, "days": days, "link": f"https://cloud.umami.is/share/{share}", **got}
    _analytics_cache[days] = {"at": time.time(), "data": data}
    return data


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
        if path == "/api/feedback":
            return self.send_json(feedback())
        if path == "/api/analytics":
            days = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query).get("days", ["30"])[0]
            return self.send_json(analytics(int(days))) if days in ("7", "30", "90") else self.send_json({"error": "bad days"}, 400)
        if path.startswith("/api/"):
            return self.send_json({"error": "not found"}, 404)
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?", 1)[0] != "/api/feedback/done":
            return self.send_json({"error": "not found"}, 404)
        n = int(self.headers.get("Content-Length") or 0)
        try:
            b = json.loads(self.rfile.read(n)) if 0 < n < 4096 else None
            assert b["tab"] in ("report", "share") and int(b["row"]) >= 2
        except Exception:
            return self.send_json({"error": "bad request"}, 400)
        return self.send_json(feedback(b["tab"], int(b["row"]), b.get("done", True)))

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
    print(f"Step 1 Pathways on http://{host}:{port}  (data: {DATA})")
    ThreadingHTTPServer((host, port), Handler).serve_forever()
