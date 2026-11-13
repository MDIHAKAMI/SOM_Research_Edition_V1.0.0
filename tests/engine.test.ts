// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  Engine,
  SimulationClock,
  createCase,
  clone,
  clockLabel,
  validateCase,
  validateEntry,
  type Entry,
  type CaseData,
} from '../simulation/engine';
import { demoCase } from '../simulation/demo';
import {
  DRUGS,
  parameters,
  modelWarnings,
  type Drug,
} from '../pharmacology/pk/models';
import { transition, step } from '../pharmacology/pk/linear';
import { macAge, sevoStep } from '../pharmacology/pd/sevo';
import {
  sevoFentanyl,
  boundedNormalizedAddition,
} from '../pharmacology/interactions/pairwise';
import {
  exportData,
  timeSeriesCSV,
  eventsCSV,
  historyCSV,
  csvTable,
} from '../research-export/export';
const patient = { age: 29, sex: 'male' as const, weight: 100, height: 190 };
let serial = 0;
const entry = (e: Omit<Entry, 'id' | 'label'>): Entry => ({
  id: String(++serial),
  label: 'Test input',
  ...e,
});
const make = (entries: Entry[] = [], elapsed = 0) => {
  const c = createCase(patient);
  c.entries = entries;
  c.elapsed = elapsed;
  return new Engine(c);
};
const near = (a: number, b: number, tol = 1e-8) =>
  assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), a + ' != ' + b);
