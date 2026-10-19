/* Library tabs beyond Pathways: everything in every pathway by kind (metabolites, enzymes, cofactors), each with a
   page of its own: its names, notes, and every step it's part of, linked back to the pathways.
   Built from the pathways themselves (built-in, edited and your own), merged by name, and rebuilt when any changes.
   Routes: #/library/<tab> and #/library/<tab>/<key>; the Pathways tab is #/pathways. */
'use strict';

const CAT_TABS = [['metabolites', 'Metabolites', 'met'], ['enzymes', 'Enzymes', 'enz'], ['cofactors', 'Cofactors', 'cof']];
const CAT = { built: null, sig: null, q: {} };
const catKey = name => norm(String(name)) || String(name);
// A cofactor's page. Vitamins are written differently from pathway to pathway ("B6 (pyridoxal phosphate)", "Vitamin B6 (PLP)"):
// one page per B-number.
function cofPage(m, id) {
  const b = String(id).startsWith('need:') && (m.cof[id]?.aliases || []).find(a => /^B\d{1,2}$/.test(a));
  return b ? 'vitamin-' + b.toLowerCase() : id;
}

function catalog() {
  const ps = Library.atomic().filter(p => (p.reactions || []).length);
  if (CAT.built && CAT.sig.length === ps.length && CAT.sig.every((p, i) => p === ps[i])) return CAT.built;
  const out = { met: {}, enz: {}, cof: {} };
  const entry = (kind, key, name) => (out[kind][key] = out[kind][key] || { kind, key, names: [], short: new Set(), aliases: new Set(), notes: [], steps: [], pathways: new Set() });
  const note = (e, text, p) => { if (text && !e.notes.some(n => n.text === text)) e.notes.push({ text, pid: p.id }); };
  for (const p of ps) {
    let m; try { m = modelFor(p); } catch { continue; }
    for (const [id, x] of Object.entries(p.metabolites)) {
      const e = entry('met', catKey(baseMetName(x.name)), x.name);
      e.names.push(x.name); if (x.short) e.short.add(x.short); (x.aliases || []).forEach(a => e.aliases.add(a)); note(e, x.notes, p);
      e.pathways.add(p.id);
      for (const r of p.reactions) {
        const made = r.to === id || (r.also_to || []).includes(id), used = r.from === id || (r.also_from || []).includes(id);
        if (made || used) e.steps.push({ p, m, r, role: made && used ? 'both' : made ? 'made' : 'used' });
      }
    }
    for (const r of p.reactions) {
      const x = p.enzymes[r.enzyme]; if (!x) continue;
      const e = entry('enz', catKey(x.name), x.name);
      e.names.push(x.name); if (x.short) e.short.add(x.short); (x.aliases || []).forEach(a => e.aliases.add(a)); note(e, x.notes, p);
      e.pathways.add(p.id); e.steps.push({ p, m, r });
      const c = r.cofactors || {}, need = m.items['n:' + r.id]?.cofs.in || [];
      for (const [ids, role] of [[c.in || [], 'in'], [c.out || [], 'out'], [need, 'need']]) for (const cid of ids) {
        const cx = m.cof[cid] || { name: cid }, ce = entry('cof', cofPage(m, cid), cx.name);
        ce.names.push(cx.name); (cx.aliases || []).forEach(a => ce.aliases.add(a)); ce.pathways.add(p.id); ce.steps.push({ p, m, r, role });
      }
    }
  }
  for (const kind of Object.values(out)) for (const e of Object.values(kind)) {
    // The plainest name it goes by: the most common, preferring one without a place in brackets.
    const count = {}; e.names.forEach(n => (count[n] = (count[n] || 0) + 1));
    e.name = Object.keys(count).sort((a, b) => /\(/.test(a) - /\(/.test(b) || count[b] - count[a] || a.length - b.length)[0];
    e.others = uniq([...e.names, ...e.aliases]).filter(n => n !== e.name);
  }
  CAT.built = out; CAT.sig = ps;
  return out;
}
const catList = kind => Object.values(catalog()[kind]).sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
const catHref = (tab, key) => `#/library/${tab}/${encodeURIComponent(key)}`;
const tabOf = kind => CAT_TABS.find(t => t[2] === kind)[0];
// A name in a table, linked to its own page when it has one.
function catLink(kind, key, label) {
  const e = catalog()[kind][key];
  return e ? `<a href="${catHref(tabOf(kind), key)}">${esc(label || e.name)}</a>` : esc(label || key);
}
const metLink = (p, id) => catLink('met', catKey(baseMetName(p.metabolites[id]?.name || id)), p.metabolites[id]?.name || id);
const metsLinked = (p, ids) => ids.map(id => metLink(p, id)).join(' + ');
const cofsLinked = (m, ids) => ids.map(id => catLink('cof', cofPage(m, id), cofName(m, id))).join(' + ');
function cofCell(m, r) {
  const c = r.cofactors || {}, i = cofsLinked(m, c.in || []), o = cofsLinked(m, c.out || []);
  return !i && !o ? '<span class="muted">None</span>' : !o ? `${i} →` : !i ? `→ ${o}` : `${i} → ${o}`;
}
const reactionCell = (p, r) => `${metsLinked(p, reactantsOf(r))} ${r.reversible ? '⇌' : '→'} ${metsLinked(p, productsOf(r))}`;
const whereCell = r => esc([r.tissue, r.loc].filter(Boolean).join(' · '));
const pathwayCell = p => `<a href="#/pathways/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`;

/* ---------- the tabs ---------- */
function libTabs(active) {
  const c = catalog(), n = { pathways: Library.atomic().length, metabolites: Object.keys(c.met).length, enzymes: Object.keys(c.enz).length, cofactors: Object.keys(c.cof).length };
  return `<nav class="libtabs" aria-label="Library">${[['pathways', 'Pathways'], ...CAT_TABS].map(([t, l]) =>
    `<a href="${t === 'pathways' ? '#/pathways' : `#/library/${t}`}"${t === active ? ' aria-current="page"' : ''}>${l} <span class="n">${n[t]}</span></a>`).join('')}</nav>`;
}
function renderCatalog(tab) {
  const [, label, kind] = CAT_TABS.find(t => t[0] === tab) || CAT_TABS[0];
  const blurb = { met: 'Every metabolite in every pathway. Open one to see what makes it and what uses it.', enz: 'Every enzyme and transporter. Open one to see its steps, cofactors, what it needs, and where it works.', cof: 'Everything that goes in or comes out beside a step, and the vitamins steps need. Open one to see every step that uses it.' }[kind];
  $('#view').innerHTML = `<div class="page library catalog">
    ${pageHead('Library', blurb)}
    ${libTabs(tab)}
    <div class="browsebar"><label class="search">${mi('search', 'sm')}<input type="search" id="catQ" placeholder="Search ${label.toLowerCase()}, other names or pathways" value="${esc(CAT.q[tab] || '')}" aria-label="Search ${label.toLowerCase()}"></label></div>
    <div id="catList"></div>
  </div>`;
  drawCatList(tab, kind);
}
function drawCatList(tab, kind) {
  const q = norm(CAT.q[tab] || ''), all = catList(kind);
  // Best matches first: a name that is the search, then one that starts with it, then a word in it that does, then the rest.
  const rank = e => {
    if (!q) return 0;
    const names = [e.name, ...e.others, ...e.short].map(norm), words = [e.name, ...e.others, ...e.short].flatMap(n => String(n).split(/[\s\-–(),/]+/)).map(norm);
    if (names.includes(q)) return 1;
    if (names.some(n => n.startsWith(q))) return 2;
    if (words.some(w => w.startsWith(q))) return 3;
    if (names.some(n => n.includes(q))) return 4;
    return [...e.pathways].some(id => norm(Library.get(id)?.name || '').includes(q)) ? 5 : 0;
  };
  const list = all.map(e => [e, rank(e)]).filter(([, r]) => !q || r).sort((a, b) => a[1] - b[1]).map(([e]) => e);
  $('#catList').innerHTML = list.length ? `<p class="muted small">${list.length === all.length ? `${all.length} ${tab}` : `${list.length} of ${all.length}`}</p>
    <ul class="catlist">${list.map(e => `<li><a class="card" href="${catHref(tab, e.key)}"><b>${esc(e.name)}</b>${e.short.size ? ` <span class="muted">(${esc([...e.short][0])})</span>` : ''}
      <span class="muted small">${plural(e.pathways.size, 'pathway')} · ${plural(e.steps.length, 'step')}${e.others.length ? ` · also ${esc(e.others.slice(0, 3).join(', '))}${e.others.length > 3 ? '…' : ''}` : ''}</span></a></li>`).join('')}</ul>`
    : `<p class="muted">Nothing matches “${esc(CAT.q[tab])}”.</p>`;
}
document.addEventListener('input', e => {
  if (e.target.id !== 'catQ') return;
  const tab = location.hash.split('/')[2], kind = CAT_TABS.find(t => t[0] === tab)?.[2];
  if (!kind) return;
  CAT.q[tab] = e.target.value; drawCatList(tab, kind);
});

/* ---------- one thing's page ---------- */
function renderCatItem(tab, key) {
  const [, label, kind] = CAT_TABS.find(t => t[0] === tab) || [];
  const e = kind && catalog()[kind][key];
  if (!e) { $('#view').innerHTML = `<div class="page">${pageHead('Not found', 'Nothing by that name in any pathway.')}<a class="btn" href="#/library/${esc(tab || 'enzymes')}">Back to the library</a></div>`; return; }
  const ps = [...e.pathways].map(id => Library.get(id)).filter(Boolean);
  const names = e.others.length ? `<p class="muted"><b>Also called:</b> ${esc(e.others.join(' · '))}</p>` : '';
  const short = e.short.size ? ` <span class="muted">(${esc([...e.short].join(', '))})</span>` : '';
  // Notes as written in each pathway; where pathways say different things, each says which pathway it's from.
  const notes = e.notes.length ? `<section class="card pad"><h2>Notes</h2>${e.notes.map(n => `<p>${esc(n.text)}${e.notes.length > 1 ? ` <span class="muted small">(${esc(Library.get(n.pid)?.name || n.pid)})</span>` : ''}</p>`).join('')}</section>` : '';
  let body = '';
  if (kind === 'enz') {
    body = `<section class="card pad"><h2>Steps</h2><div class="tablewrap"><table class="steps"><thead><tr><th>Pathway</th><th>Reaction</th><th>Cofactors</th><th>Needs</th><th>Where</th><th>Notes</th></tr></thead><tbody>
      ${e.steps.map(({ p, m, r }) => `<tr><td>${pathwayCell(p)}</td><td>${reactionCell(p, r)}</td><td>${cofCell(m, r)}</td><td>${cofsLinked(m, m.items['n:' + r.id]?.cofs.in || []) || '<span class="muted">—</span>'}</td><td>${whereCell(r)}</td><td class="muted">${esc([r.transport ? 'transport' : '', r.reversible ? 'reversible' : 'irreversible', ...(r.tags || []).filter(t => t !== 'irreversible')].filter(Boolean).join(' · '))}</td></tr>`).join('')}
    </tbody></table></div></section>`;
  } else if (kind === 'met') {
    const row = ({ p, m, r }) => `<tr><td>${pathwayCell(p)}</td><td>${catLink('enz', catKey(p.enzymes[r.enzyme]?.name), p.enzymes[r.enzyme]?.name)}</td><td>${reactionCell(p, r)}</td><td>${cofCell(m, r)}</td><td>${whereCell(r)}</td></tr>`;
    const table = (title, rows) => rows.length ? `<section class="card pad"><h2>${title}</h2><div class="tablewrap"><table class="steps"><thead><tr><th>Pathway</th><th>Enzyme</th><th>Reaction</th><th>Cofactors</th><th>Where</th></tr></thead><tbody>${rows.map(row).join('')}</tbody></table></div></section>` : '';
    body = table('Made by', e.steps.filter(s => s.role !== 'used')) + table('Used by', e.steps.filter(s => s.role !== 'made'));
  } else {
    const groups = ['need', 'in', 'out'].map(k => [k, e.steps.filter(s => s.role === k)]).filter(([, rows]) => rows.length);
    body = groups.map(([k, rows]) => `<section class="card pad"><h2>${{ in: 'Goes in at', out: 'Comes out of', need: 'Needed by' }[k]} ${plural(rows.length, 'step')}</h2><div class="tablewrap"><table class="steps"><thead><tr><th>Pathway</th><th>Enzyme</th><th>Reaction</th><th>${k === 'need' ? 'Needs' : 'All cofactors'}</th><th>Where</th></tr></thead><tbody>
      ${rows.map(({ p, m, r }) => `<tr><td>${pathwayCell(p)}</td><td>${catLink('enz', catKey(p.enzymes[r.enzyme]?.name), p.enzymes[r.enzyme]?.name)}</td><td>${reactionCell(p, r)}</td><td>${k === 'need' ? cofsLinked(m, m.items['n:' + r.id]?.cofs.in || []) : cofCell(m, r)}</td><td>${whereCell(r)}</td></tr>`).join('')}
    </tbody></table></div></section>`).join('');
  }
  $('#view').innerHTML = `<div class="page catitem">
    <a class="back" href="#/library/${tab}">${mi('arrow_back', 'sm')} ${label}</a>
    ${pageHead(`${esc(e.name)}${short}`, `${label.replace(/s$/, '')} · in ${plural(ps.length, 'pathway')}: ${ps.map(p => `<a href="#/pathways/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join(', ')}`)}
    ${names}${notes}${body}
  </div>`;
}
