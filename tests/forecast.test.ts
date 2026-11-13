// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forecastDrug, FORECAST_OFFSETS, type ForecastRequest } from '../study/forecast';
import { defaultChoice, simulate, type Agent, type DrugEvent } from '../study/pharmacology';
import { defaultClinicalContext } from '../study/clinical-context';
import { simulateOrganComparisons } from '../study/organ-comparison';

const patient = { age: 40, weight: 70, height: 175, sex: 'male' as const };
const request = (changes: Partial<ForecastRequest> = {}): ForecastRequest => ({
  patient: { ...patient }, events: [], choice: { ...defaultChoice }, now: 37,
  drug: 'fentanyl', mode: 'push', value: 25, minutes: 1, ...changes,
});
const near = (a: number, b: number, tolerance = 2e-10) => assert.ok(
  Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)), `${a} versus ${b}`,
);
function freezeDeep<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeDeep(child);
    Object.freeze(value);
  }
  return value;
}

test('counterfactual forecast preserves frozen real data and ignores future scheduled administrations', () => {
  const real: DrugEvent[] = [
    { id: 'f', t: 0, drug: 'fentanyl', kind: 'infusion', value: 60 },
    { id: 'sevo', t: 0, drug: 'sevoflurane', kind: 'et', value: 1.5 },
    { id: 'future-stop', t: 38, drug: 'fentanyl', kind: 'infusion', value: 0 },
    { id: 'future-bolus', t: 40, drug: 'propofol', kind: 'bolus', value: 500 },
  ];
  const input = freezeDeep(request({ events: real, mode: 'infusion', value: 0 }));
  const serialized = JSON.stringify(input);
  const result = forecastDrug(input);
  assert.equal(JSON.stringify(input), serialized);
  assert.deepEqual(result, forecastDrug(request({ events: real.slice(0, 2), mode: 'infusion', value: 0 })));
  for (const row of result.rows) {
    assert.ok(row.baseline && row.hypothetical);
    assert.ok(row.baseline.cp.fentanyl > row.hypothetical.cp.fentanyl);
    assert.equal(row.baseline.cp.propofol, 0);
    assert.equal(row.hypothetical.cp.propofol, 0);
    assert.equal(row.baseline.cp.sevoflurane, 1.5);
    assert.equal(row.hypothetical.cp.sevoflurane, 1.5);
  }
  assert.equal(real.length, 4);
  assert.ok(real.every(e => e.id !== 'hypothetical-only'));
});

test('5/15/30/60-minute anchors are retained off the usual sample grid and fractional now is rejected', () => {
  const result = forecastDrug(request());
  assert.deepEqual(result.rows.map(r => r.minutesAhead), [...FORECAST_OFFSETS]);
  assert.deepEqual(result.rows.map(r => r.t), [337, 937, 1837, 3637]);
  for (const row of result.rows) {
    assert.equal(row.baseline?.t, row.t);
    assert.equal(row.hypothetical?.t, row.t);
    assert.equal(row.baseline?.cp.fentanyl, 0);
    assert.ok(row.hypothetical!.cp.fentanyl > 0);
  }
  for (const now of [-1, 0.25, 37.5, NaN, Infinity, 86401])
    assert.throws(() => forecastDrug(request({ now })), /Forecast time/);
});

test('hypothetical opioid infusion replaces the current rate using microgram/kg/min input', () => {
  const events: DrugEvent[] = [{ id: 'existing', t: 0, drug: 'fentanyl', kind: 'infusion', value: 60 }];
  const result = forecastDrug(request({ events, mode: 'infusion', value: 0.5 }));
  // 0.5 microgram/kg/min × 70 kg × 60 min/hour = 2100 micrograms/hour.
  const manual = simulate(patient, [...events, { id: 'manual', t: 37, drug: 'fentanyl', kind: 'infusion', value: 2100 }], 3637 / 60, defaultChoice,
    { sampleEverySeconds: 86400, sampleAtSeconds: result.rows.map(r => r.t) });
  for (const row of result.rows) near(row.hypothetical!.cp.fentanyl, manual.find(s => s.t === row.t)!.cp.fentanyl);
});

/** Independent two-compartment closed form for the reference Kleijn PK.
 * Input amount is micromol; rate is micromol/min; time is minutes.
 */