test('all zero states; unknown ET and PD remain missing', () => {
  const e = make([], 3600);
  DRUGS.forEach((d) => {
    assert.equal(e.current.drugs[d].cp, 0);
    assert.equal(e.current.drugs[d].ce, d === 'dexmedetomidine' ? null : 0);
  });
  assert.equal(e.current.et, null);
  assert.equal(e.current.movement, null);
  assert.equal(e.samples.length, 3601);
});
for (const d of DRUGS) {
  test(d + ': bolus is central dose/volume with delayed Ce', () => {
    const e = make([entry({ kind: 'bolus', drug: d, t: 0, value: 100 })]);
    near(e.current.drugs[d].cp, 100 / parameters(d, patient).v1);
    e.advanceTo(60);
    assert.ok(e.current.drugs[d].cp < e.samples[0].drugs[d].cp);
    if (d !== 'dexmedetomidine') assert.ok(e.current.drugs[d].ce! > 0);
  });
  test(
    d + ': repeated bolus superposition preserves previous compartments',
    () => {
      const first = entry({ kind: 'bolus', drug: d, t: 0, value: 100 }),
        second = entry({ kind: 'bolus', drug: d, t: 600, value: 50 });
      const both = make([first, second], 1200),
        one = make([first], 1200),
        two = make([second], 1200);
      both.state[d].forEach((v, i) =>
        near(v, one.state[d][i] + two.state[d][i]),
      );
      assert.equal(both.current.drugs[d].total, 150);
    },
  );
  test(
    d + ': continuous/rate-changing/stopped infusion mass and residual state',
    () => {
      const e = make(
        [
          entry({ kind: 'infusion', drug: d, t: 0, value: 2 }),
          entry({ kind: 'infusion', drug: d, t: 600, value: 4 }),
          entry({ kind: 'infusion', drug: d, t: 1200, value: 0 }),
        ],
        1800,
      );
      near(e.current.drugs[d].total, 60);
      assert.equal(e.current.drugs[d].rate, 0);
      assert.ok(e.current.drugs[d].cp > 0);
      assert.ok(e.current.drugs[d].cp < e.samples[1200].drugs[d].cp);
    },
  );
  test(
    d + ': timed loading delivers exact total alongside continuous infusion',
    () => {
      const e = make(
        [
          entry({ kind: 'loading', drug: d, t: 0, value: 10, duration: 600 }),
          entry({ kind: 'infusion', drug: d, t: 0, value: 1 }),
        ],
        1200,
      );
      near(e.current.drugs[d].total, 30);
      near(e.current.drugs[d].rate, 1);
    },
  );
}
const ref = JSON.parse(readFileSync('tests/reference.json', 'utf8'));
for (const f of ref.fixtures) {
  test(
    f.drug +
      ': independent SciPy reference ' +
      f.seconds +
      (f.piecewise ? ' piecewise' : ''),
    () => {
      const d = f.drug as Drug;
      let e: Engine;
      if (f.piecewise)
        e = make(
          [
            entry({ t: 0, kind: 'bolus', drug: d, value: 100 }),
            entry({ t: 0, kind: 'infusion', drug: d, value: 2 }),
            entry({ t: 600, kind: 'bolus', drug: d, value: 50 }),
            entry({ t: 600, kind: 'infusion', drug: d, value: 4 }),
            entry({ t: 1800, kind: 'infusion', drug: d, value: 0 }),
          ],
          3600,
        );
      else
        e = make(
          [
            entry({ t: 0, kind: 'bolus', drug: d, value: f.dose }),
            entry({ t: 0, kind: 'infusion', drug: d, value: f.rate }),
          ],
          f.seconds,
        );
      e.state[d].forEach((v, i) => near(v, f.state[i], 1e-9));
    },
  );
}
test('reference coefficient values and population flags', () => {
  const p = parameters('dexmedetomidine', { ...patient, weight: 70 });
  near(p.v1, 1.78);
  near(p.q2, 2.98);
  assert.ok(modelWarnings(patient).some((s) => s.includes('Fentanyl')));
  const p53 = parameters('propofol', { ...patient, age: 53 });
  near(p53.v2, 18.9);
  near(p53.q2, 1.29);
});
test('long infusion converges to input/clearance in each distribution compartment', () => {
  for (const d of DRUGS) {
    const p = parameters(d, patient),
      m = transition(p, 60);
    let s = [0, 0, 0, 0];
    for (let i = 0; i < 10000; i++) s = step(m, s, 1);
    near(s[0] / p.v1, 1 / p.cl, 1e-5);
    near(s[1] / p.v2, 1 / p.cl, 1e-5);
    near(s[2] / p.v3, 1 / p.cl, 1e-5);
  }
});
test('all speeds give identical state at minute 60 including fractional clock ticks', () => {
  const c = demoCase();
  c.elapsed = 0;
  const expected = new Engine(c);
  expected.advanceTo(3600);
  for (const speed of [1, 5, 10, 30, 60]) {
    const e = new Engine(c),
      clock = new SimulationClock();
    let simulated = 0;
    while (simulated < 3600) {
      const n = clock.consume(125, speed);
      simulated = Math.min(3600, simulated + n);
      e.advanceTo(simulated);
    }
    assert.deepEqual(e.current, expected.current);
  }
});
test('midnight rollover and seconds', () => {
  assert.equal(clockLabel('23:59:59', 2), 'D+1 00:00:01');
  assert.equal(clockLabel('09:00:00', 1122), '09:18:42');
});
test('snapshot includes all same-second inputs; backdated replay updates event snapshot', () => {
  const ev = entry({ kind: 'event', t: 60 }),
    dose = entry({ kind: 'bolus', t: 60, drug: 'propofol', value: 200 });
  const e = make([ev, dose], 60);
  near(e.events[0].sample.drugs.propofol.cp, 200 / 4.27);
  assert.deepEqual(e.events[0].patient, patient);
  assert.ok(e.events[0].modelVersions);
  const before = make([ev], 60);
  assert.equal(before.events[0].sample.drugs.propofol.cp, 0);
});
test('sevo age adjustment, held readings and exact first-order lag', () => {
  near(macAge(40), 1.8);
  near(macAge(80) / macAge(40), 10 ** (-0.00269 * 40));
  near(sevoStep(0, 2, 60), 2 * (1 - Math.exp(-0.48)));
  const c = createCase(patient, '09:00:00', true);
  c.entries = [
    entry({ kind: 'sevo', t: 0, value: 2 }),
    entry({ kind: 'sevo', t: 600, value: 0 }),
  ];
  c.elapsed = 601;
  const e = new Engine(c);
  assert.equal(e.samples[599].et, 2);
  assert.equal(e.samples[600].et, 0);
  assert.ok(e.current.sevoCe! > 0);
  assert.ok(e.current.sevoCe! < e.samples[600].sevoCe!);
});
test('Volatile OFF marker never invents an ET measurement', () => {
  const e = make(
    [
      entry({ kind: 'sevo', t: 0, value: 2 }),
      { id: 'off', kind: 'event', t: 30, label: 'Volatile OFF' },
    ],
    60,
  );
  assert.equal(e.current.et, 2);
});
test('published response surface C50 and opioid half-requirement anchors', () => {
  near(sevoFentanyl(1.73, 0).toleranceIncision, 0.5);
  near(sevoFentanyl(1.73 / 2, 2.07).toleranceIncision, 0.5);
  near(sevoFentanyl(4.6, 0.0).toleranceHemodynamic, 0.5);
  near(sevoFentanyl(2.3, 0.43).toleranceHemodynamic, 0.5);
});
test('response surface: bounded, monotone and diminishing incremental MAC reduction', () => {
  for (let a = 0; a <= 4; a += 0.1)
    for (let f = 0; f <= 10; f += 0.2) {
      const p = sevoFentanyl(a, f);
      Object.values(p).forEach((v) =>
        assert.ok(Number.isFinite(v) && v >= 0 && v <= 1),
      );
      assert.ok(
        sevoFentanyl(a + 0.01, f).toleranceIncision >= p.toleranceIncision,
      );
    }
  const req = (f: number) => 1.73 / (1 + (f / 2.07) ** 0.931);
  assert.ok(req(0) - req(3) > req(3) - req(6));
  assert.equal(sevoFentanyl(0, 5).toleranceIncision, 0);
});
for (const combo of [
  [],
  ['sevo'],
  ['fentanyl'],
  ['propofol'],
  ['dexmedetomidine'],
  ['sevo', 'fentanyl'],
  ['sevo', 'dexmedetomidine'],
  ['sevo', 'fentanyl', 'dexmedetomidine'],
  ['propofol', 'fentanyl'],
])
  test('evidence gate: ' + (combo.join(' + ') || 'no drugs'), () => {
    const entries = combo.map((d) =>
      d === 'sevo'
        ? entry({ kind: 'sevo', t: 0, value: 1.73 })
        : entry({ kind: 'bolus', t: 0, drug: d as Drug, value: 10 }),
    );
    const e = make(entries, 1800);
    const expected =
      combo.includes('sevo') &&
      !combo.includes('propofol') &&
      !combo.includes('dexmedetomidine');
    assert.equal(e.current.movement !== null, expected);
    assert.equal(e.current.responsiveness, null);
  });
