// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { childPughClass, dexHepaticParameters, simulateOrganComparisons } from '../study/organ-comparison';
import { pk, simulate, type DrugEvent } from '../study/pharmacology';
import type { OrganProfile } from '../study/clinical-context';

const patient = { age: 40, weight: 70, height: 175, sex: 'male' as const };
const liver: OrganProfile = { knownLiverDisease: true, childPughScore: 8, knownKidneyDisease: false, crcl: null, dialysis: false };
const bolus: DrugEvent = { id: 'b', t: 13, drug: 'dexmedetomidine', kind: 'bolus', value: 2 };
const close = (actual: number, expected: number, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) <= tolerance * Math.max(1, Math.abs(expected)), `${actual} versus ${expected}`);

test('Child–Pugh score classes and total clearance ratios preserve non-clearance PK and remove Ce', () => {
  assert.deepEqual([5, 6, 7, 9, 10, 15].map(childPughClass), ['A', 'A', 'B', 'B', 'C', 'C']);
  for (const invalid of [null, NaN, Infinity, -1, 4, 16, 6.5]) assert.equal(childPughClass(invalid), null);
  const base = pk('dexmedetomidine', patient);
  for (const [score, clearance] of [[5, 0.50764], [8, 0.43904], [12, 0.36358]]) {
    const p = dexHepaticParameters(patient, score)!;
    close(p.cl, clearance);
    for (const key of ['v1', 'v2', 'v3', 'q2', 'q3'] as const) assert.equal(p[key], base[key]);
    assert.equal(p.ke0, null);
  }
  assert.equal(dexHepaticParameters(patient, null), null);
});

test('unknown severity and unsupported renal or propofol disease models remain unavailable rather than zero', () => {
  const events: DrugEvent[] = [bolus, { id: 'p', t: 0, drug: 'propofol', kind: 'bolus', value: 10 }];
  const absent = simulateOrganComparisons(patient, events, 2, { ...liver, childPughScore: null, knownKidneyDisease: true, dialysis: true });
  assert.equal(absent.overlays.length, 0);
  assert.equal(absent.unavailable.length, 4);
  assert.ok(absent.unavailable.some(x => x.drug === 'propofol' && x.organ === 'hepatic'));
  assert.ok(absent.unavailable.some(x => x.drug === 'dexmedetomidine' && x.organ === 'renal' && x.reason.includes('no renal-group effect')));
  assert.deepEqual(simulateOrganComparisons(patient, events, 2, { ...liver, knownLiverDisease: false }), { overlays: [], unavailable: [] });
  const both = simulateOrganComparisons(patient, events, 2, { ...liver, knownKidneyDisease: true });
  assert.equal(both.overlays.length, 1);
  assert.ok(both.overlays[0].limitations.some(x => x.includes('hepatic-only')));
});

test('post-event sampling, ng/mL units and Cp-only separation remain explicit', () => {
  const result = simulateOrganComparisons(patient, [bolus], 2, liver, undefined, { sampleEverySeconds: 30 });
  const overlay = result.overlays[0];
  assert.deepEqual(overlay.points.map(x => x.t), [0, 13, 30, 60, 90, 120]);
  close(overlay.points.find(x => x.t === 13)!.cp, 2 / 1.78);
  assert.equal(overlay.points[0].cp, 0);
  assert.equal(overlay.ceAvailable, false);
  assert.equal(overlay.pdEligible, false);
  assert.equal(overlay.basis, 'total-plasma');
  assert.equal(overlay.unit, 'ng/mL');
  assert.ok(overlay.points.every(x => !('ce' in x) && !('effect' in x) && Number.isFinite(x.cp) && x.cp >= 0));
});

