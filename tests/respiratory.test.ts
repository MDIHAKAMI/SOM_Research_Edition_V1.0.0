// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultChoice, zeroExposure, type Trace, type Agent } from '../study/pharmacology';
import { respiratoryPairProbability, respiratoryEstimate, respiratoryDrugContext } from '../study/respiratory';

const blank = (): Trace => ({ t: 0, cp: zeroExposure(), ce: zeroExposure(), effect: zeroExposure() });
const pair = (prop = 1, remi = 1): Trace => {
  const s = blank();
  s.cp.propofol = s.ce.propofol = prop;
  s.cp.remifentanil = s.ce.remifentanil = remi;
  return s;
};
const near = (actual: number | null, expected: number) =>
  assert.ok(actual !== null && Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);

test('respiratory Greco surface reproduces independently calculated numeric fixtures and units', () => {
  // Source constants; expected values calculated independently from z²/(1+z²).
  for (const [prop, remi, expected] of [
    [0, 0, 0], [4.3, 0, 0.5], [0, 6.7, 0.5],
    [2.15, 3.35, 0.9214492611321126],
    [1, 1, 0.3404751077487825], [2, 2, 0.8166381360404207],
  ]) near(respiratoryPairProbability(prop, remi), expected);
  // Swapping drug concentrations is not a unit-preserving operation.
  assert.notEqual(respiratoryPairProbability(4.3, 0), respiratoryPairProbability(0, 4.3));
});

test('respiratory algebra rejects malformed exposures and remains finite at extreme finite values', () => {
  for (const x of [-1, NaN, Infinity, -Infinity]) {
    assert.equal(respiratoryPairProbability(x, 1), null);
    assert.equal(respiratoryPairProbability(1, x), null);
  }
  assert.equal(respiratoryPairProbability(Number.MAX_VALUE, Number.MAX_VALUE), 1);
  const tiny = respiratoryPairProbability(Number.MIN_VALUE, Number.MIN_VALUE)!;
  assert.ok(Number.isFinite(tiny) && tiny >= 0 && tiny <= 1);
});

test('respiratory curve is monotonic on each nonnegative concentration axis', () => {
  for (const fixed of [0, 0.1, 1, 3]) {
    let previousProp = -1, previousRemi = -1;
    for (const x of [0, 0.01, 0.1, 0.5, 1, 2, 4, 8]) {
      const pp = respiratoryPairProbability(x, fixed)!;
      const pr = respiratoryPairProbability(fixed, x)!;
      assert.ok(pp >= previousProp && pr >= previousRemi);
      previousProp = pp; previousRemi = pr;
    }
  }
});

test('timeline estimate preserves explicit fixed-ke0 adaptation and blocks mismatched Marsh exposure', () => {
  const s = pair();
  const result = respiratoryEstimate(s, defaultChoice, 40);
  near(result.probability, 0.3404751077487825);
  assert.equal(result.adapted, true);
  assert.equal(result.status, 'adapted');
  assert.match(result.note, /not isolated apnea/);
  assert.match(result.note, /Rapid bolus/);
  assert.equal(respiratoryEstimate(s, { ...defaultChoice, propofol: 'marsh' }, 40).probability, null);
  s.ce.propofol = null;
  assert.equal(respiratoryEstimate(s, defaultChoice, 40).probability, null);
  s.ce.propofol = 1; s.cp.remifentanil = NaN;
  assert.equal(respiratoryEstimate(s, defaultChoice, 40).probability, null);
});

test('additional drugs are reported without adding invented respiratory probabilities', () => {
  const s = pair();
  s.cp.fentanyl = 2; s.ce.fentanyl = null;
  s.cp.sevoflurane = 1.5; s.ce.sevoflurane = null;
  const result = respiratoryEstimate(s, defaultChoice, 40);
  near(result.probability, 0.3404751077487825);
  assert.deepEqual(result.excluded.sort(), ['fentanyl', 'sevoflurane']);
  assert.equal(result.status, 'partial-adapted');
  assert.match(result.note, /not the probability for the full drug combination/);
  const noPair = blank(); noPair.cp.fentanyl = 1;
  assert.equal(respiratoryEstimate(noPair, defaultChoice, 40).probability, null);
  const baseline = respiratoryEstimate(blank(), defaultChoice, 40);
  assert.equal(baseline.probability, 0);
  assert.match(baseline.note, /not zero clinical respiratory risk/);
});

test('rocuronium is explicitly separate from central depression, including future-agent traces', () => {
  const s = pair();
  // Works before and after rocuronium is added to the central agent registry.
  s.cp['rocuronium' as Agent] = 1;
  s.ce['rocuronium' as Agent] = 1;
  const result = respiratoryEstimate(s, defaultChoice, 40);
  near(result.probability, 0.3404751077487825);
  assert.ok(result.excluded.includes('rocuronium' as Agent));
  assert.match(result.note, /paralysis is a separate cause/);
  assert.match(respiratoryDrugContext('rocuronium'), /without producing unconsciousness/);
});

test('organ, OSA, BMI, age and concentration extrapolations remain visible without fabricated adjustment', () => {
  const s = pair();
  const result = respiratoryEstimate(s, defaultChoice, 20, {
    knownKidneyDisease: true, knownLiverDisease: true, osa: true, bmi: 35,
  });
  near(result.probability, 0.3404751077487825);
  assert.equal(result.status, 'adapted-extrapolation');
  for (const word of ['kidney', 'liver', 'OSA', 'BMI', 'PK development overlap'])
    assert.ok(result.note.includes(word));
  assert.match(respiratoryEstimate(pair(5, 7), defaultChoice, 40).note, /outside the studied target ranges/);
  for (const age of [NaN, 10, 91])
    assert.equal(respiratoryEstimate(s, defaultChoice, age).probability, null);
});

test('context cards preserve concentration matrix and avoid treating excluded agents as neutral', () => {
  assert.match(respiratoryDrugContext('remifentanil'), /whole blood, not Ce/);
  assert.match(respiratoryDrugContext('morphine'), /omits M6G/);
  assert.match(respiratoryDrugContext('dexmedetomidine'), /not assumed to be zero/);
  assert.match(respiratoryDrugContext('sevoflurane'), /washout is not modeled/);
});
