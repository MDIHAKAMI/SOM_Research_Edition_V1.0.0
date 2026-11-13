// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  LEGACY_FIT_DRUG_IDS as DRUG_IDS,
  drugs,
  ageMAC,
  greco,
  type Trace,
  type PKChoice,
} from './pharmacology';

export const STATE_ESTIMATE_VERSION = 'som-exposure-1';
/**
 * @deprecated Historical exposure feature, not the current H/N calculation.
 * Requires legacy generic opioid Ce values; modern traces leave these unavailable,
 * so the aggregate index is null. Retained for historical records and tests only.
 * The current H/N calculation is in multimodal.ts.
 */
export function stateEstimates(s: Trace, choice: PKChoice, age: number) {
  const contributions = DRUG_IDS.map((drug) => {
    const volatile = drug === 'sevoflurane' || drug === 'desflurane';
    const basis = volatile
      ? 'ET'
      : ['ketamine', 'morphine'].includes(drug)
        ? 'Cp'
        : 'Ce';
    const concentration = basis === 'Ce' ? s.ce[drug] : s.cp[drug];
    const scale = volatile ? ageMAC(drug, age) : drugs[drug].scale;
    return {
      drug,
      basis,
      concentration,
      scale,
      value: concentration !== null && Number.isFinite(concentration)
        ? Math.log2(1 + Math.max(0, concentration) / scale)
        : null,
    };
  });
  const prop = Math.max(0, s.ce.propofol ?? NaN),
    remi = Math.max(0, s.ce.remifentanil ?? NaN),
    sevo = Math.max(0, s.cp.sevoflurane);
  const publishedPropRemi =
    choice.propofol === 'schnider' &&
    Number.isFinite(prop) &&
    Number.isFinite(remi) &&
    (prop > 0 || remi > 0)
      ? greco(prop, remi, 2.2, 33.1, 5, 3.6)
      : null;
  const publishedSevoRemi =
    Number.isFinite(sevo) && Number.isFinite(remi) && (sevo > 0 || remi > 0)
      ? greco(sevo, remi, 0.78, 50.2, 4.4, 12.4)
      : null;
  return {
    version: STATE_ESTIMATE_VERSION,
    publishedPropRemi,
    publishedSevoRemi,
    index: contributions.some((c) => c.value === null)
      ? null
      : contributions.reduce((sum, c) => sum + c.value!, 0),
    contributions,
  };
}
