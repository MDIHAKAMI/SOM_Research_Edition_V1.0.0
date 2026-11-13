// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/* Copyright (c) 2026 Mohammed Hakami. See LICENSE for terms of use. */
// Run npm test once, then: node examples/generate-local-research-demo.cjs
// Calls the tested research controller and the application's own Excel exporter.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const compiled = path.resolve(__dirname, '../work/test-build/study');
const { createLocalResearchService, LocalResearchError } = require(path.join(compiled, 'local-research.js'));
const { LIVE_VERSION, timeline } = require(path.join(compiled, 'live.js'));
const { defaultChoice, simulate, RELEASE } = require(path.join(compiled, 'pharmacology.js'));
const { defaultCov } = require(path.join(compiled, 'model.js'));
const { eventSnapshot } = require(path.join(compiled, 'event-snapshot.js'));
const { researchSheets, xlsx } = require(path.join(compiled, 'workbook.js'));
const { HN_VERSION } = require(path.join(compiled, 'pd-registry.js'));
const packageVersion = require('../package.json').version;

class MemoryStorage {
  state = null;
  async load() { return structuredClone(this.state); }
  async commit(next, expectedRevision) {
    if ((this.state?.revision ?? 0) !== expectedRevision) throw new LocalResearchError('Concurrent write', 409);
    this.state = structuredClone(next);
  }
}
const origin = Date.parse('2026-11-12T10:00:00.000Z');
const at = seconds => new Date(origin + seconds * 1000).toISOString();
let recordedSecond = 0;
const service = createLocalResearchService(new MemoryStorage(), {
  now: () => origin + recordedSecond * 1000,
  id: () => { throw Error('Every example identifier must be explicit.'); },
});
const studyId = 'DEMO-SOM-01', caseId = 'DEMO-CASE-001';
const patient = { age: 40, weight: 70, height: 175, sex: 'male' };
const clinical = (name, extra = {}) => ({
  name, response: null, nmb: 'none', ventilation: 'spontaneous',
  rr: null, spo2: null, etco2: null, pain: null, oaas: null,
  windowSeconds: 10, responsivenessScale: 'moaas-0-5',
  notes: 'Invented demonstration observation. No patient was studied.', ...extra,
});
let result;
async function enter(id, kind, data, occurred, recorded = occurred) {
  recordedSecond = recorded;
  result = await service.api('/live-entry', {
    id, kind, data, studyId, sessionId: caseId,
    revision: result.session.revision, observedAt: at(occurred), recorder: 'DEMO',
  });
  return result;
}

