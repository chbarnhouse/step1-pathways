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
  const ps = Library.atomic().filter(p => (p.reactions || []).length && !p.terms); // cells and cytokines aren't metabolites and enzymes
  if (CAT.built && CAT.sig.length === ps.length && CAT.sig.every((p, i) => p === ps[i])) return CAT.built;
  const out = { met: {}, enz: {}, cof: {} };
  const entry = (kind, key, name) => (out[kind][key] = out[kind][key] || { kind, key, names: [], short: new Set(), aliases: new Set(), notes: [], steps: [], pathways: new Set(), keys: [] }); // keys: [pathway, answer-history key]
  const note = (e, text, p) => { if (text && !e.notes.some(n => n.text === text)) e.notes.push({ text, pid: p.id }); };
  for (const p of ps) {
    let m; try { m = modelFor(p); } catch { continue; }
    for (const [id, x] of Object.entries(p.metabolites)) {
      const e = entry('met', catKey(baseMetName(x.name)), x.name);
      e.names.push(x.name); if (x.short) e.short.add(x.short); (x.aliases || []).forEach(a => e.aliases.add(a)); note(e, x.notes, p);
      e.pathways.add(p.id); e.keys.push([p.id, 'm:' + id]);
      for (const r of p.reactions) {
        const made = r.to === id || (r.also_to || []).includes(id), used = r.from === id || (r.also_from || []).includes(id);
        if (made || used) e.steps.push({ p, m, r, role: made && used ? 'both' : made ? 'made' : 'used' });
      }
    }
    for (const r of p.reactions) {
      const x = p.enzymes[r.enzyme]; if (!x) continue;
      const e = entry('enz', catKey(x.name), x.name);
      e.names.push(x.name); if (x.short) e.short.add(x.short); (x.aliases || []).forEach(a => e.aliases.add(a)); note(e, x.notes, p);
      e.pathways.add(p.id); e.steps.push({ p, m, r }); e.keys.push([p.id, 'e:' + r.id]);
      const c = r.cofactors || {}, need = m.items['n:' + r.id]?.cofs.in || [];
      for (const [ids, role] of [[c.in || [], 'in'], [c.out || [], 'out'], [need, 'need']]) for (const cid of ids) {
        const cx = m.cof[cid] || { name: cid }, ce = entry('cof', cofPage(m, cid), cx.name);
        ce.names.push(cx.name); (cx.aliases || []).forEach(a => ce.aliases.add(a)); ce.pathways.add(p.id); ce.steps.push({ p, m, r, role });
        ce.keys.push([p.id, (role === 'need' ? 'n:' : role === 'out' && (c.in || []).length ? 'o:' : 'c:') + r.id]);
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
/* ---------- browsing a tab: like the Pathways tab (search, sort, filter menus with chips, rows by section) ----------
   Sections: enzymes by what kind of enzyme they are, metabolites by their pathways' group, cofactors by what they do.
   Systems, tags and pathways come from the pathways a thing appears in; status from your answers about it there. */
const SECTIONS = {
  enz: [['Transporters', 'arrow_forward', 'slate', e => e.steps.some(s => s.r.transport)], ['Kinases', 'local_fire_department', 'orange', e => /kinase/i.test(e.name)],
    ['Phosphatases', 'opacity', 'teal', e => /phosphatase/i.test(e.name)], ['Dehydrogenases, reductases & oxidases', 'sync_alt', 'blue', e => /dehydrogenase|reductase|oxidase|oxygenase|hydroxylase|peroxidase|desaturase|aromatase|desmolase|demethylase|malic enzyme/i.test(e.name)],
    ['Carboxylases & decarboxylases', 'science', 'gold', e => /carboxylase|carboxykinase/i.test(e.name)], ['Synthases & synthetases', 'inventory_2', 'pink', e => /synth/i.test(e.name)],
    ['Transferases', 'swap_horiz', 'slate', e => /transferase|transaminase|transcarbamylase|transcarbamoylase|transformylase|phosphorylase|branching enzyme/i.test(e.name)], ['Isomerases & mutases', 'cycle', 'teal', e => /isomerase|mutase|epimerase|racemase/i.test(e.name)],
    ['Hydrolases & lyases', 'call_split', 'orange', e => /lyase|aldolase|thiolase|hydratase|dehydratase|deaminase|hydrolase|esterase|lipase|lactase|sidase|ferrochelatase|enolase|aconitase|fumarase|cyclohydrolase|dutpase|peptidase|transpeptidase|nucleotidase|lactonase|arginase|sulfatase|orotase|hexosaminidase|sialidase|myelinase/i.test(e.name)], ['Other steps', 'science', 'slate', () => true]],
  cof: [['Vitamins & helpers', 'nutrition', 'gold', e => e.steps.some(s => s.role === 'need') || /^vitamin-|^need:/.test(e.key)], ['Electron carriers', 'sync_alt', 'blue', e => /nad|fad|fmn|bh[24]|ascorb|glutathione|gsh|coq/i.test(e.key + ' ' + e.name)],
    ['Energy', 'local_fire_department', 'orange', e => /^(atp|adp|amp|gtp|gdp|utp|udp|ctp|ppi|pi)$/i.test(e.key)],
    ['Group carriers (CoA, folates, SAM)', 'swap_horiz', 'pink', e => /coa$|^coa|thf|^dhf|carnitine/i.test(e.key + ' ' + e.name.replace(/\s/g, '')) || /^(sam|sah)$/i.test(e.key) || /^(SAM|SAH)$/.test(e.name)],
    ['Amino acids & nitrogen', 'genetics', 'teal', e => /glutam|aspart|glycine|serine|methionine|homocysteine|carbamoyl|urea|ketobutyrate|fumarate/i.test(e.name)],
    ['Sugars & activated sugars', 'nutrition', 'gold', e => /glucose|galactose|udp-|prpp|ribose|sialic|galactosamine|phosphocholine/i.test(e.name)],
    ['Water, gases & ions', 'opacity', 'slate', e => /^(h2o|co2|o2|nh3|nh4|hco3|h|co|h2o2|fe2|so4)$/i.test(e.key)], ['Other', 'science', 'slate', () => true]],
};
const groupOfPathways = ids => { const g = {}; ids.forEach(id => { const k = Library.get(id)?.group || 'Other'; g[k] = (g[k] || 0) + 1; }); return Object.keys(g).sort((a, b) => g[b] - g[a] || groupRank(a) - groupRank(b))[0] || 'Other'; };
function facets(e) {
  if (e.f) return e.f;
  const ids = [...e.pathways], f = { systems: uniq(ids.flatMap(systemsOf)), tags: uniq(ids.flatMap(tagsOf)) };
  if (e.kind === 'met') { const lead = ids.map(id => Library.get(id)).filter(Boolean).sort((a, b) => groupRank(a.group) - groupRank(b.group))[0]; f.section = groupOfPathways(ids); f.art = lead ? tileArt(lead) : ''; }
  else { const [name, icon, tone] = SECTIONS[e.kind].find(([, , , test]) => test(e)); f.section = name; f.art = `<span class="tile-art tone-${tone}">${mi(icon)}</span>`; }
  return (e.f = f);
}
const sectionOrder = kind => (kind === 'met' ? g => groupRank(g) : g => SECTIONS[kind].findIndex(s => s[0] === g));
// Your answers about it, across every pathway it's in.
function itemStat(e) {
  let n = 0, miss = 0, last = 0;
  for (const [pid, k] of e.keys) { const x = Store.data.stats[pid]?.[k]; if (x) { n += x.n; miss += x.miss; last = Math.max(last, x.last || 0); } }
  return { n, miss, last, pct: n ? Math.round(100 * (n - miss) / n) : null };
}
const CAT_DEFAULT = { q: '', sections: [], systems: [], paths: [], tags: [], status: '', sort: 'group' };
const catState = tab => Object.assign(clone(CAT_DEFAULT), local.get('pathways.browse.cat.' + tab) || {});
const catSave = (tab, st) => local.set('pathways.browse.cat.' + tab, st);
function catRank(e, q) {
  if (!q) return 0;
  const all = [e.name, ...e.others, ...e.short], names = all.map(norm), words = all.flatMap(n => String(n).split(/[\s\-–(),/]+/)).map(norm);
  if (names.includes(q)) return 1;
  if (names.some(n => n.startsWith(q))) return 2;
  if (words.some(w => w.startsWith(q))) return 3;
  return names.some(n => n.includes(q)) ? 4 : 0; // pathways have their own filter
}
function catFiltered(kind, st) {
  const q = norm(st.q || ''), ord = sectionOrder(kind);
  return catList(kind).map(e => [e, catRank(e, q), facets(e), itemStat(e)]).filter(([e, r, f, s]) => (!q || r)
    && (!st.sections.length || st.sections.includes(f.section))
    && (!st.systems.length || st.systems.some(t => f.systems.includes(t)))
    && (!st.paths.length || st.paths.some(id => e.pathways.has(id)))
    && (!st.tags.length || st.tags.some(t => f.tags.includes(t)))
    && (!st.status || (st.status === 'new' ? !s.n : st.status === 'studied' ? !!s.n : s.miss > 0)))
    .sort((a, b) => (q ? a[1] - b[1] : 0)
      || (st.sort === 'name' ? 0 : st.sort === 'most' ? b[0].pathways.size - a[0].pathways.size || b[0].steps.length - a[0].steps.length
        : st.sort === 'weak' ? (a[3].pct ?? 101) - (b[3].pct ?? 101) : st.sort === 'recent' ? b[3].last - a[3].last : ord(a[2].section) - ord(b[2].section))
      || a[0].name.localeCompare(b[0].name, undefined, { sensitivity: 'base' }));
}
function catToolbar(tab, kind, st) {
  const all = catList(kind).map(facets), ord = sectionOrder(kind);
  const sections = uniq(all.map(f => f.section)).sort((a, b) => ord(a) - ord(b)), systems = allSystems().filter(t => all.some(f => f.systems.includes(t)));
  const tags = uniq(all.flatMap(f => f.tags)).sort((a, b) => a.localeCompare(b)), paths = Library.atomic().sort((a, b) => a.name.localeCompare(b.name));
  const item = (attr, v, on, label) => `<button type="button" class="chip-tg small fitem" ${attr}="${esc(v)}" aria-pressed="${on}">${esc(label)}</button>`;
  const menu = (key, label, n, body) => `<details class="fdd" data-f="${key}"><summary class="fdd-btn${n ? ' on' : ''}" aria-label="${label}${n ? `, ${n} on` : ''}">${label}${n ? `<span class="fdd-n">${n}</span>` : ''}${mi('expand_more', 'sm')}</summary><div class="pop fmenu">${body}</div></details>`;
  const secLabel = kind === 'met' ? 'Group' : 'Kind';
  const menus = menu('section', secLabel, st.sections.length, sections.map(g => item('data-ksec', g, st.sections.includes(g), g)).join(''))
    + menu('system', 'System', st.systems.length, systems.map(t => item('data-ksys', t, st.systems.includes(t), t)).join(''))
    + menu('path', 'Pathway', st.paths.length, paths.map(p => item('data-kpath', p.id, st.paths.includes(p.id), p.name)).join(''))
    + menu('status', 'Status', st.status ? 1 : 0, Object.entries(STATUS_LABELS).map(([v, l]) => item('data-kstatus', v, st.status === v, l)).join(''))
    + (tags.length ? menu('tags', 'Tags', st.tags.length, tags.map(t => item('data-ktag', t, st.tags.includes(t), t)).join('')) : '');
  const on = [...st.sections.map(g => ['data-ksec', g, secLabel, g]), ...st.systems.map(t => ['data-ksys', t, 'System', t]), ...st.paths.map(id => ['data-kpath', id, 'Pathway', Library.get(id)?.name || id]),
    ...(st.status ? [['data-kstatus', st.status, 'Status', STATUS_LABELS[st.status]]] : []), ...st.tags.map(t => ['data-ktag', t, 'Tag', t])];
  const chips = on.map(([attr, v, k, l]) => `<button type="button" class="fchip" ${attr}="${esc(v)}" aria-label="Remove filter ${esc(k)}: ${esc(l)}"><span class="muted">${k}:</span> ${esc(l)}${mi('close', 'sm')}</button>`).join('');
  const label = CAT_TABS.find(t => t[0] === tab)[1].toLowerCase();
  return `<div class="browsebar" data-kpage="${tab}">
    <label class="search">${mi('search', 'sm')}<input type="search" data-kq placeholder="Search ${label} by any name" value="${esc(st.q)}" aria-label="Search ${label}"></label>
    <label class="sortsel">${mi('sort', 'sm')}<select data-ksort aria-label="Sort">${[['group', kind === 'met' ? 'By group' : 'By kind'], ['name', 'A–Z'], ['most', 'In most pathways'], ['weak', 'Weakest first'], ['recent', 'Recently studied']].map(([v, l]) => `<option value="${v}"${st.sort === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="filters">${menus}${chips}${on.length || st.q ? '<button class="linkbtn" data-kclear>Clear</button>' : ''}</div>
  </div>`;
}
function catTile(tab, e) {
  const f = facets(e), s = itemStat(e);
  const acc = s.n ? `<span class="tile-acc"><span class="meter" role="img" aria-label="${s.pct} percent"><span style="width:${s.pct}%"></span></span>${s.pct}%</span>` : '<span class="tile-acc muted">not studied</span>';
  const tags = f.systems.length ? `<span class="tile-tags">${f.systems.map(t => `<span class="tagchip sys">${esc(t)}</span>`).join('')}</span>` : '';
  return `<article class="ptile lib"><a class="tile-link" href="${catHref(tab, e.key)}">${f.art}<span class="tile-text"><span class="tile-name">${esc(e.name)}</span>
    <span class="tile-meta">${e.short.size ? `${esc([...e.short][0])} · ` : ''}${plural(e.pathways.size, 'pathway')} · ${plural(e.steps.length, 'step')}</span>${acc}${tags}</span></a></article>`;
}
function catTilesHTML(tab, kind, st) {
  const rows = catFiltered(kind, st), total = catList(kind).length;
  if (!rows.length) return `<p class="muted">Nothing matches. <button class="linkbtn" data-kclear>Clear filters</button></p>`;
  const count = `<p class="muted small">${rows.length === total ? `${total} ${tab}` : `${rows.length} of ${total}`}</p>`;
  if (st.sort !== 'group' || st.q) return count + `<div class="tiles-grid">${rows.map(([e]) => catTile(tab, e)).join('')}</div>`;
  const groups = {};
  for (const [e, , f] of rows) (groups[f.section] = groups[f.section] || []).push(e);
  return count + Object.entries(groups).map(([g, es]) => `<div class="tgroup"><h2 class="glabel">${esc(g)} <span class="muted small">${es.length}</span></h2>
    <div class="rowwrap"><button class="rowbtn prev" data-rowscroll="-1" aria-label="Scroll ${esc(g)} left" tabindex="-1">${mi('chevron_left')}</button>
      <div class="tiles-row">${es.map(e => catTile(tab, e)).join('')}</div>
      <button class="rowbtn next" data-rowscroll="1" aria-label="Scroll ${esc(g)} right" tabindex="-1">${mi('chevron_right')}</button></div></div>`).join('');
}
function renderCatalog(tab) {
  const [, , kind] = CAT_TABS.find(t => t[0] === tab) || CAT_TABS[0];
  const blurb = { met: 'Every metabolite in every pathway. Open one to see what makes it and what uses it.', enz: 'Every enzyme and transporter. Open one to see its steps, cofactors, what it needs, and where it works.', cof: 'Everything that goes in or comes out beside a step, and the vitamins steps need. Open one to see every step that uses it.' }[kind];
  const st = catState(tab);
  for (const k of ['met', 'enz', 'cof']) catList(k).forEach(e => delete e.f); // tags may have changed since
  $('#view').innerHTML = `<div class="page library catalog">
    ${pageHead('Library', blurb)}
    ${libTabs(tab)}
    <div id="catBar">${catToolbar(tab, kind, st)}</div>
    <div class="tiles" id="catTiles">${catTilesHTML(tab, kind, st)}</div>
  </div>`;
  updateRows();
}
const catTab = () => { const t = location.hash.split('/')[2]; const k = CAT_TABS.find(x => x[0] === t); return k ? [t, k[2]] : [null, null]; };
function catRefresh(full = false) {
  const [tab, kind] = catTab(); if (!tab) return;
  const st = catState(tab);
  if (full) { const open = document.querySelector('#catBar details.fdd[open]')?.dataset.f; $('#catBar').innerHTML = catToolbar(tab, kind, st); if (open) { const d = document.querySelector(`#catBar details.fdd[data-f="${open}"]`); if (d) d.open = true; } }
  $('#catTiles').innerHTML = catTilesHTML(tab, kind, st); updateRows();
}
document.addEventListener('input', e => {
  if (!e.target.hasAttribute('data-kq')) return;
  const [tab] = catTab(); if (!tab) return;
  const st = catState(tab); st.q = e.target.value; catSave(tab, st); catRefresh();
});
document.addEventListener('change', e => {
  if (!e.target.hasAttribute('data-ksort')) return;
  const [tab] = catTab(); if (!tab) return;
  const st = catState(tab); st.sort = e.target.value; catSave(tab, st); catRefresh();
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-ksec],[data-ksys],[data-kpath],[data-ktag],[data-kstatus],[data-kclear]');
  if (!t) return;
  const [tab] = catTab(); if (!tab) return;
  const st = catState(tab), flip = (k, v) => { st[k] = st[k].includes(v) ? st[k].filter(x => x !== v) : [...st[k], v]; };
  if (t.dataset.ksec) flip('sections', t.dataset.ksec);
  else if (t.dataset.ksys) flip('systems', t.dataset.ksys);
  else if (t.dataset.kpath) flip('paths', t.dataset.kpath);
  else if (t.dataset.ktag) flip('tags', t.dataset.ktag);
  else if (t.dataset.kstatus) st.status = st.status === t.dataset.kstatus ? '' : t.dataset.kstatus;
  else Object.assign(st, { q: '', sections: [], systems: [], paths: [], tags: [], status: '' });
  catSave(tab, st);
  catRefresh(true);
  if (t.hasAttribute('data-kclear')) { const q = document.querySelector('[data-kq]'); if (q) q.value = ''; }
});

/* ---------- one thing's page ----------
   At a glance (names, where, what it needs, your answers), its notes, then each pathway it's in drawn with it picked out:
   heavy outline and bold underlined name for it, its steps at full strength, the rest faded back. The full table of
   steps stays one click away. */
// The diagram's status for each item: 'focus' for this thing, 'shown' for its steps and partners, 'dim' for the rest.
function focusStatus(e, p) {
  const mine = e.steps.filter(s => s.p === p), focus = new Set(), near = new Set();
  const touch = r => [r.from, r.to, ...(r.also_to || []), ...(r.also_from || [])].forEach(id => near.add('m:' + id));
  if (e.kind === 'enz') mine.forEach(({ r }) => { focus.add('e:' + r.id); touch(r); });
  else if (e.kind === 'met') { e.keys.filter(([pid]) => pid === p.id).forEach(([, k]) => focus.add(k)); mine.forEach(({ r }) => { near.add('e:' + r.id); touch(r); }); }
  else mine.forEach(({ r }) => { focus.add('e:' + r.id); touch(r); });
  return k => (focus.has(k) ? 'focus' : near.has(k) ? 'shown' : /^[em]:/.test(k) ? 'dim' : 'shown');
}
function stepLine(e, s) {
  const { p, m, r } = s, en = p.enzymes[r.enzyme]?.name, needs = cofsLinked(m, m.items['n:' + r.id]?.cofs.in || []);
  const role = e.kind === 'met' ? (s.role === 'made' ? 'made by ' : s.role === 'used' ? 'used by ' : '') : e.kind === 'cof' ? ({ in: 'goes in at ', out: 'comes out of ', need: 'needed by ' }[s.role] || '') : '';
  const bits = [e.kind === 'enz' ? '' : `${role}${catLink('enz', catKey(en), en)}`, reactionCell(p, r), `cofactors ${cofCell(m, r)}`, needs ? `needs ${needs}` : '', whereCell(r),
    (r.tags || []).includes('rate-limiting') ? '<b>rate-limiting</b>' : '', r.reversible ? 'reversible' : ''].filter(Boolean);
  return `<li>${bits.join(' · ')}</li>`;
}
function glanceHTML(e, ps) {
  const rows = [], linkList = (kind, keys) => uniq(keys).map(k => catLink(kind, k)).join(', ');
  if (e.short.size) rows.push(['Abbreviation', esc([...e.short].join(', '))]);
  if (e.others.length) rows.push(['Also called', esc(e.others.join(' · '))]);
  rows.push([e.kind === 'met' ? 'Group' : 'Kind', esc(facets(e).section)]);
  rows.push(['In', ps.map(p => `<a href="#/pathways/${encodeURIComponent(p.id)}">${esc(p.name)}</a>`).join(', ')]);
  const where = uniq(e.steps.map(({ r }) => [r.tissue, r.loc].filter(Boolean).join(' · ')).filter(Boolean));
  if (where.length) rows.push(['Where', esc(where.join('; '))]);
  if (e.kind === 'enz') {
    const rl = uniq(e.steps.filter(s => (s.r.tags || []).includes('rate-limiting')).map(s => s.p.name));
    if (rl.length) rows.push(['Rate-limiting in', esc(rl.join(', '))]);
    const needs = e.steps.flatMap(({ m, r }) => (m.items['n:' + r.id]?.cofs.in || []).map(id => cofPage(m, id)));
    if (needs.length) rows.push(['Needs', linkList('cof', needs)]);
    const cofs = e.steps.flatMap(({ m, r }) => [...(r.cofactors?.in || []), ...(r.cofactors?.out || [])].map(id => cofPage(m, id)));
    if (cofs.length) rows.push(['Cofactors', linkList('cof', cofs)]);
    const dir = uniq(e.steps.map(s => (s.r.reversible ? 'reversible' : 'one-way')));
    rows.push(['Direction', esc(dir.join(' or '))]);
  } else if (e.kind === 'met') {
    const en = s => catKey(s.p.enzymes[s.r.enzyme]?.name);
    const made = e.steps.filter(s => s.role !== 'used').map(en), used = e.steps.filter(s => s.role !== 'made').map(en);
    if (made.length) rows.push(['Made by', linkList('enz', made)]);
    if (used.length) rows.push(['Used by', linkList('enz', used)]);
    const out = ps.flatMap(p => (p.links || []).filter(l => e.keys.some(([pid, k]) => pid === p.id && k === 'm:' + l.at)).map(l => Library.get(l.to)).filter(Boolean));
    if (out.length) rows.push(['Connects to', uniq(out).map(q => `<a href="#/pathways/${encodeURIComponent(q.id)}">${esc(q.name)}</a>`).join(', ')]);
  } else {
    const n = k => e.steps.filter(s => s.role === k).length;
    rows.push(['Steps', esc([n('need') ? `needed by ${n('need')}` : '', n('in') ? `goes in at ${n('in')}` : '', n('out') ? `comes out of ${n('out')}` : ''].filter(Boolean).join(' · '))]);
    rows.push(['Enzymes', linkList('enz', e.steps.map(s => catKey(s.p.enzymes[s.r.enzyme]?.name)))]);
  }
  const st = itemStat(e);
  rows.push(['Your answers', st.n ? `${st.n} answered · ${st.pct}% right first time${st.last ? ` · last ${esc(new Date(st.last).toLocaleDateString())}` : ''}` : '<span class="muted">Not studied yet</span>']);
  return `<section class="card pad glance"><h2>At a glance</h2><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl></section>`;
}
function contextHTML(e, p) {
  // Zoomed to its steps (with room around them for labels and a little context); the whole pathway is on its page.
  let svg = '', zoomed = false;
  try {
    const st = focusStatus(e, p);
    DRAW_POS = {}; svg = flowSVG(modelFor(p), st); const pos = DRAW_POS; DRAW_POS = null;
    const rs = Object.entries(pos).filter(([k]) => st(k) !== 'dim').map(([, r]) => r), vb = svg.match(/viewBox="([^"]+)"/)?.[1].split(/\s+/).map(Number);
    if (rs.length && vb) {
      let x0 = Math.min(...rs.map(r => r.x)) - 300, x1 = Math.max(...rs.map(r => r.x + r.w)) + 300, y0 = Math.min(...rs.map(r => r.y)) - 170, y1 = Math.max(...rs.map(r => r.y + r.h)) + 170;
      if (x1 - x0 < 1200) { const c = (x0 + x1) / 2; x0 = c - 600; x1 = c + 600; } // about the pathway page's own scale
      if (y1 - y0 < 440) { const c = (y0 + y1) / 2; y0 = c - 220; y1 = c + 220; }
      x0 = Math.max(vb[0], x0); y0 = Math.max(vb[1], y0); x1 = Math.min(vb[0] + vb[2], x1); y1 = Math.min(vb[1] + vb[3], y1);
      zoomed = (x1 - x0) * (y1 - y0) < vb[2] * vb[3] * 0.8;
      if (zoomed) svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}"`);
    }
  } catch { DRAW_POS = null; }
  const mine = e.steps.filter(s => s.p === p);
  return `<section class="card pad ctx">
    <div class="ctx-h"><a class="ctx-name" href="#/pathways/${encodeURIComponent(p.id)}">${tileArt(p, 'sm')}<span><b>${esc(p.name)}</b><span class="muted small">${esc(p.group || 'Other')} · ${plural(mine.length, 'step')} here</span></span></a>
      <span class="btnrow"><button class="btn small" data-lib="study" data-id="${esc(p.id)}">${mi('play_arrow', 'sm')} Study</button><a class="btn small ghost" href="#/pathways/${encodeURIComponent(p.id)}">${mi('arrow_forward', 'sm')} Open pathway</a></span></div>
    ${svg ? `<a class="ctx-diagram" href="#/pathways/${encodeURIComponent(p.id)}" aria-label="Open ${esc(p.name)}">${svg}</a>${zoomed ? `<p class="muted small ctx-note">Zoomed to its ${mine.length > 1 ? 'steps' : 'step'}. The whole pathway is on its page.</p>` : ''}` : ''}
    <ul class="ctx-steps">${mine.map(s => stepLine(e, s)).join('')}</ul>
  </section>`;
}
function renderCatItem(tab, key) {
  const [, label, kind] = CAT_TABS.find(t => t[0] === tab) || [];
  const e = kind && catalog()[kind][key];
  if (!e) { $('#view').innerHTML = `<div class="page">${pageHead('Not found', 'Nothing by that name in any pathway.')}<a class="btn" href="#/library/${esc(tab || 'enzymes')}">Back to the library</a></div>`; return; }
  delete e.f;
  const ps = [...e.pathways].map(id => Library.get(id)).filter(Boolean).sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name));
  const short = e.short.size ? ` <span class="muted">(${esc([...e.short].join(', '))})</span>` : '';
  // Notes as written in each pathway; where pathways say different things, each says which pathway it's from.
  const notes = e.notes.length ? `<section class="card pad"><h2>Notes</h2>${e.notes.map(n => `<p>${esc(n.text)}${e.notes.length > 1 ? ` <span class="muted small">(${esc(Library.get(n.pid)?.name || n.pid)})</span>` : ''}</p>`).join('')}</section>` : '';
  $('#view').innerHTML = `<div class="page catitem">
    ${crumbsHTML([{ h: '#/pathways', t: 'Library' }, { h: `#/library/${tab}`, t: label }])}
    ${pageHead(`${facets(e).art} ${esc(e.name)}${short}`, `${label.replace(/s$/, '')} · ${esc(facets(e).section)} · in ${plural(ps.length, 'pathway')}`)}
    <div class="cat-top">${glanceHTML(e, ps)}${notes}</div>
    <h2 class="glabel ctx-label">In ${ps.length > 1 ? 'its pathways' : 'its pathway'}</h2>
    ${ps.slice(0, 4).map(p => contextHTML(e, p)).join('')}
    ${ps.length > 4 ? `<details class="morectx" data-key="${esc(key)}" data-tab="${esc(tab)}"><summary class="btn">${plural(ps.length - 4, 'more pathway')}</summary><div></div></details>` : ''}
    <details class="card pad alltable"><summary><b>All steps as a table</b></summary>${stepsTable(e, kind)}</details>
  </div>`;
}
// Every step in one table (the page's old layout), for scanning across pathways.
function stepsTable(e, kind) {
  const head = kind === 'enz' ? '<th>Pathway</th><th>Reaction</th><th>Cofactors</th><th>Needs</th><th>Where</th>' : '<th>Pathway</th><th>Role</th><th>Enzyme</th><th>Reaction</th><th>Cofactors</th><th>Where</th>';
  const role = s => ({ made: 'made', used: 'used', both: 'made and used', in: 'goes in', out: 'comes out', need: 'needed' }[s.role] || '');
  const row = s => { const { p, m, r } = s, en = p.enzymes[r.enzyme]?.name;
    return kind === 'enz' ? `<tr><td>${pathwayCell(p)}</td><td>${reactionCell(p, r)}</td><td>${cofCell(m, r)}</td><td>${cofsLinked(m, m.items['n:' + r.id]?.cofs.in || []) || '<span class="muted">—</span>'}</td><td>${whereCell(r)}</td></tr>`
      : `<tr><td>${pathwayCell(p)}</td><td>${role(s)}</td><td>${catLink('enz', catKey(en), en)}</td><td>${reactionCell(p, r)}</td><td>${cofCell(m, r)}</td><td>${whereCell(r)}</td></tr>`; };
  return `<div class="tablewrap"><table class="steps"><thead><tr>${head}</tr></thead><tbody>${e.steps.map(row).join('')}</tbody></table></div>`;
}
// The pathways past the first four are drawn when you open them (water is in nearly every pathway).
document.addEventListener('toggle', ev => {
  const d = ev.target;
  if (!d.matches?.('details.morectx') || !d.open || d.dataset.done) return;
  const kind = CAT_TABS.find(t => t[0] === d.dataset.tab)?.[2], e = kind && catalog()[kind][d.dataset.key];
  if (!e) return;
  const ps = [...e.pathways].map(id => Library.get(id)).filter(Boolean).sort((a, b) => groupRank(a.group) - groupRank(b.group) || a.name.localeCompare(b.name));
  d.querySelector('div').innerHTML = ps.slice(4).map(p => contextHTML(e, p)).join(''); d.dataset.done = '1';
}, true);
