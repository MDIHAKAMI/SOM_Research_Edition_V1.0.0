// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { MAC40, MAC_AGE_SLOPE } from '../pd/constants';
export const MODEL_VERSION = '1.0.0';
export type Evidence =
  | 'published'
  | 'approximation'
  | 'experimental'
  | 'not-modeled';
export interface ModelRecord {
  id: string;
  drug: string;
  name: string;
  version: string;
  category: Evidence;
  publication: string;
  doi: string | null;
  pmid: string | null;
  sources: string[];
  population: string;
  ageRange: string;
  weightRange: string;
  compartments: number | null;
  covariates: string[];
  ke0: number | null;
  endpoint: string;
  coefficients: Record<string, number | string>;
  notes: string;
  limitations: string;
  status: 'implemented' | 'TODO';
}
const model = (m: Omit<ModelRecord, 'version'>): ModelRecord => ({
  ...m,
  version: MODEL_VERSION,
});
export const registry: ModelRecord[] = [
  model({
    id: 'schnider-1998-1999',
    drug: 'Propofol',
    name: 'Schnider 1998 / 1999',
    category: 'published',
    publication:
      'Schnider et al. Anesthesiology 1998;88:1170–1182; 1999;90:1502–1516.',
    doi: '10.1097/00000542-199805000-00006',
    pmid: '9605675',
    sources: [
      'https://doi.org/10.1097/00000542-199805000-00006',
      'https://pubmed.ncbi.nlm.nih.gov/10360845/',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC3337375/',
    ],
    population:
      '24 healthy adult volunteers. Equations cross-checked against the published cross-simulation study, Table 1.',
    ageRange: '25–81 years (PK abstract reports 26–81)',
    weightRange: '44–123 kg; height 155–196 cm',
    compartments: 3,
    covariates: ['age', 'weight', 'height', 'sex', 'James lean body mass'],
    ke0: 0.456,
    endpoint:
      'Arterial plasma PK and EEG-linked effect-site equilibration; no consciousness probability implemented.',
    coefficients: {
      V1: 4.27,
      V2: '18.9 − 0.391(age − 53)',
      V3: 238,
      CL: '1.89 + 0.0456(weight − 77) − 0.0681(LBM − 59) + 0.0264(height − 177)',
      Q2: '1.29 − 0.024(age − 53)',
      Q3: 0.836,
      ke0: 0.456,
    },
    notes:
      'Volumes L; clearances L/min; ke0 /min. Propofol amount mg; mg/L = µg/mL. Fixed published ke0, not a pump-specific fixed-time-to-peak implementation.',
    limitations:
      'James LBM can behave paradoxically in obesity. Flags extrapolation beyond source demographics. No organ-function, cardiac-output, or interaction-driven clearance adjustment; not externally validated software.',
    status: 'implemented',
  }),
  model({
    id: 'shafer-scott',
    drug: 'Fentanyl',
    name: 'Shafer PK / Scott ke0',
    category: 'published',
    publication:
      'Shafer et al. Anesthesiology 1990;73:1091–1102. Scott & Stanski. JPET 1987;240:159–166.',
    doi: null,
    pmid: '2248388',
    sources: [
      'https://pubmed.ncbi.nlm.nih.gov/2248388/',
      'https://pubmed.ncbi.nlm.nih.gov/3100765/',
      'https://opentci.org/code/matlab/mandel-fentanyl-shafer-1990',
      'https://github.com/fjflores/Stanpump/blob/master/DRUGS.C',
    ],
    population:
      'Adult surgical PK; rounded OpenTCI parameters cross-checked with STANPUMP microconstants. See source review for rendering and rounding caveats.',
    ageRange: 'Adult; full age range not verified',
    weightRange: '40–90 kg per OpenTCI implementation warning',
    compartments: 3,
    covariates: [],
    ke0: 0.147,
    endpoint: 'Plasma PK; effect compartment uses separately derived EEG ke0.',
    coefficients: {
      V1: 6.09,
      V2: 28.1,
      V3: 228,
      CL: 0.504,
      Q2: 2.87,
      Q3: 1.37,
      ke0: 0.147,
    },
    notes:
      'Amounts µg; µg/L = ng/mL. Fixed volumes and clearances; no invented weight scaling. Separately sourced PK and PD are a literature-derived linkage.',
    limitations:
      '100 kg demo is outside the OpenTCI 40–90 kg reference range. Ce is not a validated concentration for every opioid endpoint. No age PD sensitivity modeled.',
    status: 'implemented',
  }),
  model({
    id: 'hannivoort-2015',
    drug: 'Dexmedetomidine',
    name: 'Hannivoort 2015',
    category: 'published',
    publication: 'Hannivoort et al. Anesthesiology 2015;123:357–367.',
    doi: '10.1097/ALN.0000000000000740',
    pmid: '26068206',
    sources: [
      'https://pubmed.ncbi.nlm.nih.gov/26068206/',
      'https://citeseerx.ist.psu.edu/document?doi=cbe9e6504d10f71d2f6ef383806fe685aeffad57&repid=rep1&type=pdf',
    ],
    population: '18 healthy volunteers, 9 male / 9 female; arterial sampling.',
    ageRange: '20–70 years',
    weightRange: '51–110 kg; BMI 20.6–29.3 kg/m²',
    compartments: 3,
    covariates: ['weight'],
    ke0: null,
    endpoint: 'Plasma PK only.',
    coefficients: {
      V1: 1.78,
      V2: 30.3,
      V3: 52,
      CL: 0.686,
      Q2: 2.98,
      Q3: 0.602,
      referenceWeight: 70,
      volumeExponent: 1,
      clearanceExponent: 0.75,
    },
    notes:
      'All volumes multiplied by weight/70; all clearances by (weight/70)^0.75. µg/L = ng/mL. Loading doses implemented as timed infusions.',
    limitations:
      'No generic dexmedetomidine Ce: endpoint-specific Colin equations/control stream still required. Bolus transients and high concentrations have additional limitations; no cardiovascular model.',
    status: 'implemented',
  }),
  model({
    id: 'mapleson-1996',
    drug: 'Sevoflurane',
    name: 'Mapleson / Nickalls',
    category: 'published',
    publication:
      'Mapleson. BJA 1996;76:179–185; Nickalls & Mapleson. BJA 2003;91:170–174.',
    doi: '10.1093/bja/91.2.170',
    pmid: '12878613',
    sources: [
      'https://pubmed.ncbi.nlm.nih.gov/12878613/',
      'https://doi.org/10.1093/bja/76.2.179',
    ],
    population: 'Meta-analysis; age-related iso-MAC charts.',
    ageRange: 'Charts 5–95 years; this app adult-only',
    weightRange: 'Not a covariate',
    compartments: null,
    covariates: ['age'],
    ke0: null,
    endpoint:
      'Age-adjusted reference MAC exposure, not responsiveness or instantaneous effect.',
    coefficients: {
      MAC40: MAC40.sevoflurane,
      ageSlope: MAC_AGE_SLOPE,
      equation: 'MACage = 1.8 × 10^[−0.00269(age−40)]; exposure = ET / MACage',
    },
    notes:
      'ET entered manually, percent by volume. Held until changed. No nitrous oxide contribution. Ambient pressure not modeled.',
    limitations:
      'MAC40 conventions differ between references. 1.8% is the selected published convention; never silently switch to 2.05%. Age adjustment does not individualize clinical endpoints.',
    status: 'implemented',
  }),
  model({
    id: 'mourisse-2007',
    drug: 'Sevoflurane',
    name: 'Mourisse 2007 · BIS lag',
    category: 'approximation',
    publication: 'Mourisse et al. BJA 2007;98:737–745.',
    doi: '10.1093/bja/aem104',
    pmid: '17519261',
    sources: [
      'https://pubmed.ncbi.nlm.nih.gov/17519261/',
      'https://doi.org/10.1093/bja/aem104',
    ],
    population:
      'Sevoflurane group n=18; distinct BIS and blink-reflex equilibration estimates.',
    ageRange: 'Not fully verified',
    weightRange: 'Not fully verified',
    compartments: 1,
    covariates: [],
    ke0: 0.48,
    endpoint: 'BIS-linked effect-site lag surrogate only.',
    coefficients: {
      ke0: 0.48,
      equation: 'dCe/dt = 0.48(ET − Ce), t in minutes',
    },
    notes:
      'Uses reported BIS geometric-mean ke0, 95% CI 0.38–0.60/min. Exact zero-order-hold solution. Optional and OFF by default; activated per case.',
    limitations:
      'Not measured brain concentration; no full BIS model. Must not substitute into an incision response model. Endpoint and population generalization is an approximation.',
    status: 'implemented',
  }),
  model({
    id: 'vereecke-2013-control',
    drug: 'Sevoflurane + fentanyl',
    name: 'Vereecke 2013 · no N₂O',
    category: 'approximation',
    publication:
      'Vereecke et al. Anesthesiology 2013;118:894–902. Control-group model, Table 1, equations 1–4.',
    doi: '10.1097/ALN.0b013e3182860486',
    pmid: '23360899',
    sources: [
      'https://doi.org/10.1097/ALN.0b013e3182860486',
      'https://scispace.com/pdf/interaction-between-nitrous-oxide-sevoflurane-and-opioids-a-3ayvsm496r.pdf',
    ],
    population:
      'Reanalysis of Japanese ASA I surgical patients; 91 without N₂O. Pseudo steady state after 20 min; measured fentanyl 0–10 ng/mL and sevo 0–4%.',
    ageRange: '20–50 years',
    weightRange: 'Not fully verified',
    compartments: null,
    covariates: [],
    ke0: null,
    endpoint:
      'Tolerance of movement and hemodynamic response to surgical incision only.',
    coefficients: {
      C50FMovement: 2.07,
      C50FHD: 0.43,
      C50SevoMovement: 1.73,
      C50SevoHD: 4.6,
      gammaOpioid: 0.931,
      gamma: 6.4,
      equation:
        'U = (Sevo/C50Sevo) × [1 + (Fentanyl/C50F)^gammaOpioid]; Ptol = U^gamma/(1+U^gamma)',
    },
    notes:
      'Control-group coefficients, not XA column. No age-scaling of response-surface coefficients. Main endpoint gated to pair-only cases, age/range limits and ≥20 min since last pharmacologic change. Model-predicted Cp/ET used as pseudo-equilibrium proxies, hence approximation even within gate.',
    limitations:
      'Not a Saudi validation. Stability timer is an operational approximation, not proof of equilibration. No hypnosis, laryngoscopy, general pain, dexmedetomidine, propofol, or extubation prediction. Research comparator is explicitly counterfactual and excludes other drugs.',
    status: 'implemented',
  }),
  model({
    id: 'eleveld-2018-todo',
    drug: 'Propofol',
    name: 'Eleveld 2018',
    category: 'not-modeled',
    publication: 'Eleveld et al. BJA 2018;120:942–959; corrigendum 121:519.',
    doi: '10.1016/j.bja.2018.01.018',
    pmid: null,
    sources: [
      'https://doi.org/10.1016/j.bja.2018.01.018',
      'https://doi.org/10.1016/j.bja.2018.05.045',
    ],
    population: 'Broad age/weight PK/PD development dataset.',
    ageRange: 'See original supplement',
    weightRange: 'See original supplement',
    compartments: 3,
    covariates: [],
    ke0: null,
    endpoint: 'TODO',
    coefficients: {},
    notes:
      'Author corrigendum recommends the supplementary NONMEM control stream over printed equations. Obtain corrected control stream and reproduce reference cases before activation.',
    limitations: 'Not selectable. No partial Eleveld implementation.',
    status: 'TODO',
  }),
  model({
    id: 'unmodeled-effects',
    drug: 'Multidrug / other endpoints',
    name: 'Pending evidence modules',
    category: 'not-modeled',
    publication:
      'Katoh 1994 MAC-awake; dexmedetomidine–sevoflurane trials; propofol–opioid response-surface literature.',
    doi: null,
    pmid: null,
    sources: [
      'https://pubmed.ncbi.nlm.nih.gov/7946857/',
      'https://pmc.ncbi.nlm.nih.gov/articles/PMC12256778/',
      'https://pubmed.ncbi.nlm.nih.gov/9952144/',
    ],
    population: 'Different populations and endpoints; not interchangeable.',
    ageRange: 'Not applicable',
    weightRange: 'Not applicable',
    compartments: null,
    covariates: [],
    ke0: null,
    endpoint:
      'Responsiveness, laryngoscopy, extubation, dex Ce, multidrug composite.',
    coefficients: {},
    notes:
      'Complete source equation and coefficient set required. Bounded normalized-addition infrastructure exists but no unmatched pairwise endpoints are combined. No live numerical heuristic is activated.',
    limitations:
      'MAC-BAR pneumoperitoneum and movement to incision differ. Discrete reported MAC reductions alone cannot identify a full response probability curve. All unmodeled outputs remain null, never zero.',
    status: 'TODO',
  }),
];
export const modelVersions = Object.fromEntries(
  registry.map((m) => [m.id, m.version]),
);