async function main() {
  await service.api('/studies', {
    id: studyId, name: studyId,
    protocol: 'Synthetic demonstration of local recording, immutable event snapshots, delayed dose correction and export. Not clinical evidence.',
  });
  result = await service.api('/live-sessions', {
    id: caseId, studyId, participant: 'SIM-001', site: 'DEMO', recorder: 'DEMO',
    patient, covariates: defaultCov, choice: defaultChoice, cohort: 'development',
    noticeVersion: LIVE_VERSION, priorDrugs: 'No prior drugs in this invented example.',
    startedAt: at(0), synthetic: true,
  });
  await enter('PHASE-INDUCTION', 'phase', { phase: 'induction' }, 0);
  await enter('PROP-ORIGINAL', 'drug', { drug: 'propofol', mode: 'push', value: 100 }, 0, 5);
  await enter('REMI-START', 'drug', { drug: 'remifentanil', mode: 'infusion', value: 0.1 }, 20, 25);
  await enter('OBS-LOSS', 'clinical', clinical('Loss of verbal responsiveness', { oaas: 1 }), 60, 65);
  const originalLoss = structuredClone(result.entries.find(e => e.id === 'OBS-LOSS').snapshot);
  await enter('CONTEXT-90', 'context', { nProfile: 'airway', n2oPercent: 0, spinalBupivacaine: false, bis: 42 }, 90, 95);
  await enter('PHASE-MAINTENANCE', 'phase', { phase: 'maintenance' }, 120);
  await enter('KETAMINE-1', 'drug', { drug: 'ketamine', mode: 'push', value: 20 }, 120, 130);
  await enter('OBS-INCISION', 'clinical', clinical('Skin incision', { response: 'tolerated', oaas: 0 }), 180, 185);
  await enter('VOID-PROP', 'void', { target: 'PROP-ORIGINAL', reason: 'Invented transcription correction: replace 100 mg with 120 mg at the original occurrence time.' }, 240);
  await enter('PROP-CORRECTED', 'drug', { drug: 'propofol', mode: 'push', value: 120 }, 0, 245);
  await enter('OBS-STIMULUS', 'clinical', clinical('Major surgical stimulus', { response: 'tolerated', oaas: 0 }), 300, 305);
  await enter('PHASE-EMERGENCE', 'phase', { phase: 'emergence' }, 420);
  await enter('REMI-STOP', 'drug', { drug: 'remifentanil', mode: 'infusion', value: 0 }, 420, 425);
  await enter('OBS-COMMAND', 'clinical', clinical('Obeys command', { oaas: 5 }), 540, 545);
  await enter('END-CASE', 'end', {}, 600);
  assert.equal(result.session.synthetic, true);
  assert.equal(result.session.recorder, 'DEMO');
  assert.equal(result.entries.length, 15);
  assert.ok(result.entries.every(e => e.author === 'DEMO'));
  assert.deepEqual(result.entries.find(e => e.id === 'OBS-LOSS').snapshot, originalLoss);

  const correctedTrace = simulate(patient, timeline(result.entries).filter(e => e.t <= 60), 1, defaultChoice).at(-1);
  const correctedSnapshot = eventSnapshot(correctedTrace, defaultChoice, patient.age, result.entries, patient);
  assert.notEqual(originalLoss.cp.propofol, correctedSnapshot.cp.propofol);
  assert.ok(Math.abs(correctedSnapshot.cp.propofol / originalLoss.cp.propofol - 1.2) < 1e-12);
  assert.ok(Math.abs(correctedSnapshot.ce.propofol / originalLoss.ce.propofol - 1.2) < 1e-12);

  const backup = JSON.parse(JSON.stringify(await service.exportBackup()));
  const restored = createLocalResearchService(new MemoryStorage(), { now: () => origin + 600000 });
  assert.deepEqual(await restored.importBackup(backup), { imported: 1, studies: 1 });
  const importedCase = await restored.api(`/live-session?studyId=${studyId}&sessionId=${caseId}`);
  assert.deepEqual(importedCase.session, backup.state.cases[0].session);
  const byId = entries => [...entries].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(importedCase.entries), byId(backup.state.cases[0].entries));
  assert.deepEqual(await restored.importBackup(backup), { imported: 0, studies: 0 });

  // Freeze only the export metadata clock; concentrations and snapshots are unchanged.
  const RealDate = Date;
  let sheets;
  try {
    global.Date = class extends RealDate {
      constructor(...args) { super(...(args.length ? args : [origin + 600000])); }
      static now() { return origin + 600000; }
    };
    sheets = researchSheets(importedCase.session, importedCase.entries);
  } finally { global.Date = RealDate; }
  const originalRows = sheets.find(s => s.name === 'Event concentrations').rows;
  const stored = originalRows.find(r => r[0] === 'OBS-LOSS' && r[2] === 'Propofol');
  assert.equal(stored[3], originalLoss.cp.propofol);
  const series = sheets.find(s => s.name === 'Concentration series').rows;
  const propCol = series[0].findIndex(x => String(x).startsWith('propofol Cp-ET'));
  assert.equal(series.find(r => r[0] === 60)[propCol], correctedSnapshot.cp.propofol);
  fs.writeFileSync(path.join(__dirname, 'local-research-demo.json'), JSON.stringify(backup, null, 2) + '\n');
  fs.writeFileSync(path.join(__dirname, 'local-research-demo.xlsx'), xlsx(sheets));
  const checks = {
    synthetic: true, packageVersion, scientificEngine: RELEASE, hnVersion: HN_VERSION,
    studyId, participant: 'SIM-001', recorder: 'DEMO', entries: result.entries.length,
    sheets: sheets.map(s => s.name), event: 'OBS-LOSS', occurrenceSecond: 60,
    originalPropofolCp: originalLoss.cp.propofol, reconstructedPropofolCp: correctedSnapshot.cp.propofol,
    originalPropofolCe: originalLoss.ce.propofol, reconstructedPropofolCe: correctedSnapshot.ce.propofol,
    originalH: originalLoss.multimodal.H, reconstructedH: correctedSnapshot.multimodal.H,
    originalSnapshotPreserved: true, importRoundTrip: 'passed', duplicateImport: 'skipped safely',
  };
  console.log(JSON.stringify(checks, null, 2));
}
main().catch(error => { console.error(error); process.exitCode = 1; });
