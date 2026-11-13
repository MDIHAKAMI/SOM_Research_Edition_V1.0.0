// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/* Copyright (c) 2026 Mohammed Hakami. See LICENSE for terms of use. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLocalResearchService, LocalResearchError, LOCAL_TIME_SOURCE,
  type LocalResearchStorage, type LocalResearchState,
} from '../study/local-research';
import { LIVE_VERSION, timeline } from '../study/live';
import { defaultChoice, simulate } from '../study/pharmacology';
import { defaultCov } from '../study/model';
import { researchSheets, xlsx } from '../study/workbook';

const origin = Date.parse('2026-11-12T10:00:00.000Z');
const at = (seconds: number) => new Date(origin + seconds * 1000).toISOString();
const patient = { age: 40, weight: 70, height: 175, sex: 'male' as const };
class MemoryStorage implements LocalResearchStorage {
  state: LocalResearchState | null = null;
  rejectWrites = false;
  async load() { return structuredClone(this.state); }
  async commit(next: LocalResearchState, expectedRevision: number) {
    if (this.rejectWrites) throw Error('Synthetic storage failure');
    if ((this.state?.revision ?? 0) !== expectedRevision) throw new LocalResearchError('Concurrent write', 409);
    this.state = structuredClone(next);
  }
}
function fixture(seconds = 60) {
  const storage = new MemoryStorage();
  let stamp = origin + seconds * 1000, sequence = 0;
  const service = createLocalResearchService(storage, { now: () => stamp, id: () => `generated-${++sequence}` });
  return { ...service, storage, setNow: (seconds: number) => { stamp = origin + seconds * 1000; } };
}
const study = { id: 'STUDY-01', name: 'STUDY-01', protocol: 'Synthetic workflow verification' };
const start = (overrides: Record<string, unknown> = {}) => ({
  id: 'CASE-001', studyId: study.id, participant: 'SYN-001', site: 'TEST-01',
  patient, covariates: defaultCov, choice: defaultChoice, cohort: 'development',
  noticeVersion: LIVE_VERSION, priorDrugs: '', startedAt: at(0), recorder: 'REC-01',
  synthetic: true, ...overrides,
});
const command = (id: string, revision: number, kind: string, data: unknown, second = 0) => ({
  id, revision, kind, data, studyId: study.id, sessionId: 'CASE-001', observedAt: at(second),
});
const dose = { drug: 'propofol', mode: 'push', value: 100, minutes: 1 };
const observation = {
  name: 'Loss of verbal responsiveness', response: null, nmb: 'none', ventilation: 'spontaneous',
  rr: null, spo2: null, etco2: null, pain: null, oaas: 1, windowSeconds: 10, notes: '',
  responsivenessScale: 'moaas-0-5',
};
async function started(f = fixture()) {
  await f.api('/studies', study);
  await f.api('/live-sessions', start());
  return f;
}

test('local research records a complete synthetic case and retains original snapshots after correction', async () => {
  const f = await started();
  const savedDose = await f.api('/live-entry', command('DOSE-1', 0, 'drug', dose));
  assert.equal(savedDose.session.revision, 1);
  assert.equal(savedDose.timeSource, LOCAL_TIME_SOURCE);
  assert.equal(savedDose.entries[0].author, 'REC-01');
  assert.equal(savedDose.entries[0].receivedAt, at(60));
  const observed = await f.api('/live-entry', command('OBS-1', 1, 'clinical', observation, 10));
  const snapshot = structuredClone(observed.entries.find((e: any) => e.id === 'OBS-1').snapshot);
  const reference = simulate(patient, timeline(savedDose.entries), 10 / 60, defaultChoice).at(-1)!;
  assert.equal(snapshot.cp.propofol, reference.cp.propofol);
  assert.equal(snapshot.ce.propofol, reference.ce.propofol);
  assert.equal(snapshot.traceAtSeconds, 10);
  assert.equal(snapshot.timelineRevision, 1);
  assert.equal(snapshot.retrospective, true);
  assert.equal(snapshot.calculatedAt, at(60));
  const corrected = await f.api('/live-entry', command('VOID-1', 2, 'void', { target: 'DOSE-1', reason: 'Synthetic correction' }, 15));
  assert.deepEqual(corrected.entries.find((e: any) => e.id === 'OBS-1').snapshot, snapshot);
  assert.equal(timeline(corrected.entries).length, 0);
  const ended = await f.api('/live-entry', command('END-1', 3, 'end', {}, 60));
  const sheets = researchSheets(ended.session, ended.entries);
  const caseSheet = sheets.find(s => s.name === 'Case')!;
  assert.deepEqual(caseSheet.rows.find(r => r[0] === 'Study ID'), ['Study ID', study.id]);
  assert.deepEqual(caseSheet.rows.find(r => r[0] === 'Synthetic data'), ['Synthetic data', true]);
  assert.ok(sheets.find(s => s.name === 'Audit'));
  assert.ok(sheets.find(s => s.name === 'Event concentrations'));
  assert.ok(sheets.find(s => s.name === 'Concentration series'));
  assert.ok(xlsx(sheets).byteLength > 2000);
  await assert.rejects(f.api('/live-entry', command('LATE-1', 4, 'drug', dose, 60)), /case has ended/);
  const read = await f.api('/live-session?studyId=STUDY-01&sessionId=CASE-001');
  assert.equal(read.session.endedAt, at(60));
  assert.deepEqual(read.entries.find((e: any) => e.id === 'OBS-1').snapshot, snapshot);
});

