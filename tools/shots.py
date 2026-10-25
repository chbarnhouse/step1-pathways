#!/usr/bin/env python3
"""Render pathway diagrams at full size, for checking layouts by eye.

    python3 tools/shots.py OUT_DIR id[,id…]       one PNG per pathway, cropped to the drawing
    python3 tools/shots.py OUT_DIR all            every pathway
    python3 tools/shots.py OUT_DIR link:a+b       a connected quiz's drawing

Needs the local server (python3 server.py, port 8124) and Playwright with WebKit.
Reads the drawing off each pathway page and lays it out at 100% on a blank page, so nothing is clipped by the canvas.
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8124/'
QUIET = "() => { for (const [k, v] of [['tourNever','1'],['seenVersion','9.9.9'],['dataAck','1'],['aiAck','1'],['riskAck','1'],['remind','\"off\"']]) localStorage.setItem('pathways.' + k, v); }"


def main(out, which):
    out = Path(out); out.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.webkit.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000})
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.goto(BASE); pg.evaluate(QUIET); pg.reload(); pg.wait_for_timeout(2000)
        ids = pg.evaluate("() => Library.atomic().map(p => p.id)") if which == 'all' else which.split(',')
        css = pg.evaluate("() => [...document.styleSheets].map(s => { try { return [...s.cssRules].map(r => r.cssText).join('\\n'); } catch { return ''; } }).join('\\n')")
        sheet = b.new_page(viewport={'width': 1200, 'height': 800})
        for pid in ids:
            svg = pg.evaluate("id => { const p = Library.get(id); return p ? flowSVG(modelFor(p), () => 'shown') : ''; }", pid)
            if not svg:
                print(f'{pid}: not found'); continue
            sheet.set_content(f"<html><head><style>{css}</style></head><body style='margin:0;background:#fff'><div class='stage'>{svg}</div></body></html>")
            w, h = sheet.evaluate("() => { const s = document.querySelector('svg'), vb = s.viewBox.baseVal; s.style.width = vb.width + 'px'; s.style.height = vb.height + 'px'; return [Math.ceil(vb.width), Math.ceil(vb.height)]; }")
            sheet.set_viewport_size({'width': max(200, w), 'height': max(200, h)})
            f = out / f"{pid.replace(':', '_').replace('+', '_')}.png"
            sheet.screenshot(path=str(f), clip={'x': 0, 'y': 0, 'width': w, 'height': h})
            print(f'{pid}: {w}×{h} → {f}')
        b.close()
        if errs: print('page errors:', errs)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'all')
