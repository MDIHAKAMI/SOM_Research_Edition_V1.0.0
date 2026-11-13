// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { step, transition } from '../pharmacology/pk/linear';
import { validatePatient, type Patient, type PKParameters } from '../pharmacology/pk/models';
import { DRUG_IDS, IV, drugs, pk, defaultChoice, type Agent, type DrugEvent, type PKChoice } from './pharmacology';
import type { OrganProfile } from './clinical-context';

/** Separate Cp-only comparisons. Never pass these points to H/N or a PD surface. */
export interface OrganOverlay {
  id: string;
  drug: Agent;
  label: string;
  basis: 'total-plasma';
  unit: 'ng/mL';
  source: string;
  evidence: 'label-based-clearance-only-scenario';
  parameters: PKParameters;
  ceAvailable: false;
  pdEligible: false;
  limitations: string[];
  points: { t: number; cp: number }[];
}

export interface OrganUnavailable {
  drug: Agent;
  organ: 'hepatic' | 'renal';
  reason: string;
  source?: string;
}

export interface OrganComparisonResult {
  overlays: OrganOverlay[];
  unavailable: OrganUnavailable[];
}

export const DEX_HEPATIC_SOURCE = 'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=eb1ba463-ab42-4f49-9ebe-3ad5af108326';
export const CHI_HEPATIC_SOURCE = 'https://doi.org/10.12659/MSM.910103';
const ZHONG_SOURCE = 'https://doi.org/10.1111/jcpt.12652';
export const DEX_TOTAL_CLEARANCE_FRACTION = Object.freeze({ A: 0.74, B: 0.64, C: 0.53 });
export type ChildPughClass = keyof typeof DEX_TOTAL_CLEARANCE_FRACTION;

/** FDA Child–Pugh class ranges. Missing or invalid scores never acquire a default. */
export function childPughClass(score: number | null): ChildPughClass | null {
  if (score === null || !Number.isInteger(score) || score < 5 || score > 15) return null;
  return score <= 6 ? 'A' : score <= 9 ? 'B' : 'C';
}

/** Label mean TOTAL clearance ratios applied to Hannivoort; other PK is assumed unchanged. */
export function dexHepaticParameters(patient: Patient, score: number | null): PKParameters | null {
  const grade = childPughClass(score);
  if (grade === null) return null;
  const base = pk('dexmedetomidine', patient);
  return {
    ...base,
    cl: base.cl * DEX_TOTAL_CLEARANCE_FRACTION[grade],
    ke0: null,
    model: `hannivoort-label-hepatic-cl-${grade}`,
  };
}

function validateTimeline(events: DrugEvent[], minutes: number, sampleEvery: number) {
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)
    throw Error('Duration outside 0–1440 minutes.');
  if (!Number.isInteger(sampleEvery) || sampleEvery < 1)
    throw Error('Invalid sample interval.');
  if (events.length > 2000) throw Error('Too many timeline entries.');
  for (const e of events) {
    if (!DRUG_IDS.includes(e.drug) || !Number.isInteger(e.t) || e.t < 0 || e.t > 86400 ||
        !Number.isFinite(e.value) || e.value < 0 || e.value > 1e6 ||
        !['bolus', 'infusion', 'et'].includes(e.kind) ||
        (e.kind === 'et') === IV.includes(e.drug) ||
        (e.kind === 'et' && e.value > drugs[e.drug].max) ||
        (e.durationSeconds !== undefined && (e.kind !== 'bolus' ||
          !Number.isInteger(e.durationSeconds) || e.durationSeconds < 1 ||
          e.durationSeconds > 86400 || e.t + e.durationSeconds > 86400)))
      throw Error('Invalid drug event.');
  }
}

