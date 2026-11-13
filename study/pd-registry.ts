// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import type { Agent } from './pharmacology';
import {
  HN_COEFFICIENTS,
  HN_SOURCES,
  type ExposureBinding,
} from './hn-coefficients';

export const HN_VERSION = 'som-hn-3.0.0';
export const PD_VERSION = HN_VERSION;
export const PUBLISHED_PD_VERSION = 'som-published-pd-1.0.0';
export type Domain = 'H' | 'N';
export type NProfile = 'generic' | 'incision' | 'airway' | 'tetany' | 'bar-incision' | 'bar-airway' | 'closure' | 'lma';
export type Grade = 'A' | 'B' | 'C' | 'D';
export type ExposureType = 'Cp' | 'Ce' | 'MAC' | 'ET' | 'Ce-MOAA/S' | 'brain' | 'arterial-blood' |
  'Ce-ketamine-hypnosis' | 'Ce-sufentanil-hypnosis' | 'Ce-morphine-thermal' | 'Ce-hydromorphone-thermal' | 'none';
export interface PDContext {
  nProfile: NProfile;
  n2oPercent: number | null;
  spinalBupivacaine: boolean | null;
  bis: number | null;
}
export const DEFAULT_PD_CONTEXT: PDContext = {
  nProfile: 'generic', n2oPercent: null, spinalBupivacaine: null, bis: null,
};
/** Context still describes observations and published pair outputs. It never gates H/N credits. */
export const N_PROFILES: Record<NProfile, string> = {
  generic: 'Mixed-stimulus research score', incision: 'Incision / movement', airway: 'Airway instrumentation',
  tetany: 'Tetanic stimulation', 'bar-incision': 'Cardiovascular response · incision',
  'bar-airway': 'Cardiovascular response · intubation', closure: 'Closure', lma: 'LMA insertion',
};
/** Compatibility metadata for saved snapshots and workbook consumers. Values are not universal EC50s. */
export interface Anchor {
  id: string;
  drug: Agent;
  domain: Domain;
  endpoint: string;
  profile: NProfile | null;
  exposureType: ExposureType;
  value: number | null;
  units: string;
  anchorType: string;
  evidenceGrade: Grade | null;
  source: string;
  pmid: string;
  doi: string;
  citation: string;
  population: string;
  clinicalContext: string;
  backgroundDrugs: string;
  ageAdjustment: string;
  weightAdjustment: string;
  enabled: boolean;
  limitations: string;
  version: string;
  interactionOverrides: string[];
  requirements: ('schnider' | 'spinal' | 'n2o70' | 'n2o66' | 'sevo')[];
  formula: string;
  sourceIds: string[];
  derivation: string;
  assumptions: string[];
  knots: [number, number][];
  parameters: Record<string, number>;
  binding: ExposureBinding;
}
const exposureTypes: Record<ExposureBinding, ExposureType> = {
  Cp: 'Cp', Ce: 'Ce', MAC: 'MAC', ET: 'ET', none: 'none',
  ketamineHypnosis: 'Ce-ketamine-hypnosis', sufentanilHypnosis: 'Ce-sufentanil-hypnosis',
  morphineThermal: 'Ce-morphine-thermal', hydromorphoneThermal: 'Ce-hydromorphone-thermal',
};
/** All 26 current drug/domain definitions; no legacy log-index anchors remain active. */
export const ANCHORS: Anchor[] = Object.entries(HN_COEFFICIENTS).flatMap(([key, d]) =>
  (['H', 'N'] as const).map((domain): Anchor => {
    const drug = key as Agent, s = d[domain], sources = s.source_ids.map((id) => HN_SOURCES[id]);
    return {
      id: `${drug}-${domain.toLowerCase()}-v3`, drug, domain, profile: null,
      endpoint: sources.map((source) => source.endpoint).filter(Boolean).join('; ') || d.evidenceSummary,
      exposureType: exposureTypes[s.binding], value: s.parameters.anchor ?? null, units: s.unit,
      anchorType: s.function_type, evidenceGrade: null,
      source: sources[0]?.url ?? '', pmid: sources.map((source) => source.pmid).filter(Boolean).join('; '),
      doi: sources.map((source) => source.doi).filter(Boolean).join('; '),
      citation: sources.map((source) => source.study).join('; '),
      population: sources.map((source) => source.population).filter(Boolean).join('; ') ||
        'Multiple source populations; transfers are described in the coefficient derivation.',
      clinicalContext: d.implementationBinding,
      backgroundDrugs: 'Source backgrounds retained in derivation; reference drugs need not be present.',
      ageAdjustment: s.binding === 'MAC' ? 'MAC40 × 10^(−0.00269 × (age−40)); explicit transfer' :
        'No extra H/N age correction; covariates remain in the selected concentration model.',
      weightAdjustment: 'No extra H/N weight correction; covariates remain in the selected concentration model.',
      enabled: true, limitations: [...s.assumptions, d.implementationBinding,
        'Constructed research score; no established clinical thresholds.'].join(' '),
      version: PD_VERSION, interactionOverrides: [], requirements: [], formula: s.expression,
      sourceIds: [...s.source_ids], derivation: d.derivation, assumptions: [...s.assumptions],
      knots: s.knots.map(([x, y]) => [x, y]), parameters: { ...s.parameters }, binding: s.binding,
    };
  }),
);
/** Historical snapshot type only. H/N 3.0 has no rho-based cross-domain conversion. */
export interface Rho {
  id: string; drug: Agent; value: number; evidenceGrade: Grade; provenance: string;
  source: string; anchorIds: string[]; enabled: boolean; limitations: string; version: string;
}
export const RHOS: Rho[] = [];
export function validatePDContext(value: any): PDContext {
  if (
    !value ||
    !Object.hasOwn(N_PROFILES, value.nProfile) ||
    (value.n2oPercent !== null &&
      (!Number.isFinite(value.n2oPercent) ||
        value.n2oPercent < 0 ||
        value.n2oPercent > 100)) ||
    ![true, false, null].includes(value.spinalBupivacaine) ||
    (value.bis !== null &&
      (!Number.isFinite(value.bis) || value.bis < 0 || value.bis > 100))
  )
    throw Error('Check the PD reference context.');
  return {
    nProfile: value.nProfile,
    n2oPercent: value.n2oPercent,
    spinalBupivacaine: value.spinalBupivacaine,
    bis: value.bis,
  };
}
