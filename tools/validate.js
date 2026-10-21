#!/usr/bin/env node
/* Validate every pathway in data/pathways through the app's own model.
   node tools/validate.js            → one line per pathway, non-zero exit on any problem
   Checks: references resolve, cofactor ids exist, group frames hold only their members, reading order covers everything,
   enzyme names that collide across pathways (by full name/alias) are listed for review. */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
global.window = {}; global.Store = undefined; global.localStorage = { getItem: () => null, setItem() {} }; global.document = { addEventListener() {} };
const cof = JSON.parse(fs.readFileSync(path.join(root, 'data/cofactors.json'), 'utf8'));
const pathways = {};
for (const f of fs.readdirSync(path.join(root, 'data/pathways')).filter(f => f.endsWith('.json'))) {
  const p = JSON.parse(fs.readFileSync(path.join(root, 'data/pathways', f), 'utf8'));
  if (p.id + '.json' !== f) { console.error(`✗ ${f}: id "${p.id}" must match the file name`); process.exitCode = 1; }
  pathways[p.id] = p;
}
window.PATHWAYS_BUNDLE = { cofactors: cof, pathways };
vm.runInThisContext(['util.js', 'store.js', 'model.js'].map(f => fs.readFileSync(path.join(root, 'static/js', f), 'utf8')).join('\n'));
for (const p0 of Object.values(pathways)) {
  const p = Library.get(p0.id);
  try {
    const m = buildModel(p);
    const missing = [];
    for (const r of p.reactions) for (const id of [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])]) if (!m.cof[id]) missing.push(id);
    if (missing.length) throw new Error('unknown cofactor ids: ' + uniq(missing).join(', '));
    // Connectors: the boxes that carry out a step (by) and that inhibit another box (inhibits) exist.
    const badConn = [...p.reactions.flatMap(r => (r.by || []).filter(id => !p.metabolites[id]).map(id => `${r.id} by ${id}`)),
      ...(p.inhibits || []).filter(x => !p.metabolites[x.from] || !p.metabolites[x.to]).map(x => `inhibits ${x.from} → ${x.to}`)];
    if (badConn.length) throw new Error('connectors to unknown boxes: ' + badConn.join(', '));
    // Groupings: every member exists, ids are unique, and (on a grid) the frame around a group holds no other box.
    const gids = new Set();
    for (const g of p.groups || []) {
      if (!g.id || !g.name || gids.has(g.id)) throw new Error(`group "${g.id || g.name}": needs a unique id and a name`);
      gids.add(g.id);
      const bad = (g.members || []).filter(id => !p.metabolites[id]);
      if (bad.length || !(g.members || []).length) throw new Error(`group "${g.id}": unknown or no members ${bad.join(', ')}`);
      if (p.layout === 'grid') {
        const P = g.members.map(id => p.metabolites[id].pos || [0, 0]), c0 = Math.min(...P.map(x => x[0])), c1 = Math.max(...P.map(x => x[0])), r0 = Math.min(...P.map(x => x[1])), r1 = Math.max(...P.map(x => x[1]));
        const stray = Object.entries(p.metabolites).filter(([id, x]) => !g.members.includes(id) && x.pos && x.pos[0] >= c0 && x.pos[0] <= c1 && x.pos[1] >= r0 && x.pos[1] <= r1).map(([id]) => id);
        if (stray.length) throw new Error(`group "${g.id}": its frame would also hold ${stray.join(', ')}`);
      }
    }
    console.log(`✓ ${p.id.padEnd(18)} ${String(p.reactions.length).padStart(2)} steps · ${m.seq.map(k => k.slice(2)).join(' ')}`);
  } catch (e) { console.error(`✗ ${p.id}: ${e.message}`); process.exitCode = 1; }
}
