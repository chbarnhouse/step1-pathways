/* Shared helpers. Plain scripts sharing one global scope, concatenated in order by build.py:
   util → store → model → draw → stats → editor → study. */
'use strict';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const uniq = a => [...new Set(a)];
const clone = o => JSON.parse(JSON.stringify(o));
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';
const uniqueId = (base, taken) => { let id = base, n = 2; while (taken.has(id)) id = `${base}-${n++}`; return id; };

const ICON = {
  ok: '<path d="M3.5 8.5l3 3 6-7"/>',
  no: '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
};
const icon = k => `<svg class="ic ${k}" viewBox="0 0 16 16" aria-hidden="true">${ICON[k]}</svg>`;

// Greek letters fold to their Latin initial, whether typed as α, "alpha" or just "a": a-ketoglutarate ≡ α-ketoglutarate.
// Applied to both the answer and what was typed, so any word that happens to start "beta…" folds the same on both sides.
const GREEK = { α: 'a', β: 'b', γ: 'g', δ: 'd', ε: 'e', θ: 'th', κ: 'k', ω: 'o' };
const GREEK_WORDS = { alpha: 'a', beta: 'b', gamma: 'g', delta: 'd', epsilon: 'e', theta: 'th', kappa: 'k', omega: 'o' };
const foldGreek = s => String(s).replace(/[αβγδεθκω]/g, c => GREEK[c]);
// Case-, space- and punctuation-insensitive; "phosphate" ≡ "P", "bisphosphate"/"diphosphate" ≡ "BP"; Greek folded.
function norm(s) {
  return foldGreek(String(s).toLowerCase())
    .replace(/\b(alpha|beta|gamma|delta|epsilon|theta|kappa|omega)/g, w => GREEK_WORDS[w])
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(bis|di)phosphate\b/g, 'bp').replace(/\bphosphate\b/g, 'p')
    .replace(/[\s\-_,.'’()\/]/g, '');
}

function download(name, text) {
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  } catch { return false; }
}

/* In-page stand-ins for alert / confirm / prompt — the native ones are disabled inside shared artifacts.
   ask() resolves to the typed text (input), true (confirmed) or null (cancelled). */
function ask({ title, text = '', input = false, value = '', ok = 'OK', cancel = 'Cancel', copy = false, alt = '', allowEmpty = false, html = '' }) {
  const d = document.getElementById('askDialog');
  d.innerHTML = `<form method="dialog" class="dlg">
    <div class="dlg-h"><h2>${esc(title)}</h2></div>
    ${text ? `<p class="ask-text">${esc(text).replace(/\n/g, '<br>')}</p>` : ''}${html}
    ${input === 'area' ? `<textarea id="askInput" rows="14" spellcheck="false">${esc(value)}</textarea>` : input ? `<input id="askInput" value="${esc(value)}" autocomplete="off">` : ''}
    <div class="actions">
      <button class="btn primary" value="ok">${esc(ok)}</button>
      ${copy ? '<button class="btn" type="button" id="askCopy">Copy</button>' : ''}
      ${alt ? `<button class="btn" value="alt">${esc(alt)}</button>` : ''}
      ${cancel ? `<button class="btn ghost" value="cancel" formnovalidate>${esc(cancel)}</button>` : ''}
    </div></form>`;
  return new Promise(res => {
    const inp = d.querySelector('#askInput');
    d.querySelector('#askCopy')?.addEventListener('click', e => {
      navigator.clipboard?.writeText(inp.value).then(() => { e.target.textContent = 'Copied'; }, () => { inp.select(); e.target.textContent = 'Selected — press ⌘C'; });
    });
    d.addEventListener('close', () => {
      if (d.returnValue === 'alt') return res('alt');
      if (d.returnValue !== 'ok') return res(null);
      res(input ? (inp.value.trim() || (allowEmpty ? '' : null)) : true);
    }, { once: true });
    d.returnValue = '';
    d.showModal();
    if (inp) { inp.focus(); inp.select(); }
  });
}
const say = (title, text) => ask({ title, text, cancel: null });
// A short message at the bottom of the screen that goes away by itself.
function toast(msg) {
  let t = document.getElementById('toast');
  if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.append(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 3200);
}
