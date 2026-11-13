// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { researchSheets, xlsx, type SheetData } from '../study/workbook';
import { defaultClinicalContext, CLINICAL_EXTENSION_VERSION } from '../study/clinical-context';
import { defaultChoice, zeroExposure, simulate } from '../study/pharmacology';
import { defaultCov } from '../study/model';
import { makeDose, combined, type Entry, type LiveSession } from '../study/live';
import { respiratoryEstimate, RESPIRATORY_VERSION } from '../study/respiratory';
import { simulateOrganComparisons } from '../study/organ-comparison';

const start = '2026-10-14T09:00:00.000Z';
const at = (t: number) => new Date(Date.parse(start) + t * 1000).toISOString();
const patient = { age: 43, sex: 'male' as const, weight: 70, height: 175 };
function makeSession(): LiveSession {
  return { id: 'synthetic-export', studyId: 'test', participant: 'SYNTHETIC', site: 'TEST',
    patient: { ...patient, clinical: { ...defaultClinicalContext(), knownLiverDisease: true,
      childPughScore: 8, crcl: 119, nmb: { ...defaultClinicalContext().nmb, reversalAt: 80 } } },
    covariates: { ...defaultCov, osa: true }, choice: { ...defaultChoice }, cohort: 'development',
    startedAt: start, endedAt: at(120), revision: 1, noticeVersion: 'test', priorDrugs: '' };
}
function entry(id: string, t: number, kind: Entry['kind'], data: unknown): Entry {
  return { id, sessionId: 'synthetic-export', kind, t, observedAt: at(t), receivedAt: at(t), author: 'test', data };
}
function dose(id: string, drug: 'rocuronium' | 'dexmedetomidine' | 'propofol' | 'remifentanil', value: number): Entry {
  return entry(id, 0, 'drug', { event: makeDose(drug, 'push', value, 70, 0, id), entered: { mode: 'push', value } });
}
function table(sheets: SheetData[], name: string) {
  const sheet = sheets.find(s => s.name === name)!;
  return { sheet, column: (name: string) => {
    const index = sheet.rows[0].indexOf(name); assert.ok(index >= 0, `Missing column ${name}`); return index;
  }, row: (time: number) => sheet.rows.find((row, i) => i > 0 && row[0] === time)! };
}

test('export gates reconstructed rocuronium at the earliest active reversal and preserves original snapshot records', () => {
  const session = makeSession();
  const snapTrace = { t: 50, cp: { ...zeroExposure(), rocuronium: 123 },
    ce: { ...zeroExposure(), rocuronium: 45 }, effect: zeroExposure() };
  const observation = { ...entry('observation', 50, 'clinical', { name: 'Skin incision' }),
    snapshot: { release: 'original-release', cp: snapTrace.cp, ce: snapTrace.ce, effects: combined(snapTrace) } };
  const entries = [dose('roc', 'rocuronium', 6.097), dose('dex', 'dexmedetomidine', 10),
    dose('prop', 'propofol', 50), dose('remi', 'remifentanil', 20),
    entry('voided-reversal', 10, 'clinical', { name: 'Neuromuscular reversal' }),
    entry('correction', 15, 'void', { target: 'voided-reversal' }),
    entry('reversal', 37, 'clinical', { name: 'Neuromuscular reversal' }), observation];
  const before = structuredClone({ session, entries });
  const sheets = researchSheets(session, entries), concentrations = table(sheets, 'Concentration series');
  const cpColumn = concentrations.sheet.rows[0].findIndex(c => String(c).startsWith('rocuronium Cp-ET'));
  const ceColumn = concentrations.sheet.rows[0].findIndex(c => String(c).startsWith('rocuronium Ce '));
  assert.ok(Number(concentrations.row(30)[cpColumn]) > 0);
  assert.ok(Number(concentrations.row(30)[ceColumn]) > 0);
  assert.ok(concentrations.row(37), 'The exact reversal second must be sampled');
  for (const row of concentrations.sheet.rows.slice(1).filter(r => Number(r[0]) >= 37)) {
    assert.equal(row[cpColumn], null); assert.equal(row[ceColumn], null);
  }
  const extension = table(sheets, 'Clinical extensions');
  assert.ok(Number(extension.row(30)[extension.column('TOFR raw ratio')]) > 0);
  assert.equal(extension.row(37)[extension.column('TOFR raw ratio')], null);
  assert.equal(extension.row(37)[extension.column('TOFR baseline-normalized ratio')], null);
  assert.equal(extension.row(37)[extension.column('Rocuronium status')], 'Unavailable after reversal');
  assert.equal(extension.row(37)[extension.column('Effective reversal seconds')], 37);
  const saved = sheets.find(s => s.name === 'Event concentrations')!.rows.find(r => r[0] === 'observation' && r[2] === 'Rocuronium')!;
  assert.equal(saved[3], 123); assert.equal(saved[4], 45); assert.equal(saved[6], 'original-release');
  const audit = sheets.find(s => s.name === 'Audit')!.rows.find(r => r[0] === 'observation')!;
  assert.equal(audit[8], JSON.stringify(observation.snapshot));
  assert.deepEqual({ session, entries }, before);
  const cases = sheets.find(s => s.name === 'Case')!;
  assert.match(String(cases.rows.find(r => r[0] === 'Historical rocuronium snapshots')![1]), /no-reversal trajectory.*not retroactively edited/);
  assert.equal(sheets.length, 20);
  assert.ok(xlsx(sheets).byteLength > 0);
});

