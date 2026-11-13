// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import type { Patient, PKParameters } from '../pharmacology/pk/models';
import type { RocuroniumContext } from './clinical-context';

/** Kleijn et al. 2011, Table 4 and Figure 1.
 * DOI: 10.1111/j.1365-2125.2011.04000.x
 * Deterministic rocuronium-alone component; no reversal or NMBA interaction.
 * Amounts are µmol, Cp/Ce are µmol/L, time is minutes inside the PK engine.
 * The paper's original NONMEM mass conversion was not recovered. Clinical
 * input is explicitly bromide mg, converted using the labeled salt mass.
 */
export const ROCURONIUM_SOURCE =
  'https://doi.org/10.1111/j.1365-2125.2011.04000.x';
export const ROCURONIUM_BROMIDE_MOLAR_MASS = 609.7; // g/mol, product label

export interface RocuroniumParameters {
  pk: PKParameters;
  ec50: number; // µmol/L, model-specific effect-site concentration
  gamma: number;
  baseline: number; // raw T4/T1 ratio, not percentage or probability
  notes: string[];
}

export interface RocuroniumTOFR {
  raw: number | null;
  normalized: number | null;
  available: boolean;
  notes: string[];
}

function validateInputs(patient: Patient, context: RocuroniumContext) {
  if (
    ![patient.age, patient.weight, patient.height].every(
      (v) => Number.isFinite(v) && v > 0,
    ) ||
    !['male', 'female'].includes(patient.sex)
  )
    throw Error('Invalid patient covariates for the rocuronium model.');
  if (
    (context.crcl !== null &&
      (!Number.isFinite(context.crcl) || context.crcl < 0)) ||
    !['reference', 'asian'].includes(context.race) ||
    !['none', 'sevo'].includes(context.sevo) ||
    (context.reversalAt !== null &&
      (!Number.isFinite(context.reversalAt) || context.reversalAt < 0)) ||
    typeof context.otherBlocker !== 'boolean'
  )
    throw Error('Invalid rocuronium model context.');
}

function creatinineClearance(patient: Patient, context: RocuroniumContext) {
  // Source Table 2 footnote: explicitly imputed, not measured renal function.
  const crcl = context.crcl ?? (patient.age < 18
    ? 53.8 + patient.age ** 1.75
    : 183 - 1.34 * patient.age);
  if (!Number.isFinite(crcl) || crcl < 0)
    throw Error('The source creatinine-clearance imputation is out of range.');
  return crcl;
}

/** Source-population limits are applicability notes, not input clamping. */
export function rocuroniumApplicabilityWarnings(
  patient: Patient,
  context: RocuroniumContext,
): string[] {
  validateInputs(patient, context);
  const crcl = creatinineClearance(patient, context);
  const notes: string[] = [];
  if (context.crcl === null)
    notes.push(
      `CrCl imputed as ${crcl.toFixed(1)} mL/min using the source age formula; this is not a measured renal assessment.`,
    );
  if (
    patient.age < 1 ||
    patient.age > 91 ||
    patient.weight < 9.6 ||
    patient.weight > 139 ||
    crcl < 4.3 ||
    crcl > 239
  )
    notes.push(
      'Outside the original PK covariate ranges (age 1–91 years, weight 9.6–139 kg, CrCl 4.3–239 mL/min).',
    );
  if (
    patient.age < 1 ||
    patient.age > 64 ||
    patient.weight < 11.2 ||
    patient.weight > 107 ||
    crcl < 53.3 ||
    crcl > 239
  )
    notes.push(
      'Outside the rocuronium-alone TOFR development ranges (age 1–64 years, weight 11.2–107 kg, CrCl 53.3–239 mL/min); the broader PK/reversal cohort does not establish spontaneous-recovery accuracy here.',
    );
  if (crcl < 30)
    notes.push(
      'Severe renal impairment was represented in PK and reversal data, but not in the rocuronium-alone TOFR development subset.',
    );
  notes.push(
    context.race === 'reference'
      ? 'Original non-Asian reference coefficient selected; this is a model scenario, not Saudi-population validation.'
      : 'Original Asian coefficient selected; nationality or residence alone does not establish this source category.',
  );
  notes.push(
    context.sevo === 'sevo'
      ? 'Fixed sevoflurane anesthesia scenario; the source did not model changing end tidal concentrations, washout or desflurane. Spontaneous TOFR90 prediction was less accurate in this group.'
      : 'Fixed no-sevoflurane reference scenario; volatile potentiation is not inferred from the current end tidal value.',
  );
  if (context.reversalAt !== null)
    notes.push(
      'This rocuronium-alone model does not include reversal; TOFR prediction is unavailable from the recorded reversal time.',
    );
  if (context.otherBlocker)
    notes.push(
      'Another neuromuscular blocker is recorded; combined TOFR is unavailable from this single-drug model.',
    );
  return notes;
}

