// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  rocuroniumParameters,
  rocuroniumMgToUmol,
  rocuroniumTOFR,
  rocuroniumApplicabilityWarnings,
} from '../study/rocuronium';
import type { RocuroniumContext } from '../study/clinical-context';
import type { PKParameters } from '../pharmacology/pk/models';
import { transition, transitionWithMass, step } from '../pharmacology/pk/linear';

const patient = { age: 43, weight: 70, height: 175, sex: 'male' as const };
const context: RocuroniumContext = {
  crcl: 119,
  race: 'reference',
  sevo: 'none',
  reversalAt: null,
  otherBlocker: false,
};
const near = (a: number, b: number, tolerance = 1e-10) =>
  assert.ok(
    Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(b)),
    `${a} != ${b}`,
  );

/** Closed-form two-compartment bolus and its effect-site convolution.
 * Independent of the generic engine's matrix exponential implementation.
 */
function analyticBolus(p: PKParameters, dose: number, minutes: number) {
  const k10 = p.cl / p.v1;
  const k12 = p.q2 / p.v1;
  const k21 = p.q2 / p.v2;
  const sum = k10 + k12 + k21;
  const discriminant = Math.sqrt(sum * sum - 4 * k10 * k21);
  const alpha = (sum + discriminant) / 2;
  const beta = (sum - discriminant) / 2;
  const a = (alpha - k21) / (alpha - beta);
  const b = (k21 - beta) / (alpha - beta);
  const ke0 = p.ke0!;
  const lag = (lambda: number) =>
    (ke0 / (ke0 - lambda)) *
    (Math.exp(-lambda * minutes) - Math.exp(-ke0 * minutes));
  return [
    dose * (a * Math.exp(-alpha * minutes) + b * Math.exp(-beta * minutes)),
    ((dose * k12) / (alpha - beta)) *
      (Math.exp(-beta * minutes) - Math.exp(-alpha * minutes)),
    0,
    (dose / p.v1) * (a * lag(alpha) + b * lag(beta)),
  ];
}

test('Kleijn reference parameters retain molar TOFR endpoint and two-compartment structure', () => {
  const p = rocuroniumParameters(patient, context);
  assert.deepEqual(p.pk, {
    v1: 4.73, v2: 6.76, v3: 1, cl: 0.269, q2: 0.279, q3: 0,
    ke0: 0.134, model: 'kleijn-2011-rocuronium-alone',
  });
  near(p.ec50, 1.62);
  near(p.gamma, 7.52);
  near(p.baseline, 1.04);
  const c = rocuroniumParameters(
    { ...patient, age: 40, weight: 75 }, { ...context, crcl: 100 },
  );
  near(c.pk.cl, 0.2890477612513453);
  near(c.pk.v1, 5.207438446869144);
  near(c.pk.v2, 7.110878265276205);
  near(c.pk.q2, 0.2938167975246874);
  near(c.pk.ke0!, 0.13170855726554687);
});

test('clinical bromide mass conversion is not the active-cation mass conversion', () => {
  near(rocuroniumMgToUmol(609.7), 1000);
  near(rocuroniumMgToUmol(42), 68.88633754305395);
  near(rocuroniumMgToUmol(42) / 4.73, 14.563707725804218);
  assert.equal(rocuroniumMgToUmol(0), 0);
  for (const bad of [-1, -Number.EPSILON, NaN, Infinity, Number.MAX_VALUE])
    assert.throws(() => rocuroniumMgToUmol(bad));
});

test('fixed sevo context changes only original PD terms and race changes only Q2', () => {
  const p = rocuroniumParameters(patient, context);
  const s = rocuroniumParameters(patient, { ...context, sevo: 'sevo' });
  near(s.pk.ke0!, 0.058022);
  near(s.ec50, 0.9801);
  assert.deepEqual({ ...s.pk, ke0: p.pk.ke0 }, p.pk);
  const a = rocuroniumParameters(patient, { ...context, race: 'asian' });
  near(a.pk.q2, 0.219852);
  assert.deepEqual({ ...a.pk, q2: p.pk.q2 }, p.pk);
  assert.ok(s.notes.some((n) => n.includes('Fixed sevoflurane')));
});

test('explicit renal covariate changes V1; missing renal data uses marked source imputation', () => {
  const p = rocuroniumParameters(patient, context);
  const renal = rocuroniumParameters(patient, { ...context, crcl: 10 });
  assert.ok(renal.pk.v1 > p.pk.v1);
  assert.equal(renal.pk.cl, p.pk.cl);
  assert.ok(renal.notes.some((n) => n.includes('Severe renal impairment')));
  const imputed = rocuroniumParameters(patient, { ...context, crcl: null });
  const explicit = rocuroniumParameters(patient, {
    ...context, crcl: 183 - 1.34 * patient.age,
  });
  assert.deepEqual(imputed.pk, explicit.pk);
  assert.ok(imputed.notes.some((n) => n.includes('CrCl imputed')));
  assert.ok(!explicit.notes.some((n) => n.includes('CrCl imputed')));
  assert.ok(rocuroniumParameters(patient, { ...context, crcl: 0 }).pk.v1 > 0);
});

