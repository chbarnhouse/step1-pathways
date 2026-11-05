/* Your copy only: what classmates do on the public site, read through /api/analytics. */
'use strict';
const AN = { days: 30, data: {}, err: '', loading: {} };
const AN_RANGES = [[7, '7 days'], [30, '30 days'], [90, '90 days']];
const AN_PAGES = { '/': 'Dashboard', '/new': 'New quiz', '/quiz': 'Quiz', '/map': 'Map', '/pathways': 'Library', '/pathways/edit': 'Pathway editor', '/settings': 'Settings', '/other': 'Other' };
const AN_EVENTS = { 'quiz-start': 'Quizzes started', 'quiz-finish': 'Quizzes finished', backup: 'Backups downloaded' };

function loadAnalytics(days) {
  if (Store.mode !== 'server' || AN.loading[days] || AN.data[days]) return;
  AN.loading[days] = true;
  fetch(`/api/analytics?days=${days}`).then(r => r.json()).then(d => { AN.data[days] = d; AN.err = d.configured && !d.ok ? d.error || 'Umami didn’t answer.' : ''; })
    .catch(() => { AN.err = 'Couldn’t reach your server.'; }).finally(() => {
      AN.loading[days] = false;
      const el = $('#dashAnalytics'); if (el) el.innerHTML = analyticsCardHTML();
      if (location.hash === '#/analytics') renderAnalytics();
    });
}
const anNum = n => Number(n || 0).toLocaleString();
const anEvent = (d, name) => (d.events || []).find(e => e.x === name)?.y || 0;
const anPage = x => AN_PAGES[x] || (x.startsWith('/library/') ? `Library: ${x.slice(9)}` : x.startsWith('/pathways/') ? (x === '/pathways/custom' ? 'A custom pathway' : Library.get(x.slice(10))?.name || x.slice(10)) : x);
const anCountry = x => { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(x); } catch { return x; } };
const anCap = x => x[0].toUpperCase() + x.slice(1);
const anValues = list => (list || []).map(v => ({ x: v.value ?? v.x, y: v.total ?? v.y }));

