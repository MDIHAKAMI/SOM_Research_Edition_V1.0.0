// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { stateEstimates } from '../study/state-estimates';
import { alignedNow, serverOffset } from '../study/case-clock';
import { caseStartAt, occurrenceAt, parseRiyadhInput, riyadhInput, validateCaseStart } from '../study/case-time';
import { researchSheets, xlsx } from '../study/workbook';
import {
  simulate,
  zeroExposure,
  defaultChoice,
  DRUG_IDS,
  drugs,
  ageMAC,
} from '../study/pharmacology';
import {
  LIVE_VERSION,
  elapsed,
  makeDose,
  type LiveSession,
  type Entry,
} from '../study/live';
import { defaultCov } from '../study/model';
const patient = { age: 65, weight: 70, height: 175, sex: 'male' as const };

test('Riyadh backdating crosses midnight independently of device time zone and rejects invalid times', () => {
  const now = Date.parse('2026-09-12T21:05:00.500Z');
  const start = caseStartAt(now, 15);
  assert.equal(start, '2026-09-12T20:50:00.000Z');
  assert.equal(riyadhInput(start), '2026-09-12T23:50:00');
  assert.deepEqual(occurrenceAt('2026-09-12T23:55:30', start, now), { t: 330, observedAt: '2026-09-12T20:55:30.000Z' });
  assert.equal(parseRiyadhInput('2026-09-13T00:01'), '2026-09-12T21:01:00.000Z');
  for (const value of ['', '2026-02-30T12:00', '2026-09-12T24:00', '2026-09-12T12:60']) assert.throws(() => parseRiyadhInput(value));
  for (const minutes of ['', -1, 1440, 'abc']) assert.throws(() => caseStartAt(now, minutes));
  assert.throws(() => occurrenceAt('2026-09-12T23:49:59', start, now), /before the case/);
  assert.throws(() => occurrenceAt('2026-09-13T00:05:01', start, now), /future/);
  assert.throws(() => validateCaseStart('2026-09-11T20:50:00Z', now), /24 hours/);
});