test('clinical extension rows retain respiratory pair exclusions, dex hepatic units, versions and profile flags', () => {
  const session = makeSession();
  const entries = [dose('roc', 'rocuronium', 6.097), dose('dex', 'dexmedetomidine', 10), dose('prop', 'propofol', 50), dose('remi', 'remifentanil', 20)];
  const sheets = researchSheets(session, entries), extension = table(sheets, 'Clinical extensions'), row = extension.row(30);
  const events = entries.map(e => e.data.event), trace = simulate(session.patient, events, 2, session.choice).find(t => t.t === 30)!;
  const expected = respiratoryEstimate(trace, session.choice, patient.age, {
    ...session.patient.clinical, osa: true, bmi: patient.weight / (patient.height / 100) ** 2,
  });
  assert.equal(row[extension.column('Respiratory pair probability 0-1')], expected.probability);
  assert.equal(row[extension.column('Respiratory status')], expected.status);
  assert.match(String(row[extension.column('Respiratory excluded drugs')]), /rocuronium/);
  assert.match(String(row[extension.column('Respiratory excluded drugs')]), /dexmedetomidine/);
  const expectedDex = simulateOrganComparisons(session.patient, events, 2, session.patient.clinical!, session.choice).overlays[0].points.find(p => p.t === 30)!.cp;
  assert.equal(row[extension.column('Dex hepatic Cp ng/mL')], expectedDex);
  assert.match(String(row[extension.column('Dex hepatic status')]), /Child–Pugh B/);
  assert.equal(row[extension.column('Clinical version')], CLINICAL_EXTENSION_VERSION);
  assert.equal(row[extension.column('Respiratory version')], RESPIRATORY_VERSION);
  assert.equal(row[extension.column('Known liver disease')], true);
  assert.equal(row[extension.column('Child–Pugh score')], 8);
  assert.equal(row[extension.column('CrCl mL/min')], 119);
  assert.match(String(row[extension.column('Origin')]), /not an original event snapshot/);
  // Configured reversal alone is also honored, including its exact boundary.
  assert.equal(extension.row(80)[extension.column('Rocuronium Cp µmol/L')], null);
});

test('absent clinical features stay blank and another blocker suppresses combined TOFR without erasing own-drug PK', () => {
  const session = makeSession(); session.patient = { ...patient };
  const clean = table(researchSheets(session, []), 'Clinical extensions');
  assert.equal(clean.row(0)[clean.column('TOFR raw ratio')], null);
  assert.equal(clean.row(0)[clean.column('Dex hepatic Cp ng/mL')], null);
  assert.equal(clean.row(0)[clean.column('Known liver disease')], false);
  assert.equal(clean.row(0)[clean.column('Child–Pugh score')], null);
  assert.equal(clean.row(0)[clean.column('Dex hepatic status')], 'Hepatic comparison not selected');
  session.patient.clinical = { ...defaultClinicalContext(), nmb: { ...defaultClinicalContext().nmb, otherBlocker: true } };
  const blocked = table(researchSheets(session, [dose('roc', 'rocuronium', 6.097)]), 'Clinical extensions');
  assert.equal(blocked.row(30)[blocked.column('TOFR raw ratio')], null);
  assert.ok(Number(blocked.row(30)[blocked.column('Rocuronium Cp µmol/L')]) > 0);
  assert.equal(blocked.row(30)[blocked.column('Rocuronium status')], 'Unavailable with another neuromuscular blocker');
});
