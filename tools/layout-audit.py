#!/usr/bin/env python3
"""Layout audit: draws pathways in WebKit and counts things that collide or crowd.
   python3 tools/layout-audit.py [all|tiles|links|map|ids…] [--url http://localhost:8124] [--json out.json]
   tiles = every pathway as a joined drawing draws it (compartments off).
   map = the merged Map (every metabolic pathway joined).
   links = every two-pathway set the app suggests (they share a link or a molecule), drawn the way New quiz draws them.
   Counted per drawing: text over text, text over a box or pill it doesn't belong to, a joining line through text, and pairs closer than 3 px."""
import json, sys
from playwright.sync_api import sync_playwright

args = [a for a in sys.argv[1:] if not a.startswith('--')]
url = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--url'), 'http://localhost:8124')
out = next((sys.argv[i + 1] for i, a in enumerate(sys.argv) if a == '--json'), None)
which = args[0] if args else 'links'

PROBE = r"""([id, zones]) => {
  const p = Library.get(id); if (!p) return null;
  const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-99999px;top:0;width:4000px';
  host.innerHTML = flowSVG(modelFor(p), () => 'shown', { zones }); document.body.append(host);
  const svg = host.querySelector('svg'), base = svg.getScreenCTM().inverse();
  const box = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
  // Things that must stay apart: each text line, each box and pill. A text belongs to the box or pill it sits in.
  const items = [];
  svg.querySelectorAll('text').forEach(t => { if (!t.textContent.trim() || t.closest('.zone-name')) return; const owner = t.closest('g.mbox, g.elab, a.xlink') || t.previousElementSibling?.matches?.('rect.xtag, rect.legend') && t.previousElementSibling;
    items.push({ kind: 'text', label: t.textContent.trim().slice(0, 40), r: box(t), owner, onLine: t.classList.contains('xtagt') && !t.closest('.xlink'), inPill: !!t.closest('g.elab.trn') && !t.matches('.drug, .reg'), box: t.closest('g.mbox') }); }); // box: a line drawn before it is painted over
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
  // Joining lines between parts (dotted hand-offs, ties) that run through a line of text.
  const texts = items.filter(i => i.kind === 'text' && !i.onLine), cross = []; // a line's own name tag sits on it
  svg.querySelectorAll('path.xline').forEach(pth => { const L = pth.getTotalLength(), ctm = pth.getScreenCTM();
    for (const t of texts) { if (pth.closest('a.xlink, g.xlink') && pth.closest('a.xlink, g.xlink') === t.owner) continue;
      for (let l = 6; l < L - 6; l += 4) { const q = pth.getPointAtLength(l), x = ctm.a * q.x + ctm.c * q.y + ctm.e, y = ctm.b * q.x + ctm.d * q.y + ctm.f;
        if (x > t.r.x + 1 && x < t.r.x + t.r.w - 1 && y > t.r.y + 2 && y < t.r.y + t.r.h - 2) { cross.push(['line', 'text:' + t.label]); break; } } } });
  hits.push(...cross);
  // Any arrow or curl (a step's own, or one drawn between parts) that runs through a line of text. Texts go in 80-px
  // buckets; each line is sampled every 4 px and only the texts in its sample's bucket are checked.
  const TB = 80, tb = new Map(), tkey = (i, j) => i * 100003 + j;
  texts.filter(t => !t.inPill).forEach(t => { for (let i = Math.floor(t.r.x / TB); i <= Math.floor((t.r.x + t.r.w) / TB); i++) for (let j = Math.floor(t.r.y / TB); j <= Math.floor((t.r.y + t.r.h) / TB); j++) { const k = tkey(i, j); (tb.get(k) || tb.set(k, []).get(k)).push(t); } });
  svg.querySelectorAll('path:not(.ah):not(.xline):not(.region):not([fill-rule]), line.ln').forEach(pth => { if (pth.closest('.blob, defs, .zone, .xlink') || !pth.getTotalLength) return;
    const L = pth.getTotalLength(), ctm = pth.getScreenCTM(), seen = new Set();
    for (let l = 6; l < L - 6; l += 4) { const q = pth.getPointAtLength(l), x = ctm.a * q.x + ctm.c * q.y + ctm.e, y = ctm.b * q.x + ctm.d * q.y + ctm.f;
      for (const t of tb.get(tkey(Math.floor(x / TB), Math.floor(y / TB))) || []) if (!seen.has(t) && !(t.box && pth.compareDocumentPosition(t.box) & Node.DOCUMENT_POSITION_FOLLOWING) && x > t.r.x + 1 && x < t.r.x + t.r.w - 1 && y > t.r.y + 2 && y < t.r.y + t.r.h - 2) { seen.add(t); hits.push(['step', 'text:' + t.label]); } } });
  // A compartment's name tab wider than the shape it names.
  svg.querySelectorAll('rect.legend[data-room]').forEach(r => { if (+r.getAttribute('width') > +r.dataset.room - 16) hits.push(['tab', 'too wide: ' + (r.nextElementSibling?.textContent || '').trim()]); });
  host.remove();
  return { id, hits: hits.length, near: near.length, examples: hits.slice(0, 6), nearEx: near.slice(0, 4), all: hits };
}"""

with sync_playwright() as pw:
    b = pw.webkit.launch(); pg = b.new_page(viewport={'width': 1400, 'height': 1000}); pg.set_default_timeout(600000)
    pg.goto(url + '/#/'); pg.wait_for_timeout(2500)
    if which == 'links':
        ids = pg.evaluate("""() => { const out = new Set(), atoms = Library.atomic().filter(p => !p.nephron);
          for (const p of atoms) { const d = { pathway: p.id, extra: [], combine: false }; for (const q of suggestions(d)) { const d2 = { pathway: p.id, extra: [], combine: false }; addPathway(d2, q); out.add(draftPathway(d2)); } }
          return [...out].filter(id => id.startsWith('link:')).sort(); }""")
    elif which == 'map':
        ids = pg.evaluate("() => { const ids = mapPathways().filter(p => !MAP_OFF_GROUPS.includes(p.group)).map(p => p.id), d = { pathway: ids[0], extra: [], combine: false }; ids.slice(1).forEach(id => addPathway(d, id)); return [draftPathway(d)]; }")
    elif which in ('all', 'tiles'):
        ids = pg.evaluate("() => Library.atomic().map(p => p.id)")
    else:
        ids = args
    res = [r for r in (pg.evaluate(PROBE, [i, which != 'tiles']) for i in ids) if r]
    b.close()
res.sort(key=lambda r: -(r['hits'] * 3 + r['near']))
tot_h, tot_n = sum(r['hits'] for r in res), sum(r['near'] for r in res)
print(f"{len(res)} drawings · {tot_h} collisions · {tot_n} too close")
for r in res[:25]:
    if r['hits'] or r['near']:
        print(f"  {r['id']}: {r['hits']} collide, {r['near']} close  e.g. {r['examples'][:3] or r['nearEx'][:2]}")
if out: json.dump(res, open(out, 'w'), indent=1)
