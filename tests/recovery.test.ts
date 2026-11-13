// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRecoveryStorage, createRecoveryLockScope, parsed, recoveryId } from '../study/workspace-recovery';
import { simulate, defaultChoice, DEMO_EVENTS } from '../study/pharmacology';
import { elapsed } from '../study/live';

class MemoryStore {
  values = new Map<string, string>();
  fail = false;
  getItem(k: string) { return this.values.get(k) ?? null; }
  setItem(k: string, v: string) { if (this.fail) throw Error('QuotaExceededError'); this.values.set(k, v); }
  removeItem(k: string) { this.values.delete(k); }
}
const patient = { age: 40, weight: 70, height: 175, sex: 'male' as const };
const quick = { id: 'quick-1', startedAt: '2026-09-23T01:00:00.000Z', endedAt: null,
  patient, choice: defaultChoice, entries: DEMO_EVENTS };

class BrowserLocks {
  held = new Set<string>();
  requests: Promise<void>[] = [];
  request = (name: string, hold: (granted: boolean) => Promise<void>): Promise<void> => {
    const completed = (async () => {
      await Promise.resolve(); // Browser callbacks arrive after request returns.
      if (this.held.has(name)) { await hold(false); return; }
      this.held.add(name);
      try { await hold(true); }
      finally {
        await Promise.resolve(); // Releasing the callback is not yet releasing the browser lock.
        this.held.delete(name);
      }
    })();
    this.requests.push(completed);
    return completed;
  };
  async idle() { await Promise.all(this.requests); }
}

test('overlapping StrictMode effects share one document lease and cancelled cleanup cannot unlock the active effect', async () => {
  const browser = new BrowserLocks();
  const document = createRecoveryLockScope(browser.request);
  const otherDocument = createRecoveryLockScope(browser.request);
  const cancelledEffect = document.acquire('case');
  const activeEffect = document.acquire('case');
  const cancelled = await cancelledEffect;
  cancelled.release();
  cancelled.release(); // Cleanup must be idempotent.
  const active = await activeEffect;
  assert.equal(cancelled.warning, '');
  assert.equal(active.warning, '');
  assert.equal(browser.requests.length, 1);
  assert.match((await otherDocument.acquire('case')).warning, /another tab/);
  assert.equal(browser.held.has('som-recovery:case'), true);
  active.release();
  await browser.idle();
  assert.equal(browser.held.size, 0);
  const moved = await otherDocument.acquire('case');
  assert.equal(moved.warning, '');
  moved.release();
  await browser.idle();
});

test('a same-document immediate reopen waits for final browser release while another workspace remains independent', async () => {
  const browser = new BrowserLocks();
  const document = createRecoveryLockScope(browser.request);
  const otherDocument = createRecoveryLockScope(browser.request);
  const first = await document.acquire('case');
  const separate = await otherDocument.acquire('different-case');
  assert.equal(separate.warning, '');
  first.release();
  const reopened = await document.acquire('case');
  assert.equal(reopened.warning, '');
  assert.match((await otherDocument.acquire('case')).warning, /another tab/);
  reopened.release();
  separate.release();
  await browser.idle();
});

test('unavailable or failed browser locks never create a writable lease and a later request may retry', async () => {
  assert.match((await createRecoveryLockScope().acquire('case')).warning, /cannot protect/);
  const browser = new BrowserLocks();
  let attempts = 0;
  const document = createRecoveryLockScope((name, hold) => {
    if (++attempts === 1) return Promise.reject(Error('Synthetic browser failure'));
    return browser.request(name, hold);
  });
  const denied = await document.acquire('case');
  assert.notEqual(denied.warning, '');
  const retried = await document.acquire('case');
  assert.equal(retried.warning, '');
  retried.release();
  await browser.idle();
});

