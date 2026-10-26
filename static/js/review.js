/* Content review (#/review, the server copy only): every fact written into the app rather than taken from a source
   the owner checked (fed vs fasting, drugs and their classes, diseases, mix-ups), as plain sentences. Each one is
   marked "Looks right" or "Needs a fix" with a note; marks live in Store.data.review { id: { v: 'ok'|'fix', note, h, at } },
   so they reach the server's state file, where whoever fixes the content reads them. A fact whose wording changed
   since it was marked shows as changed (h is a hash of its text). */
'use strict';

const RV = { show: 'open', section: '' }; // show: 'open' (not yet checked or changed) | 'fix' | 'all'
const rvHash = s => { let h = 0; for (const c of String(s)) h = (h * 31 + c.codePointAt(0)) | 0; return (h >>> 0).toString(36); };

function reviewFacts() {
  const out = [], ps = Object.values(Library.builtin()).filter(p => (p.reactions || []).length && !p.compose);
  const en = (p, r) => p.enzymes[r.enzyme]?.name || r.enzyme;
  const add = (section, id, title, body, where) => out.push({ section, id, title, body, where, h: rvHash(title + body) });
  // Fed vs fasting.
  for (const p of ps) for (const r of p.reactions) if (r.reg)
    add('Fed vs fasting', `reg|${p.id}|${r.id}`, `${en(p, r)}: ${r.reg.fed.toUpperCase()} when fed, ${r.reg.fasting.toUpperCase()} when fasting`, r.reg.why, p.name);
  // Drug classes: what the members share.
  const classes = Library.drugClasses();
  for (const [c, x] of Object.entries(classes)) {
    const members = uniq(ps.flatMap(p => p.reactions.flatMap(r => (r.drugs || []).filter(d => d.cls === c).map(d => d.name))));
    add('Drug classes', `cls|${c}`, `${c}${x.aliases?.length ? ` (${x.aliases.join(', ')})` : ''}: ${members.join(', ')}`, x.note, '');
  }
  // Each drug or toxin on its steps, once per pathway (one note covers its steps there).
  const seen = new Map();
  for (const p of ps) for (const r of p.reactions) for (const d of r.drugs || []) {
    const k = `${d.kind}|${p.id}|${norm(d.name)}`, e = seen.get(k);
    if (e) { e.steps.push(en(p, r)); continue; }
    seen.set(k, { d, p, steps: [en(p, r)] });
  }
  for (const [k, { d, p, steps }] of seen) {
    const what = `${d.effect === 'activates' ? 'drives' : 'blocks'} ${uniq(steps).join(' and ')}`;
    add(d.kind === 'toxin' ? 'Toxins' : 'Drugs', `drug|${k}`, `${d.name}${d.cls ? ` (${d.cls})` : ''} ${what}`, d.note + (d.aliases?.length ? ` Also called: ${d.aliases.join(', ')}.` : ''), p.name);
  }
  // Where it breaks.
  for (const p of ps) for (const r of p.reactions) for (const x of r.diseases || [])
    add('Diseases', `dis|${p.id}|${r.id}|${norm(x.name)}`, `${x.name}: ${en(p, r)} fails`, x.clue, p.name);
  // Mix-ups.
  for (const [a, b, note] of CONFUSIONS) add('Mix-ups', `mix|${norm(a[0])}|${norm(b[0])}`, `${a[0]} vs ${b[0]}`, note, '');
  return out;
}
const reviewState = f => { const x = (Store.data.review || {})[f.id]; return !x ? 'open' : x.h !== f.h ? 'changed' : x.v; };

