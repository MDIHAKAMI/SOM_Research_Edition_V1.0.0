// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { multimodal, contextAt, sparseCurve, referenceSparing } from '../study/multimodal';
import { ANCHORS, RHOS, DEFAULT_PD_CONTEXT, validatePDContext } from '../study/pd-registry';
import { HN_COEFFICIENTS, HN_SOURCES } from '../study/hn-coefficients';
import { publishedPairs } from '../study/pair-registry';
import { simulate, zeroExposure, defaultChoice, ageMAC, type Trace } from '../study/pharmacology';
import { makeDose, validateClinical, clinicalEvents, type Entry, type LiveSession } from '../study/live';
import { eventSnapshot } from '../study/event-snapshot';
import { researchSheets, xlsx } from '../study/workbook';
import { defaultCov } from '../study/model';
const patient = { age: 40, weight: 70, height: 175, sex: 'male' as const };
const near = (a: number | null, b: number, tol = 1e-10) =>
  assert.ok(a !== null && Math.abs(a - b) < tol, `${a} != ${b}`);
const blank = (): Trace => ({
  t: 0, cp: zeroExposure(), ce: zeroExposure(), effect: zeroExposure(),
  endpointCe: { dexmedetomidineMoaas: 0, ketamineHypnosis: 0, sufentanilHypnosis: 0, morphineThermal: 0, hydromorphoneThermal: 0 },
});
const ctx = { ...DEFAULT_PD_CONTEXT, n2oPercent: 0 };
const term = (s: Trace, drug: string, domain: string) => multimodal(s, defaultChoice, 40, ctx).contributions.find(c => c.drug === drug && c.domain === domain)!;