// Your copy only: this week at a glance, and a way in.
function analyticsCardHTML() {
  if (Store.mode !== 'server') return '';
  const d = AN.data[7];
  if (!d) { loadAnalytics(7); return ''; }
  if (!d.ok) return '';
  return `<section class="card pad rv-dash"><div class="sec-h"><h2>${mi('bar_chart', 'h-ic')} Analytics</h2><a class="btn small" href="#/analytics">Open</a></div>
    <p class="muted">Public site, last 7 days: ${plural(d.stats.visitors, 'visitor')} · ${anEvent(d, 'quiz-start') === 1 ? '1 quiz' : `${anEvent(d, 'quiz-start')} quizzes`} started.</p></section>`;
}
function anKpi(label, value, note) { return `<section class="card pad an-kpi"><span class="muted small">${label}</span><b>${value}</b><span class="muted small">${note}</span></section>`; }
function anChange(now, before) {
  if (!before) return 'No earlier period to compare';
  const p = Math.round((now - before) / before * 100);
  return `${p > 0 ? '+' : ''}${p}% vs the previous ${AN.days} days`;
}
function anList(title, rows, name = x => x) {
  const top = Math.max(1, ...rows.map(r => r.y));
  return `<section class="card pad"><h2>${title}</h2>${rows.length ? `<ol class="an-rows">${rows.slice(0, 8).map(r => `<li class="an-row"><span title="${esc(name(r.x))}">${esc(name(r.x))}</span><b>${anNum(r.y)}</b><i style="width:${Math.max(1, r.y / top * 100)}%"></i></li>`).join('')}</ol>` : '<p class="muted">Nothing yet.</p>'}</section>`;
}
function anDays(d) {
  const by = k => Object.fromEntries((d.daily[k] || []).map(p => [p.x.slice(0, 10), p.y]));
  const views = by('pageviews'), people = by('sessions'), out = [];
  for (let i = AN.days - 1; i >= 0; i--) {
    const t = new Date(Date.now() - i * 86400000), key = t.toLocaleDateString('en-CA');
    out.push({ label: t.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), people: people[key] || 0, views: views[key] || 0 });
  }
  return out;
}
function anTrend(d) {
  const days = anDays(d), top = Math.max(1, ...days.map(x => x.people));
  const bars = days.map(x => `<div class="an-day" data-tip="${esc(`${x.label}: ${plural(x.people, 'visitor')}, ${plural(x.views, 'page view')}`)}"><i style="height:${x.people / top * 100}%"></i></div>`).join('');
  return `<section class="card pad an-trend"><h2>Visitors per day</h2>
    <div class="an-chart"><div class="an-y muted small"><span>${anNum(top)}</span><span>0</span></div><div class="an-bars">${bars}</div>
      <div class="an-x muted small"><span>${days[0].label}</span><span>${days[days.length - 1].label}</span></div></div>
    <details><summary class="muted small">Show as a table</summary><table class="an-table"><thead><tr><th>Day</th><th>Visitors</th><th>Page views</th></tr></thead>
      <tbody>${days.filter(x => x.views).reverse().map(x => `<tr><td>${x.label}</td><td>${anNum(x.people)}</td><td>${anNum(x.views)}</td></tr>`).join('')}</tbody></table></details></section>`;
}
function renderAnalytics() {
  const d = AN.data[AN.days];
  if (!d) loadAnalytics(AN.days);
  const range = `<div class="seg" role="group">${AN_RANGES.map(([v, l]) => `<button type="button" data-anrange="${v}" aria-pressed="${AN.days === v}">${l}</button>`).join('')}</div>`;
  const head = `<div class="an-head"><h1>Analytics</h1><div class="an-tools">${range}${d?.link ? `<a class="btn small" href="${esc(d.link)}" target="_blank" rel="noopener">${mi('open_in_new', 'sm')} Open in Umami</a>` : ''}</div></div>`;
  let body = '<p class="muted">Loading…</p>';
  if (d && !d.configured) body = '<section class="card pad"><p class="muted">Not connected. Add analytics.json beside your saved data on the server.</p></section>';
  else if (AN.err) body = `<section class="card pad"><p>${esc(AN.err)}</p></section>`;
  else if (d?.ok) {
    const s = d.stats, c = s.comparison || {}, started = anEvent(d, 'quiz-start'), done = anEvent(d, 'quiz-finish');
    body = `<div class="an-kpis">
      ${anKpi('Visitors', anNum(s.visitors), anChange(s.visitors, c.visitors))}
      ${anKpi('Visits', anNum(s.visits), anChange(s.visits, c.visits))}
      ${anKpi('Page views', anNum(s.pageviews), anChange(s.pageviews, c.pageviews))}
      ${anKpi('Quizzes started', anNum(started), started ? `${Math.round(done / started * 100)}% finished` : 'None yet')}
    </div>${anTrend(d)}<div class="an-grid">
      ${anList('Top pages', d.pages, anPage)}
      ${anList('Pathways quizzed', anValues(d.pathways), x => x === 'custom' ? 'A custom pathway' : Library.get(x)?.name || x)}
      ${anList('Quiz styles', anValues(d.modes), x => MODE_NAMES[x] || x)}
      ${anList('Actions', d.events, x => AN_EVENTS[x] || x)}
      ${anList('Devices', d.devices, anCap)}
      ${anList('Countries', d.countries, anCountry)}
    </div><p class="muted small">Public site only. A visitor is one browser, not one person. European time zones, browsers asking not to be tracked and ad blockers aren’t counted.</p>`;
  }
  $('#view').innerHTML = `<div class="page analytics">${head}${body}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-anrange]');
  if (b) { AN.days = +b.dataset.anrange; AN.err = ''; renderAnalytics(); }
});
