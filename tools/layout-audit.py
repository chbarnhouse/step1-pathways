#!/usr/bin/env python3
"""Layout audit: draws pathways in WebKit and counts things that collide or crowd.
   python3 tools/layout-audit.py [all|links|ids…] [--url http://localhost:8124] [--json out.json]
   links = every two-pathway set the app suggests (they share a link or a molecule), drawn the way New quiz draws them.
   Counted per drawing: text over text, text over a box or pill it doesn't belong to, and pairs closer than 3 px."""
import json, sys
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
url = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--url'), 'http://localhost:8124')
out = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--json'), None)
which = args[0] if args else 'links'

PROBE = r"""(id) => {
  const p = Library.get(id); if (!p) return null;
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-99999px;top:0;width:4000px';
  host.innerHTML = flowSVG(modelFor(p), () => 'shown'); document.body.append(host);
  const svg = host.querySelector('svg'), base = svg.getScreenCTM().inverse();
  const box = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  // Things that must stay apart: each text line, each box and pill. A text belongs to the box or pill it sits in.
  const items = [];
  svg.querySelectorAll('text').forEach(t => { if (!t.textContent.trim() || t.closest('.zone-name')) return; const owner = t.closest('g.mbox, g.elab, a.xlink') || t.previousElementSibling?.matches?.('rect.xtag, rect.legend') && t.previousElementSibling;
    items.push({ kind: 'text', label: t.textContent.trim().slice(0, 40), r: box(t), owner }); });
  svg.querySelectorAll('g.mbox > rect, rect.trnpill, rect.xtag, rect.legend').forEach(r => { const owner = r.closest('g.mbox, g.elab, a.xlink') || r; items.push({ kind: r.classList.contains('trnpill') ? 'pill' : r.classList.contains('xtag') ? 'tag' : r.classList.contains('legend') ? 'tab' : 'box', label: (owner.textContent || '').trim().slice(0, 40), r: box(r), owner }); });
  const ov = (a, b, g = 0) => a.x < b.x + b.w + g && b.x < a.x + a.w + g && a.y < b.y + b.h + g && b.y < a.y + a.h + g;
  const hits = [], near = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const A = items[i], B = items[j];
    if (A.owner && (A.owner === B.owner || A.owner === B.owner?.parentNode)) continue;
    if (A.kind !== 'text' && B.kind !== 'text') { if (ov(A.r, B.r, -1)) hits.push([A.kind + ':' + A.label, B.kind + ':' + B.label]); continue; }
    if ((A.kind === 'text' && B.kind !== 'text' && B.r.w * B.r.h > 0 && A.r.x >= B.r.x - 1 && A.r.x + A.r.w <= B.r.x + B.r.w + 1 && A.r.y >= B.r.y - 1 && A.r.y + A.r.h <= B.r.y + B.r.h + 1 && B.kind !== 'box')) continue; // a pill's own text
    if (ov(A.r, B.r, -1)) hits.push([A.kind + ':' + A.label, B.kind + ':' + B.label]);
    else if (ov(A.r, B.r, 3)) near.push([A.kind + ':' + A.label, B.kind + ':' + B.label]);
  }
  host.remove();
  return { id, hits: hits.length, near: near.length, examples: hits.slice(0, 6), nearEx: near.slice(0, 4) };
}"""

with sync_playwright() as pw:
    b = pw.webkit.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000}); pg.set_default_timeout(600000)
    pg.goto(url + '/#/'); pg.wait_for_timeout(2500)
    if which == 'links':
        ids = pg.evaluate("""() => { const out = new Set(), atoms = Library.atomic().filter(p => !p.nephron);
          for (const p of atoms) { const d = { pathway: p.id, extra: [], combine: false }; for (const q of suggestions(d)) { const d2 = { pathway: p.id, extra: [], combine: false }; addPathway(d2, q); out.add(draftPathway(d2)); } }
          return [...out].filter(id => id.startsWith('link:')).sort(); }""")
    elif which == 'all':
        ids = pg.evaluate("() => Library.atomic().map(p => p.id)")
    else:
        ids = args
    res = [r for r in (pg.evaluate(PROBE, i) for i in ids) if r]
    b.close()
res.sort(key=lambda r: -(r['hits'] * 3 + r['near']))
tot_h, tot_n = sum(r['hits'] for r in res), sum(r['near'] for r in res)
print(f"{len(res)} drawings · {tot_h} collisions · {tot_n} too close")
for r in res[:25]:
    if r['hits'] or r['near']:
        print(f"  {r['id']}: {r['hits']} collide, {r['near']} close  e.g. {r['examples'][:3] or r['nearEx'][:2]}")
if out: json.dump(res, open(out, 'w'), indent=1)
