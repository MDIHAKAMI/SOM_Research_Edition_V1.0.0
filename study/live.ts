// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  DRUG_IDS,
  drugs,
  greco,
  prior,
  defaultChoice,
  simulate,
  type Agent,
  type DrugEvent,
  type PKChoice,
  type Trace,
} from './pharmacology';
import { validatePatient, type Patient } from '../pharmacology/pk/models';
import { defaultCov, validateCov, type Covariates } from './model';
export const LIVE_VERSION = 'atlas-live-1';
export const clinicalEvents = [
  'Loss of verbal responsiveness',
  'Loss of eyelash reflex',
  'Apnea',
  'Laryngoscopy',
  'Intubation',
  'LMA insertion',
  'Skin incision',
  'Major surgical stimulus',
  'Movement',
  'Hemodynamic response',
  'Additional analgesic',
  'Pain',
  'Return of spontaneous ventilation',
  'Volatile OFF',
  'First movement',
  'Eye opening',
  'Responds to name',
  'Obeys command',
  'Extubation',
  'Neuromuscular reversal',
] as const;
export const LEGACY_CLINICAL_EVENTS = [
  'Loss of response',
  'Surgical stimulus',
  'Return of responsiveness',
] as const;
export const stimulusEvents: readonly string[] = [
  'Laryngoscopy',
  'Intubation',
  'LMA insertion',
  'Skin incision',
  'Major surgical stimulus',
  'Surgical stimulus',
];
export type ClinicalName =
  | (typeof clinicalEvents)[number]
  | (typeof LEGACY_CLINICAL_EVENTS)[number];
export interface LiveSession {
  id: string;
  studyId: string;
  participant: string;
  site: string;
  patient: Patient;
  covariates: Covariates;
  choice: PKChoice;
  cohort: 'development' | 'validation';
  startedAt: string;
  endedAt: string | null;
  revision: number;
  noticeVersion: string;
  priorDrugs: string;
  /** Explicit origin for synthetic records; absent in legacy cases. */
  synthetic?: boolean;
}
export interface Entry {
  id: string;
  sessionId: string;
  kind: 'drug' | 'clinical' | 'phase' | 'end' | 'void' | 'context';
  t: number;
  observedAt: string;
  receivedAt: string;
  author: string;
  /** Server acceptance sequence; resolves same-second recorded events. */
  recordedRevision?: number;
  data: any;
  snapshot?: {
    release: string;
    versions?: { pk: string; ce: string; publishedPD: string; hn: string };
    ceUnavailableReason?: Partial<NonNullable<Trace['ceUnavailableReason']>>;
    cp: Omit<Trace['cp'], 'rocuronium'> & { rocuronium: number | null };
    ce: Trace['ce'];
    effects: ReturnType<typeof combined>;
    multimodal?: import('./multimodal').MultimodalState;
    interactions?: ReturnType<typeof import('./pair-registry').publishedPairs>;
    endpointCe?: Trace['endpointCe'];
    mac?: { sevoflurane: number; desflurane: number };
    selectedModels?: PKChoice;
    traceAtSeconds?: number;
    inputEntryIds?: string[];
    modelProvenance?: unknown;
    timelineRevision?: number;
    calculatedAt?: string;
    retrospective?: boolean;
    rocuroniumAvailability?: {
      status: string;
      reversalAt: number | null;
      unadjustedCounterfactual?: { cp: number; ce: number | null };
    };
  };
}
export type DoseMode = 'push' | 'loading' | 'infusion' | 'et';
export function makeDose(
  drug: Agent,
  mode: DoseMode,
  value: number,
  weight: number,
  t: number,
  id: string,
  minutes = 1,
): DrugEvent {
  if (
    !DRUG_IDS.includes(drug) ||
    !Number.isFinite(value) ||
    value < 0 ||
    !Number.isFinite(weight) ||
    weight <= 0
  )
    throw Error('Enter a valid dose and weight.');
  const volatile = drug === 'sevoflurane' || drug === 'desflurane';
  if (volatile !== (mode === 'et'))
    throw Error('Volatile agents require measured end-tidal concentration.');
  if (!['push', 'loading', 'infusion', 'et'].includes(mode))
    throw Error('Choose a delivery method.');
  let rate = value;
  if (mode === 'infusion')
    rate =
      (value * weight * (drug === 'dexmedetomidine' ? 1 : 60)) /
      (['propofol', 'ketamine', 'morphine', 'hydromorphone', 'midazolam', 'rocuronium'].includes(drug) ? 1000 : 1);
  const e: DrugEvent = {
    id,
    t,
    drug,
    kind: mode === 'et' ? 'et' : mode === 'infusion' ? 'infusion' : 'bolus',
    value: rate,
  };
  if (mode === 'loading') {
    if (!Number.isFinite(minutes) || minutes < 1 / 60 || minutes > 1440)
      throw Error('Enter a duration from 1 second to 24 hours.');
    e.durationSeconds = Math.round(minutes * 60);
  }
  return e;
}
export const doseUnit = (drug: Agent, mode: DoseMode) =>
  mode === 'et'
    ? '% end-tidal'
    : mode === 'infusion'
      ? drug === 'dexmedetomidine'
        ? 'mcg/kg/hr'
        : 'mcg/kg/min'
      : drugs[drug].doseUnit;