test('transients and unmodeled adjuncts prevent misleading combined probabilities', () => {
  assert.equal(
    make([entry({ kind: 'sevo', t: 0, value: 2 })], 1199).current.movement,
    null,
  );
  assert.equal(
    make(
      [
        entry({ kind: 'sevo', t: 0, value: 2 }),
        { id: 'mid', kind: 'record', t: 0, label: 'Midazolam' },
      ],
      1800,
    ).current.movement,
    null,
  );
});
test('heuristic infrastructure bounded and refuses incompatible endpoints', () => {
  assert.equal(boundedNormalizedAddition([]), null);
  assert.equal(
    boundedNormalizedAddition([
      { endpoint: 'test', fraction: 0.7, source: 'fixture' },
      { endpoint: 'test', fraction: 0.6, source: 'fixture' },
    ])!.value,
    1,
  );
  assert.throws(() =>
    boundedNormalizedAddition([
      { endpoint: 'incision', fraction: 0.3, source: 'test' },
      { endpoint: 'MAC-BAR', fraction: 0.4, source: 'test' },
    ]),
  );
});
test('extreme source-supported body sizes stay finite and nonnegative', () => {
  for (const p of [
    { age: 25, sex: 'female' as const, weight: 44, height: 155 },
    { age: 81, sex: 'male' as const, weight: 123, height: 196 },
    { age: 20, sex: 'female' as const, weight: 51, height: 155 },
    { age: 70, sex: 'male' as const, weight: 110, height: 196 },
  ]) {
    const c = createCase(p);
    c.entries = DRUGS.map((d) =>
      entry({ kind: 'bolus', t: 0, drug: d, value: 100 }),
    );
    c.elapsed = 10800;
    const e = new Engine(c);
    for (const s of e.samples)
      for (const d of DRUGS) {
        assert.ok(Number.isFinite(s.drugs[d].cp) && s.drugs[d].cp >= 0);
        if (s.drugs[d].ce !== null)
          assert.ok(Number.isFinite(s.drugs[d].ce) && s.drugs[d].ce! >= 0);
      }
  }
});
test('invalid numeric inputs and model-version mismatch fail explicitly', () => {
  for (const v of [-1, NaN, Infinity])
    assert.throws(() =>
      validateEntry(entry({ kind: 'bolus', drug: 'propofol', t: 0, value: v })),
    );
  assert.throws(() =>
    validateEntry(
      entry({
        kind: 'loading',
        drug: 'dexmedetomidine',
        t: 0,
        value: 10,
        duration: 0,
      }),
    ),
  );
  assert.throws(() => createCase({ ...patient, weight: NaN }));
  const c = createCase(patient);
  c.versions = {};
  assert.throws(() => validateCase(c));
});
test('export has units, exact events, all histories and blank missing values', () => {
  const c = demoCase();
  c.entries.push({ id: 'ext', kind: 'event', t: 2999, label: 'Extubated' });
  const e = new Engine(c),
    out = exportData(e, 60);
  assert.equal(out.clinicalEvents.at(-1)!.entry.t, 2999);
  assert.equal(out.timeSeries.at(-1)!.elapsed_s, 3000);
  assert.equal(out.case.entries.length, c.entries.length);
  assert.equal(out.timeSeries[0].dex_ce_ng_ml, null);
  assert.ok(timeSeriesCSV(e).includes('propofol_cp_ug_ml'));
  assert.ok(eventsCSV(e).includes('Extubated'));
  assert.ok(historyCSV(e).includes('synthetic demo assumption'));
  assert.ok(csvTable([{ label: '=1+1' }]).includes("'=1+1"));
  const restored = new Engine(JSON.parse(JSON.stringify(out.case)));
  assert.deepEqual(restored.current, e.current);
});
test('counterfactual references never enter exported clinical snapshots', () => {
  const e = make(
    [
      entry({ kind: 'sevo', t: 0, value: 2 }),
      entry({ kind: 'event', t: 1800 }),
    ],
    1800,
  );
  assert.ok(e.events[0].sample.pairReference);
  const out = exportData(e);
  assert.equal('pairReference' in out.clinicalEvents[0].sample, false);
  assert.equal(JSON.stringify(out).includes('pairReference'), false);
});
test('malformed import metadata fails and model key order is irrelevant', () => {
  const c = createCase(patient);
  for (const malformed of [
    null,
    { ...c, id: 123 },
    { ...c, ended: 'false' },
    { ...c, phase: 'unknown' },
    { ...c, entries: [{ id: 'x', kind: 'event', t: 0, label: {} }] },
  ])
    assert.throws(() => validateCase(malformed as CaseData));
  c.versions = Object.fromEntries(Object.entries(c.versions).reverse());
  assert.doesNotThrow(() => validateCase(c));
});
test('generate complete example exports from actual engine', () => {
  const e = new Engine(demoCase());
  mkdirSync('work/legacy-engine-test-exports', { recursive: true });
  writeFileSync(
    'work/legacy-engine-test-exports/demo-case.json',
    JSON.stringify(exportData(e), null, 2),
  );
  writeFileSync('work/legacy-engine-test-exports/demo-timeseries.csv', timeSeriesCSV(e));
  writeFileSync('work/legacy-engine-test-exports/demo-input-history.csv', historyCSV(e));
});
