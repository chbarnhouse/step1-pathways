/* Per-item history: how often each metabolite / enzyme / cofactor set / direction was asked and missed.
   Feeds the "Weak spots first" filter and the Weak spots dialog. Keys:
   m:<met>  e:<reaction>  (asked as the enzyme)  c:<reaction> (cofactors)  d:<reaction> (direction) */
'use strict';

const Stats = {
  of(pid) { return (Store.data.stats[pid] = Store.data.stats[pid] || {}); },
  record(pid, key, ok) {
    const s = this.of(pid), e = (s[key] = s[key] || { n: 0, miss: 0 });
    e.n++; if (!ok) e.miss++; e.last = Date.now();
    Store.save();
  },
  // Smoothed miss rate: unseen items sit at 0.5 so new material still comes up.
  rate(pid, key) { const e = this.of(pid)[key]; return e ? (e.miss + 0.5) / (e.n + 1) : 0.5; },
  // Weighted shuffle (Efraimidis–Spirakis): higher miss rate → earlier in the deck, but nothing is starved.
  order(pid, keys, weak) {
    if (!weak) return shuffle(keys);
    return keys.map(k => ({ k, r: Math.pow(Math.random(), 1 / (0.15 + 4 * this.rate(pid, k))) }))
      .sort((a, b) => b.r - a.r).map(x => x.k);
  },
  reset(pid) { delete Store.data.stats[pid]; Store.save(); },
  rows(m) {
    const s = this.of(m.p.id), out = [];
    for (const [key, e] of Object.entries(s)) {
      const [t, id] = key.split(':');
      let label, kind;
      if (t === 'm') { if (!m.p.metabolites[id]) continue; label = m.p.metabolites[id].name; kind = 'Metabolite'; }
      else {
        const r = m.p.reactions.find(x => x.id === id); if (!r) continue;
        const en = m.p.enzymes[r.enzyme]?.name || r.enzyme;
        const pair = `${m.p.metabolites[r.from]?.short || r.from} → ${m.p.metabolites[r.to]?.short || r.to}`;
        if (t === 'e') { label = en; kind = 'Enzyme'; }
        else if (t === 'c') { label = `${en} cofactors (${pair})`; kind = 'Cofactors'; }
        else { label = `${pair} direction`; kind = 'Direction'; }
      }
      out.push({ key, label, kind, n: e.n, miss: e.miss, rate: e.miss / e.n });
    }
    return out.sort((a, b) => b.rate - a.rate || b.miss - a.miss || a.label.localeCompare(b.label));
  },
};

function openStats() {
  const m = S.m, rows = Stats.rows(m);
  const d = $('#statsDialog');
  const body = rows.length ? `<table class="stats"><thead><tr><th>Item</th><th>Type</th><th class="num">Missed</th><th>Miss rate</th></tr></thead><tbody>${rows.map(r => `
    <tr><td>${esc(r.label)}</td><td class="muted">${r.kind}</td><td class="num">${r.miss} / ${r.n}</td>
    <td><div class="bar" role="img" aria-label="${Math.round(r.rate * 100)} percent"><span style="width:${Math.round(r.rate * 100)}%"></span></div><span class="pct">${Math.round(r.rate * 100)}%</span></td></tr>`).join('')}</tbody></table>`
    : '<p class="muted">Nothing recorded for this pathway yet — answer a few questions first.</p>';
  d.innerHTML = `<form method="dialog" class="dlg">
    <div class="dlg-h"><h2>Weak spots · ${esc(m.p.name)}</h2><button class="btn ghost" value="close" aria-label="Close">Close</button></div>
    <p class="muted">Every answer is counted; reveals and self-graded misses count as misses. Turn on <b>Weak spots first</b> to see the worst ones more often.</p>
    ${body}
    <div class="actions">${rows.length ? '<button class="btn" type="button" data-stats="reset">Reset this pathway</button>' : ''}</div>
  </form>`;
  d.showModal();
}
document.addEventListener('click', e => {
  if (!e.target.closest('[data-stats="reset"]')) return;
  $('#statsDialog').close();
  ask({ title: `Clear the history for ${S.m.p.name}?`, ok: 'Clear' }).then(y => { if (y) Stats.reset(S.m.p.id); openStats(); });
});