test('timed bolus equals equivalent finite infusion including stop time and subsequent washout', () => {
  const timed = [{ ...bolus, value: 4, durationSeconds: 47 }];
  const infusion: DrugEvent[] = [
    { ...bolus, kind: 'infusion', value: 4 * 3600 / 47 },
    { ...bolus, id: 'stop', t: 60, kind: 'infusion', value: 0 },
  ];
  const a = simulateOrganComparisons(patient, timed, 5, liver).overlays[0].points;
  const b = simulateOrganComparisons(patient, infusion, 5, liver).overlays[0].points;
  assert.deepEqual(a.map(x => x.t), b.map(x => x.t));
  a.forEach((x, i) => close(x.cp, b[i].cp));
});

test('independent RK4 amount equations agree with matrix replay through overlapping dose changes', () => {
  const events: DrugEvent[] = [
    { ...bolus, t: 0, value: 2 },
    { ...bolus, id: 'load', t: 13, value: 3, durationSeconds: 47 },
    { ...bolus, id: 'inf', t: 20, kind: 'infusion', value: 12 },
    { ...bolus, id: 'stop', t: 90, kind: 'infusion', value: 0 },
    { ...bolus, id: 'second', t: 120, value: 1 },
  ];
  const points = simulateOrganComparisons(patient, events, 3, liver, undefined, { sampleEverySeconds: 1 }).overlays[0].points;
  // Independently transcribed three-compartment amount ODE, per second.
  const v = [1.78, 30.3, 52], cl = 0.43904, q2 = 2.98, q3 = 0.602;
  const derivative = (a: number[], input: number) => [
    (input - (cl + q2 + q3) * a[0] / v[0] + q2 * a[1] / v[1] + q3 * a[2] / v[2]) / 60,
    (q2 * a[0] / v[0] - q2 * a[1] / v[1]) / 60,
    (q3 * a[0] / v[0] - q3 * a[2] / v[2]) / 60,
  ];
  let amounts = [0, 0, 0];
  for (let t = 0; t <= 180; t++) {
    if (t === 0) amounts[0] += 2;
    if (t === 120) amounts[0] += 1;
    close(points[t].cp, amounts[0] / v[0], 2e-9);
    const input = (t >= 13 && t < 60 ? 3 * 60 / 47 : 0) + (t >= 20 && t < 90 ? 12 / 60 : 0);
    for (let i = 0; i < 20 && t < 180; i++) {
      const h = 0.05, k1 = derivative(amounts, input);
      const k2 = derivative(amounts.map((a, j) => a + h * k1[j] / 2), input);
      const k3 = derivative(amounts.map((a, j) => a + h * k2[j] / 2), input);
      const k4 = derivative(amounts.map((a, j) => a + h * k3[j]), input);
      amounts = amounts.map((a, j) => a + h * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]) / 6);
    }
  }
});

test('full-history comparison does not mutate baseline outputs, patient, events or profile', () => {
  const events = [bolus], snapshot = JSON.stringify({ patient, events, liver });
  const before = simulate(patient, events, 2);
  const a = simulateOrganComparisons(patient, events, 2, liver);
  const b = simulateOrganComparisons(patient, events, 2, JSON.parse(JSON.stringify(liver)));
  assert.deepEqual(a, b);
  assert.deepEqual(simulate(patient, events, 2), before);
  assert.equal(JSON.stringify({ patient, events, liver }), snapshot);
  const severe = simulateOrganComparisons(patient, events, 2, { ...liver, childPughScore: 12 });
  close(a.overlays[0].points.find(x => x.t === 13)!.cp, severe.overlays[0].points.find(x => x.t === 13)!.cp);
});

test('invalid timelines are rejected instead of propagating nonfinite concentrations', () => {
  for (const minutes of [-1, NaN, Infinity, 1441]) assert.throws(() => simulateOrganComparisons(patient, [bolus], minutes, liver));
  for (const sampleEverySeconds of [0, 0.5, NaN]) assert.throws(() => simulateOrganComparisons(patient, [bolus], 2, liver, undefined, { sampleEverySeconds }));
  for (const e of [{ ...bolus, t: -1 }, { ...bolus, value: NaN }, { ...bolus, durationSeconds: 0 }, { ...bolus, kind: 'et' as const }])
    assert.throws(() => simulateOrganComparisons(patient, [e], 2, liver));
});
