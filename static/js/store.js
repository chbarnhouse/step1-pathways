/* Where user data lives.
   Self-hosted (served by server.py): /api/state on the server, so every device sees the same edits and stats.
   Standalone (the single-file build, or any static host): this browser's localStorage — export to back up or share.
   Built-in pathways always come from window.PATHWAYS_BUNDLE (server-generated bundle.js, or inlined by build.py). */
'use strict';

const Store = {
  mode: 'local',
  data: { custom: {}, stats: {} },
  async init() {
    if (!window.PATHWAYS_STANDALONE) {
      try {
        const r = await fetch('api/state', { cache: 'no-store' });
        if (r.ok) { this.data = Object.assign({ custom: {}, stats: {} }, await r.json()); this.mode = 'server'; return; }
      } catch {}
    }
    try { this.data = Object.assign({ custom: {}, stats: {} }, JSON.parse(localStorage.getItem('pathways.data') || '{}')); } catch {}
  },
  save() { clearTimeout(this.t); this.t = setTimeout(() => this.flush(), 400); },
  async flush() {
    const body = JSON.stringify(this.data);
    if (this.mode === 'server') {
      try { await fetch('api/state', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body }); return; } catch {}
    }
    try { localStorage.setItem('pathways.data', body); } catch {}
  },
};

const Library = {
  builtin: () => (window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.pathways) || {},
  sharedCof: () => (window.PATHWAYS_BUNDLE && window.PATHWAYS_BUNDLE.cofactors) || {},
  all() { return Object.assign({}, this.builtin(), Store.data.custom); },
  get(id) { return Store.data.custom[id] || this.builtin()[id]; },
  status(id) { return Store.data.custom[id] ? (this.builtin()[id] ? 'edited' : 'custom') : 'builtin'; },
  list() {
    return Object.values(this.all()).map(p => ({ id: p.id, name: p.name, status: this.status(p.id), group: p.group || 'Other' }))
      .sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  },
};
