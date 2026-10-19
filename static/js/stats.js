/* Per-item answer history, keyed per pathway:
   m:<met>  e:<reaction> (enzyme)  c:<reaction> (cofactors)  d:<reaction> (direction)
   r:/p:<reaction> (reactants / products, enzyme-given)  w:<reaction> (which pathway)
   b:<reaction> (a membrane just before that step, Compartments mode)  z:<zone> (a compartment) */
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
  // Smoothed miss rate: unseen items sit at 0.5 so new material still comes up.
  rate(pid, key) {
    const one = (p, k) => { const e = Store.data.stats[p]?.[k]; return e ? (e.miss + 0.5) / (e.n + 1) : 0.5; };
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
    const mn = id => p.metabolites[id]?.short || p.metabolites[id]?.name || id;
    for (const [key, e] of Object.entries(s)) {
      const [t, id] = key.split(':');
      let label, kind;
      if (t === 'm') { if (!p.metabolites[id]) continue; label = p.metabolites[id].name; kind = 'Metabolite'; }
      else if (t === 'z') { label = id.split('|').reverse().join(' · '); kind = 'Compartment'; }
      else {
        const r = p.reactions.find(x => x.id === id); if (!r) continue;
        const en = p.enzymes[r.enzyme]?.name || r.enzyme, pair = `${mn(r.from)} → ${mn(r.to)}`;
        ({ e: () => { label = en; kind = 'Enzyme'; },
          c: () => { const c = r.cofactors || {}; label = `${en}: ${(c.in || []).length && (c.out || []).length ? 'cofactors in' : 'cofactors'}`; kind = 'Cofactors'; },
          o: () => { label = `${en}: cofactors out`; kind = 'Cofactors'; },
          n: () => { label = `${en}: what it needs`; kind = 'Cofactors'; },
          d: () => { label = `${pair}: direction`; kind = 'Direction'; },
          r: () => { label = `${en}: reactants`; kind = 'Reactants'; },
          p: () => { label = `${en}: products`; kind = 'Products'; },
          w: () => { label = `${en}: pathway`; kind = 'Pathway'; },
          l: () => { label = `${en}: location`; kind = 'Location'; },
          b: () => { label = `Membrane before ${en}`; kind = 'Membrane'; } })[t]?.();
        if (!label) continue;
      }
      out.push({ pid: p.id, pname: p.name, key, label, kind, n: e.n, miss: e.miss, rate: e.miss / e.n, last: e.last || 0 });
    }
    return out.sort((a, b) => b.rate - a.rate || b.miss - a.miss || a.label.localeCompare(b.label));
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