test('H/N 3.0 registry has all 13 drugs, no rho transforms, and traceable sources', () => {
  assert.equal(Object.keys(HN_COEFFICIENTS).length, 13);
  assert.equal(ANCHORS.length, 26);
  assert.deepEqual(RHOS, []);
  for (const a of ANCHORS) {
    assert.ok(a.enabled); assert.equal(a.version, 'som-hn-3.0.0');
    assert.deepEqual(a.requirements, []);
    for (const id of a.sourceIds) assert.ok(HN_SOURCES[id]?.url);
  }
  const v = multimodal(blank(), defaultChoice, 40);
  assert.equal(v.contributions.length, 26);
  assert.equal(v.H.value, 0); assert.equal(v.N.value, 0);
  assert.equal(v.H.complete, true); assert.equal(v.N.complete, true);
  assert.equal('probability' in v, false);
});
test('missing and invalid required exposures never become complete zero scores', () => {
  for (const bad of [NaN, Infinity, -1]) {
    const s = blank(); s.cp.propofol = bad;
    const v = multimodal(s, defaultChoice, 40);
    assert.equal(v.H.value, null); assert.equal(v.N.value, null);
    assert.equal(v.H.complete, false); assert.ok(v.H.excluded.includes('propofol'));
  }
  for (const bad of [NaN, Infinity, -1]) {
    const s = blank(); s.ce.remifentanil = bad;
    assert.equal(multimodal(s, defaultChoice, 40).H.value, null);
    assert.equal(multimodal(s, defaultChoice, 40).N.value, null);
  }
  const s = blank(); s.cp.ketamine = 100; delete s.endpointCe;
  assert.equal(term(s, 'ketamine', 'H').value, null);
  assert.ok(term(s, 'ketamine', 'N').value! > 0);
  const v = multimodal(s, defaultChoice, 40);
  assert.equal(v.H.value, null);
  const missing = blank(); delete (missing.cp as Partial<typeof missing.cp>).hydromorphone; delete missing.endpointCe;
  assert.equal(multimodal(missing, defaultChoice, 40).N.value, null);
  assert.throws(() => validatePDContext({ ...ctx, n2oPercent: NaN }));
});
test('hypnotic reference and sparing points reproduce the prespecified arithmetic', () => {
  const s = blank(); s.cp.propofol = 1.85; s.ce.propofol = 999;
  near(term(s, 'propofol', 'H').value, 1);
  s.cp.sevoflurane = .9; near(term(s, 'sevoflurane', 'H').value, 1);
  s.cp.fentanyl = 1; near(term(s, 'fentanyl', 'H').value, .095);
  s.cp.fentanyl = 3; near(term(s, 'fentanyl', 'H').value, .205);
  s.cp.remifentanil = 99; s.ce.remifentanil = 2; near(term(s, 'remifentanil', 'H').value, .272);
  s.ce.remifentanil = 4; near(term(s, 'remifentanil', 'H').value, .38974);
  s.cp.alfentanil = 500; near(term(s, 'alfentanil', 'H').value, (3.62-1.55)/3.62);
  s.cp.sufentanil = 99; s.endpointCe!.sufentanilHypnosis = .3;
  near(term(s, 'sufentanil', 'H').value, (2.5-1.7)/2.5);
  assert.deepEqual(term(s, 'sufentanil', 'H').sourceIds, ['devalence2018']);
  s.cp.dexmedetomidine = .8; s.ce.dexmedetomidine = 999;
  near(term(s, 'dexmedetomidine', 'H').value, .38721055925357);
  s.cp.midazolam = 99; s.ce.midazolam = 21;
  near(term(s, 'midazolam', 'H').value, (1.59-.7)/1.59);
  s.ce.midazolam = 52; near(term(s, 'midazolam', 'H').value, (1.59-.32)/1.59);
});
test('named effect compartments are used without generic Ce or Cp substitution', () => {
  const s = blank(); s.cp.ketamine = 999; s.ce.ketamine = null; s.endpointCe!.ketamineHypnosis = 1640;
  near(term(s, 'ketamine', 'H').value, 1);
  s.cp.morphine = 999; s.ce.morphine = null; s.endpointCe!.morphineThermal = 46.9;
  const morph = term(s, 'morphine', 'N').value;
  const h = blank(); h.cp.hydromorphone = 999; h.ce.hydromorphone = null; h.endpointCe!.hydromorphoneThermal = 4.4;
  near(term(h, 'hydromorphone', 'N').value, morph!);
  assert.equal(term(h, 'hydromorphone', 'H').status, 'omitted');
  assert.match(term(h, 'hydromorphone', 'H').reason, /not a biological zero/);
  h.endpointCe!.hydromorphoneThermal = NaN;
  assert.equal(multimodal(h, defaultChoice, 40).N.value, null);
});
test('opioid N is pooled before its curve and invariant to equivalent splitting', () => {
  near(referenceSparing(3), .59); near(referenceSparing(10), .76);
  const s = blank(); s.cp.fentanyl = 3;
  near(multimodal(s, defaultChoice, 40).N.value, 1);
  s.cp.fentanyl = 1.5; s.ce.remifentanil = 1.5/(1.67/1.37);
  const mixed = multimodal(s, defaultChoice, 40);
  near(mixed.N.value, 1); near(mixed.opioidPool, 3);
  near(mixed.contributions.find(c=>c.drug==='fentanyl'&&c.domain==='N')!.value,.5);
  near(mixed.contributions.find(c=>c.drug==='remifentanil'&&c.domain==='N')!.value,.5);
  s.ce.remifentanil = null; s.cp.remifentanil = 2;
  const missing = multimodal(s, defaultChoice, 40);
  assert.equal(missing.opioidPool, null); assert.equal(missing.N.value, null);
  assert.equal(missing.contributions.find(c=>c.drug==='fentanyl'&&c.domain==='N')!.value, null);
});
test('all positive eligible terms remain without their source reference drug or background', () => {
  const k = blank(); k.cp.ketamine = 30;
  const n = term(k, 'ketamine', 'N').value!; near(n, .3283742993906302);
  k.cp.fentanyl = 1; near(term(k, 'ketamine', 'N').value, n);
  k.cp.fentanyl = 0; k.ce.remifentanil = 1; near(term(k, 'ketamine', 'N').value, n);
  const d = blank(); d.cp.dexmedetomidine = .7;
  const v = multimodal(d, defaultChoice, 40);
  assert.ok(v.H.value! > 0); assert.ok(v.N.value! > 0);
  for (const context of [ctx, { ...ctx, nProfile: 'airway' as const, spinalBupivacaine: true, n2oPercent: 70 }, { ...ctx, bis: 40 }]) {
    const w = multimodal(d, defaultChoice, 40, context);
    near(w.H.value, v.H.value!); near(w.N.value, v.N.value!);
  }
  const f = blank(); f.cp.fentanyl = 3;
  near(multimodal(f, defaultChoice, 40).N.value, 1);
});
test('N calibration contrast and MAC normalization retain declared score units', () => {
  const lo = blank(); lo.cp.propofol = 2; lo.ce.remifentanil = 4.4;
  const hi = blank(); hi.cp.propofol = 7.3; hi.ce.remifentanil = 1.2;
  near(multimodal(lo, defaultChoice, 40).N.value, multimodal(hi, defaultChoice, 40).N.value!);
  const s = blank(); s.cp.sevoflurane = ageMAC('sevoflurane', 40);
  near(multimodal(s, defaultChoice, 40).N.value, 1/.59);
  s.cp.sevoflurane *= .41; s.cp.fentanyl = 3;
  near(multimodal(s, defaultChoice, 40).N.value, 1/.59);
});
test('sparse continuation is continuous and all three extrapolation policies are explicit', () => {
  for (const d of Object.values(HN_COEFFICIENTS)) for (const spec of [d.H,d.N]) {
    if (!spec.knots.length) continue;
    const [xm,ym] = spec.knots.at(-1)!, [x0,y0] = spec.knots.at(-2)!;
    for (const policy of ['exponential','hold','linear'] as const) {
      near(sparseCurve(0,spec.knots,policy),0); near(sparseCurve(xm,spec.knots,policy),ym);
    }
    const eps=1e-5*Math.max(1,xm), slope=(ym-y0)/(xm-x0);
    near((sparseCurve(xm+eps,spec.knots)!-ym)/eps,slope,2e-5);
    const held=sparseCurve(xm*3,spec.knots,'hold')!, curved=sparseCurve(xm*3,spec.knots)!, linear=sparseCurve(xm*3,spec.knots,'linear')!;
    assert.ok(held<=curved&&curved<=linear); assert.ok(curved<1);
  }
  const s=blank();s.cp.sufentanil=1;s.endpointCe!.sufentanilHypnosis=.6;
  const a=multimodal(s,defaultChoice,40,ctx,{tailPolicy:'hold'}), b=multimodal(s,defaultChoice,40,ctx,{tailPolicy:'linear'});
  near(a.H.value,.32);near(b.H.value,.64);assert.ok(a.flags.some(x=>x.includes('hold continuation')));
});
test('deliberate omissions and structural zeros remain visible and separate', () => {
  const s=blank();s.cp.rocuronium=1;s.cp.midazolam=10;s.ce.midazolam=10;s.cp.morphine=10;s.endpointCe!.morphineThermal=10;
  const v=multimodal(s,defaultChoice,40);
  assert.equal(term(s,'rocuronium','H').status,'structural-zero');assert.equal(term(s,'rocuronium','N').value,0);
  assert.ok(v.H.omitted.includes('morphine'));assert.ok(v.N.omitted.includes('midazolam'));
  assert.ok(v.H.complete&&v.N.complete);
});
test('dynamic concentrations feed H/N reproducibly across trace durations', () => {
  const history=[makeDose('midazolam','push',2,70,0,'m'),makeDose('hydromorphone','push',1,70,0,'h'),makeDose('ketamine','push',35,70,0,'k')];
  const short=simulate(patient,history,20).at(-1)!, long=simulate(patient,history,40).find(t=>t.t===1200)!;
  assert.deepEqual(short,long);
  const v=multimodal(short,defaultChoice,40);
  assert.ok(v.H.value!>0&&v.N.value!>0);assert.ok(v.H.complete&&v.N.complete);
});
test('published coefficients retain C50 and bounds; no Cp-Ce or ET-MAC mixups', () => {
  const s = blank();
  s.ce.propofol = 2.2;
  near(
    publishedPairs(s, defaultChoice, 40, ctx).find(
      (p) => p.modelId === 'prop-remi-h',
    )!.probability,
    0.5,
  );
  s.cp.sevoflurane = 1.73;
  s.cp.fentanyl = 0;
  s.ce.fentanyl = 999;
  near(
    publishedPairs(s, defaultChoice, 40, ctx).find(
      (p) => p.modelId === 'sevo-fent-movement',
    )!.probability,
    0.5,
  );
  s.cp.fentanyl = 2.07;
  s.cp.sevoflurane = 1.73 / 2;
  near(
    publishedPairs(s, defaultChoice, 40, ctx).find(
      (p) => p.modelId === 'sevo-fent-movement',
    )!.probability,
    0.5,
  );
  assert.equal(
    publishedPairs(s, defaultChoice, 40).find(
      (p) => p.modelId === 'sevo-fent-movement',
    )!.probability,
    null,
  );
  const ref = publishedPairs(s, defaultChoice, 40, ctx).find(
    (p) => p.modelId === 'prop-remi-h',
  )!;
  s.cp.ketamine = 500;
  const more = publishedPairs(s, defaultChoice, 40, ctx).find(
    (p) => p.modelId === 'prop-remi-h',
  )!;
  assert.equal(ref.probability, more.probability);
  assert.ok(more.excluded.includes('ketamine'));
  for (const p of publishedPairs(s, defaultChoice, 40, ctx))
    assert.ok(
      p.probability === null || (p.probability >= 0 && p.probability <= 1),
    );
});
test('expanded events enforce assessability and retain all required named markers', () => {
  const base = {
    name: 'Intubation',
    response: 'tolerated',
    nmb: 'active',
    ventilation: 'controlled',
    rr: null,
    spo2: null,
    etco2: null,
    pain: null,
    oaas: null,
    windowSeconds: null,
    notes: '',
  };
  assert.throws(() => validateClinical(base));
  assert.throws(() =>
    validateClinical({
      ...base,
      response: 'unassessable',
      oaas: 0,
      responsivenessScale: 'oaas-1-5',
    }),
  );
  assert.equal(
    validateClinical({
      ...base,
      response: 'unassessable',
      oaas: 0,
      responsivenessScale: 'moaas-0-5',
    }).responsivenessScale,
    'moaas-0-5',
  );
  assert.equal(
    validateClinical({ ...base, response: 'unassessable' }).name,
    'Intubation',
  );
  for (const name of [
    'Volatile OFF',
    'Loss of eyelash reflex',
    'Eye opening',
    'Obeys command',
    'Additional analgesic',
    'Hemodynamic response',
  ])
    assert.ok((clinicalEvents as readonly string[]).includes(name));
});
test('event snapshot export is frozen while reconstruction follows corrected history and context', () => {
  const session: LiveSession = {
    id: 'hn-test',
    studyId: 's',
    participant: 'SYNTHETIC',
    site: 'TEST',
    patient,
    covariates: defaultCov,
    choice: defaultChoice,
    cohort: 'development',
    startedAt: '2026-09-08T20:50:00Z',
    endedAt: '2026-09-08T21:10:00Z',
    revision: 3,
    noticeVersion: 'atlas-live-1',
    priorDrugs: '',
  };
  const e = (id: string, t: number, kind: Entry['kind'], data: any): Entry => ({
    id,
    sessionId: session.id,
    t,
    kind,
    data,
    observedAt: new Date(
      Date.parse(session.startedAt) + t * 1000,
    ).toISOString(),
    receivedAt: new Date(
      Date.parse(session.startedAt) + t * 1000,
    ).toISOString(),
    author: 'test',
  });
  const dose = e('d', 0, 'drug', {
      event: makeDose('propofol', 'push', 100, 70, 0, 'd'),
    }),
    context = e('c', 60, 'context', ctx);
  const trace = simulate(patient, [dose.data.event], 2).at(-1)!;
  const observation = e('o', 120, 'clinical', {
    name: 'Loss of verbal responsiveness',
    notes: '',
  });
  observation.snapshot = eventSnapshot(trace, defaultChoice, 40, [
    dose,
    context,
  ]);
  const frozen = JSON.stringify(observation.snapshot),
    correction = e('v', 180, 'void', {
      target: 'd',
      reason: 'Synthetic correction',
    });
  const sheets = researchSheets(session, [
    dose,
    context,
    observation,
    correction,
  ]);
  assert.equal(JSON.stringify(observation.snapshot), frozen);
  const original = sheets.find((s) => s.name === 'HN event states')!.rows[1];
  near(original[5] as number, observation.snapshot.multimodal!.H.value!);
  const rebuilt = sheets
    .find((s) => s.name === 'HN reconstructed series')!
    .rows.find((r) => r[0] === 120)!;
  assert.equal(rebuilt[2], 0);
  assert.equal(contextAt([context], 59).n2oPercent, null);
  assert.equal(contextAt([context], 60).n2oPercent, 0);
  assert.equal(
    sheets.find((s) => s.name === 'HN event contributions')!.rows.length,
    27,
  );
  mkdirSync('work/export-check', { recursive: true });
  writeFileSync('work/export-check/synthetic-hn-case.xlsx', xlsx(sheets));
  writeFileSync(
    'work/export-check/hn-registry.json',
    JSON.stringify({ anchors: ANCHORS, rhos: RHOS }, null, 2),
  );
});