function referenceRocCp(minutes: number, doseUmol: number, rateUmolPerMinute = 0) {
  const v1 = 4.73, k10 = 0.269 / v1, k12 = 0.279 / v1, k21 = 0.279 / 6.76;
  const s = k10 + k12 + k21, d = Math.sqrt(s * s - 4 * k10 * k21);
  const alpha = (s + d) / 2, beta = (s - d) / 2;
  const a = (alpha - k21) / (alpha - beta), b = 1 - a;
  return (doseUmol * (a * Math.exp(-alpha * minutes) + b * Math.exp(-beta * minutes)) +
    rateUmolPerMinute * (a * (1 - Math.exp(-alpha * minutes)) / alpha + b * (1 - Math.exp(-beta * minutes)) / beta)) / v1;
}

test('rocuronium bromide mg bolus and microgram/kg/min infusion retain molar PK units in forecast', () => {
  const rocPatient = { ...patient, age: 43, clinical: { ...defaultClinicalContext(), crcl: 119 } };
  // 6.097 mg bromide / 609.7 g/mol gives exactly 10 micromol.
  const push = forecastDrug(request({ patient: rocPatient, drug: 'rocuronium', value: 6.097 }));
  const infusion = forecastDrug(request({ patient: rocPatient, drug: 'rocuronium', mode: 'infusion', value: 1 }));
  for (const row of push.rows) {
    near(row.hypothetical!.cp.rocuronium, referenceRocCp(row.minutesAhead, 10));
    assert.equal(row.baseline!.cp.rocuronium, 0);
    assert.equal(row.baselineTOFR, 1.04);
    assert.ok(row.hypotheticalTOFR !== null && row.hypotheticalTOFR >= 0 && row.hypotheticalTOFR <= 1.04);
  }
  // 1 microgram/kg/min × 70 kg = 0.07 mg/min; convert salt mass once.
  for (const row of infusion.rows) near(row.hypothetical!.cp.rocuronium, referenceRocCp(row.minutesAhead, 0, 0.07 * 1000 / 609.7));
  assert.equal(push.nmbPresent, true);
});

test('finite loading administration stops at its stated duration during the forecast', () => {
  const result = forecastDrug(request({ mode: 'loading', value: 25, minutes: 2.5 }));
  const manual: DrugEvent[] = [
    { id: 'begin', t: 37, drug: 'fentanyl', kind: 'infusion', value: 600 },
    { id: 'end', t: 187, drug: 'fentanyl', kind: 'infusion', value: 0 },
  ];
  const comparison = simulate(patient, manual, 3637 / 60, defaultChoice,
    { sampleEverySeconds: 86400, sampleAtSeconds: result.rows.map(r => r.t) });
  for (const row of result.rows) near(row.hypothetical!.cp.fentanyl, comparison.find(s => s.t === row.t)!.cp.fentanyl);
});

test('organ Cp comparison requires explicit hepatic context and valid severity, retaining exact anchors', () => {
  const events: DrugEvent[] = [{ id: 'dex', t: 0, drug: 'dexmedetomidine', kind: 'bolus', value: 10 }];
  const clinical = { ...defaultClinicalContext(), knownLiverDisease: true, childPughScore: 8 };
  const changed = { ...patient, clinical };
  for (const p of [patient, { ...patient, clinical: { ...clinical, knownLiverDisease: false } }, { ...patient, clinical: { ...clinical, childPughScore: null } }])
    assert.ok(forecastDrug(request({ patient: p, events, drug: 'dexmedetomidine' })).rows.every(r => r.organCp.length === 0));
  const result = forecastDrug(request({ patient: changed, events, drug: 'dexmedetomidine', value: 5 }));
  const options = { sampleEverySeconds: 86400, sampleAtSeconds: result.rows.map(r => r.t) };
  const baseline = simulateOrganComparisons(changed, events, 3637 / 60, clinical, defaultChoice, options).overlays[0];
  for (const row of result.rows) {
    assert.equal(row.organCp.length, 1);
    assert.equal(row.organCp[0].unit, 'ng/mL');
    near(row.organCp[0].baseline, baseline.points.find(p => p.t === row.t)!.cp);
    assert.ok(row.organCp[0].hypothetical > row.organCp[0].baseline);
  }
});

