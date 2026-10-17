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

// Case-, space- and punctuation-insensitive; "phosphate" ≡ "P", "bisphosphate"/"diphosphate" ≡ "BP"; α/β spelled out.
function norm(s) {
  return String(s).toLowerCase()
    .replace(/α/g, 'alpha').replace(/β/g, 'beta').replace(/γ/g, 'gamma').replace(/δ/g, 'delta')
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
