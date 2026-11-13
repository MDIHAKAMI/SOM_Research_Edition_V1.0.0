// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  DRUG_IDS,
  greco,
  type Agent,
  type Trace,
  type PKChoice,
} from './pharmacology';
import { PUBLISHED_PD_VERSION, DEFAULT_PD_CONTEXT, type PDContext } from './pd-registry';
import { isActive } from './multimodal';
export interface PairModel {
  id: string;
  drugs: Agent[];
  endpoint: string;
  exposure: string;
  equation: string;
  parameters: Record<string, number>;
  source: string;
  evidenceGrade: string;
  population: string;
  limitations: string;
  executable: boolean;
  version: string;
}
/** Pure published algebra. UI eligibility and source compatibility are enforced separately. */
export function publishedPairProbability(modelId: string, hypnotic: number, opioid: number): number | null {
  const model = PAIR_MODELS.find(p => p.id === modelId && p.executable);
  if (!model || !Number.isFinite(hypnotic) || !Number.isFinite(opioid) || hypnotic < 0 || opioid < 0) return null;
  const c = model.parameters;
  if (modelId.startsWith('sevo-fent')) {
    const u = (hypnotic/c.Sevo50) * (1+(opioid/c.FentScale)**c.exponent);
    return u > 0 ? 1/(1+Math.exp(-c.n*Math.log(u))) : 0;
  }
  return greco(hypnotic,opioid,c.P50,c.R50,c.n,c.alpha);
}
const pair = (v: Omit<PairModel, 'version'>): PairModel => ({
  ...v,
  version: PUBLISHED_PD_VERSION,
});
export const PAIR_MODELS: PairModel[] = [
  pair({
    id: 'prop-remi-h',
    drugs: ['propofol', 'remifentanil'],
    endpoint: 'Unresponsiveness: OAA/S <2 (source 1–5 scale)',
    exposure: 'Schnider propofol Ce µg/mL; Minto remifentanil Ce ng/mL',
    equation: 'U=p/P50+r/R50+alpha*(p/P50)*(r/R50); P=U^n/(1+U^n)',
    parameters: { P50: 2.2, R50: 33.1, n: 5, alpha: 3.6 },
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3050649/',
    evidenceGrade: 'A source',
    population: 'Clinical evaluation n=21; volunteer development',
    limitations:
      'Dynamic transfer and covariates outside source population require evaluation. Source prediction can precede observed LOR.',
    executable: true,
  }),
  pair({
    id: 'prop-remi-airway',
    drugs: ['propofol', 'remifentanil'],
    endpoint: 'Laryngoscopy tolerance',
    exposure: 'Schnider propofol Ce µg/mL; Minto remifentanil Ce ng/mL',
    equation: 'Greco P=U^n/(1+U^n)',
    parameters: { P50: 5.6, R50: 48.9, n: 2.2, alpha: 33.2 },
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC3050649/',
    evidenceGrade: 'A source',
    population: 'Kern 2004 volunteer development n=24',
    limitations:
      'Named stimulus endpoint, not incision or extubation readiness.',
    executable: true,
  }),
  pair({
    id: 'sevo-remi-h',
    drugs: ['sevoflurane', 'remifentanil'],
    endpoint: 'Unresponsiveness: OAA/S <2 (source 1–5 scale)',
    exposure: 'Sevo ET %; Minto remifentanil Ce ng/mL',
    equation: 'Greco P=U^n/(1+U^n)',
    parameters: { P50: 0.78, R50: 50.2, n: 4.4, alpha: 12.4 },
    source: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2888734/',
    evidenceGrade: 'A/B source',
    population: 'Dynamic emergence evaluation n=20',
    limitations:
      'Uses published ET column. Held ET is not volatile brain concentration; no invented age adjustment.',
    executable: true,
  }),
  ...(
    [
      [
        'movement',
        1.73,
        2.07,
        'No purposeful movement within 60 s of incision',
      ],
      ['bar', 4.6, 0.43, 'No HR or SBP increase >15% after incision'],
    ] as const
  ).map(([name, Sevo50, FentScale, endpoint]) =>
    pair({
      id: `sevo-fent-${name}`,
      drugs: ['sevoflurane', 'fentanyl'],
      endpoint,
      exposure: 'Sevo ET %; fentanyl Cp ng/mL',
      equation: 'U=(ET/Sevo50)*(1+(Cp/FentScale)^0.931); P=U^6.4/(1+U^6.4)',
      parameters: { Sevo50, FentScale, exponent: 0.931, n: 6.4 },
      source: 'https://pubmed.ncbi.nlm.nih.gov/23360899/',
      evidenceGrade: 'B conditional',
      population:
        'No-N2O control data, n=91, ASA I Japanese patients, ages 20–50',
      limitations:
        '20-min pseudo-equilibrium; fentanyl Cp 0–10 ng/mL, ET 0–4%; NMB recovered. FentScale is not a standalone fentanyl EC50. Current dynamic use is an extrapolation.',
      executable: true,
    }),
  ),
  ...(
    [
      [
        'prop-sevo',
        ['propofol', 'sevoflurane'],
        'Shake/shout, tetany, LMA, laryngoscopy',
        '19741484',
        'Endpoint C50s recovered; full coefficients and linkage not recovered.',
      ],
      [
        'prop-fent',
        ['propofol', 'fentanyl'],
        'Responsiveness and stimulus endpoints',
        '7943832',
        'Blood/plasma assay matrix and executable coefficients unresolved.',
      ],
      [
        'des-fent',
        ['desflurane', 'fentanyl'],
        'MAC reduction',
        '1729936',
        'Bolus groups and MAC-sparing points do not define a continuous response surface.',
      ],
      [
        'prop-ket',
        ['propofol', 'ketamine'],
        'Loss of consciousness',
        '7879932',
        'Dose-based study (mg/kg at a fixed time), not a concentration response surface.',
      ],
      [
        'sevo-ket',
        ['sevoflurane', 'ketamine'],
        'MAC-BAR at pneumoperitoneum',
        '32981056',
        'Fixed regimens; no general continuous concentration model.',
      ],
      [
        'sevo-dex',
        ['sevoflurane', 'dexmedetomidine'],
        'MAC reduction in older adults',
        '10526824',
        'Fixed Cp study; no generic N50 or arbitrary polynomial interpolation.',
      ],
      [
        'prop-suf',
        ['propofol', 'sufentanil'],
        'Responsiveness / LMA insertion',
        '24843335',
        'Saudi-site LMA study: prop Ce4, suf Ce50 .16; exact suf ke0 unresolved.',
      ],
    ] as const
  ).map(([id, drugs, endpoint, pmid, limitations]) =>
    pair({
      id,
      drugs: [...drugs] as Agent[],
      endpoint,
      exposure: 'See source; not executable',
      equation: 'Not implemented',
      parameters: {},
      source: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      evidenceGrade: 'Literature only',
      population: 'Source-specific; see publication',
      limitations,
      executable: false,
    }),
  ),
];
export function publishedPairs(
  s: Trace,
  choice: PKChoice,
  age: number,
  ctx: PDContext = DEFAULT_PD_CONTEXT,
) {
  const active = DRUG_IDS.filter((d) => isActive(s, d));
  return PAIR_MODELS.filter((m) => m.executable).map((model) => {
    const excluded = active.filter((d) => !model.drugs.includes(d));
    const contextExcluded = [
      ...(ctx.n2oPercent !== null && ctx.n2oPercent > 0
        ? [`N2O ${ctx.n2oPercent}%`]
        : []),
      ...(ctx.spinalBupivacaine === true ? ['Spinal bupivacaine'] : []),
    ];
    const required = model.id.startsWith('sevo-fent')
      ? [s.cp.sevoflurane, s.cp.fentanyl]
      : [
          model.drugs[0] === 'propofol' ? s.ce.propofol! : s.cp.sevoflurane,
          s.ce.remifentanil!,
        ];
    let reason = '',
      probability: number | null = null;
    if (
      !Number.isFinite(age) ||
      required.some((v) => v === null || !Number.isFinite(v) || v < 0)
    )
      reason =
        'Required exposure or age is invalid; no probability calculated.';
    else if (!active.some((d) => model.drugs.includes(d)))
      reason = 'No active exposure represented by this pair.';
    else if (model.id.startsWith('prop-') && choice.propofol !== 'schnider')
      reason = 'Requires Schnider effect site; Marsh is selected.';
    else if (
      model.id.startsWith('sevo-fent') &&
      (ctx.n2oPercent !== 0 ||
        age < 20 ||
        age > 50 ||
        s.cp.fentanyl > 10 ||
        s.cp.sevoflurane > 4 ||
        s.cp.sevoflurane <= 0)
    )
      reason =
        'Requires recorded no-N2O context, age 20–50, fentanyl Cp ≤10 and sevo ET >0 to 4%.';
    else {
      probability = publishedPairProbability(model.id,
        model.drugs[0] === 'propofol' ? s.ce.propofol! : s.cp.sevoflurane,
        model.id.startsWith('sevo-fent') ? s.cp.fentanyl : s.ce.remifentanil!);
      if (
        !Number.isFinite(probability) ||
        probability! < 0 ||
        probability! > 1
      ) {
        probability = null;
        reason = 'Required exposure is invalid.';
      }
    }
    return {
      modelId: model.id,
      version: model.version,
      endpoint: model.endpoint,
      probability,
      excluded,
      contextExcluded,
      reason,
      interpretation:
        excluded.length || contextExcluded.length
          ? 'Pair subset reference; additional drugs or recorded background interventions are excluded.'
          : 'Named pair reference; source and dynamic limitations apply.',
      evidenceGrade: model.evidenceGrade,
      source: model.source,
      exposure: model.exposure,
      parameters: { ...model.parameters },
      input: Object.fromEntries(
        model.drugs.map((d) => [
          d,
          { Cp: s.cp[d], Ce: Number.isFinite(s.ce[d]) ? s.ce[d] : null },
        ]),
      ),
      limitations: model.limitations,
    };
  });
}