test('PK and spontaneous TOFR development ranges are distinguished without silent clamping', () => {
  const older = rocuroniumParameters({ ...patient, age: 75 }, context);
  assert.ok(older.pk.cl > 0);
  assert.ok(older.notes.some((n) => n.includes('TOFR development ranges')));
  assert.ok(!older.notes.some((n) => n.includes('Outside the original PK')));
  const heavier = rocuroniumApplicabilityWarnings({ ...patient, weight: 150 }, context);
  assert.ok(heavier.some((n) => n.includes('Outside the original PK')));
  assert.ok(heavier.some((n) => n.includes('TOFR development ranges')));
});

test('invalid imported inputs cannot select a silent default or generate invalid PK', () => {
  for (const bad of [NaN, Infinity, -1])
    assert.throws(() => rocuroniumParameters(patient, { ...context, crcl: bad }));
  assert.throws(() => rocuroniumParameters({ ...patient, weight: 0 }, context));
  assert.throws(() => rocuroniumParameters({ ...patient, age: 200 }, context));
  assert.throws(() => rocuroniumParameters(patient, {
    ...context, race: 'unknown' as RocuroniumContext['race'],
  }));
  assert.throws(() => rocuroniumParameters(patient, {
    ...context, sevo: 'desflurane' as RocuroniumContext['sevo'],
  }));
});

test('TOFR magnitude retains source baseline and explicitly normalized response', () => {
  const p = rocuroniumParameters(patient, context);
  const zero = rocuroniumTOFR(0, p, context, 0);
  assert.equal(zero.raw, 1.04);
  assert.equal(zero.normalized, 1);
  const midpoint = rocuroniumTOFR(p.ec50, p, context, 60);
  near(midpoint.raw!, 0.52);
  near(midpoint.normalized!, 0.5);
  near(rocuroniumTOFR(2 * p.ec50, p, context, 60).raw!, 0.005635443025537016);
  near(rocuroniumTOFR(1.9606221716664944, p, context, 60).raw!, 0.2);
  assert.equal('probability' in midpoint, false);
  const extreme = rocuroniumTOFR(Number.MAX_VALUE, p, context, 60);
  assert.equal(extreme.raw, 0);
  assert.equal(extreme.normalized, 0);
});

test('invalid Ce is unavailable rather than treated as zero or fed into a fractional power', () => {
  const p = rocuroniumParameters(patient, context);
  for (const ce of [-1, -Number.EPSILON, NaN, Infinity]) {
    const output = rocuroniumTOFR(ce, p, context, 0);
    assert.equal(output.available, false);
    assert.equal(output.raw, null);
    assert.equal(output.normalized, null);
  }
  assert.equal(rocuroniumTOFR(1, p, context, -1).available, false);
  assert.equal(rocuroniumTOFR(1, { ...p, ec50: 0 }, context, 0).available, false);
});

test('reversal gating uses exact event seconds and another blocker prevents combined output', () => {
  const reversed = { ...context, reversalAt: 153.25 };
  const p = rocuroniumParameters(patient, reversed);
  assert.equal(rocuroniumTOFR(0, p, reversed, 153.249).available, true);
  for (const t of [153.25, 154, 3600]) {
    const output = rocuroniumTOFR(0, p, reversed, t);
    assert.equal(output.available, false);
    assert.equal(output.raw, null);
  }
  const other = { ...context, otherBlocker: true };
  assert.equal(rocuroniumTOFR(0, p, other, 0).available, false);
});

test('generic propagation matches independent analytic two-compartment and Ce solution', () => {
  const p = rocuroniumParameters(patient, context).pk;
  const dose = rocuroniumMgToUmol(42);
  for (const minutes of [0.25, 1, 5, 30, 120]) {
    const expected = analyticBolus(p, dose, minutes);
    const actual = step(transition(p, minutes * 60), [dose, 0, 0, 0], 0);
    actual.forEach((v, i) => near(v, expected[i]));
    assert.equal(actual[2], 0);
  }
});

test('infusion equilibrium and eliminated amount preserve massless effect compartment', () => {
  const p = rocuroniumParameters(patient, context).pk;
  const rate = rocuroniumMgToUmol(0.5); // bromide mg/min -> µmol/min
  const cp = rate / p.cl;
  const steady = [cp * p.v1, cp * p.v2, 0, cp];
  step(transition(p, 3600), steady, rate).forEach((v, i) => near(v, steady[i]));
  const fromZero = step(transition(p, 24 * 3600), [0, 0, 0, 0], rate);
  near(fromZero[0] / p.v1, cp, 1e-8);
  near(fromZero[1] / p.v2, cp, 1e-8);
  near(fromZero[3], cp, 1e-8);
  const dose = rocuroniumMgToUmol(42);
  const mass = step(transitionWithMass(p, 7200), [dose, 0, 0, 0, 0], rate);
  near(mass[0] + mass[1] + mass[2] + mass[4], dose + 120 * rate);
});

test('fractional-second repeat bolus replay agrees with analytic superposition', () => {
  const p = rocuroniumParameters(patient, context).pk;
  const first = rocuroniumMgToUmol(42);
  const second = rocuroniumMgToUmol(7);
  const eventSeconds = 153.25;
  const endSeconds = 1800;
  let state = step(transition(p, eventSeconds), [first, 0, 0, 0], 0);
  const ceBefore = state[3];
  state[0] += second;
  assert.equal(state[3], ceBefore);
  state = step(transition(p, endSeconds - eventSeconds), state, 0);
  const a = analyticBolus(p, first, endSeconds / 60);
  const b = analyticBolus(p, second, (endSeconds - eventSeconds) / 60);
  state.forEach((v, i) => near(v, a[i] + b[i]));
});
