/* Automatic backups for the static copy (the server copy saves on the server and needs none).
   1. Linked file (Chrome, Edge): you pick a file once; every change is written to it a moment later.
      The browser remembers the file but asks for permission again after a restart, so the dashboard
      shows a one-click Reconnect when that happens. Firefox and Safari have no way for a page to write
      to a file you chose, so this option doesn't appear there.
   2. Auto-download (every browser): a dated backup lands in Downloads when you leave a quiz. */
'use strict';

const AutoBackup = {
  supported: typeof window.showSaveFilePicker === 'function',
  handle: null,
  status: 'off', // off | linked | needs-permission | error
  savedAt: 0,
  t: null,
  db() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('step1-pathways', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('handles');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async idb(op, value) {
    const db = await this.db();
    return new Promise((res, rej) => {
      const tx = db.transaction('handles', op === 'get' ? 'readonly' : 'readwrite'), st = tx.objectStore('handles');
      const r = op === 'get' ? st.get('backup') : op === 'put' ? st.put(value, 'backup') : st.delete('backup');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async init() {
    if (!this.supported || Store.mode !== 'local') return;
    try {
      this.handle = await this.idb('get') || null;
      if (!this.handle) return;
      this.status = (await this.handle.queryPermission({ mode: 'readwrite' })) === 'granted' ? 'linked' : 'needs-permission';
      this.savedAt = local.get('pathways.autoFileAt') || 0;
    } catch { this.status = 'off'; }
  },
  async link() {
    try {
      this.handle = await window.showSaveFilePicker({ suggestedName: 'step1-pathways-backup.json', types: [{ description: 'Step 1 Pathways backup', accept: { 'application/json': ['.json'] } }] });
    } catch { return false; } // cancelled
    await this.idb('put', this.handle).catch(() => {});
    this.status = 'linked';
    return this.write();
  },
  async reconnect() {
    if (!this.handle) return false;
    try { this.status = (await this.handle.requestPermission({ mode: 'readwrite' })) === 'granted' ? 'linked' : 'needs-permission'; } catch { this.status = 'needs-permission'; }
    return this.status === 'linked' && this.write();
  },
  async unlink() { this.handle = null; this.status = 'off'; await this.idb('delete').catch(() => {}); },
  schedule() { if (this.status === 'linked') { clearTimeout(this.t); this.t = setTimeout(() => this.write(), 1500); } },
  async write() {
    if (this.status !== 'linked') return false;
    try {
      const w = await this.handle.createWritable();
      await w.write(backupText()); await w.close();
      this.savedAt = Date.now();
      local.set('pathways.autoFileAt', this.savedAt); local.set('pathways.lastBackup', this.savedAt);
      return true;
    } catch { this.status = 'error'; return false; }
  },
  get fileName() { return this.handle?.name || ''; },
};
const autoDownloadOn = () => Store.mode === 'local' && !!local.get('pathways.autoDownload');
