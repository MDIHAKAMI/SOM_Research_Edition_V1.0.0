// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/** New clinical comparison context; absence preserves historical case behavior. */
export const CLINICAL_EXTENSION_VERSION = 'som-clinical-extensions-1.0.0';
export interface OrganProfile {
  knownLiverDisease: boolean;
  childPughScore: number | null;
  knownKidneyDisease: boolean;
  crcl: number | null; // unindexed mL/min, never substituted from eGFR
  dialysis: boolean;
}
export interface RocuroniumContext {
  crcl: number | null;
  race: 'reference' | 'asian';
  sevo: 'none' | 'sevo'; // fixed anesthesia scenario, not a switch driven by current ET
  reversalAt: number | null; // seconds since case start
  otherBlocker: boolean;
}
export interface ClinicalContext extends OrganProfile {
  nmb: Omit<RocuroniumContext, 'crcl'>;
}
export function defaultClinicalContext(): ClinicalContext {
  return { knownLiverDisease: false, childPughScore: null, knownKidneyDisease: false,
    crcl: null, dialysis: false,
    nmb: { race: 'reference', sevo: 'none', reversalAt: null, otherBlocker: false } };
}
export function clinicalContext(value?: ClinicalContext): ClinicalContext {
  const base = defaultClinicalContext();
  return { ...base, ...value, nmb: { ...base.nmb, ...value?.nmb } };
}
export function rocContext(value?: ClinicalContext): RocuroniumContext {
  const c = clinicalContext(value);
  return { ...c.nmb, crcl: c.crcl };
}
export function validateClinicalContext(value?: ClinicalContext) {
  if (value === undefined) return;
  if (!value || typeof value !== 'object') throw Error('Invalid clinical profile.');
  const c = clinicalContext(value);
  if ([c.knownLiverDisease, c.knownKidneyDisease, c.dialysis, c.nmb.otherBlocker].some(x => typeof x !== 'boolean') ||
    (c.childPughScore !== null && (!Number.isInteger(c.childPughScore) || c.childPughScore < 5 || c.childPughScore > 15)) ||
    (c.crcl !== null && (!Number.isFinite(c.crcl) || c.crcl < 0 || c.crcl > 300)) ||
    !['reference', 'asian'].includes(c.nmb.race) || !['none', 'sevo'].includes(c.nmb.sevo) ||
    (c.nmb.reversalAt !== null && (!Number.isInteger(c.nmb.reversalAt) || c.nmb.reversalAt < 0 || c.nmb.reversalAt > 86400)))
    throw Error('Check Child–Pugh score (5–15), CrCl (0–300 mL/min), and neuromuscular model context.');
}