function renderReview() {
  const facts = reviewFacts(), sections = uniq(facts.map(f => f.section));
  const count = s => facts.filter(f => reviewState(f) === s).length, done = facts.length - count('open') - count('changed');
  const shown = facts.filter(f => (!RV.section || f.section === RV.section)
    && (RV.show === 'all' || (RV.show === 'fix' ? reviewState(f) === 'fix' : ['open', 'changed'].includes(reviewState(f)))));
  const seg = (attr, opts, cur) => `<div class="seg" role="group">${opts.map(([v, l]) => `<button type="button" ${attr}="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  const card = f => {
    const s = reviewState(f), x = (Store.data.review || {})[f.id] || {};
    const badge = s === 'ok' ? `<span class="rv-badge ok">${mi('task_alt', 'sm')} Looks right</span>` : s === 'fix' ? `<span class="rv-badge fix">${mi('edit', 'sm')} Needs a fix</span>` : s === 'changed' ? `<span class="rv-badge changed">${mi('history', 'sm')} Changed since you checked</span>` : '';
    return `<article class="card pad rv-card" data-rv="${esc(f.id)}">
      <div class="rv-top"><span class="muted small">${esc(f.section)}${f.where ? ` · ${esc(f.where)}` : ''}</span>${badge}</div>
      <h3>${esc(f.title)}</h3><p>${esc(f.body)}</p>
      <div class="btnrow"><button class="btn small" data-rvset="ok" aria-pressed="${s === 'ok'}">${mi('check', 'sm')} Looks right</button><button class="btn small" data-rvset="fix" aria-pressed="${s === 'fix'}">${mi('edit', 'sm')} Needs a fix</button></div>
      ${s === 'fix' ? `<label class="rv-note"><span class="muted small">What’s wrong, or what it should say</span><textarea data-rvnote rows="2">${esc(x.note || '')}</textarea></label>` : ''}
    </article>`;
  };
  $('#view').innerHTML = `<div class="page review">
    ${pageHead('Review content', 'The facts written into this app for you to check: fed vs fasting, drugs and their classes, diseases and mix-ups. Mark each one; anything marked “Needs a fix”, with your note, is what gets corrected. Only your copy has this page.')}
    <section class="card pad rv-bar">
      <div class="rv-progress"><span class="meter" role="img" aria-label="${done} of ${facts.length} checked"><span style="width:${Math.round(100 * done / (facts.length || 1))}%"></span></span>
        <span><b>${done}</b> of ${facts.length} checked · ${count('fix')} need a fix${count('changed') ? ` · ${count('changed')} changed since` : ''}</span></div>
      <div class="rv-filters">${seg('data-rvshow', [['open', `To check (${count('open') + count('changed')})`], ['fix', `Needs a fix (${count('fix')})`], ['all', 'All']], RV.show)}
        ${seg('data-rvsec', [['', 'Every section'], ...sections.map(s => [s, `${s} (${facts.filter(f => f.section === s).length})`])], RV.section)}</div>
    </section>
    <div class="rv-list">${shown.length ? shown.map(card).join('') : `<p class="muted">Nothing here${RV.show === 'open' ? ': everything in this view is checked.' : '.'}</p>`}</div>
  </div>`;
}
document.addEventListener('click', e => {
  if (!$('#view .review')) return;
  const sh = e.target.closest('[data-rvshow]'), sc = e.target.closest('[data-rvsec]'), set = e.target.closest('[data-rvset]');
  if (sh) { RV.show = sh.dataset.rvshow; return renderReview(); }
  if (sc) { RV.section = sc.dataset.rvsec; return renderReview(); }
  if (!set) return;
  const id = set.closest('[data-rv]').dataset.rv, f = reviewFacts().find(x => x.id === id); if (!f) return;
  const r = (Store.data.review = Store.data.review || {}), was = r[id];
  // Marking a card keeps it in view until the next filter change, so the note box can open under it.
  r[id] = { v: set.dataset.rvset, note: set.dataset.rvset === 'fix' ? was?.note || '' : '', h: f.h, at: Date.now() };
  Store.save();
  const keep = RV.show; if (keep === 'open') RV.show = 'all';
  renderReview(); RV.show = keep;
  const card = document.querySelector(`[data-rv="${CSS.escape(id)}"]`); card?.scrollIntoView({ block: 'nearest' }); card?.querySelector('textarea')?.focus();
});
let rvTimer = 0;
document.addEventListener('input', e => {
  const t = e.target.closest?.('[data-rvnote]'); if (!t) return;
  const id = t.closest('[data-rv]').dataset.rv, x = Store.data.review?.[id]; if (!x) return;
  x.note = t.value; x.at = Date.now();
  clearTimeout(rvTimer); rvTimer = setTimeout(() => Store.save(), 600);
});