test('first hypothetical dex dose has zero organ baseline instead of losing the selected comparison', () => {
  const clinical = { ...defaultClinicalContext(), knownLiverDisease: true, childPughScore: 8 };
  const result = forecastDrug(request({ patient: { ...patient, clinical }, drug: 'dexmedetomidine', value: 5 }));
  for (const row of result.rows) {
    assert.equal(row.organCp.length, 1);
    assert.equal(row.organCp[0].baseline, 0);
    assert.ok(row.organCp[0].hypothetical > 0);
  }
});

test('24-hour cap yields unavailable later anchors and rejects an administration crossing the boundary', () => {
  const result = forecastDrug(request({ now: 86100 }));
  assert.equal(result.rows[0].t, 86400);
  assert.ok(result.rows[0].baseline && result.rows[0].hypothetical);
  for (const row of result.rows.slice(1)) {
    assert.equal(row.baseline, null);
    assert.equal(row.hypothetical, null);
    assert.equal(row.baselineTOFR, null);
    assert.equal(row.hypotheticalTOFR, null);
    assert.equal(row.baselineRespiratory, null);
    assert.equal(row.hypotheticalRespiratory, null);
    assert.deepEqual(row.organCp, []);
  }
  assert.throws(() => forecastDrug(request({ now: 86399, mode: 'loading', minutes: 1 })), /24-hour/);
});

test('adding a hypothetical rocuronium dose preserves all ten legacy Cp/Ce values against prior-source output', () => {
  // Generated by loading the actual pre-extension publish-upload-fix TypeScript,
  // not by the implementation under test. Old study/pharmacology.ts SHA-256:
  // 6b34830e63f30f6cb4418ee192c0945d11a08e52df7efd35499f37c0b3a5aa41.
  // These are regression fixtures, not independent clinical validation.
  const legacy = ['propofol', 'sevoflurane', 'desflurane', 'ketamine', 'dexmedetomidine', 'remifentanil', 'fentanyl', 'alfentanil', 'morphine', 'sufentanil'] as const;
  const doses = [50, 1.5, 4, 10, 10, 20, 50, 500, 2, 5];
  const events: DrugEvent[] = legacy.map((drug, i) => ({ id: `legacy-${i}`, t: 0, drug, kind: ['sevoflurane', 'desflurane'].includes(drug) ? 'et' : 'bolus', value: doses[i] }));
  const expectedCp = [
    [0.36081631549875687,1.5,4,79.26949553897221,0.14419922892720985,0.2727610572638044,0.6786115449773689,30.997058046968807,40.39191140933373,0.13739937418390613],
    [0.1957056332113639,1.5,4,30.426162462848605,0.11378050371447404,0.08913793873539787,0.415853473519338,14.05896562167305,8.662516082471194,0.03563151709615294],
    [0.11669838686295606,1.5,4,16.96982804171969,0.08266410672461771,0.020018122006460838,0.27540667530576923,9.53979748095281,7.052440921003761,0.019410693149454566],
    [0.04906888473967445,1.5,4,13.021413908042947,0.04981454694828938,0.0022661543677167683,0.1539506376133343,6.024257603114534,5.791294346953937,0.014104797503911365],
  ];
  const linked: Agent[] = ['propofol', 'dexmedetomidine', 'remifentanil'];
  const expectedCe = [
    [1.1881641083311207,0.22177518833078866,0.49594623333864807],
    [0.22244627113159485,0.15431566398337165,0.10839032840360507],
    [0.1259568152708794,0.10286896908478978,0.0238946775478395],
    [0.051904870437827294,0.05747105269100586,0.002462973907338997],
  ];
  const result = forecastDrug(request({ events, now: 0, drug: 'rocuronium', value: 6.097 }));
  result.rows.forEach((row, index) => {
    for (const trace of [row.baseline!, row.hypothetical!]) {
      legacy.forEach((drug, j) => near(trace.cp[drug], expectedCp[index][j]));
      linked.forEach((drug, j) => near(trace.ce[drug]!, expectedCe[index][j]));
      for (const drug of legacy.filter(d => !linked.includes(d))) assert.equal(trace.ce[drug], null);
    }
  });
});
