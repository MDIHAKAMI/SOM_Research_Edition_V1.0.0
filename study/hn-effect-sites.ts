// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/**
 * Endpoint-specific effect-site links for the exploratory H/N calculation.
 * Each link is integrated with the selected parent PK model. These combinations
 * are declared composites, not reproductions of a jointly estimated PK/PD model.
 */
export const HN_EFFECT_SITE_VERSION = 'som-hn-effect-sites-1.0.0';
export const MIDAZOLAM_EEG_HALF_TIME_MINUTES = 4.8;
export const MIDAZOLAM_EEG_KE0 = Math.LN2 / MIDAZOLAM_EEG_HALF_TIME_MINUTES;

export const HN_EFFECT_SITES = [
  {
    key: 'ketamineHypnosis', drug: 'ketamine', domain: 'H',
    ke0: Math.LN2 / (23 / 60), halfTimeMinutes: 23 / 60,
    endpoint: 'EEG slow-wave activity; transferred to the exploratory hypnosis index',
    source: 'https://doi.org/10.1016/j.bja.2019.07.021',
    linkage: 'Selected Domino/Clements parent PK plus the reported 23-second slow-wave equilibration half-time. The source used a different PK model; this is an exploratory composite.',
  },
  {
    key: 'morphineThermal', drug: 'morphine', domain: 'N',
    ke0: Math.LN2 / (0.71 * 60), halfTimeMinutes: 0.71 * 60,
    endpoint: 'Maximum tolerated thermal stimulus',
    source: 'https://doi.org/10.1016/j.bja.2025.11.060',
    correction: 'https://doi.org/10.1016/j.bja.2026.04.044',
    linkage: 'Pierre parent-morphine PK plus the reported 0.71-hour thermal-response equilibration half-time. The source PK differs; this is an exploratory composite. Active metabolite effects are omitted.',
  },
  {
    key: 'hydromorphoneThermal', drug: 'hydromorphone', domain: 'N',
    ke0: Math.LN2 / (0.75 * 60), halfTimeMinutes: 0.75 * 60,
    endpoint: 'Maximum tolerated thermal stimulus',
    source: 'https://doi.org/10.1016/j.bja.2025.11.060',
    correction: 'https://doi.org/10.1016/j.bja.2026.04.044',
    linkage: 'Jeleazcov parent-hydromorphone PK plus the reported 0.75-hour thermal-response equilibration half-time. The source PK differs; this is an exploratory composite.',
  },
  {
    key: 'sufentanilHypnosis', drug: 'sufentanil', domain: 'H',
    ke0: 0.11, halfTimeMinutes: Math.LN2 / 0.11,
    endpoint: 'EEG-derived equilibration; transferred to the exploratory hypnotic-sparing term',
    source: 'https://cdn-links.lww.com/permalink/aln/b/aln_2015_10_07_jeleazcov_201409064_sdc1.pdf',
    linkage: 'Gepts PK plus Scott EEG ke0 = 0.11/min, as explicitly reported in the Jeleazcov supplement. This declared composite does not establish identity with the hypnosis-sparing study concentration trajectory.',
  },
] as const;

export type HNEffectSiteKey = (typeof HN_EFFECT_SITES)[number]['key'];
export interface EndpointConcentrations extends Partial<Record<HNEffectSiteKey, number>> {
  dexmedetomidineMoaas: number;
}
