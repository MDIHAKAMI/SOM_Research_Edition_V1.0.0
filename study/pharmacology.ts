// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  parameters,
  lbm,
  validatePatient,
  type Patient,
  type PKParameters,
} from '../pharmacology/pk/models';
import { transition, transitionWithMass, step } from '../pharmacology/pk/linear';
import { sevoFentanyl } from '../pharmacology/interactions/pairwise';
import { macAtAge, MAC40, DEX_MOAAS_KE0 } from '../pharmacology/pd/constants';
import { rocuroniumParameters, rocuroniumMgToUmol } from './rocuronium';
import { rocContext } from './clinical-context';
import { HN_EFFECT_SITES, MIDAZOLAM_EEG_KE0, type EndpointConcentrations } from './hn-effect-sites';
export const RELEASE = 'som-4.3.0';
export const PK_VERSION = 'som-pk-2.2.0';
export const CE_VERSION = 'som-ce-2.2.0';
/** Preserve the original order and width of stored exploratory model features. */
export const LEGACY_FIT_DRUG_IDS = [
  'propofol',
  'sevoflurane',
  'desflurane',
  'ketamine',
  'dexmedetomidine',
  'remifentanil',
  'fentanyl',
  'alfentanil',
  'morphine',
  'sufentanil',
] as const;
export const ANESTHETIC_IDS = [...LEGACY_FIT_DRUG_IDS, 'midazolam', 'hydromorphone'] as const;
export const DRUG_IDS = [...ANESTHETIC_IDS, 'rocuronium'] as const;
export type Agent = (typeof DRUG_IDS)[number];
export const IV = DRUG_IDS.filter(
  (d) => !['sevoflurane', 'desflurane'].includes(d),
);
export type Exposure = Record<Agent, number>;
export type EffectExposure = Record<Agent, number | null>;
export const ceReason = (d: Agent): string | null =>
  ['fentanyl', 'alfentanil', 'sufentanil'].includes(d) ? 'Fixed effect-site linkage unresolved for selected PK variant.' :
  ['ketamine', 'morphine', 'hydromorphone'].includes(d) ? 'No generic effect site; a separately named endpoint-specific composite is available for H/N.' :
  ['sevoflurane', 'desflurane'].includes(d) ? 'Measured held end-tidal exposure; no brain effect-site model.' : null;
export const zeroExposure = (): Exposure =>
  Object.fromEntries(DRUG_IDS.map((d) => [d, 0])) as Exposure;