test('start and entry retries are idempotent but reused identifiers cannot change payloads', async () => {
  const f = await started();
  const again = await f.api('/live-sessions', start());
  assert.equal(again.session.revision, 0);
  await assert.rejects(f.api('/live-sessions', start({ participant: 'SYN-002' })), /different case request/);
  const entry = command('DOSE-1', 0, 'drug', dose);
  await f.api('/live-entry', entry);
  const retried = await f.api('/live-entry', entry);
  assert.equal(retried.entries.length, 1);
  assert.equal(retried.session.revision, 1);
  await assert.rejects(f.api('/live-entry', { ...entry, data: { ...dose, value: 150 } }), /different request/);
  await assert.rejects(f.api('/live-entry', { ...entry, observedAt: at(1) }), /different request/);
  await assert.rejects(f.api('/live-entry', command('STALE', 0, 'drug', dose)), (e: any) => e.status === 409);
});

test('a participant cannot cross development/validation or synthetic/recorded groups', async () => {
  const f = await started();
  await assert.rejects(f.api('/live-sessions', start({ id: 'CASE-002', cohort: 'validation' })), /different cohort or data origin/);
  await assert.rejects(f.api('/live-sessions', start({ id: 'CASE-002', synthetic: false })), /different cohort or data origin/);
  const same = await f.api('/live-sessions', start({ id: 'CASE-002' }));
  assert.equal(same.session.participant, 'SYN-001');
});

test('entry validation preserves NMB masking, event-time rules and correct dose units', async () => {
  const f = await started();
  await assert.rejects(f.api('/live-entry', command('NMB', 0, 'clinical', {
    ...observation, name: 'Skin incision', nmb: 'active', response: 'tolerated',
  })), /Movement cannot be scored/);
  await assert.rejects(f.api('/live-entry', command('FUTURE', 0, 'drug', dose, 100)), /no later than the device time/);
  await assert.rejects(f.api('/live-entry', command('BEFORE', 0, 'drug', dose, -1)), /within this case/);
  await assert.rejects(f.api('/live-entry', command('BAD', 0, 'drug', { drug: 'sevoflurane', mode: 'push', value: 2 })), /end-tidal/);
  const saved = await f.api('/live-entry', command('INFUSION', 0, 'drug', {
    drug: 'propofol', mode: 'infusion', value: 100, minutes: 1,
  }, 20));
  assert.equal(saved.entries[0].data.event.value, 420);
  assert.equal(saved.entries[0].data.entered.value, 100);
  await assert.rejects(f.api('/live-entry', command('END-EARLY', 1, 'end', {}, 10)), /earlier than an existing/);
  const context = await f.api('/live-entry', command('CONTEXT', 1, 'context', {
    nProfile: 'airway', n2oPercent: 50, spinalBupivacaine: false, bis: 42,
  }, 25));
  assert.equal(context.entries.find((e: any) => e.id === 'CONTEXT').data.bis, 42);
});

