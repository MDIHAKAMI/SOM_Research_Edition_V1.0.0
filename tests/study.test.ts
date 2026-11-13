// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulate,
  pk,
  IV,
  DRUG_IDS,
  greco,
  prior,
  zeroExposure,
  RELEASE,
} from '../study/pharmacology';
import {
  features,
  featureNames,
  syntheticObservations,
  fitModel,
  predict,
  metrics,
  defaultCov,
} from '../study/model';
const patient = { age: 40, sex: 'male' as const, weight: 70, height: 175 };
function close(a: number, b: number, t = 1e-8) {
  assert.ok(Math.abs(a - b) <= t * Math.max(1, Math.abs(b)), `${a} != ${b}`);
}
test('all IV agents have positive PK and correct bolus-unit conversion', () => {
  for (const d of IV) {
    const p = pk(d, patient);
    assert.ok(p.v1 > 0 && p.cl > 0);
    const s = simulate(
      patient,
      [{ id: '1', t: 0, drug: d, kind: 'bolus', value: 1 }],
      1,
    );
    // Independent unit expectation: rocuronium bromide mg -> micromol using
    // the 609.70 g/mol salt mass; ketamine/morphine mg -> micrograms.
    const factor = d === 'rocuronium' ? 1000 / 609.70 :
      ['ketamine','morphine','midazolam','hydromorphone'].includes(d) ? 1000 : 1;
    close(s[0].cp[d], factor / p.v1);
    assert.ok(s.at(-1)!.cp[d] < s[0].cp[d]);
    for (const q of s)
      for (const a of DRUG_IDS)
        assert.ok(Number.isFinite(q.effect[a]) && q.effect[a] >= 0);
  }
});
test('infusion unit-per-hour conversion and rate linearity across all IV agents', () => {
  for (const d of IV) {
    const p = pk(d, patient),
      e = { id: '1', t: 0, drug: d, kind: 'infusion' as const, value: 60 },
      s = simulate(patient, [e], 1 / 60).at(-1)!,
      a = simulate(patient, [e], 120).at(-1)!,
      b = simulate(patient, [{ ...e, value: 120 }], 120).at(-1)!;
    const factor = d === 'rocuronium' ? 1000 / 609.70 :
      ['ketamine','morphine','midazolam','hydromorphone'].includes(d) ? 1000 : 1;
    const initial = factor / (60 * p.v1);
    assert.ok(Math.abs(s.cp[d] / initial - 1) < 0.02);
    close(b.cp[d], 2 * a.cp[d]);
    assert.ok(a.cp[d] > 0 && a.cp[d] < factor / p.cl);
  }
});
test('multi-drug PK preserves independent superposition and backdated event replay', () => {
  const a = {
      id: 'a',
      t: 10,
      drug: 'remifentanil' as const,
      kind: 'bolus' as const,
      value: 50,
    },
    b = {
      id: 'b',
      t: 65,
      drug: 'remifentanil' as const,
      kind: 'bolus' as const,
      value: 30,
    };
  const both = simulate(patient, [b, a], 10).at(-1)!,
    one = simulate(patient, [a], 10).at(-1)!,
    two = simulate(patient, [b], 10).at(-1)!;
  close(both.cp.remifentanil, one.cp.remifentanil + two.cp.remifentanil);
  close(both.ce.remifentanil!, one.ce.remifentanil! + two.ce.remifentanil!);
});
test('volatile ET is held and never represented as a measured effect site', () => {
  const a = simulate(
    patient,
    [{ id: 'a', t: 30, drug: 'desflurane', kind: 'et', value: 6.6 }],
    2,
  );
  assert.equal(a[0].cp.desflurane, 0);
  assert.equal(a.at(-1)!.effect.desflurane, 6.6);
  assert.equal(a.at(-1)!.ce.desflurane, null);
});
test('published half-response anchors and response direction', () => {
  close(greco(2.2, 0, 2.2, 33.1, 5, 3.6), 0.5);
  close(greco(0, 48.9, 5.6, 48.9, 2.2, 33.2), 0.5);
  close(prior({ ...zeroExposure(), sevoflurane: 1.73 }, 'movement').p!, 0.5);
  assert.equal(prior(zeroExposure(), 'lor').p, 0);
  assert.equal(prior(zeroExposure(), 'laryngoscopy').p, 1);
  assert.equal(prior(zeroExposure(), 'extubation').p, null);
});
test('all 45 pair terms, two triple terms and distinct drug features', () => {
  const f = features(zeroExposure(), patient, defaultCov);
  assert.equal(f.length, featureNames.length);
  assert.equal(featureNames.filter((n) => n.includes(' × ')).length, 47);
  assert.ok(featureNames.includes('fentanyl: Cp'));
  assert.ok(featureNames.includes('morphine: Cp'));
});
test('fitting keeps participants together, excludes prospective validation and preserves synthetic labels', () => {
  const rows = syntheticObservations();
  const f = fitModel(rows, 'lor');
  assert.equal(f.synthetic, true);
  assert.equal(f.release, RELEASE);
  assert.equal(f.trainCases.length, 90);
  assert.equal(f.testCases.length, 30);
  assert.ok(f.trainCases.every((c) => !f.testCases.includes(c)));
  assert.ok(f.beta.every(Number.isFinite));
  assert.ok(f.metrics.auc !== null);
  const changed = rows.map((r) => ({ ...r, cohort: 'validation' as const }));
  assert.throws(() => fitModel(changed, 'lor'), /30 independent/);
  assert.throws(
    () => fitModel([...rows, { ...rows[0], synthetic: false }], 'lor'),
    /cannot be fitted together/,
  );
  assert.ok(
    predict(f, rows[0].exposure, rows[0].patient, rows[0].covariates) >= 0,
  );
});
test('metrics distinguish perfect predictions from reversed predictions', () => {
  const rows = syntheticObservations()
    .slice(0, 2)
    .map((r, i) => ({ ...r, y: i }));
  const good = metrics(rows, [0, 1]),
    bad = metrics(rows, [1, 0]);
  assert.equal(good.auc, 1);
  assert.equal(good.brier, 0);
  assert.equal(bad.auc, 0);
  assert.equal(bad.brier, 1);
});
