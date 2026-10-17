#!/usr/bin/env python3
"""Build dist/pathways.html — the whole app in one file, no server needed.

Inlines the stylesheet, every script and the built-in pathway library. Edits and answer
history are kept in the browser (localStorage). Anyone can open it from a file, a static
host, or a shared link; nothing talks to the homelab.

  python3 build.py
"""
import re
from pathlib import Path

from server import ROOT, STATIC, bundle_js

DIST = ROOT / "dist"


def main():
    html = (STATIC / "index.html").read_text()
    css = (STATIC / "style.css").read_text()
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}</style>")

    def inline(m):
        src = m.group(1)
        code = bundle_js() if src == "bundle.js" else (STATIC / src).read_text()
        if src == "bundle.js":
            code = "window.PATHWAYS_STANDALONE = true;\n" + code
        return "<script>\n" + code.replace("</script", "<\\/script") + "</script>"

    html = re.sub(r'<script src="([^"]+)"></script>', inline, html)
    DIST.mkdir(exist_ok=True)
    out = DIST / "pathways.html"
    out.write_text(html)
    print(f"wrote {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
