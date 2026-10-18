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

    # Artifact variant: claude.ai wraps the page in its own document skeleton, so drop ours.
    art = re.sub(r"<!doctype html>\s*<html[^>]*>\s*<head>|</head>\s*<body>|</body>\s*</html>\s*$", "", html, flags=re.I)
    art = re.sub(r'<meta (charset|name="viewport")[^>]*>\s*', "", art)
    art = art.replace("window.PATHWAYS_STANDALONE = true;", "window.PATHWAYS_STANDALONE = true;\nwindow.PATHWAYS_ARTIFACT = true;")
    art = art.replace("<title>Pathways</title>", "<title>Biochem Pathways</title>")
    out2 = DIST / "pathways-artifact.html"
    out2.write_text(art.strip() + "\n")
    print(f"wrote {out2}")


if __name__ == "__main__":
    main()