test('migrates the active case and restores its doses after session storage is lost and three hours elapse', () => {
  const durable = new MemoryStore(), tab = new MemoryStore();
  tab.setItem('som-quick', JSON.stringify(quick)); tab.setItem('som-mode', 'quick');
  const first = createRecoveryStorage(durable, tab, 'a', true);
  first.setItem('som-quick', JSON.stringify({ ...quick, confirmed: true }));
  const restored = createRecoveryStorage(durable, new MemoryStore(), 'a', false);
  const value = JSON.parse(restored.getItem('som-quick')!);
  assert.equal(restored.getItem('som-mode'), 'quick');
  assert.equal(value.id, quick.id); assert.deepEqual(value.entries, DEMO_EVENTS);
  assert.equal(elapsed(value.startedAt, Date.parse('2026-09-23T04:00:00Z')), 10800);
  assert.deepEqual(simulate(value.patient, value.entries, 180, value.choice), simulate(patient, DEMO_EVENTS, 180, defaultChoice));
});
test('research snapshot, resume intent and pending idempotent command survive independently', () => {
  const durable = new MemoryStore(), tab = new MemoryStore();
  const first = createRecoveryStorage(durable, tab, 'research', true);
  first.patch({ 'som-mode': 'live', 'som-research': JSON.stringify({ studyId: 'study', sessionId: 'session' }),
    'som-research-cache': JSON.stringify({ session: { id: 'session', revision: 2 }, entries: [1] }),
    'som-pending': JSON.stringify({ id: 'command-1', sessionId: 'session', revision: 2 }) });
  const offline = createRecoveryStorage(durable, new MemoryStore(), 'research', false);
  assert.equal(offline.getItem('som-mode'), 'live');
  offline.setItem('som-research-cache', JSON.stringify({ session: { id: 'session', revision: 3 }, entries: [1, 2] }));
  assert.equal(JSON.parse(offline.getItem('som-pending')!).id, 'command-1');
  assert.equal(JSON.parse(offline.getItem('som-research-cache')!).session.revision, 3);
});
test('independent workspaces never read each other and duplicate tabs cannot overwrite newer case data', () => {
  const durable = new MemoryStore();
  const a = createRecoveryStorage(durable, new MemoryStore(), 'a', false);
  a.setItem('som-quick', 'first');
  const duplicate = createRecoveryStorage(durable, new MemoryStore(), 'a', false);
  const b = createRecoveryStorage(durable, new MemoryStore(), 'b', false);
  b.setItem('som-quick', 'different case');
  a.setItem('som-quick', 'newer dose');
  duplicate.setItem('som-clock-offset', '10');
  assert.throws(() => duplicate.setItem('som-quick', 'stale dose'), /another tab/);
  assert.equal(createRecoveryStorage(durable, new MemoryStore(), 'a', false).getItem('som-quick'), 'newer dose');
  assert.equal(b.getItem('som-quick'), 'different case');
});
test('failed write preserves both durable and in-memory prior record', () => {
  const durable = new MemoryStore(), tab = new MemoryStore();
  const store = createRecoveryStorage(durable, tab, 'a', true);
  store.setItem('som-quick', JSON.stringify(quick));
  durable.fail = true;
  assert.throws(() => store.setItem('som-quick', 'new entry'), /not saved/);
  assert.deepEqual(JSON.parse(store.getItem('som-quick')!), quick);
  assert.deepEqual(JSON.parse(createRecoveryStorage(durable, tab, 'a', false).getItem('som-quick')!), quick);
});
test('ended records remain ended; malformed keys are isolated and corrupt envelopes are never overwritten', () => {
  const durable = new MemoryStore(), tab = new MemoryStore();
  tab.setItem('som-quick', JSON.stringify({ ...quick, endedAt: '2026-09-23T04:00:00Z' }));
  tab.setItem('som-start-draft', '{broken');
  const store = createRecoveryStorage(durable, tab, 'a', true);
  assert.equal(parsed(store.getItem('som-start-draft')), null);
  assert.equal(JSON.parse(store.getItem('som-quick')!).endedAt, '2026-09-23T04:00:00Z');
  durable.setItem('som-recovery-v1:corrupt', '{broken');
  assert.throws(() => createRecoveryStorage(durable, tab, 'corrupt', true), /copy has been kept/);
  assert.equal(durable.getItem('som-recovery-v1:corrupt'), '{broken');
  assert.equal(recoveryId('#workspace=12345678-1234-1234-1234-123456789abc'), '12345678-1234-1234-1234-123456789abc');
  assert.equal(recoveryId('#workspace=not-a-workspace'), null);
});