export function activeEntries(entries: Entry[]) {
  const voided = new Set(
    entries.filter((e) => e.kind === 'void').map((e) => e.data.target),
  );
  return entries.filter((e) => e.kind !== 'void' && !voided.has(e.id));
}
export function timeline(entries: Entry[]): DrugEvent[] {
  return activeEntries(entries)
    .filter((e) => e.kind === 'drug')
    .sort((a, b) => a.t - b.t || (a.recordedRevision ?? 0) - (b.recordedRevision ?? 0))
    .map((e) => e.data.event)
    .sort((a, b) => a.t - b.t);
}
export function elapsed(start: string, now: number) {
  return Math.max(0, Math.floor((now - Date.parse(start)) / 1000));
}
export function riyadh(date: string | number) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(date));
}
export function clockDuration(t: number) {
  return [Math.floor(t / 3600), Math.floor(t / 60) % 60, t % 60]
    .map((v) => v.toString().padStart(2, '0'))
    .join(':');
}
export function validateSetup(v: any) {
  if (
    !v ||
    typeof v.participant !== 'string' ||
    !/^[-A-Za-z0-9]{1,60}$/.test(v.participant) ||
    typeof v.site !== 'string' ||
    !/^[-A-Za-z0-9]{1,60}$/.test(v.site)
  )
    throw Error(
      'Use a participant code and site code, without names or record numbers.',
    );
  validatePatient(v.patient);
  validateCov(v.covariates ?? defaultCov);
  if (!['development', 'validation'].includes(v.cohort))
    throw Error('Choose a cohort.');
  const choice = v.choice ?? defaultChoice;
  if (
    !['schnider', 'marsh'].includes(choice.propofol) ||
    !['domino', 'clements250'].includes(choice.ketamine)
  )
    throw Error('Unknown PK model.');
  simulate(v.patient, [], 0, choice);
  if (typeof v.priorDrugs !== 'string' || v.priorDrugs.length > 1000)
    throw Error('Prior medication note is too long.');
  if (v.synthetic !== undefined && typeof v.synthetic !== 'boolean')
    throw Error('Data origin must be explicitly true or false.');
  return {
    participant: v.participant,
    site: v.site,
    patient: v.patient as Patient,
    covariates: v.covariates ?? defaultCov,
    choice,
    cohort: v.cohort,
    priorDrugs: v.priorDrugs,
    synthetic: v.synthetic ?? false,
  };
}
/** Endpoint-specific references. The three-agent extension is a declared structural hypothesis,
 * reducing exactly to the two published LOR surfaces on their respective axes. It is NOT eMAC. */
