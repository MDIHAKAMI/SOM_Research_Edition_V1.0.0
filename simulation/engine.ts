// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  DRUGS,
  parameters,
  validatePatient,
  type Drug,
  type Patient,
  type PKParameters,
} from '../pharmacology/pk/models';
import { transition, step, type Matrix } from '../pharmacology/pk/linear';
import { macAge, sevoStep } from '../pharmacology/pd/sevo';
import {
  sevoFentanyl,
  type PairResult,
} from '../pharmacology/interactions/pairwise';
import { modelVersions } from '../pharmacology/models/registry';
export type InputKind =
  | 'bolus'
  | 'infusion'
  | 'loading'
  | 'sevo'
  | 'event'
  | 'record';
export interface Entry {
  id: string;
  t: number;
  kind: InputKind;
  drug?: Drug;
  value?: number;
  duration?: number;
  label: string;
  unit?: string;
}
export interface CaseData {
  schema: 'ass-case-1';
  id: string;
  patient: Patient;
  startClock: string;
  elapsed: number;
  entries: Entry[];
  sevoLag: boolean;
  phase: 'induction' | 'maintenance' | 'emergence';
  ended: boolean;
  demo: boolean;
  versions: Record<string, string>;
}
export interface Concentration {
  cp: number;
  ce: number | null;
  rate: number;
  total: number;
}
export interface Sample {
  t: number;
  et: number | null;
  mac: number | null;
  sevoCe: number | null;
  sevoCeMAC: number | null;
  drugs: Record<Drug, Concentration>;
  responsiveness: null;
  laryngoscopy: null;
  movement: number | null;
  hemodynamic: number | null;
  hypnoticState: null;
  antinociceptiveState: number | null;
  overallState: null;
  evidence: 'approximation' | 'not-modeled';
  reason: string;
  pairReference: PairResult | null;
}
export interface CapturedEvent {
  entry: Entry;
  sample: Sample;
  patient: Patient;
  modelVersions: Record<string, string>;
}
export const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
export const newId = () =>
  globalThis.crypto?.randomUUID?.() ?? 'case-' + Date.now().toString(36);