export const ENDPOINTS = [
  'lor',
  'movement',
  'laryngoscopy',
  'ror',
  'extubation',
  'respiratory',
] as const;
export type Endpoint = (typeof ENDPOINTS)[number];
export const endpointName: Record<Endpoint, string> = {
  lor: 'Loss of responsiveness',
  movement: 'Movement to incision',
  laryngoscopy: 'Response to laryngoscopy',
  ror: 'Return of responsiveness',
  extubation: 'Extubation readiness',
  respiratory: 'Ventilatory depression',
};
export const endpointDefinition: Record<Endpoint, string> = {
  lor: 'At the assessment: OAA/S = 1. Repeated assessments during induction; use the same scale and stimulus.',
  movement:
    'Purposeful movement within 60 seconds of skin incision. Unassessable during active neuromuscular blockade.',
  laryngoscopy:
    'Purposeful movement or cough during laryngoscopy. Record stimulus time and neuromuscular blockade; do not substitute a blood-pressure change.',
  ror: 'First response to a standardized verbal command during emergence. Repeated at-risk assessments; retain the last negative and first positive time.',
  extubation:
    'Clinician-assessed readiness at the assessment time, using the prospectively specified study checklist. Actual extubation is a separate event, not the outcome definition.',
  respiratory:
    'Respiratory rate ≤4 breaths/min over a 60-second spontaneous-breathing observation. Record support, airway obstruction and observation window separately; this is not a universal apnea definition.',
};
export interface DrugInfo {
  name: string;
  unit: string;
  doseUnit: string;
  max: number;
  scale: number;
  color: string;
  model: string;
  source: string;
  description: string;
  limitations: string;
  anchor: string;
}
export const drugs: Record<Agent, DrugInfo> = {
  rocuronium: {
    name: 'Rocuronium', unit: 'µmol/L', doseUnit: 'mg bromide', max: 30, scale: 1.62,
    color: '#657943', model: 'Kleijn 2011 · rocuronium-alone component',
    source: 'https://doi.org/10.1111/j.1365-2125.2011.04000.x',
    description: 'Two-compartment plasma PK and a TOF-linked effect site. Doses are rocuronium bromide mg; concentrations use µmol/L.',
    anchor: 'Predicted TOF ratio is T4/T1. It is not a probability of paralysis or a measure of consciousness or analgesia.',
    limitations: 'Fixed anesthetic-context scenario. Reversal and other blockers are not modeled. Original control-stream mass convention remains unavailable; bromide conversion uses the labeled molecular weight.',
  },
  propofol: {
    name: 'Propofol',
    unit: 'µg/mL',
    doseUnit: 'mg',
    max: 12,
    scale: 3,
    color: '#59dcc1',
    model: 'Schnider 1998/1999; Marsh comparison',
    source: 'https://pubmed.ncbi.nlm.nih.gov/9605675/',
    description:
      'Hypnotic. Ce uses the selected model’s EEG-linked equilibration constant.',
    limitations:
      'Adult population estimate. James lean body mass behaves poorly in obesity. No interaction-dependent clearance.',
    anchor:
      'Published propofol-only Cp50 for loss of consciousness: 3.3 µg/mL; this is a population endpoint anchor, not a target recommendation.',
  },
  sevoflurane: {
    name: 'Sevoflurane',
    unit: '% ET',
    doseUnit: '% ET',
    max: 4,
    scale: MAC40.sevoflurane,
    color: '#8cc6ff',
    model: 'Mapleson age-adjusted MAC',
    source: 'https://doi.org/10.1093/bja/76.2.179',
    description:
      'Measured end-tidal input; MAC40 = 1.8%. No vaporizer-to-lung model.',
    limitations:
      'ET is held between entries; not instantaneous brain concentration. MAC describes movement, not consciousness.',
    anchor:
      '1 age-adjusted MAC is the population median immobility concentration for the reference stimulus at equilibrium.',
  },
  desflurane: {
    name: 'Desflurane',
    unit: '% ET',
    doseUnit: '% ET',
    max: 15,
    scale: MAC40.desflurane,
    color: '#a6a1ff',
    model: 'Mapleson age-adjusted MAC',
    source: 'https://doi.org/10.1093/bja/76.2.179',
    description:
      'Measured end-tidal input; MAC40 = 6.6%. Each volatile remains a separate predictor.',
    limitations:
      'No uptake/washout or brain equilibration model. Sevoflurane coefficients cannot be transferred to desflurane.',
    anchor:
      'MAC40 = 6.6% is the selected published convention; this is an exposure reference, not individualized adequacy.',
  },
  ketamine: {
    name: 'Ketamine',
    unit: 'ng/mL Cp',
    doseUnit: 'mg',
    max: 2500,
    scale: 200,
    color: '#f4c26b',
    model: 'Domino; Clements 250 comparison',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3838936/',
    description:
      'Racemic ketamine parent-drug plasma PK. A separate hypnosis effect site uses the reported 23-second slow-wave EEG equilibration half-time.',
    limitations:
      'The hypnosis effect site is an exploratory composite with the selected PK model. Low-dose external comparison does not validate the anesthetic range. Norketamine and enantiomer-specific effects are omitted.',
    anchor:
      'The external model comparison used low-dose ketamine exposures. Dissociation, analgesia and EEG changes need different PD endpoints.',
  },
  dexmedetomidine: {
    name: 'Dexmedetomidine',
    unit: 'ng/mL',
    doseUnit: 'µg',
    max: 3,
    scale: 0.7,
    color: '#eb98c7',
    model: 'Hannivoort PK / separate Colin BIS and MOAA/S lags',
    source: 'https://doi.org/10.1093/bja/aex085',
    description:
      'Hannivoort PK; existing Ce uses BIS ke0 = 0.12/min. A separate MOAA/S effect site uses 0.0428/min.',
    limitations:
      'The linked Ce is not a universal antinociceptive or cardiovascular effect site. Extrapolation outside healthy-volunteer demographics.',
    anchor:
      'A measured 0.70 ng/mL was associated with 17% sevoflurane MAC reduction in one older-adult study; it is not a transferable fixed reduction.',
  },
  remifentanil: {
    name: 'Remifentanil',
    unit: 'ng/mL',
    doseUnit: 'µg',
    max: 20,
    scale: 3,
    color: '#75b8ff',
    model: 'Minto 1997',
    source: 'https://pubmed.ncbi.nlm.nih.gov/9009935/',
    description:
      'Age/lean-body-mass PK and age-dependent effect-site equilibration.',
    limitations:
      'No generic opioid-equivalence conversion. James lean body mass has obesity limitations.',
    anchor:
      'The propofol–remifentanil surfaces predict different probabilities for responsiveness, laryngoscopy and tetany at the same concentrations.',
  },
  fentanyl: {
    name: 'Fentanyl',
    unit: 'ng/mL',
    doseUnit: 'µg',
    max: 10,
    scale: 2,
    color: '#efb980',
    model: 'Shafer author-code PK; Ce unresolved',
    source: 'https://pubmed.ncbi.nlm.nih.gov/2248388/',
    description:
      'Source microparameter PK. A compatible fixed effect-site linkage is unresolved.',
    limitations:
      'Ce linkage is not validated for every endpoint. Sevoflurane–fentanyl incision surface uses plasma at pseudo-equilibrium.',
    anchor:
      '1 ng/mL alone cannot establish adequate anesthesia. Explore its contribution to incision tolerance with sevoflurane.',
  },
  alfentanil: {
    name: 'Alfentanil',
    unit: 'ng/mL',
    doseUnit: 'µg',
    max: 500,
    scale: 100,
    color: '#b8d986',
    model: 'Maitre author-code PK; Ce unresolved',
    source: 'https://pubmed.ncbi.nlm.nih.gov/3099604/',
    description:
      'Age, sex and weight-dependent three-compartment PK; fixed effect-site linkage unresolved.',
    limitations:
      'Implementation cross-checked against OpenTIVA microconstants; source demographic range 25–53 years, 41–95 kg.',
    anchor:
      'Published propofol co-administration markedly changes alfentanil concentrations associated with intubation; no single acceptable range.',
  },
  morphine: {
    name: 'Morphine',
    unit: 'ng/mL Cp',
    doseUnit: 'mg base',
    max: 100,
    scale: 20,
    color: '#df9a91',
    model: 'Pierre 2017 parent-morphine submodel',
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC5445229/',
    description:
      'Three-compartment serum PK, volumes scaled by weight/70 and clearances by (weight/70)^0.75. A separate thermal-response effect site uses a reported 42.6-minute equilibration half-time. Enter morphine base equivalent.',
    limitations:
      'Healthy/NASH study n=21. The thermal-response effect site is an exploratory composite. M3G/M6G effects and generic Ce are not modeled. Renal accumulation is not predicted.',
    anchor:
      'Parent plasma concentration is only part of morphine exposure. No validated standalone general-anesthesia concentration target.',
  },
  sufentanil: {
    name: 'Sufentanil',
    unit: 'ng/mL',
    doseUnit: 'µg',
    max: 1.5,
    scale: 0.2,
    color: '#9bd4d0',
    model: 'Gepts 1995 PK; separate exploratory hypnosis effect site',
    source: 'https://pubmed.ncbi.nlm.nih.gov/8533912/',
    description:
      'Fixed adult three-compartment PK. A separate hypnosis effect site uses the Scott EEG link (0.11/min) as an exploratory composite.',
    limitations:
      'PK study did not estimate PD. Generic Ce remains unavailable; the named hypnosis link is not verified as identical to the sparing study implementation. No demographic scaling is invented.',
    anchor:
      'Published targets around 0.2–0.3 ng/mL were studied with propofol in specific surgery; they are not universal targets.',
  },
  midazolam: {
    name: 'Midazolam', unit: 'ng/mL', doseUnit: 'mg', max: 500, scale: 50,
    color: '#ca9dde', model: 'Zomorodi 1998 PK / Bührer EEG link',
    source: 'https://pubmed.ncbi.nlm.nih.gov/9856717/',
    description: 'Adult three-compartment PK with the published typical parameters. Ce uses the Bührer EEG equilibration half-time of 4.8 minutes.',
    limitations: 'The PK model was developed after coronary bypass surgery. The separately sourced EEG link is a documented composite; active metabolites, organ dysfunction and additional demographic scaling are not modeled.',
    anchor: 'The exploratory H term is derived from midazolam-associated propofol sparing during procedural sedation. It is not a probability of general-anesthesia adequacy.',
  },
  hydromorphone: {
    name: 'Hydromorphone', unit: 'ng/mL Cp', doseUnit: 'mg', max: 30, scale: 4.4,
    color: '#c88e72', model: 'Jeleazcov 2014 PK / separate thermal-response effect site',
    source: 'https://pubmed.ncbi.nlm.nih.gov/23958818/',
    description: 'Adult three-compartment PK with published age and weight covariates. A separate thermal-response effect site uses the reported 45-minute equilibration half-time.',
    limitations: 'PK development population: postoperative cardiac-surgery adults aged 40–81 years. The thermal-response effect site is an exploratory composite with a different-source link. No organ-dysfunction, dialysis or metabolite model is included.',
    anchor: 'The exploratory N conversion uses a thermal-potency comparison with morphine. It is not a universal fentanyl dose conversion or an established intraoperative target.',
  },
};
export interface PKChoice {
  propofol: 'schnider' | 'marsh';
  ketamine: 'domino' | 'clements250';
}
export const defaultChoice: PKChoice = {
  propofol: 'schnider',
  ketamine: 'domino',
};
function micro(
  v1: number,
  k10: number,
  k12: number,
  k13: number,
  k21: number,
  k31: number,
  ke0: number | null,
  model: string,
): PKParameters {
  return {
    v1,
    v2: k12 ? (v1 * k12) / k21 : 1,
    v3: k13 ? (v1 * k13) / k31 : 1,
    cl: v1 * k10,
    q2: v1 * k12,
    q3: v1 * k13,
    ke0,
    model,
  };
}
export function pk(d: Agent, p: Patient, choice = defaultChoice): PKParameters {
  validatePatient(p);
  let q: PKParameters;
  if (d === 'rocuronium') q = rocuroniumParameters(p, rocContext(p.clinical)).pk;
  else if (d === 'propofol' && choice.propofol === 'marsh')
    q = micro(
      0.228 * p.weight,
      0.119,
      0.114,
      0.0419,
      0.055,
      0.0033,
      0.26,
      'adult-diprifusor-documented-composite',
    );
  else if (d === 'propofol') q = parameters(d, p);
  else if (d === 'fentanyl') q = micro(6.09, .0827, .471, .225, .102, .006, null, 'shafer-stanpump-exact-micro');
  else if (d === 'dexmedetomidine')
    q = {
      ...parameters(d, p),
      ke0: 0.12,
      model: 'hannivoort-colin-bis-link',
    };
  else if (d === 'remifentanil') {
    const a = p.age - 40,
      l = lbm(p) - 55;
    q = {
      v1: 5.1 - 0.0201 * a + 0.072 * l,
      v2: 9.82 - 0.0811 * a + 0.108 * l,
      v3: 5.42,
      cl: 2.6 - 0.0162 * a + 0.0191 * l,
      q2: 2.05 - 0.0301 * a,
      q3: 0.076 - 0.00113 * a,
      ke0: 0.595 - 0.007 * a,
      model: 'minto-1997',
    };
  } else if (d === 'alfentanil') {
    const v = 0.111 * p.weight * (p.sex === 'female' ? 1.15 : 1),
      a = Math.max(0, p.age - 40);
    q = micro(
      v,
      (0.356 - 0.00269 * a) / v,
      0.104,
      0.017,
      0.0673,
      0.0126 - 0.000113 * a,
      null,
      'maitre-stanpump-pk-only',
    );
  } else if (d === 'sufentanil')
    q = {
      v1: 14.3,
      v2: 63.1,
      v3: 261.6,
      cl: 0.92,
      q2: 1.55,
      q3: 0.33,
      ke0: null,
      model: 'gepts-pk-only',
    };
  else if (d === 'morphine') {
    const w = p.weight / 70,
      c = w ** 0.75;
    q = {
      v1: 9.41 * w,
      v2: 108 * w,
      v3: 50.7 * w,
      cl: ((44.1 + 6.32) * c) / 60,
      q2: (67.1 * c) / 60,
      q3: (83.4 * c) / 60,
      ke0: null,
      model: 'pierre-2017-parent',
    };
  } else if (d === 'midazolam') {
    // Zomorodi 1998, PMID 9856717: published typical adult parameters.
    // Bührer 1990, PMID 2225714: separate EEG t1/2ke0 = 4.8 min.
    q = { v1: 32.2, v2: 53, v3: 245, cl: 0.43, q2: 0.56, q3: 0.39,
      ke0: MIDAZOLAM_EEG_KE0, model: 'zomorodi-1998-buhrer-eeg-composite' };
  } else if (d === 'hydromorphone') {
    // Jeleazcov 2014, PMID 23958818; complete equations reproduced in the
    // Jeleazcov 2016 supplement, Table S1. Linear weight scaling is intentional.
    const w = p.weight / 70, a = p.age - 67;
    q = { v1: 3.35 * w * (1 - 0.028 * a), v2: 13.9 * w, v3: 145 * w,
      cl: 1.01 * w * (1 - 0.015 * a), q2: 1.47 * w, q3: 1.41 * w,
      ke0: null, model: 'jeleazcov-2014-parent' };
  } else if (d === 'ketamine')
    q =
      choice.ketamine === 'domino'
        ? micro(
            0.063 * p.weight,
            0.4381,
            0.5921,
            0.59,
            0.247,
            0.0146,
            null,
            'domino',
          )
        : micro(
            1.7522 * p.weight,
            0.0109,
            0.0186,
            0,
            0.0137,
            0,
            null,
            'clements250',
          );
  else throw Error('Volatile exposure requires measured ET.');
  if (
    [q.v1, q.v2, q.v3, q.cl].some((v) => !Number.isFinite(v) || v <= 0) ||
    [q.q2, q.q3].some((v) => v < 0)
  )
    throw Error('Covariates produce an invalid PK parameter.');
  return q;
}
export const ageMAC = (d: Agent, age: number) =>
  macAtAge(d === 'desflurane' ? 'desflurane' : 'sevoflurane', age);
