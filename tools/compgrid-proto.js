/* Prototype: a joined drawing laid out compartment-first. Every compartment is one column band (several sub-columns:
   one or more per pathway); each pathway runs down its own sub-columns, rows lined up on the molecules the pathways
   share (or hand across a membrane). Drawn by gridSVG, which shades the bands and puts carriers on the membranes. */
function compGrid(p) {
  const where = { ...tileWhere(p) };
  const zk = id => { const w = where[id]; return w?.loc ? canonLoc(w.loc) + '|' + (w.tissue || '') : ''; };
  // A molecule with no recorded place takes its neighbor's.
  for (let pass = 0; pass < 4; pass++) for (const r of p.reactions) { if (!where[r.from] && where[r.to]) where[r.from] = where[r.to]; if (!where[r.to] && where[r.from]) where[r.to] = where[r.from]; }
  const joins = (p.stitch?.joins || []).map(([a, b], i) => ({ id: 'join' + i, enzyme: '__join', from: a, to: b, transport: true, reversible: false, branch: true }));
  const zones = uniq(Object.keys(p.metabolites).map(zk).filter(Boolean));
  // Order the compartments so the steps between them are short: outside (blood) · cytosol · organelles.
  const wt = {}; for (const r of [...p.reactions, ...joins]) { const a = zk(r.from), b = zk(r.to); if (a && b && a !== b) { wt[a + '>' + b] = (wt[a + '>' + b] || 0) + 1; wt[b + '>' + a] = (wt[b + '>' + a] || 0) + 1; } }
  const rank = z => (/blood|plasma|extracell|lumen|gut|urine|interstit|brush/.test(z) ? 0 : /cytosol|cytoplasm/.test(z) ? 1 : /mito|matrix/.test(z) ? 3 : 2);
  const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
  const cost = o => o.reduce((s, a, i) => s + o.reduce((t, b, j) => t + (wt[a + '>' + b] || 0) * Math.abs(i - j), 0), 0) * 10 + o.reduce((s, z, i) => s + Math.abs(rank(z) - i * 3 / Math.max(1, o.length - 1)), 0);
  const order = zones.length <= 6 ? perms(zones).sort((a, b) => cost(a) - cost(b))[0] : zones.sort((a, b) => rank(a) - rank(b));
  const at = {}; // id → { z, sub: 'tile:lane', row }
  const taken = new Set(), key = (sub, row) => sub + '#' + row;
  const put = (id, z, sub, row) => { at[id] = { z, sub, row }; taken.add(key(z + '/' + sub, row)); };
  const free = (z, sub, row) => !taken.has(key(z + '/' + sub, row));
  let maxRow = -1; const SPANS = []; // steps across a membrane on one row: { row, lo, hi } in compartment order
  (p.stitch?.tiles || []).forEach((T, ti) => {
    const m = modelFor(T.p), seq = m.spineMets.filter((id, i, a) => a.indexOf(id) === i), ring = !!T.p.circular;
    const rel = {}, across = r => zk(r.from) !== zk(r.to), straight = r => (r.transport || r.via) && across(r); // through a carrier: straight across the membrane
    const lanesOf = (z, row) => Object.entries(rel).filter(([k, q]) => zk(k) === z && q.row === row).map(([, q]) => q.lane);
    const near = (z, row, lane, step = 1) => { const used = lanesOf(z, row); while (used.includes(lane)) lane += step; return lane; };
    // A cycle inside one compartment folds into a loop (down one lane, back up the next); any other main line runs down
    // one lane per compartment, straight across a membrane where a carrier takes it, a row lower when that spot is taken.
    if (ring && uniq(seq.map(zk)).length === 1) { const n = seq.length, half = Math.ceil(n / 2); seq.forEach((id, i) => { rel[id] = i < half ? { row: i, lane: 0 } : { row: n - 1 - i, lane: 1 }; }); }
    else {
      let row = 0; const crossed = new Set(); // rows a step already crosses a membrane on: the next one back drops a row
      seq.forEach((id, i) => {
        if (i) { const st = straight(m.spine[i - 1] || {}) && !crossed.has(row); row += st ? 0 : 1; if (st) crossed.add(row); }
        while (lanesOf(zk(id), row).includes(0)) row++;
        rel[id] = { row, lane: 0 };
      });
    }
    // A step's extra input (acetyl-CoA into citrate synthase): level with the step's product, just outside its lane.
    for (const r of m.spine) for (const id of r.also_from || []) if (!rel[id] && rel[r.to]) { const q = rel[r.to]; rel[id] = { row: q.row, lane: near(zk(id), q.row, q.lane - 1, -1) }; }
    // Side steps: beside the box they hang off (in the next free lane of their own compartment); through a carrier into
    // another compartment, level with it.
    for (let pass = 0; pass < 3; pass++) for (const b of m.branches) {
      const [anc, id] = rel[b.from] && !rel[b.to] ? [b.from, b.to] : rel[b.to] && !rel[b.from] ? [b.to, b.from] : [];
      if (!id) continue;
      const q = rel[anc], z = zk(id);
      rel[id] = straight(b) ? { row: q.row, lane: near(z, q.row, 0) } : z === zk(anc) ? { row: q.row, lane: near(z, q.row, q.lane + 1) } : { row: q.row + 1, lane: near(z, q.row + 1, 0) };
    }
    // Line this pathway up with what's drawn already: a molecule both have, else one handed across a membrane.
    const shared = seq.concat(Object.keys(rel)).find(id => at[id] && rel[id]);
    const join = !shared && joins.find(j => (at[j.from] && rel[j.to]) || (at[j.to] && rel[j.from]));
    // Nothing in common: its own columns, from the top, moved down until no step of it across a membrane runs along a row
    // where another pathway already crosses that membrane or has a box in either compartment.
    // (An L across a membrane may run its long leg along either row; from a box drawn already, it drops first.)
    const zi = z => order.indexOf(z), spansOf = o => m.spine.concat(m.branches).filter(r => rel[r.from] && rel[r.to] && zk(r.from) !== zk(r.to))
      .flatMap(r => uniq([rel[r.from], rel[r.to]].filter((q, i) => !at[[r.from, r.to][i]]).map(q => q.row)).map(row => ({ row: row + o, lo: Math.min(zi(zk(r.from)), zi(zk(r.to))), hi: Math.max(zi(zk(r.from)), zi(zk(r.to))) })));
    const clash = o => spansOf(o).some(sp => SPANS.some(q => q.row === sp.row && q.lo < sp.hi && sp.lo < q.hi) || Object.values(at).some(q => q.row === sp.row && zi(q.z) > sp.lo && zi(q.z) < sp.hi))
      || SPANS.some(q => Object.entries(rel).some(([k, x]) => x.row + o === q.row && zi(zk(k)) > q.lo && zi(zk(k)) < q.hi));
    let off = shared ? at[shared].row - rel[shared].row : join ? (at[join.from] ? at[join.from].row - rel[join.to].row : at[join.to].row - rel[join.from].row) : -Math.min(...Object.values(rel).map(q => q.row));
    // Lined up on a shared box, it still moves (the nearest rows first, below before above) if that row is taken.
    if (!shared && !join) while (clash(off) && off < 60) off++;
    else if (clash(off)) { const o0 = off; for (let d = 1; d < 30; d++) { if (!clash(o0 + d)) { off = o0 + d; break; } if (!clash(o0 - d)) { off = o0 - d; break; } } }
    SPANS.push(...spansOf(off));
    for (const [id, q] of Object.entries(rel)) { if (at[id]) continue; put(id, zk(id), ti + ':' + q.lane, q.row + off); maxRow = Math.max(maxRow, q.row + off); }
  });
  // Anything left (a molecule only a join reaches): beside its partner.
  for (const id of Object.keys(p.metabolites)) if (!at[id]) { const j = joins.find(j => j.from === id || j.to === id), o = j && at[j.from === id ? j.to : j.from]; put(id, zk(id), o ? o.sub : '9:0', o ? o.row : ++maxRow); }
  // Columns: compartments in order; inside each, its sub-columns by pathway, then lane.
  // Inside a compartment, the sub-columns with steps into the compartment on the left sit at its left, those with steps
  // to the right at its right, so steps across a membrane stay short.
  const subOf = id => at[id].z + '/' + at[id].sub, pull = {};
  for (const r of [...p.reactions, ...joins]) { if (!at[r.from] || !at[r.to]) continue; const a = at[r.from].z, b = at[r.to].z; if (a === b) continue;
    const d = Math.sign(order.indexOf(b) - order.indexOf(a)); pull[subOf(r.from)] = (pull[subOf(r.from)] || 0) + d; pull[subOf(r.to)] = (pull[subOf(r.to)] || 0) - d; }
  const subs = uniq(Object.values(at).map(q => q.z + '/' + q.sub)).sort((a, b) => {
    const [za, sa] = a.split('/'), [zb, sb] = b.split('/'), [ta, la] = sa.split(':').map(Number), [tb, lb] = sb.split(':').map(Number);
    return order.indexOf(za) - order.indexOf(zb) || (pull[a] || 0) - (pull[b] || 0) || ta - tb || la - lb;
  });
  const minRow = Math.min(...Object.values(at).map(q => q.row));
  const metabolites = Object.fromEntries(Object.entries(p.metabolites).map(([id, x]) => {
    const q = at[id], [loc, tissue] = (q.z || '|').split('|');
    return [id, { ...x, loc: where[id]?.loc || loc, ...(where[id]?.tissue || tissue ? { tissue: where[id]?.tissue || tissue } : {}), pos: [subs.indexOf(q.z + '/' + q.sub), q.row - minRow] }];
  }));
  // Each column's x: wide where a step crosses a membrane through a carrier (pill, name and cofactors side by side),
  // narrower between compartments otherwise, narrowest between two lanes of one compartment.
  const colOf = id => subs.indexOf(subOf(id)), gapW = [];
  for (let c = 1; c < subs.length; c++) {
    const zl = subs[c - 1].split('/')[0], zr = subs[c].split('/')[0];
    const spans = [...p.reactions, ...joins].filter(r => at[r.from] && at[r.to] && Math.min(colOf(r.from), colOf(r.to)) < c && Math.max(colOf(r.from), colOf(r.to)) >= c && at[r.from].row === at[r.to].row);
    // A carrier's pill sits on the membrane with the enzyme's name between it and the box: room for both on each side.
    const need = r => { const pill = Math.min(22, (p.enzymes[r.via]?.name || '').length) * 6.9 + 18, name = Math.min(16, (p.enzymes[r.enzyme]?.name || '').length) * 7; return 2 * (pill / 2 + name + 40) + BW; };
    gapW[c] = zl !== zr && spans.some(r => r.via) ? Math.max(BW + 300, ...spans.filter(r => r.via).map(need)) : spans.length ? BW + 230 : BW + 120;
  }
  const col_x = subs.map((_, c) => 0); for (let c = 1; c < subs.length; c++) col_x[c] = col_x[c - 1] + gapW[c];
  const gp = { ...p, id: p.id + '~bands', layout: 'grid', col_x, column_zones: { membranes: [] }, metabolites, reactions: [...p.reactions, ...joins], enzymes: { ...p.enzymes, __join: { name: 'same molecule' } } };
  delete gp.stitch;
  return gp;
}
// Joins carry no name: their enzyme is hidden.
const compGridStatus = statusOf => k => (/^[eck]:join\d+$/.test(k) ? 'hide' : statusOf(k));
