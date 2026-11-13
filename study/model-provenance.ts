// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { pk, defaultChoice, type Agent, type PKChoice, PK_VERSION, CE_VERSION } from './pharmacology';
import type { Patient } from '../pharmacology/pk/models';
import { HN_VERSION, PUBLISHED_PD_VERSION } from './pd-registry';
import { HN_EFFECT_SITES, HN_EFFECT_SITE_VERSION, MIDAZOLAM_EEG_HALF_TIME_MINUTES, MIDAZOLAM_EEG_KE0 } from './hn-effect-sites';
export function modelProvenance(drug: Agent, patient: Patient, choice: PKChoice = defaultChoice) {
  const volatile = drug === 'sevoflurane' || drug === 'desflurane';
  const endpointLinks = HN_EFFECT_SITES.filter(site => site.drug === drug);
  const linkage = volatile || ['ketamine', 'morphine', 'hydromorphone'].includes(drug) ? 'no generic effect site; endpoint-specific composites listed separately' :
    drug === 'dexmedetomidine' ? 'explicit endpoint-specific extension' :
    ['fentanyl','alfentanil','sufentanil'].includes(drug) ? 'generic fixed linkage unresolved' :
    drug === 'midazolam' || (drug === 'propofol' && choice.propofol === 'marsh') ? 'documented composite' : 'source-estimated linkage';
  return { drug, pkVariant: volatile ? 'held ET and Mapleson age MAC' : pk(drug,patient,choice).model,
    pkVersion: PK_VERSION, effectSiteLinkage: linkage, ceVersion: CE_VERSION,
    ceEndpoint: drug === 'rocuronium' ? 'Kleijn raw acceleromyographic T4/T1, rocuronium-alone scenario' : drug === 'dexmedetomidine' ? 'Separate BIS and MOAA/S lags' :
      drug === 'midazolam' ? 'Bührer EEG effect; transferred to Liou procedural-sedation sparing' :
      linkage === 'source-estimated linkage' ? 'Source EEG linkage; endpoint transfer remains separate' : linkage,
    concentrationUnits: drug === 'rocuronium' ? 'umol/L; bromide mg input / 609.70 g/mol' : volatile ? '% v/v end-tidal' : drug === 'propofol' ? 'ug/mL' : 'ng/mL',
    sourceMatrix: drug === 'morphine' ? 'serum; synthetic active-base dose' : drug === 'propofol' && choice.propofol === 'schnider' ? 'original arterial whole-blood assay; source model concentration convention retained' :
      drug === 'midazolam' || drug === 'hydromorphone' ? 'arterial plasma' : volatile ? 'end-tidal gas' : 'source model blood/plasma concentration convention',
    endpointEffectSites: endpointLinks.map(site => ({
      key: site.key, domain: site.domain, endpoint: site.endpoint,
      ke0PerMinute: site.ke0, halfTimeMinutes: site.halfTimeMinutes,
      source: site.source, linkage: site.linkage,
      correction: 'correction' in site ? site.correction : null,
      version: HN_EFFECT_SITE_VERSION,
    })),
    ...(drug === 'midazolam' ? {
      genericEffectSiteSource: 'https://pubmed.ncbi.nlm.nih.gov/2225714/',
      genericEffectSiteKe0PerMinute: MIDAZOLAM_EEG_KE0,
      genericEffectSiteHalfTimeMinutes: MIDAZOLAM_EEG_HALF_TIME_MINUTES,
      linkageSupport: 'Liou 2023 documents Zomorodi PK plus Bührer EEG equilibration. Identity with the TIVA Trainer implementation has not been established.',
    } : {}),
    ...(drug === 'hydromorphone' ? {
      pkParameterSource: 'https://cdn-links.lww.com/permalink/aln/b/aln_2015_10_07_jeleazcov_201409064_sdc1.pdf',
      pkParameterLocation: 'Table S1, reproducing Jeleazcov 2014',
      applicability: patient.age < 40 || patient.age > 81
        ? 'Outside the hydromorphone PK development age range of 40–81 years; extrapolated.'
        : 'Age within development range; postoperative cardiac-surgery PK context.',
    } : {}),
    publishedPDVersion: PUBLISHED_PD_VERSION, hnVersion: HN_VERSION };
}