export interface DrugEvent {
  id: string;
  t: number;
  drug: Agent;
  kind: 'bolus' | 'infusion' | 'et';
  value: number;
  durationSeconds?: number;
}
export interface Trace {
  t: number;
  cp: Exposure;
  ce: EffectExposure;
  ceUnavailableReason?: Record<Agent, string | null>;
  diagnostics?: { amounts: Record<string, number[]>; cumulative: Exposure; eliminated: Exposure; residualCorrections: { time: number; drug: string; raw: number[]; corrected: number[] }[] };
  effect: Exposure;
  endpointCe?: EndpointConcentrations;
}
/** Convert entered mass to the engine's amount unit once, including salt convention. */
export const inputFactor = (drug: Agent) => drug === 'rocuronium' ? rocuroniumMgToUmol(1) :
  ['ketamine', 'morphine', 'midazolam', 'hydromorphone'].includes(drug) ? 1000 : 1;
export function simulate(
  p: Patient,
  events: DrugEvent[],
  minutes = 120,
  choice = defaultChoice,
  options: { sampleEverySeconds?: number; sampleAtSeconds?: number[]; diagnostics?: boolean } = {},
): Trace[] {
  validatePatient(p);
  const sampleEvery = options.sampleEverySeconds ?? 10;
  const requestedSamples = new Set(options.sampleAtSeconds ?? []);
  if ([...requestedSamples].some(t => !Number.isInteger(t) || t < 0 || t > 86400)) throw Error('Invalid requested sample time.');
  if (!Number.isInteger(sampleEvery) || sampleEvery < 1) throw Error('Invalid sample interval.');
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440)
    throw Error('Duration outside 0–1440 minutes.');
  if (events.length > 2000) throw Error('Too many timeline entries.');
  for (const e of events)
    if (
      !DRUG_IDS.includes(e.drug) ||
      !Number.isFinite(e.t) ||
      !Number.isInteger(e.t) ||
      e.t < 0 ||
      e.t > 86400 ||
      !Number.isFinite(e.value) ||
      e.value < 0 ||
      e.value > 1e6 ||
      (e.durationSeconds !== undefined &&
        (e.kind !== 'bolus' ||
          !Number.isInteger(e.durationSeconds) ||
          e.durationSeconds < 1 ||
          e.durationSeconds > 86400 ||
          e.t + e.durationSeconds > 86400)) ||
      !['bolus', 'infusion', 'et'].includes(e.kind) ||
      (e.kind === 'et') === IV.includes(e.drug) ||
      (e.kind === 'et' && e.value > drugs[e.drug].max)
    )
      throw Error('Invalid drug event.');
  const states = Object.fromEntries(IV.map((d) => [d, [0, 0, 0, 0, 0]])) as Record<
    Agent,
    number[]
  >;
  const pars = Object.fromEntries(
    IV.map((d) => [d, pk(d, p, choice)]),
  ) as Record<Agent, PKParameters>;
  const mats = Object.fromEntries(
    IV.map((d) => [d, transitionWithMass(pars[d])]),
  ) as Record<Agent, ReturnType<typeof transition>>;
  const rates = zeroExposure(),
    loading = zeroExposure(),
    et = zeroExposure(),
    out: Trace[] = [];
  const cumulative = zeroExposure();
  let residualCorrections: { time: number; drug: string; raw: number[]; corrected: number[] }[] = [];
  let dexMoaas = [0, 0, 0, 0];
  const dexMoaasMatrix = transition({
    ...pars.dexmedetomidine,
    ke0: DEX_MOAAS_KE0,
  });
  // Integrate each named effect site with its complete driving PK system.
  // Sampling Cp and then applying a discrete lag would lose the within-second
  // PK trajectory and give a different result around boluses and input changes.
  const hnSites = HN_EFFECT_SITES.map(site => ({
    ...site,
    state: [0, 0, 0, 0],
    matrix: transition({ ...pars[site.drug], ke0: site.ke0 }),
  }));
  const schedule = new Map<number, DrugEvent[]>();
  const ends = new Map<number, DrugEvent[]>();
  events.forEach((e) => schedule.set(e.t, [...(schedule.get(e.t) || []), e]));
  events
    .filter((e) => e.durationSeconds)
    .forEach((e) => {
      const end = e.t + e.durationSeconds!;
      ends.set(end, [...(ends.get(end) || []), e]);
    });
  for (let t = 0; t <= Math.round(minutes * 60); t++) {
    for (const e of ends.get(t) || [])
      loading[e.drug] -=
        (e.value *
          inputFactor(e.drug) *
          60) /
        e.durationSeconds!;
    for (const e of schedule.get(t) || []) {
      const factor = inputFactor(e.drug);
      if (e.kind === 'et') et[e.drug] = e.value;
      else if (e.kind === 'bolus' && e.durationSeconds)
        loading[e.drug] += (e.value * factor * 60) / e.durationSeconds;
      else if (e.kind === 'bolus') {
        states[e.drug][0] += e.value * factor;
        cumulative[e.drug] += e.value * factor;
        if (e.drug === 'dexmedetomidine') dexMoaas[0] += e.value * factor;
        for (const site of hnSites) if (site.drug === e.drug) site.state[0] += e.value * factor;
      } else rates[e.drug] = (e.value * factor) / 60;
    }
    if (t % sampleEvery === 0 || requestedSamples.has(t) || t === Math.round(minutes * 60) || schedule.has(t) || ends.has(t)) {
      const cp = zeroExposure(), effect = zeroExposure();
      const ce = zeroExposure() as EffectExposure;
      for (const d of DRUG_IDS) {
        if (IV.includes(d)) {
          cp[d] = states[d][0] / pars[d].v1;
          ce[d] = pars[d].ke0 ? states[d][3] : null;
          effect[d] = ce[d] ?? cp[d];
        } else {
          cp[d] = effect[d] = et[d];
          ce[d] = null;
        }
      }
      out.push({
        t,
        cp,
        ce,
        effect,
        endpointCe: {
          dexmedetomidineMoaas: dexMoaas[3],
          ...Object.fromEntries(hnSites.map(site => [site.key, site.state[3]])),
        },
        ceUnavailableReason: Object.fromEntries(DRUG_IDS.map(d => [d, ceReason(d)])) as Record<Agent, string | null>,
        ...(options.diagnostics ? { diagnostics: { amounts: Object.fromEntries(IV.map(d => [d, states[d].slice(0, pars[d].q3 === 0 ? 2 : 3)])), cumulative: { ...cumulative }, eliminated: Object.fromEntries(IV.map(d => [d, states[d][4]])) as Exposure, residualCorrections: [...residualCorrections] } } : {}),
      });
    }
    if (t < minutes * 60) {
      residualCorrections = [];
      for (const d of IV) {
        const input = rates[d] + loading[d];
        if (input < -1e-9) throw Error('Negative input rate.');
        cumulative[d] += Math.max(0, input) / 60;
        states[d] = step(
          mats[d],
          states[d],
          Math.max(0, input),
          (raw, corrected) => residualCorrections.push({ time: t + 1, drug: d, raw, corrected }),
        );
      }
      dexMoaas = step(
        dexMoaasMatrix,
        dexMoaas,
        rates.dexmedetomidine + Math.max(0, loading.dexmedetomidine),
      );
      for (const site of hnSites) {
        const input = rates[site.drug] + loading[site.drug];
        if (input < -1e-9) throw Error('Negative endpoint effect-site input rate.');
        site.state = step(site.matrix, site.state, Math.max(0, input));
      }
    }
  }
  return out;
}
export const priorSources = {
  remi: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3050649/',
  sevo: 'https://pubmed.ncbi.nlm.nih.gov/23360899/',
};
export function greco(
  prop: number,
  remi: number,
  cp50: number,
  cr50: number,
  n: number,
  alpha: number,
) {
  const p = prop / cp50,
    r = remi / cr50,
    u = p + r + alpha * p * r;
  return u > 0 ? 1 / (1 + Math.exp(-n * Math.log(u))) : 0;
}
export interface Prior {
  p: number | null;
  label: string;
  source: string;
  excluded: Agent[];
  warning: string;
}
export function prior(e: Exposure, endpoint: Endpoint): Prior {
  const remiPair: Agent[] = ['propofol', 'remifentanil'],
    sevoPair: Agent[] = ['sevoflurane', 'fentanyl'];
  const useSevo = endpoint === 'movement';
  const pair = useSevo ? sevoPair : remiPair;
  let p: number | null = null,
    label = 'No frozen published prior for this endpoint',
    source = '';
  if (endpoint === 'lor') {
    p = greco(e.propofol, e.remifentanil, 2.2, 33.1, 5, 3.6);
    label = 'Propofol–remifentanil · OAA/S = 1';
    source = priorSources.remi;
  }
  if (endpoint === 'laryngoscopy') {
    p = 1 - greco(e.propofol, e.remifentanil, 5.6, 48.9, 2.2, 33.2);
    label = 'Propofol–remifentanil · response to laryngoscopy';
    source = priorSources.remi;
  }
  if (useSevo) {
    p = sevoFentanyl(e.sevoflurane, e.fentanyl).movementIncision;
    label = 'Sevoflurane–fentanyl · movement to incision';
    source = priorSources.sevo;
  }
  const excluded = DRUG_IDS.filter((d) => !pair.includes(d) && e[d] > 0);
  return {
    p,
    label,
    source,
    excluded,
    warning:
      p === null
        ? 'Requires a prospectively specified and fitted endpoint model.'
        : (useSevo
            ? 'Fentanyl Cp and sevo ET at pseudo-equilibrium; development ages 20–50.'
            : 'Equilibrium effect-site response surface; dynamic and demographic transfer require evaluation.') +
          (excluded.length
            ? ' Other active agents excluded from this reference.'
            : ''),
  };
}
export const DEMO_EVENTS: DrugEvent[] = [
  { id: 'd1', t: 0, drug: 'propofol', kind: 'bolus', value: 120 },
  { id: 'd2', t: 0, drug: 'remifentanil', kind: 'infusion', value: 350 },
  { id: 'd3', t: 60, drug: 'propofol', kind: 'infusion', value: 360 },
  { id: 'd4', t: 600, drug: 'dexmedetomidine', kind: 'infusion', value: 25 },
  { id: 'd5', t: 900, drug: 'ketamine', kind: 'bolus', value: 15 },
  { id: 'd6', t: 3600, drug: 'propofol', kind: 'infusion', value: 0 },
  { id: 'd7', t: 3600, drug: 'remifentanil', kind: 'infusion', value: 0 },
  { id: 'd8', t: 3600, drug: 'dexmedetomidine', kind: 'infusion', value: 0 },
];