test('JSON backup import preserves original event snapshots and is duplicate-safe', async () => {
  const original = await started();
  await original.api('/live-entry', command('DOSE', 0, 'drug', dose));
  await original.api('/live-entry', command('OBS', 1, 'clinical', observation, 20));
  await original.api('/live-entry', command('END', 2, 'end', {}, 60));
  await original.api('/feedback', { studyId: study.id, role: 'Researcher', ratings: [4, 4, 5, 5], comment: 'Synthetic test' });
  const backup = JSON.parse(JSON.stringify(await original.exportBackup()));
  const second = fixture(120);
  assert.deepEqual(await second.importBackup(backup), { imported: 1, studies: 1 });
  const restored = await second.api('/live-session?studyId=STUDY-01&sessionId=CASE-001');
  assert.deepEqual(restored.session, backup.state.cases[0].session);
  assert.deepEqual(restored.entries, backup.state.cases[0].entries);
  assert.deepEqual(await second.importBackup(backup), { imported: 0, studies: 0 });
  const feedback = await second.api('/feedback?studyId=STUDY-01');
  assert.equal(feedback.rows.length, 1);
  assert.equal(feedback.rows[0].data.instrument, 'atlas-usability-v1-custom');
});

test('backup conflicts and malformed dose history cannot partially overwrite local records', async () => {
  const f = await started();
  await f.api('/live-entry', command('DOSE', 0, 'drug', dose));
  const backup = JSON.parse(JSON.stringify(await f.exportBackup()));
  const before = JSON.stringify(f.storage.state);
  const conflicting = structuredClone(backup);
  conflicting.state.studies.push({ id: 'NEW', name: 'NEW', protocol: '', created_at: at(0), role: 'local' });
  conflicting.state.cases[0].session.priorDrugs = 'Changed';
  await assert.rejects(f.importBackup(conflicting), /already exists with different data/);
  assert.equal(JSON.stringify(f.storage.state), before, 'Import is atomic even if a new study preceded the conflict');
  const invalid = structuredClone(backup);
  invalid.state.cases[0].entries[0].data.event.value = 999;
  const second = fixture();
  await assert.rejects(second.importBackup(invalid), /does not match its entered units/);
  assert.equal(second.storage.state, null);
  const badRevision = structuredClone(backup);
  badRevision.state.cases[0].session.revision = 90;
  await assert.rejects(second.importBackup(badRevision), /Invalid case metadata/);
});

test('local storage failure is reported without claiming that an entry was saved', async () => {
  const f = await started();
  const before = structuredClone(f.storage.state);
  f.storage.rejectWrites = true;
  await assert.rejects(f.api('/live-entry', command('DOSE', 0, 'drug', dose)), /storage failure/);
  assert.deepEqual(f.storage.state, before);
  f.storage.rejectWrites = false;
  const retry = await f.api('/live-entry', command('DOSE', 0, 'drug', dose));
  assert.equal(retry.session.revision, 1);
});

test('simultaneous writers cannot overwrite each other and may retry after refreshing', async () => {
  const f = await started();
  const requests = await Promise.allSettled([
    f.api('/live-entry', command('A', 0, 'drug', dose)),
    f.api('/live-entry', command('B', 0, 'drug', { ...dose, value: 50 })),
  ]);
  assert.equal(requests.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(requests.filter(r => r.status === 'rejected').length, 1);
  const fresh = await f.api('/live-session?studyId=STUDY-01&sessionId=CASE-001');
  assert.equal(fresh.entries.length, 1);
  assert.equal(fresh.session.revision, 1);
  const lostId = fresh.entries[0].id === 'A' ? 'B' : 'A';
  const retry = await f.api('/live-entry', command(lostId, 1, 'drug', lostId === 'A' ? dose : { ...dose, value: 50 }));
  assert.equal(retry.entries.length, 2);
  assert.equal(retry.session.revision, 2);
});

test('returned records are detached from persisted data and study IDs remain user-specified', async () => {
  const f = await started();
  const studies = await f.api('/studies');
  assert.equal(studies[0].id, study.id);
  studies[0].name = 'Mutated';
  const current = await f.api('/live-session?studyId=STUDY-01&sessionId=CASE-001');
  current.session.patient.weight = 500;
  assert.equal((await f.api('/studies'))[0].name, study.name);
  assert.equal((await f.api('/live-session?studyId=STUDY-01&sessionId=CASE-001')).session.patient.weight, 70);
  await assert.rejects(f.api('/studies', { id: 'unsafe/id', name: 'A', protocol: '' }), /Study ID must/);
  await assert.rejects(f.api('/live-session?studyId=MISSING&sessionId=CASE-001'), /Study not found/);
});