/** Full typical-value rocuronium PK/PD parameterization, with random effects 0.
 * The inert third compartment adapts the two-compartment source to the generic
 * engine: q3=0 and a zero initial A3, with v3=1 to avoid division by zero.
 */
export function rocuroniumParameters(
  patient: Patient,
  context: RocuroniumContext,
): RocuroniumParameters {
  const notes = rocuroniumApplicabilityWarnings(patient, context);
  const w = patient.weight / 70;
  const crcl = creatinineClearance(patient, context);
  const sevo = context.sevo === 'sevo';
  const pk: PKParameters = {
    v1: 4.73 * Math.exp(-0.00143 * (crcl - 119)) * w,
    v2: 6.76 * Math.exp(0.00613 * (patient.age - 43)) * w,
    v3: 1,
    cl: 0.269 * (1 - 0.00678 * (patient.age - 43)) * w ** 0.75,
    q2: 0.279 * (context.race === 'asian' ? 0.788 : 1) * w ** 0.75,
    q3: 0,
    ke0: 0.134 * w ** -0.25 * (sevo ? 0.433 : 1),
    model: 'kleijn-2011-rocuronium-alone',
  };
  if (
    [pk.v1, pk.v2, pk.cl, pk.q2, pk.ke0!].some(
      (v) => !Number.isFinite(v) || v <= 0,
    )
  )
    throw Error('Covariates produce an invalid rocuronium PK/PD parameter.');
  return {
    pk,
    ec50: 1.62 * (sevo ? 0.605 : 1),
    gamma: 7.52,
    baseline: 1.04,
    notes,
  };
}

/** Clinical dose (rocuronium BROMIDE mg) -> µmol. Also converts mg/min -> µmol/min. */
export function rocuroniumMgToUmol(mg: number): number {
  if (!Number.isFinite(mg) || mg < 0)
    throw Error('Rocuronium bromide input must be finite and nonnegative.');
  const umol = (mg * 1000) / ROCURONIUM_BROMIDE_MOLAR_MASS;
  if (!Number.isFinite(umol)) throw Error('Rocuronium input exceeds numeric range.');
  return umol;
}

/** Original raw and explicitly baseline-normalized TOFR. Neither is probability.
 * atSeconds and context.reversalAt are seconds since case start (DrugEvent.t).
 * A zero Ce does not establish a measurable TOFR after unmodeled reversal/NMBA.
 */
export function rocuroniumTOFR(
  ceUmolL: number,
  parameters: RocuroniumParameters,
  context: RocuroniumContext,
  atSeconds: number,
): RocuroniumTOFR {
  const notes = [...parameters.notes];
  const unavailable = (reason: string): RocuroniumTOFR => ({
    raw: null,
    normalized: null,
    available: false,
    notes: [...notes, reason],
  });
  if (!Number.isFinite(atSeconds) || atSeconds < 0)
    return unavailable('Invalid assessment time.');
  if (!Number.isFinite(ceUmolL) || ceUmolL < 0)
    return unavailable('Effect-site concentration is missing or invalid.');
  if (
    ![parameters.ec50, parameters.gamma, parameters.baseline].every(
      (v) => Number.isFinite(v) && v > 0,
    )
  )
    return unavailable('Invalid TOFR model parameters.');
  if (
    (context.reversalAt !== null &&
      (!Number.isFinite(context.reversalAt) || context.reversalAt < 0)) ||
    typeof context.otherBlocker !== 'boolean'
  )
    return unavailable('Invalid reversal or neuromuscular-blocker context.');
  if (context.otherBlocker)
    return unavailable('Combined neuromuscular-blocker effects are not modeled.');
  if (context.reversalAt !== null && atSeconds >= context.reversalAt)
    return unavailable('Reversal effects are not included in this prediction.');
  // Stable Hill inhibition: log domain prevents Ce^gamma overflow. This also
  // retains the original 1.04 baseline instead of silently clamping it to 1.
  const logRatio =
    ceUmolL === 0
      ? -Infinity
      : parameters.gamma * (Math.log(ceUmolL) - Math.log(parameters.ec50));
  const normalized =
    logRatio > 0
      ? Math.exp(-logRatio) / (1 + Math.exp(-logRatio))
      : 1 / (1 + Math.exp(logRatio));
  return {
    raw: parameters.baseline * normalized,
    normalized,
    available: true,
    notes,
  };
}