export function combined(s: Trace, choice: PKChoice = defaultChoice) {
  const e = { ...s.effect, fentanyl: s.cp.fentanyl };
  const active = DRUG_IDS.filter((d) => e[d] > 1e-5);
  const prop = e.propofol,
    sevo = e.sevoflurane,
    remi = e.remifentanil;
  const triple = prop > 0 && sevo > 0;
  const excluded = active.filter(
    (d) => !['propofol', 'sevoflurane', 'remifentanil'].includes(d),
  );
  let lor: number | null = null;
  if (choice.propofol === 'schnider' || prop === 0) {
    if (triple) {
      const p = prop / 2.2,
        v = sevo / 0.78,
        rp = remi / 33.1,
        rv = remi / 50.2,
        u =
          p +
          v +
          (rp * p) / (p + v) +
          (rv * v) / (p + v) +
          3.6 * p * rp +
          12.4 * v * rv;
      const n = (5 * p + 4.4 * v) / (p + v);
      lor = u > 0 ? 1 / (1 + Math.exp(-n * Math.log(u))) : 0;
    } else
      lor =
        sevo > 0
          ? greco(sevo, remi, 0.78, 50.2, 4.4, 12.4)
          : greco(prop, remi, 2.2, 33.1, 5, 3.6);
  }
  const laryngoscopy =
    (prop > 0 || remi > 0) && choice.propofol === 'schnider'
      ? 1 - prior(e, 'laryngoscopy').p!
      : null;
  const incision = sevo > 0 ? 1 - prior(e, 'movement').p! : null;
  return {
    lor,
    laryngoscopy,
    incision,
    kind: triple
      ? 'Probable · structural calculation'
      : 'Published response surface',
    covered: active.filter((d) => !excluded.includes(d)),
    excluded,
    laryngoscopyExcluded: active.filter(
      (d) => !['propofol', 'remifentanil'].includes(d),
    ),
    incisionExcluded: active.filter(
      (d) => !['sevoflurane', 'fentanyl'].includes(d),
    ),
    lorSource:
      sevo > 0
        ? 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2888734/'
        : 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3050649/',
  };
}
export function validateClinical(d: any) {
  if (!d || ![...clinicalEvents, ...LEGACY_CLINICAL_EVENTS].includes(d.name))
    throw Error('Choose a clinical event.');
  if (
    !['tolerated', 'not tolerated', 'unassessable', null].includes(d.response)
  )
    throw Error('Choose a response.');
  if (stimulusEvents.includes(d.name) && d.response === null)
    throw Error('Record tolerated, not tolerated or unassessable.');
  if (
    !['none', 'active', 'unknown'].includes(d.nmb) ||
    !['spontaneous', 'assisted', 'controlled', 'unknown'].includes(
      d.ventilation,
    )
  )
    throw Error('Record ventilation and neuromuscular blockade.');
  if (
    d.nmb !== 'none' &&
    stimulusEvents.includes(d.name) &&
    d.response !== 'unassessable'
  )
    throw Error(
      'Movement cannot be scored as tolerance with active or unknown neuromuscular blockade. Choose unassessable and add the observed signs.',
    );
  for (const [k, min, max] of [
    ['rr', 0, 100],
    ['spo2', 0, 100],
    ['etco2', 0, 120],
    ['pain', 0, 10],
    ['oaas', 0, 5],
    ['windowSeconds', 0, 3600],
  ] as const)
    if (d[k] !== null && (!Number.isFinite(d[k]) || d[k] < min || d[k] > max))
      throw Error('Check ' + k + '.');
  if (d.name === 'Pain' && d.pain === null && d.response !== 'unassessable')
    throw Error('Enter a patient-reported pain score or choose unassessable.');
  if (typeof d.notes !== 'string' || d.notes.length > 2000)
    throw Error('Note is too long.');
  const responsivenessScale = d.responsivenessScale ?? 'unrecorded';
  if (
    !['moaas-0-5', 'oaas-1-5', 'unrecorded'].includes(responsivenessScale) ||
    (responsivenessScale === 'oaas-1-5' && d.oaas !== null && d.oaas < 1)
  )
    throw Error('The responsiveness score does not match its recorded scale.');
  return {
    name: d.name,
    response: d.response,
    nmb: d.nmb,
    ventilation: d.ventilation,
    rr: d.rr,
    spo2: d.spo2,
    etco2: d.etco2,
    pain: d.pain,
    oaas: d.oaas,
    responsivenessScale,
    windowSeconds: d.windowSeconds,
    notes: d.notes,
  };
}