test('all ten exposure features contribute without replacing missing measurements or manufacturing probabilities', () => {
  const cp = zeroExposure(),
    ce = zeroExposure();
  for (const d of DRUG_IDS)
    cp[d] = ce[d] = ['sevoflurane', 'desflurane'].includes(d)
      ? ageMAC(d, 65)
      : drugs[d].scale;
  ce.ketamine = ce.morphine = ce.sevoflurane = ce.desflurane = NaN;
  const s = stateEstimates({ t: 0, cp, ce, effect: cp }, defaultChoice, 65);
  assert.equal(s.index, 10);
  assert.ok(s.contributions.every((c) => c.value === 1));
  assert.equal('anesthesiaProbability' in s, false);
  const missing = stateEstimates(
    { t: 0, cp, ce: { ...ce, remifentanil: NaN }, effect: cp },
    defaultChoice,
    65,
  );
  assert.equal(missing.index, null);
  assert.equal(missing.publishedSevoRemi, null);
  assert.equal(missing.publishedPropRemi, null);
  assert.equal(
    stateEstimates(
      { t: 0, cp: zeroExposure(), ce: zeroExposure(), effect: zeroExposure() },
      defaultChoice,
      65,
    ).index,
    0,
  );
});
test('adding another hypnotic never switches the identity of either published curve', () => {
  const cp = { ...zeroExposure(), sevoflurane: 1.8 },
    ce = zeroExposure();
  const a = stateEstimates({ t: 0, cp, ce, effect: cp }, defaultChoice, 40),
    b = stateEstimates(
      { t: 1, cp, ce: { ...ce, propofol: 0.01 }, effect: cp },
      defaultChoice,
      40,
    );
  assert.equal(a.publishedSevoRemi, b.publishedSevoRemi);
  assert.ok(a.publishedSevoRemi! > 0.97);
  assert.equal(a.publishedPropRemi, null);
  assert.ok(b.publishedPropRemi! < 0.001);
  assert.equal(
    stateEstimates(
      { t: 1, cp, ce: { ...ce, propofol: 3 }, effect: cp },
      { ...defaultChoice, propofol: 'marsh' },
      40,
    ).publishedPropRemi,
    null,
  );
});
test('wall-clock reconstruction advances across screen sleep and KSA midnight; ended elapsed time is frozen', () => {
  const wall = Date.parse('2026-09-07T20:50:00Z'),
    server = '2026-09-07T20:45:00Z',
    offset = serverOffset(server, wall, wall);
  assert.equal(
    alignedNow(wall + 30 * 60 * 1000, offset),
    Date.parse('2026-09-07T21:15:00Z'),
  );
  assert.equal(
    elapsed(server, alignedNow(wall + 30 * 60 * 1000, offset)),
    1800,
  );
  const end = '2026-09-07T21:15:00Z';
  assert.equal(elapsed(server, Date.parse(end)), 1800);
  const doses = [
    makeDose('propofol', 'infusion', 50, 70, 0, 'inf'),
    makeDose('propofol', 'loading', 60, 70, 0, 'load', 2),
  ];
  const resumed = simulate(patient, doses, 30).at(-1)!,
    whole = simulate(patient, doses, 60).find((t) => t.t === 1800)!;
  assert.deepEqual(resumed, whole);
  assert.ok(resumed.ce.propofol! > 0);
});
test('completed-case Excel export preserves small numbers, KSA dates, units and immutable event snapshots', () => {
  const session: LiveSession = {
    id: 'test-case',
    studyId: 'test-study',
    participant: 'SYNTHETIC-001',
    site: 'TEST',
    patient,
    covariates: defaultCov,
    choice: defaultChoice,
    cohort: 'development',
    startedAt: '2026-09-07T22:30:00Z',
    endedAt: '2026-09-07T22:31:00Z',
    revision: 2,
    noticeVersion: LIVE_VERSION,
    priorDrugs: '',
  };
  const entry: Entry = {
    id: 'd1',
    sessionId: session.id,
    kind: 'drug',
    t: 0,
    observedAt: session.startedAt,
    receivedAt: session.startedAt,
    author: 'test',
    data: {
      event: makeDose('sufentanil', 'push', 0.02, 70, 0, 'd1'),
      entered: { mode: 'push', drug: 'sufentanil', value: 0.02 },
    },
  };
  const event: Entry = {
    ...entry,
    id: 'e1',
    kind: 'clinical',
    t: 30,
    data: { name: 'Loss of response', notes: '=SUM(1,2)' },
    snapshot: {
      release: 'original-snapshot',
      cp: { ...zeroExposure(), sufentanil: 0.004 },
      ce: { ...zeroExposure(), ketamine: NaN, morphine: NaN },
      effects: {
        lor: 0.9999,
        kind: 'Published response surface',
        laryngoscopy: null,
        incision: null,
        covered: [],
        excluded: [],
        laryngoscopyExcluded: [],
        incisionExcluded: [],
        lorSource: '',
      },
    },
  };
  const sheets = researchSheets(session, [entry, event]);
  assert.equal(sheets.length, 20);
  assert.match(
    String(sheets[0].rows.find((r) => r[0] === 'Started KSA')?.[1]),
    /8 Sept 2026.*01:30:00/,
  );
  assert.equal(
    sheets
      .find((s) => s.name === 'Models')!
      .rows.find((r) => r[0] === 'Sevoflurane')![3],
    ageMAC('sevoflurane', 65),
  );
  assert.equal(sheets.find((s) => s.name === 'Events')!.rows[1][14], 0.9999);
  assert.throws(() => researchSheets({ ...session, endedAt: null }, [entry]));
  assert.throws(() =>
    researchSheets(session, [{ ...entry, sessionId: 'other' }]),
  );
  mkdirSync('work/export-check', { recursive: true });
  writeFileSync('work/export-check/synthetic-case.xlsx', xlsx(sheets));
  assert.equal(
    sheets
      .find((s) => s.name === 'Event concentrations')!
      .rows.find((r) => r[2] === 'Sufentanil')![3],
    0.004,
  );
});