export function createCase(
  patient: Patient,
  startClock = '09:00:00',
  sevoLag = false,
): CaseData {
  validatePatient(patient);
  DRUGS.forEach((d) => parameters(d, patient));
  if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(startClock))
    throw Error('Use a valid HH:MM:SS start time.');
  return {
    schema: 'ass-case-1',
    id: newId(),
    patient: clone(patient),
    startClock,
    elapsed: 0,
    entries: [],
    sevoLag,
    phase: 'induction',
    ended: false,
    demo: false,
    versions: clone(modelVersions),
  };
}
export function validateEntry(e: Entry) {
  if (!Number.isInteger(e.t) || e.t < 0 || e.t > 86400)
    throw Error('Timestamp must be an integer second within 24 hours.');
  if (
    !['bolus', 'infusion', 'loading', 'sevo', 'event', 'record'].includes(
      e.kind,
    ) ||
    !e.id ||
    !e.label
  )
    throw Error('Invalid timeline entry.');
  if (
    ['bolus', 'infusion', 'loading'].includes(e.kind) &&
    (!e.drug || !DRUGS.includes(e.drug))
  )
    throw Error('Select a modeled IV drug.');
  if (
    ['bolus', 'infusion', 'loading', 'sevo'].includes(e.kind) &&
    (!Number.isFinite(e.value) || e.value! < 0 || e.value! > 1000000)
  )
    throw Error(
      'Value must be finite and nonnegative (software maximum 1,000,000).',
    );
  if (e.kind === 'sevo' && e.value! > 10)
    throw Error('ET sevo must be between 0 and 10%.');
  if (
    e.kind === 'loading' &&
    (!Number.isInteger(e.duration) ||
      e.duration! < 1 ||
      e.t + e.duration! > 86400)
  )
    throw Error(
      'Loading infusion needs a whole-second duration within the 24-hour case.',
    );
}
export function validateCase(c: CaseData) {
  if (!c || typeof c !== 'object' || c.schema !== 'ass-case-1')
    throw Error('Unsupported case format.');
  if (
    typeof c.id !== 'string' ||
    !c.id.trim() ||
    c.id.length > 200 ||
    !c.patient ||
    typeof c.startClock !== 'string' ||
    typeof c.sevoLag !== 'boolean' ||
    typeof c.ended !== 'boolean' ||
    typeof c.demo !== 'boolean' ||
    !['induction', 'maintenance', 'emergence'].includes(c.phase)
  )
    throw Error('Invalid case metadata.');
  validatePatient(c.patient);
  createCase(c.patient, c.startClock, c.sevoLag);
  if (
    !Number.isInteger(c.elapsed) ||
    c.elapsed < 0 ||
    c.elapsed > 86400 ||
    !Array.isArray(c.entries) ||
    c.entries.length > 10000
  )
    throw Error('Invalid case duration or entries.');
  if (
    !c.versions ||
    Object.keys(c.versions).length !== Object.keys(modelVersions).length ||
    Object.entries(modelVersions).some(
      ([id, version]) => c.versions[id] !== version,
    )
  )
    throw Error(
      'Model version mismatch; this case must be opened with its original model version.',
    );
  const ids = new Set<string>();
  c.entries.forEach((e) => {
    if (
      !e ||
      typeof e !== 'object' ||
      typeof e.id !== 'string' ||
      typeof e.label !== 'string' ||
      e.label.length > 500 ||
      (e.unit !== undefined && typeof e.unit !== 'string')
    )
      throw Error('Invalid timeline text.');
    validateEntry(e);
    if (ids.has(e.id)) throw Error('Duplicate entry ID');
    ids.add(e.id);
  });
}
export function clockLabel(start: string, t: number) {
  const [h, m, s] = start.split(':').map(Number);
  let n = h * 3600 + m * 60 + s + t;
  const days = Math.floor(n / 86400);
  n %= 86400;
  return (
    (days ? 'D+' + days + ' ' : '') +
    [Math.floor(n / 3600), Math.floor(n / 60) % 60, n % 60]
      .map((v) => String(v).padStart(2, '0'))
      .join(':')
  );
}
export class Engine {
  data: CaseData;
  t = 0;
  samples: Sample[] = [];
  events: CapturedEvent[] = [];
  et: number | null = null;
  sevoCe = 0;
  lastChange = 0;
  excluded = new Set<string>();
  state = {} as Record<Drug, number[]>;
  rates = {} as Record<Drug, number>;
  totals = {} as Record<Drug, number>;
  params = {} as Record<Drug, PKParameters>;
  matrices = {} as Record<Drug, Matrix>;
  schedule = new Map<number, Entry[]>();
  loads: { drug: Drug; rate: number; end: number }[] = [];
  constructor(data: CaseData) {
    validateCase(data);
    this.data = clone(data);
    for (const d of DRUGS) {
      this.state[d] = [0, 0, 0, 0];
      this.rates[d] = 0;
      this.totals[d] = 0;
      this.params[d] = parameters(d, data.patient);
      this.matrices[d] = transition(this.params[d]);
    }
    for (const e of data.entries) {
      const es = this.schedule.get(e.t) ?? [];
      es.push(e);
      this.schedule.set(e.t, es);
    }
    this.apply();
    this.advanceTo(data.elapsed);
  }
  apply() {
    const es = this.schedule.get(this.t) ?? [];
    this.loads = this.loads.filter((l) => l.end > this.t);
    for (const e of es) {
      if (e.kind === 'sevo') {
        if (this.et !== e.value) this.lastChange = this.t;
        this.et = e.value!;
      }
      if (e.kind === 'bolus') {
        this.state[e.drug!][0] += e.value!;
        this.totals[e.drug!] += e.value!;
        this.lastChange = this.t;
      }
      if (e.kind === 'infusion') {
        this.rates[e.drug!] = e.value!;
        this.lastChange = this.t;
      }
      if (e.kind === 'loading') {
        this.loads.push({
          drug: e.drug!,
          rate: (e.value! * 60) / e.duration!,
          end: this.t + e.duration!,
        });
        this.lastChange = this.t;
      }
      if (
        e.kind === 'record' ||
        (['bolus', 'infusion', 'loading'].includes(e.kind) &&
          e.drug !== 'fentanyl' &&
          e.value! > 0)
      )
        this.excluded.add(e.drug ?? e.label);
    }
    const snap = this.snapshot();
    this.samples.push(snap);
    for (const e of es.filter((e) => e.kind === 'event'))
      this.events.push({
        entry: clone(e),
        sample: clone(snap),
        patient: clone(this.data.patient),
        modelVersions: clone(modelVersions),
      });
  }
  effectiveRate(d: Drug) {
    return (
      this.rates[d] +
      this.loads.filter((l) => l.drug === d).reduce((s, l) => s + l.rate, 0)
    );
  }
  snapshot(): Sample {
    const drugs = {} as Record<Drug, Concentration>;
    for (const d of DRUGS)
      drugs[d] = {
        cp: this.state[d][0] / this.params[d].v1,
        ce: this.params[d].ke0 === null ? null : this.state[d][3],
        rate: this.effectiveRate(d),
        total: this.totals[d],
      };
    const pair =
      this.et === null ? null : sevoFentanyl(this.et, drugs.fentanyl.cp);
    let reason =
      'Pseudo-equilibrium pairwise approximation; patient ASA and individual equilibration are unverified.';
    let eligible = true;
    if (this.et === null) {
      eligible = false;
      reason = 'No measured ET sevo value entered.';
    } else if (this.excluded.size) {
      eligible = false;
      reason =
        'Additional agents are recorded. Their effect on the composite prediction is not currently modeled.';
    } else if (
      this.data.patient.age < 20 ||
      this.data.patient.age > 50 ||
      this.et > 4 ||
      drugs.fentanyl.cp > 10
    ) {
      eligible = false;
      reason = 'Outside response-surface age or concentration range.';
    } else if (this.t - this.lastChange < 1200 || this.loads.length) {
      eligible = false;
      reason =
        'Transient phase: pairwise study observed pseudo steady state after 20 minutes. No live probability inferred.';
    }
    return {
      t: this.t,
      et: this.et,
      mac: this.et === null ? null : this.et / macAge(this.data.patient.age),
      sevoCe: this.data.sevoLag && this.et !== null ? this.sevoCe : null,
      sevoCeMAC:
        this.data.sevoLag && this.et !== null
          ? this.sevoCe / macAge(this.data.patient.age)
          : null,
      drugs,
      responsiveness: null,
      laryngoscopy: null,
      movement: eligible && pair ? pair.movementIncision : null,
      hemodynamic: eligible && pair ? pair.hemodynamicResponse : null,
      hypnoticState: null,
      antinociceptiveState: eligible && pair ? pair.toleranceIncision : null,
      overallState: null,
      evidence: eligible ? 'approximation' : 'not-modeled',
      reason,
      pairReference: pair,
    };
  }
  advanceTo(target: number) {
    if (!Number.isInteger(target) || target < this.t || target > 86400)
      throw Error(
        'Cannot advance outside 0–24 h or backwards. Replay the case to rewind.',
      );
    while (this.t < target) {
      for (const d of DRUGS) {
        const rate = this.effectiveRate(d);
        this.state[d] = step(this.matrices[d], this.state[d], rate);
        this.totals[d] += rate / 60;
      }
      if (this.et !== null) this.sevoCe = sevoStep(this.sevoCe, this.et);
      if (this.loads.some((l) => l.end === this.t + 1))
        this.lastChange = this.t + 1;
      this.t++;
      this.apply();
    }
    this.data.elapsed = this.t;
    return this.current;
  }
  get current() {
    return this.samples[this.samples.length - 1];
  }
}
export class SimulationClock {
  fraction = 0;
  consume(wallMilliseconds: number, speed: number) {
    if (
      !Number.isFinite(wallMilliseconds) ||
      wallMilliseconds < 0 ||
      ![1, 5, 10, 30, 60].includes(speed)
    )
      throw Error('Invalid clock input');
    this.fraction += (wallMilliseconds / 1000) * speed;
    const n = Math.floor(this.fraction + 1e-9);
    this.fraction -= n;
    return n;
  }
}
