/* Per-item answer history, keyed per pathway:
   m:<met>  e:<reaction> (enzyme)  c:<reaction> (cofactors)  d:<reaction> (direction)
   r:/p:<reaction> (reactants / products, enzyme-given)  w:<reaction> (which pathway)
   b:<reaction> (a membrane just before that step, Compartments mode)  z:<zone> (a compartment)
   f:<reaction> (activates or inhibits)  g:<group> (a grouping's name)  gb:<group> (finding its boxes, Draw yourself) */
'use strict';

const Stats = {
  of(pid) { return (Store.data.stats[pid] = Store.data.stats[pid] || {}); },
  // A connected quiz ("link:a+b") files each answer under the pathway(s) it belongs to.
  targets(pid, key) { return String(pid).startsWith(LINK_PREFIX) ? stitchTargets(Library.get(pid), key) : [[pid, key]]; },
  record(pid, key, ok) {
    for (const [p, k] of this.targets(pid, key)) {
      const s = this.of(p), e = (s[k] = s[k] || { n: 0, miss: 0 });
      e.n++; if (!ok) e.miss++; e.last = Date.now();
    }
    Store.save();
  },
  // Your own mix-ups: a wrong answer that is the name of something else (glucokinase for hexokinase), counted per item.
  mix(pid, key, wrong) {
    for (const [p, k] of this.targets(pid, key)) {
      const s = ((Store.data.mixups = Store.data.mixups || {})[p] = Store.data.mixups[p] || {}), e = (s[k] = s[k] || {}), w = norm(wrong);
      e[w] = { name: wrong, n: (e[w]?.n || 0) + 1, last: Date.now() };
    }
    Store.save();
  },
  mixes(pid, key) { return this.targets(pid, key).flatMap(([p, k]) => Object.values(Store.data.mixups?.[p]?.[k] || {})).sort((a, b) => b.n - a.n); },
  // Smoothed miss rate: unseen items sit at 0.5 so new material still comes up. Items you keep mixing up come back sooner.
  rate(pid, key) {
    const one = (p, k) => { const e = Store.data.stats[p]?.[k], mx = Object.values(Store.data.mixups?.[p]?.[k] || {}).reduce((n, x) => n + x.n, 0);
      return Math.min(1, (e ? (e.miss + 0.5) / (e.n + 1) : 0.5) + 0.1 * Math.min(3, mx)); };
    const ts = this.targets(pid, key);
    return ts.length ? Math.max(...ts.map(([p, k]) => one(p, k))) : 0.5;
  },
  reset(pid) { if (pid) delete Store.data.stats[pid]; else Store.data.stats = {}; Store.save(); },
  // First-try accuracy over everything answered in a pathway, or null if nothing yet.
  accuracy(pid) {
    const s = Store.data.stats[pid];
    if (!s) return null;
    let n = 0, miss = 0;
    for (const e of Object.values(s)) { n += e.n; miss += e.miss; }
    return n ? { n, pct: Math.round(100 * (n - miss) / n) } : null;
  },
  rows(p) {
    const s = Store.data.stats[p.id] || {}, out = [];
    for (const [key, e] of Object.entries(s)) {
      const d = this.describe(p, key); if (!d) continue;
      out.push({ pid: p.id, pname: p.name, key, label: d.label, kind: d.kind, n: e.n, miss: e.miss, rate: e.miss / e.n, last: e.last || 0 });
    }
    return out.sort((a, b) => b.rate - a.rate || b.miss - a.miss || a.label.localeCompare(b.label));
  },
  // What a stats key asks about, in words: { label, kind }, or null when the pathway no longer has it.
  describe(p, key) {
    const mn = id => p.metabolites[id]?.short || p.metabolites[id]?.name || id;
    {
      const [t, id] = key.split(':');
      let label, kind;
      if (t === 'm') { if (!p.metabolites[id]) return null; label = p.metabolites[id].name; kind = 'Metabolite'; }
      else if (t === 'z') { label = id.split('|').reverse().join(' · '); kind = 'Compartment'; }
      else if (t === 'v') { const d = p.reactions.flatMap(r => r.diseases || []).find(x => norm(x.name) === id); if (!d) return null; label = d.name; kind = 'Where it breaks'; }
      else if (t === 'g' || t === 'gb') { const g = (p.groups || []).find(x => x.id === id); if (!g) return null; label = t === 'g' ? g.name : `${g.name}: its boxes`; kind = 'Group'; }
      else {
        const r = p.reactions.find(x => x.id === id); if (!r) return null;
        const en = p.enzymes[r.enzyme]?.name || r.enzyme, pair = `${mn(r.from)} → ${mn(r.to)}`;
        ({ e: () => { label = en; kind = r.transport ? 'Transporter' : 'Enzyme'; },
          c: () => { const c = r.cofactors || {}; label = `${en}: ${(c.in || []).length && (c.out || []).length ? 'cofactors in' : 'cofactors'}`; kind = 'Cofactors'; },
          o: () => { label = `${en}: cofactors out`; kind = 'Cofactors'; },
          n: () => { label = `${en}: what it needs`; kind = 'Cofactors'; },
          d: () => { label = `${pair}: direction`; kind = 'Direction'; },
          r: () => { label = `${en}: reactants`; kind = 'Reactants'; },
          p: () => { label = `${en}: products`; kind = 'Products'; },
          w: () => { label = `${en}: pathway`; kind = 'Pathway'; },
          l: () => { label = `${en}: location`; kind = 'Location'; },
          f: () => { label = `${en}: ${mn(r.from)} → ${mn(r.to)}, activates or inhibits`; kind = 'Effect'; },
          b: () => { label = `Membrane before ${en}`; kind = 'Membrane'; },
          t: () => { label = p.enzymes[r.via]?.name || en; kind = 'Transporter'; },
          k: () => { label = `${en}: rate-limiting`; kind = 'Rate-limiting'; },
          y: () => { label = `${en}: on or off when fed`; kind = 'Fed vs fasting'; },
          x: () => { label = `${en}: on or off when fasting`; kind = 'Fed vs fasting'; },
          q: () => { label = `${en}: drugs & toxins`; kind = 'Drugs & toxins'; } })[t]?.();
        if (!label) return null;
      }
      return { label, kind };
    }
  },
  // Misses by kind of question, everywhere: [{ kind, n, miss, rate, pids }], worst first (kinds you've answered 3+ times).
  byKind() {
    const k = {};
    for (const p of Object.values(Library.all())) for (const r of this.rows(p)) { const e = (k[r.kind] = k[r.kind] || { kind: r.kind, n: 0, miss: 0, pids: new Set() }); e.n += r.n; e.miss += r.miss; if (r.miss) e.pids.add(r.pid); }
    return Object.values(k).filter(e => e.n >= 3).map(e => ({ ...e, rate: e.miss / e.n, pids: [...e.pids] })).sort((a, b) => b.rate - a.rate || b.miss - a.miss);
  },
  // Your most frequent mix-ups: [{ pid, key, wrong, n, label }].
  topMixes(limit = 5) {
    const out = [];
    for (const [pid, keys] of Object.entries(Store.data.mixups || {})) { const p = Library.get(pid); if (!p) continue;
      for (const [key, ws] of Object.entries(keys)) for (const w of Object.values(ws)) out.push({ pid, key, wrong: w.name, n: w.n, last: w.last || 0, label: this.describe(p, key)?.label || key, pname: p.name }); }
    return out.sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit);
  },
  worst(limit = 8) {
    return Object.values(Library.all()).flatMap(p => this.rows(p)).filter(r => r.miss > 0)
      .sort((a, b) => b.rate - a.rate || b.miss - a.miss || b.last - a.last).slice(0, limit);
  },
};

function statsTableHTML(rows, { showPathway = false } = {}) {
  if (!rows.length) return '<p class="muted">Nothing missed yet. Answers you miss or reveal show up here.</p>';
  return `<div class="tablewrap"><table class="stats"><thead><tr><th>Item</th>${showPathway ? '<th>Pathway</th>' : ''}<th>Type</th><th class="num">Missed</th><th>Miss rate</th></tr></thead><tbody>${rows.map(r => `
    <tr><td>${esc(r.label)}</td>${showPathway ? `<td class="muted">${esc(r.pname)}</td>` : ''}<td class="muted">${r.kind}</td><td class="num">${r.miss} / ${r.n}</td>
    <td><span class="bar" role="img" aria-label="${Math.round(r.rate * 100)} percent missed"><span style="width:${Math.round(r.rate * 100)}%"></span></span><span class="pct">${Math.round(r.rate * 100)}%</span></td></tr>`).join('')}</tbody></table></div>`;
}