/** Replay from zero with the same one-second matrix propagator and post-event sampling. */
function replayDexCp(parameters: PKParameters, events: DrugEvent[], minutes: number, sampleEvery: number, requested: Set<number>) {
  const matrix = transition(parameters), totalSeconds = Math.round(minutes * 60);
  let state = [0, 0, 0, 0], infusionPerMinute = 0, loadingPerMinute = 0;
  const starts = new Map<number, DrugEvent[]>(), ends = new Map<number, DrugEvent[]>();
  const eventTimes = new Set<number>();
  for (const e of events) {
    eventTimes.add(e.t);
    if (e.durationSeconds !== undefined) eventTimes.add(e.t + e.durationSeconds);
    if (e.drug !== 'dexmedetomidine') continue;
    starts.set(e.t, [...(starts.get(e.t) ?? []), e]);
    if (e.durationSeconds !== undefined) {
      const end = e.t + e.durationSeconds;
      ends.set(end, [...(ends.get(end) ?? []), e]);
    }
  }
  const points: OrganOverlay['points'] = [];
  for (let t = 0; t <= totalSeconds; t++) {
    for (const e of ends.get(t) ?? []) loadingPerMinute -= e.value * 60 / e.durationSeconds!;
    for (const e of starts.get(t) ?? []) {
      if (e.kind === 'bolus' && e.durationSeconds !== undefined)
        loadingPerMinute += e.value * 60 / e.durationSeconds;
      else if (e.kind === 'bolus') state[0] += e.value; // μg; μg/L is numerically ng/mL
      else infusionPerMinute = e.value / 60; // stored μg/hour to μg/minute
    }
    if (t % sampleEvery === 0 || requested.has(t) || t === totalSeconds || eventTimes.has(t))
      points.push({ t, cp: state[0] / parameters.v1 });
    if (t < totalSeconds) {
      const input = infusionPerMinute + loadingPerMinute;
      if (input < -1e-9) throw Error('Negative input rate.');
      state = step(matrix, state, Math.max(0, input));
    }
  }
  return points;
}

export function simulateOrganComparisons(
  patient: Patient,
  events: DrugEvent[],
  minutes: number,
  profile: OrganProfile,
  _choice: PKChoice = defaultChoice,
  options: { sampleEverySeconds?: number; sampleAtSeconds?: number[] } = {},
): OrganComparisonResult {
  validatePatient(patient);
  const sampleEvery = options.sampleEverySeconds ?? 10;
  const requested = new Set(options.sampleAtSeconds ?? []);
  if ([...requested].some(t => !Number.isInteger(t) || t < 0 || t > 86400)) throw Error('Invalid requested sample time.');
  validateTimeline(events, minutes, sampleEvery);
  const result: OrganComparisonResult = { overlays: [], unavailable: [] };
  const totalSeconds = Math.round(minutes * 60);
  const active = DRUG_IDS.filter(drug => events.some(e => e.drug === drug && e.value > 0 && e.t <= totalSeconds));
  const renalRequested = profile.knownKidneyDisease || profile.dialysis;
  for (const drug of active) {
    if (renalRequested) result.unavailable.push({
      drug, organ: 'renal',
      reason: drug === 'rocuronium'
        ? 'Entered CrCl is already included in this rocuronium concentration model. Severe renal impairment was not represented in its spontaneous TOFR development subset; dialysis removal is not modeled.'
        : drug === 'dexmedetomidine'
        ? 'No renal adjustment calculated. The ESRF study retained no renal-group effect; dialysis removal is not modeled.'
        : 'No verified renal comparison model is implemented for this drug. This does not imply no renal effect.',
      ...(drug === 'dexmedetomidine' ? { source: ZHONG_SOURCE } : {}),
    });
    if (!profile.knownLiverDisease) continue;
    if (drug === 'dexmedetomidine') {
      const grade = childPughClass(profile.childPughScore), parameters = dexHepaticParameters(patient, profile.childPughScore);
      if (grade === null || parameters === null) {
        result.unavailable.push({ drug, organ: 'hepatic', reason: 'Enter a known Child–Pugh score (5–15) for the hepatic clearance comparison.', source: DEX_HEPATIC_SOURCE });
        continue;
      }
      result.overlays.push({
        id: `dex-hepatic-label-${grade}`, drug,
        label: `Hepatic clearance scenario · Child–Pugh ${grade}`,
        basis: 'total-plasma', unit: 'ng/mL', source: DEX_HEPATIC_SOURCE,
        evidence: 'label-based-clearance-only-scenario', parameters,
        ceAvailable: false, pdEligible: false,
        limitations: [
          'Label mean total-clearance ratio applied to Hannivoort. Other PK parameters are assumed unchanged.',
          'Cp comparison only; no disease-specific Ce or endpoint probability is calculated.',
          ...(renalRequested ? ['Renal disease and dialysis are not incorporated; this is a hepatic-only scenario.'] : []),
        ],
        points: replayDexCp(parameters, events, minutes, sampleEvery, requested),
      });
    } else result.unavailable.push({
      drug, organ: 'hepatic',
      reason: drug === 'propofol'
        ? 'A hepatic propofol comparison is not available in this release. The usual propofol model remains displayed.'
        : 'No verified hepatic comparison model is implemented for this drug. This does not imply no hepatic effect.',
      ...(drug === 'propofol' ? { source: CHI_HEPATIC_SOURCE } : {}),
    });
  }
  return result;
}
