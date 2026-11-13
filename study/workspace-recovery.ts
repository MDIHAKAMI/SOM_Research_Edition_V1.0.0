// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
// Recovery stores administration records, never the large derived trace.
// Each URL identifies a browser-local workspace, not a database credential.
export interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  patch(values: Record<string, string | null>): void;
}
type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const KEYS = ['som-quick', 'som-mode', 'som-research', 'som-research-cache',
  'som-pending', 'som-start-id', 'som-start-draft', 'som-clock-offset'];
const PREFIX = 'som-recovery-v1:';
type Envelope = { version: 1; values: Record<string, string>; updatedAt: string };
type RecoveryLockRequest = (name: string, hold: (granted: boolean) => Promise<void>) => Promise<void>;
type RecoveryLease = { release: () => void; warning: string };
const LOCK_DENIED = 'This case is already open in another tab. Continue there, or close that tab and reload this one before recording data.';
const LOCK_UNSUPPORTED = 'This browser cannot protect the saved case across tabs. Open it in an updated browser before recording data.';

/** One scope per document: overlapping effects share a browser lock, never another tab's lock. */
export function createRecoveryLockScope(request?: RecoveryLockRequest) {
  type Lease = {
    references: number;
    ready: Promise<(() => Promise<void>) | null>;
    closing?: Promise<void>;
  };
  const leases = new Map<string, Lease>();
  const acquire = async (id: string): Promise<RecoveryLease> => {
    if (!request) return { release: () => {}, warning: LOCK_UNSUPPORTED };
    let lease = leases.get(id);
    if (lease?.closing) {
      // The callback may have ended while the browser has not yet released its lock.
      await lease.closing;
      return acquire(id);
    }
    if (!lease) {
      const ready = new Promise<(() => Promise<void>) | null>(resolve => {
        let completed: Promise<void>;
        try {
          completed = request('som-recovery:' + id, async granted => {
            if (!granted) { resolve(null); return; }
            await new Promise<void>(unlock => resolve(() => {
              unlock();
              return completed.catch(() => {});
            }));
          });
          void completed.catch(() => resolve(null));
        } catch { resolve(null); }
      });
      lease = { references: 0, ready };
      leases.set(id, lease);
    }
    lease.references++;
    const held = lease;
    const unlock = await held.ready;
    if (!unlock) {
      held.references--;
      if (leases.get(id) === held) leases.delete(id);
      return { release: () => {}, warning: LOCK_DENIED };
    }
    let released = false;
    return { warning: '', release: () => {
      if (released) return;
      released = true;
      if (--held.references !== 0) return;
      held.closing = unlock().then(() => {
        if (leases.get(id) === held) leases.delete(id);
      });
    } };
  };
  return { acquire };
}
type RecoveryLockScope = ReturnType<typeof createRecoveryLockScope>;
const DOCUMENT_LOCK_SCOPE = Symbol.for('som.recovery-lock-scope.v1');
function documentLockScope(): RecoveryLockScope {
  // A document property survives module replacement without sharing a lease across tabs.
  const owner = document as Document & { [DOCUMENT_LOCK_SCOPE]?: RecoveryLockScope };
  return owner[DOCUMENT_LOCK_SCOPE] ??= createRecoveryLockScope(navigator.locks
    ? async (name, hold) => { await navigator.locks.request(name, { ifAvailable: true }, lock => hold(!!lock)); }
    : undefined);
}
export function parsed<T>(value: string | null): T | null {
  try { return value ? JSON.parse(value) as T : null; } catch { return null; }
}
export function recoveryId(hash: string): string | null {
  const id = new URLSearchParams(hash.replace(/^#/, '')).get('workspace');
  return id && /^[a-f\d-]{36}$/i.test(id) ? id : null;
}
export function createRecoveryStorage(durable: Store, legacy: Store, id: string, migrate: boolean): RecoveryStorage {
  const key = PREFIX + id;
  const read = (): Envelope => {
    const raw = durable.getItem(key);
    if (!raw) return { version: 1, values: {}, updatedAt: '' };
    const data = parsed<Envelope>(raw);
    if (!data || data.version !== 1 || !data.values || typeof data.values !== 'object' ||
      Object.entries(data.values).some(([k, v]) => !KEYS.includes(k) || typeof v !== 'string'))
      throw Error('The saved case could not be read. Its recovery copy has been kept.');
    return data;
  };
  let seen = read();
  if (!durable.getItem(key) && migrate) {
    for (const k of KEYS) {
      try { const value = legacy.getItem(k); if (value !== null) seen.values[k] = value; } catch {}
    }
    durable.setItem(key, JSON.stringify({ ...seen, updatedAt: new Date().toISOString() }));
  }
  const patch = (updates: Record<string, string | null>) => {
    const latest = read();
    for (const [k, value] of Object.entries(updates)) {
      if (!KEYS.includes(k)) throw Error('Unknown recovery field.');
      // A duplicated tab may read the same case, but cannot overwrite a newer record.
      if (latest.values[k] !== seen.values[k] && (latest.values[k] ?? null) !== value)
        throw Error('This case changed in another tab. Reload this tab before adding more data.');
      if (value === null) delete latest.values[k]; else latest.values[k] = value;
    }
    latest.updatedAt = new Date().toISOString();
    try { durable.setItem(key, JSON.stringify(latest)); }
    catch { throw Error('This change was not saved: browser storage is full or unavailable. Keep this case open and free some browser storage.'); }
    for (const [k, value] of Object.entries(updates)) {
      if (value === null) delete seen.values[k]; else seen.values[k] = value;
    }
    // Retain the old per-tab copy for backwards compatibility with already cached pages.
    for (const [k, value] of Object.entries(updates)) {
      try { if (value === null) legacy.removeItem(k); else legacy.setItem(k, value); } catch {}
    }
  };
  return {
    getItem: (k) => seen.values[k] ?? null,
    setItem: (k, v) => patch({ [k]: v }),
    removeItem: (k) => patch({ [k]: null }),
    patch,
  };
}
export async function openRecoveryStorage(): Promise<{ storage: RecoveryStorage; release: () => void; warning: string }> {
  const fromUrl = recoveryId(location.hash);
  let fromTab: string | null = null;
  try { fromTab = sessionStorage.getItem('som-workspace-id'); } catch {}
  const id = fromUrl ?? fromTab ?? crypto.randomUUID();
  // Publish the workspace identity before awaiting acquisition so a replayed effect
  // cannot create a different workspace while the first effect is still opening.
  const hash = new URLSearchParams(location.hash.replace(/^#/, ''));
  hash.set('workspace', id);
  history.replaceState(history.state, '', `${location.pathname}${location.search}#${hash}`);
  try { sessionStorage.setItem('som-workspace-id', id); } catch {}
  // An unknown explicit URL must not pick up some other case's legacy data.
  // Hold an origin-wide browser lock for this document's lifetime. The synchronous
  // save below then has a single writer even when a user duplicates an active tab.
  const { release, warning } = await documentLockScope().acquire(id);
  let store: RecoveryStorage;
  try { store = createRecoveryStorage(localStorage, sessionStorage, id, !warning && (!fromUrl || fromTab === id)); }
  catch (error) { release(); throw error; }
  if (warning) {
    const denied = () => { throw Error(warning); };
    store = { getItem: store.getItem, setItem: denied, removeItem: denied, patch: denied };
  }
  return { storage: store, release, warning };
}
