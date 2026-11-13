// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DRUG_IDS, IV, defaultChoice, simulate, zeroExposure } from '../study/pharmacology';
import { makeDose, type Entry, type LiveSession } from '../study/live';
import { eventSnapshot } from '../study/event-snapshot';
import { researchSheets, xlsx } from '../study/workbook';
import { featureNames, features, defaultCov } from '../study/model';
import { forecastDrug } from '../study/forecast';
import { HN_VERSION } from '../study/pd-registry';

const patient = { age: 40, sex: 'male' as const, weight: 70, height: 175 };
const start = '2026-10-17T09:00:00.000Z';
const at = (t: number) => new Date(Date.parse(start) + t * 1000).toISOString();
const session: LiveSession = { id: 'hn3-integration', studyId: 'test', participant: 'SYNTHETIC', site: 'TEST',
  patient, covariates: defaultCov, choice: defaultChoice, cohort: 'development',
  startedAt: start, endedAt: at(120), revision: 1, noticeVersion: 'test', priorDrugs: '' };
const entry = (id: string, t: number, kind: Entry['kind'], data: unknown): Entry =>
  ({ id, sessionId: session.id, kind, t, observedAt: at(t), receivedAt: at(t), author: 'test', data });

test('new milligram drug infusion inputs preserve microgram per kilogram per minute conversion', () => {
  for (const drug of ['midazolam', 'hydromorphone'] as const) {
    const dose = makeDose(drug, 'infusion', 1, 70, 0, drug);
    assert.equal(dose.value, 4.2); // 70 micrograms/min = 4.2 mg/hour.
    const push = makeDose(drug, 'push', 2, 70, 0, drug);
    assert.equal(push.value, 2);
    const loading = makeDose(drug, 'loading', 2, 70, 0, drug, 2);
    assert.equal(loading.value, 2);
    assert.equal(loading.durationSeconds, 120);
  }
});

test('all thirteen agents can be previewed without adding an administration to the case', () => {
  assert.equal(DRUG_IDS.length, 13);
  assert.equal(IV.length, 11);
  for (const drug of DRUG_IDS) {
    const events: never[] = [];
    const result = forecastDrug({ patient, events, choice: defaultChoice, now: 37, drug,
      mode: ['sevoflurane', 'desflurane'].includes(drug) ? 'et' : 'push', value: 1, minutes: 1 });
    assert.deepEqual(events, []);
    assert.equal(result.rows.length, 4);
    for (const row of result.rows) {
      assert.equal(row.baseline!.cp[drug], 0);
      assert.ok(row.hypothetical!.cp[drug] > 0);
    }
  }
});

test('legacy fitted feature schema remains fixed when new drugs enter the inventory', () => {
  assert.equal(featureNames.length, 66);
  const base = features(zeroExposure(), patient, defaultCov);
  const extra = features({ ...zeroExposure(), midazolam: 25, hydromorphone: 4 }, patient, defaultCov);
  assert.deepEqual(extra, base);
  assert.equal(featureNames.filter(n => n.includes(' × ')).length, 47);
});

test('new snapshots and exports retain source-specific H/N inputs and all thirteen drugs', () => {
  const entries = ['midazolam', 'hydromorphone'].map((drug, i) => entry(`dose-${i}`, 0, 'drug',
    { event: makeDose(drug as 'midazolam' | 'hydromorphone', 'push', 1, 70, 0, `dose-${i}`), entered: { mode: 'push', value: 1 } }));
  const trace = simulate(patient, entries.map(e => e.data.event), 2).at(-1)!;
  const snap = eventSnapshot(trace, defaultChoice, 40, entries);
  assert.equal(snap.multimodal.version, HN_VERSION);
  assert.equal(snap.multimodal.contributions.length, 26);
  assert.ok(snap.multimodal.H.value! > 0);
  assert.ok(snap.multimodal.N.value! > 0);
  assert.ok(snap.endpointCe!.hydromorphoneThermal! > 0);
  const observed = { ...entry('observed', 120, 'clinical', { name: 'Research observation' }), snapshot: snap };
  const before = JSON.stringify(observed);
  const sheets = researchSheets(session, [...entries, observed]);
  assert.equal(JSON.stringify(observed), before);
  const contributions = sheets.find(s => s.name === 'HN event contributions')!;
  assert.equal(contributions.rows.length, 27);
  const states = sheets.find(s => s.name === 'HN event states')!;
  assert.equal(states.rows[1][states.rows[0].indexOf('Registry version')], HN_VERSION);
  assert.ok(xlsx(sheets).byteLength > 1000);
});

test('export does not reinterpret historical H/N snapshots with the new equations', () => {
  const oldState = { version: 'som-hn-2.0.0', t: 60, context: { nProfile: 'generic', n2oPercent: null, spinalBupivacaine: null, bis: null },
    H: { value: 1.234, complete: true, included: ['propofol'], excluded: [] },
    N: { value: 0.567, complete: true, included: ['propofol'], excluded: [] }, contributions: [] };
  // Historical stored JSON predates the current TypeScript snapshot shape.
  const old: Entry = JSON.parse(JSON.stringify({ ...entry('old', 60, 'clinical', { name: 'Historical observation' }),
    snapshot: { release: 'som-4.2.0', cp: zeroExposure(), ce: zeroExposure(), multimodal: oldState } }));
  const before = JSON.stringify(old);
  const states = researchSheets(session, [old]).find(s => s.name === 'HN event states')!;
  assert.equal(states.rows[1][states.rows[0].indexOf('H units')], 1.234);
  assert.equal(states.rows[1][states.rows[0].indexOf('N units')], 0.567);
  assert.equal(states.rows[1][states.rows[0].indexOf('Registry version')], 'som-hn-2.0.0');
  assert.equal(JSON.stringify(old), before);
});
