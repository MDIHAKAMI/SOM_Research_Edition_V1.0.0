// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pk, simulate, inputFactor, DRUG_IDS, LEGACY_FIT_DRUG_IDS, defaultChoice, type DrugEvent } from '../study/pharmacology';
import { HN_EFFECT_SITES, MIDAZOLAM_EEG_KE0 } from '../study/hn-effect-sites';
import { modelProvenance } from '../study/model-provenance';

const p = { age: 67, weight: 70, height: 175, sex: 'male' as const };
const near = (actual: number, expected: number, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

test('new inventory preserves the original fitted-feature order and exact source PK parameters', () => {
  assert.equal(DRUG_IDS.length, 13);
  assert.deepEqual(LEGACY_FIT_DRUG_IDS, ['propofol', 'sevoflurane', 'desflurane', 'ketamine',
    'dexmedetomidine', 'remifentanil', 'fentanyl', 'alfentanil', 'morphine', 'sufentanil']);
  const mid = pk('midazolam', p), hydro = pk('hydromorphone', p);
  assert.deepEqual([mid.v1, mid.v2, mid.v3, mid.cl, mid.q2, mid.q3], [32.2, 53, 245, .43, .56, .39]);
  near(mid.ke0!, Math.LN2 / 4.8);
  assert.deepEqual([hydro.v1, hydro.v2, hydro.v3, hydro.cl, hydro.q2, hydro.q3], [3.35, 13.9, 145, 1.01, 1.47, 1.41]);
  assert.equal(hydro.ke0, null);
  const older = pk('hydromorphone', { ...p, age: 80, weight: 140 });
  near(older.v1, 3.35 * 2 * (1 - .028 * 13));
  near(older.cl, 1.01 * 2 * (1 - .015 * 13));
  near(older.q2, 2.94);
});

test('milligram dosing produces ng/mL Cp while effect sites start at zero', () => {
  for (const drug of ['midazolam', 'hydromorphone'] as const) {
    assert.equal(inputFactor(drug), 1000);
    const s = simulate(p, [{ id: drug, t: 0, drug, kind: 'bolus', value: 2 }], 0)[0];
    near(s.cp[drug], 2000 / pk(drug, p).v1);
    assert.equal(s.ce[drug], drug === 'midazolam' ? 0 : null);
    near(s.endpointCe!.hydromorphoneThermal!, 0);
  }
});

test('named endpoint effect sites retain parent Cp and avoid inventing a generic Ce', () => {
  const events: DrugEvent[] = HN_EFFECT_SITES.map((s, i) => ({
    id: `e${i}`, t: 0, drug: s.drug, kind: 'bolus', value: 1,
  }));
  const trace = simulate(p, events, 5, defaultChoice, { sampleEverySeconds: 1 });
  for (const site of HN_EFFECT_SITES) {
    assert.equal(trace[0].endpointCe![site.key], 0);
    assert.ok(trace.at(-1)!.endpointCe![site.key]! > 0);
    assert.ok(trace.at(-1)!.cp[site.drug] > 0);
    assert.equal(trace.at(-1)!.ce[site.drug], null);
    assert.ok(modelProvenance(site.drug, p).endpointEffectSites.some(x => x.key === site.key));
  }
  const mid = simulate(p, [{ id: 'mid', t: 0, drug: 'midazolam', kind: 'bolus', value: 1 }], 5).at(-1)!;
  assert.ok(mid.ce.midazolam! > 0);
  assert.equal(modelProvenance('midazolam', p).genericEffectSiteKe0PerMinute, MIDAZOLAM_EEG_KE0);
});

test('finite delivery boundaries and simultaneous rate changes feed named sites consistently', () => {
  for (const drug of ['ketamine', 'sufentanil', 'morphine', 'hydromorphone'] as const) {
    const site = HN_EFFECT_SITES.find(s => s.drug === drug)!;
    const finite: DrugEvent[] = [
      { id: 'load', t: 3, drug, kind: 'bolus', value: 2, durationSeconds: 7 },
      { id: 'start', t: 10, drug, kind: 'infusion', value: 4 },
      { id: 'stop', t: 25, drug, kind: 'infusion', value: 0 },
    ];
    const rate: DrugEvent[] = [
      { id: 'load-start', t: 3, drug, kind: 'infusion', value: 2 * 3600 / 7 },
      { id: 'load-stop', t: 10, drug, kind: 'infusion', value: 0 },
      { id: 'start', t: 10, drug, kind: 'infusion', value: 4 },
      { id: 'stop', t: 25, drug, kind: 'infusion', value: 0 },
    ];
    const a = simulate(p, finite, 1, defaultChoice, { sampleEverySeconds: 1, diagnostics: true });
    const b = simulate(p, rate, 1, defaultChoice, { sampleEverySeconds: 1 });
    assert.equal(a[3].cp[drug], 0);
    assert.equal(a[3].endpointCe![site.key], 0);
    for (let i = 0; i < a.length; i++) {
      near(a[i].cp[drug], b[i].cp[drug], 2e-9);
      near(a[i].endpointCe![site.key]!, b[i].endpointCe![site.key]!, 2e-9);
      const mass = a[i].diagnostics!;
      near(mass.amounts[drug].reduce((sum, v) => sum + v, 0) + mass.eliminated[drug], mass.cumulative[drug], 2e-8);
    }
  }
});

test('zero exposure stays zero and endpoint state does not carry between simulations', () => {
  simulate(p, [{ id: 'h', t: 0, drug: 'hydromorphone', kind: 'bolus', value: 4 }], 10);
  const z = simulate(p, [], 10).at(-1)!;
  for (const drug of DRUG_IDS) assert.equal(z.cp[drug], 0);
  for (const site of HN_EFFECT_SITES) assert.equal(z.endpointCe![site.key], 0);
  assert.equal(z.ce.midazolam, 0);
});
