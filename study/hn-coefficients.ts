// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/** H/N 3.0: constructed research scores, separate from published endpoint probabilities.
 * All coefficients are traceable coordinates or explicit approximations, not dosing targets.
 * The runtime and exported metadata share this single registry.
 */
import type { Agent } from './pharmacology';
export type TailPolicy = 'exponential' | 'hold' | 'linear';
export const DEFAULT_TAIL_POLICY: TailPolicy = 'exponential';
export type ExposureBinding = 'Cp' | 'Ce' | 'ET' | 'MAC' | 'none' |
  'ketamineHypnosis' | 'sufentanilHypnosis' | 'morphineThermal' | 'hydromorphoneThermal';
export interface CoefficientSpec {
  function_type: 'zero' | 'linear' | 'hill' | 'piecewise_linear_exponential_tail' | 'separate_reference_curve' | 'pooled_opioid';
  expression: string;
  expression_latex: string;
  exposure_basis: string;
  unit: string;
  source_ids: string[];
  parameters: Record<string, number>;
  knots: [number, number][];
  status: 'candidate' | 'deliberate_omission' | 'structural_zero';
  assumptions: string[];
  binding: ExposureBinding;
}
export interface DrugCoefficients {
  H: CoefficientSpec;
  N: CoefficientSpec;
  derivation: string;
  implementationBinding: string;
  evidenceSummary: string;
}
export interface HNSource {
  id: string;
  pmid?: string;
  doi?: string;
  url: string;
  study: string;
  endpoint?: string;
  population?: string;
}
export const REFERENCE_CURVE = {
  "expression": "S_F(x)=Emax*x/(K+x)",
  "Emax": 0.8670718232044199,
  "K": 1.4088397790055254,
  "gamma": 1,
  "reference_divisor": 0.59,
  "source_id": "katoh1998",
  "points": [
    [
      3,
      0.59
    ],
    [
      10,
      0.76
    ]
  ],
  "derivation": "Fit two rounded abstract points with Hill exponent fixed to 1. Interpret further 17% reduction as 17 percentage points, giving 76% total reduction. Recover full source equation before claiming reproduction of its full curve. Emax and K are investigator-derived."
} as const;
export const HN_MODEL_ASSUMPTIONS: string[] = [
  "Sparing observed with a reference anesthetic is retained as an independent drug credit when that anesthetic is absent.",
  "Equivalent opioid concentrations from selected endpoints share the fentanyl reference curve; single-point ratios do not establish equal shapes or maxima.",
  "Different domains and source populations are transported to a common score; averaging is not a meta-analysis.",
  "Different drug classes add on the chosen credit scale; unmodelled synergy and antagonism remain possible.",
  "The ketamine term uses a fentanyl-shaped MAC-saving function after an electrical-pain equivalence conversion. This is a major structural hypothesis.",
  "Linear direct-anchor terms are score coordinates, not linear biological concentration-response relationships.",
  "No clinical threshold, BIS mapping, probability of response, or dosing recommendation is established."
];
export const HN_SOURCES: Record<string, HNSource> = {
  "kuizenga2019": {
    "id": "kuizenga2019",
    "pmid": "31567365",
    "doi": "10.1097/ALN.0000000000002966",
    "url": "https://pubmed.ncbi.nlm.nih.gov/31567365/",
    "endpoint": "Tolerance to shake and shout, 50% probability",
    "study": "Kuizenga et al., 2019"
  },
  "chortkoff1995": {
    "id": "chortkoff1995",
    "pmid": "7574003",
    "doi": "10.1097/00000539-199510000-00014",
    "url": "https://pubmed.ncbi.nlm.nih.gov/7574003/",
    "study": "Chortkoff et al. 1995"
  },
  "mertens2003": {
    "id": "mertens2003",
    "pmid": "12883407",
    "doi": "10.1097/00000542-200308000-00016",
    "url": "https://pubmed.ncbi.nlm.nih.gov/12883407/",
    "study": "Mertens et al. 2003"
  },
  "kazama1997": {
    "id": "kazama1997",
    "pmid": "9286884",
    "doi": "10.1097/00000542-199708000-00007",
    "url": "https://pubmed.ncbi.nlm.nih.gov/9286884/",
    "endpoint": "Loss of response to command",
    "study": "Kazama et al., 1997"
  },
  "katoh1998": {
    "id": "katoh1998",
    "pmid": "9447851",
    "doi": "10.1097/00000542-199801000-00006",
    "url": "https://pubmed.ncbi.nlm.nih.gov/9447851/",
    "endpoint": "Sevoflurane MAC-awake (command response) and incision MAC (movement); distinct H and N endpoints",
    "study": "Katoh and Ikeda, 1998"
  },
  "ryu2018": {
    "id": "ryu2018",
    "pmid": "30336856",
    "doi": "10.1016/j.bja.2018.05.064",
    "url": "https://pubmed.ncbi.nlm.nih.gov/30336856/",
    "study": "Ryu et al. 2018"
  },
  "schuller2015": {
    "id": "schuller2015",
    "pmid": "26174308",
    "doi": "10.1093/bja/aev072",
    "url": "https://pubmed.ncbi.nlm.nih.gov/26174308/",
    "study": "Schuller et al. 2015"
  },
  "lang1996": {
    "id": "lang1996",
    "pmid": "8873541",
    "doi": "10.1097/00000542-199610000-00006",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8873541/",
    "endpoint": "50% reduction of isoflurane MAC for incision movement",
    "study": "Lang et al., 1996"
  },
  "vuyk1996": {
    "id": "vuyk1996",
    "pmid": "8602658",
    "doi": "10.1097/00000542-199602000-00006",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8602658/",
    "endpoint": "Loss of consciousness, 50% probability",
    "study": "Vuyk et al., 1996"
  },
  "mcewan1993": {
    "id": "mcewan1993",
    "pmid": "8489058",
    "doi": "10.1097/00000542-199305000-00009",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8489058/",
    "endpoint": "50% reduction of isoflurane MAC for incision movement",
    "study": "McEwan et al., 1993"
  },
  "brunner1994": {
    "id": "brunner1994",
    "pmid": "8110548",
    "doi": "10.1093/bja/72.1.42",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8110548/",
    "endpoint": "50% reduction of isoflurane MAC for incision movement",
    "study": "Brunner et al., 1994"
  },
  "westmoreland1994": {
    "id": "westmoreland1994",
    "pmid": "8267175",
    "doi": "10.1213/00000539-199401000-00006",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8267175/",
    "endpoint": "50% reduction in isoflurane MAC for skin-incision movement.",
    "study": "Westmoreland et al., 1994"
  },
  "glass1993": {
    "id": "glass1993",
    "pmid": "8489055",
    "doi": "10.1097/00000542-199305000-00006",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8489055/",
    "endpoint": "No movement at skin incision, with 70% nitrous oxide.",
    "study": "Glass et al., 1993"
  },
  "liou2023": {
    "id": "liou2023",
    "pmid": "36647160",
    "doi": "10.1186/s40360-023-00642-5",
    "url": "https://link.springer.com/article/10.1186/s40360-023-00642-5",
    "endpoint": "95% modeled probability of MOAA/S < 4 during procedural sedation.",
    "study": "Liou et al. 2023"
  },
  "schulte2005": {
    "id": "schulte2005",
    "pmid": "15982813",
    "doi": "10.1016/j.pain.2005.05.005",
    "url": "https://pubmed.ncbi.nlm.nih.gov/15982813/",
    "endpoint": "Mechanical pain threshold and secondary hyperalgesia in experimental cutaneous pain; not a universal opioid endpoint.",
    "study": "Schulte et al. 2005"
  },
  "olofsen2026": {
    "id": "olofsen2026",
    "pmid": "41656122",
    "doi": "10.1016/j.bja.2025.11.060",
    "url": "https://pubmed.ncbi.nlm.nih.gov/41656122/",
    "endpoint": "Thermal limit: maximally tolerated temperature.",
    "study": "Olofsen et al. 2026"
  },
  "olofsen2026corrigendum": {
    "id": "olofsen2026corrigendum",
    "pmid": "42150960",
    "doi": "10.1016/j.bja.2026.04.044",
    "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC13370836/",
    "endpoint": "Correction.",
    "study": "Olofsen et al. 2026, corrigendum"
  },
  "katoh1993": {
    "id": "katoh1993",
    "pmid": "8403176",
    "doi": "10.1007/BF03009252",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8403176/",
    "endpoint": "Sevoflurane awakening / eye opening to verbal command.",
    "study": "Katoh et al. 1993"
  },
  "zacny1996": {
    "id": "zacny1996",
    "pmid": "8951965",
    "doi": "10.1016/s0091-3057(96)00082-2",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8951965/",
    "endpoint": "Cold-pressor analgesia with fentanyl.",
    "study": "Zacny et al. 1996"
  },
  "gilliland1996": {
    "id": "gilliland1996",
    "pmid": "8882238",
    "doi": "10.1111/j.1365-2044.1996.tb12605.x",
    "url": "https://pubmed.ncbi.nlm.nih.gov/8882238/",
    "endpoint": "Postoperative morphine consumption, not instantaneous nociceptive tolerance.",
    "study": "Gilliland et al. 1996"
  },
  "xiong2019": {
    "id": "xiong2019",
    "pmid": "30406275",
    "doi": "10.1007/s00101-018-0506-6",
    "url": "https://pubmed.ncbi.nlm.nih.gov/30406275/",
    "endpoint": "Propofol sparing at dexmedetomidine target concentrations",
    "study": "Xiong et al. 2019"
  },
  "fragen1999": {
    "id": "fragen1999",
    "pmid": "10526824",
    "doi": "10.1016/S0952-8180(99)00081-1",
    "url": "https://pubmed.ncbi.nlm.nih.gov/10526824/",
    "endpoint": "Dexmedetomidine plasma concentration and sevoflurane incision MAC",
    "study": "Fragen and Fitzgerald 1999"
  },
  "tucker2005": {
    "id": "tucker2005",
    "pmid": "15804361",
    "doi": "10.1186/1471-2253-5-2",
    "url": "https://pubmed.ncbi.nlm.nih.gov/15804361/",
    "endpoint": "Ketamine/fentanyl electrical pain tolerance; digitized group means",
    "study": "Tucker et al. 2005"
  },
  "sleigh2019": {
    "id": "sleigh2019",
    "pmid": "31492526",
    "doi": "10.1016/j.bja.2019.07.021",
    "url": "https://pubmed.ncbi.nlm.nih.gov/31492526/",
    "endpoint": "Ketamine slow waves and loss of behavioural responsiveness",
    "study": "Sleigh et al. 2019"
  },
  "nct02853864": {
    "id": "nct02853864",
    "url": "https://clinicaltrials.gov/study/NCT02853864",
    "study": "ClinicalTrials.gov registration NCT02853864"
  },
  "devalence2018": {
    "id": "devalence2018",
    "pmid": "29098683",
    "doi": "10.1111/anae.14102",
    "url": "https://archive-ouverte.unige.ch/unige:188161",
    "study": "de Valence et al. 2018, Effect of sufentanil on bispectral index in the elderly",
    "endpoint": "Loss of consciousness, OAA/S <2",
    "population": "71 patients aged 65 years or older"
  }
};
export const HN_COEFFICIENTS: Record<Agent, DrugCoefficients> = {
  "propofol": {
    "H": {
      "function_type": "linear",
      "expression": "Cp / 1.85",
      "expression_latex": "Cp / 1.85",
      "exposure_basis": "model-predicted Cp",
      "unit": "microgram/mL",
      "source_ids": [
        "kuizenga2019"
      ],
      "parameters": {
        "coefficient": 0.5405405405405405,
        "anchor": 1.85
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [],
      "binding": "Cp"
    },
    "N": {
      "function_type": "linear",
      "expression": "0.0783555421986 Cp",
      "expression_latex": "0.0783555421986 Cp",
      "exposure_basis": "source arterial-blood concentration; model-predicted Cp",
      "unit": "microgram/mL",
      "source_ids": [
        "mertens2003",
        "lang1996",
        "mcewan1993",
        "katoh1998"
      ],
      "parameters": {
        "coefficient": 0.07835554219862577,
        "raw_sparing_coefficient": 0.0462297698971892
      },
      "knots": [],
      "status": "candidate",
      "assumptions": ["Mertens reports arterial-blood concentrations; a separated-plasma assay was not established in the inspected source. Predicted Cp follows the selected PK model's assay convention; transfer between conventions is not source-matched reproduction."],
      "binding": "Cp"
    },
    "derivation": "H: reciprocal of the 1.85 microgram/mL shake/shout reference. N: [S_F(qR*4.4)-S_F(qR*1.2)]/(7.3-2)/0.59. This preserves one intubation trade-off between propofol and remifentanil.",
    "implementationBinding": "Model-predicted Cp is used as the declared score coordinate. Schnider retains its arterial whole-blood convention. For N, the Mertens source reports arterial-blood concentrations; a separated-plasma assay was not established, so transfer across assay conventions remains an assumption. Rapid bolus Cp is not instantaneous brain effect.",
    "evidenceSummary": "H direct normalization; N cross-endpoint interaction transfer"
  },
  "sevoflurane": {
    "H": {
      "function_type": "linear",
      "expression": "ET / 0.90",
      "expression_latex": "ET / 0.90",
      "exposure_basis": "end tidal",
      "unit": "vol%",
      "source_ids": [
        "kuizenga2019"
      ],
      "parameters": {
        "coefficient": 1.1111111111111112,
        "anchor": 0.9
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [],
      "binding": "ET"
    },
    "N": {
      "function_type": "linear",
      "expression": "MAC_fraction / 0.59",
      "expression_latex": "MAC_fraction / 0.59",
      "exposure_basis": "own age-adjusted MAC fraction",
      "unit": "MAC fraction",
      "source_ids": [
        "katoh1998"
      ],
      "parameters": {
        "coefficient": 1.6949152542372883
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [],
      "binding": "MAC"
    },
    "derivation": "H: reciprocal of 0.90 vol% shake/shout reference. N: fentanyl 3 ng/mL displaced 0.59 of sevoflurane incision MAC; one MAC therefore contributes 1/0.59 points.",
    "implementationBinding": "H uses held end-tidal vol%; N uses own age-adjusted MAC: MAC40 × 10^(−0.00269 × (age−40)). Held ET is not instantaneous brain exposure.",
    "evidenceSummary": "H direct normalization; N MAC-sparing normalization"
  },
  "desflurane": {
    "H": {
      "function_type": "linear",
      "expression": "ET * (2.69/2.60) / 1.85",
      "expression_latex": "ET * (2.69/2.60) / 1.85",
      "exposure_basis": "end tidal",
      "unit": "vol%",
      "source_ids": [
        "chortkoff1995",
        "kuizenga2019"
      ],
      "parameters": {
        "coefficient": 0.5592515592515591
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [],
      "binding": "ET"
    },
    "N": {
      "function_type": "linear",
      "expression": "MAC_fraction / 0.59",
      "expression_latex": "MAC_fraction / 0.59",
      "exposure_basis": "own age-adjusted MAC fraction",
      "unit": "MAC fraction",
      "source_ids": [
        "katoh1998",
        "ryu2018"
      ],
      "parameters": {
        "coefficient": 1.6949152542372883
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Same movement-endpoint credit per MAC as sevoflurane is imputed, not demonstrated for autonomic responses."
      ],
      "binding": "MAC"
    },
    "derivation": "H: matched awakening propofol 2.69 microgram/mL / desflurane 2.60 vol%, then divide by the propofol 1.85 anchor. N: sevoflurane coefficient transported at equal MAC.",
    "implementationBinding": "H uses held end-tidal vol%; N uses own age-adjusted MAC. Equal-MAC credit is transported from sevoflurane.",
    "evidenceSummary": "H awakening-to-responsiveness transfer; N imputation"
  },
  "fentanyl": {
    "H": {
      "function_type": "piecewise_linear_exponential_tail",
      "expression": "f(C; knots)",
      "expression_latex": "f(C; knots)",
      "exposure_basis": "measured equilibrated plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "kazama1997",
        "katoh1998"
      ],
      "parameters": {
        "tail_asymptote": 1
      },
      "knots": [
        [
          0,
          0
        ],
        [
          1,
          0.095
        ],
        [
          3,
          0.205
        ]
      ],
      "status": "candidate",
      "assumptions": [],
      "binding": "Cp"
    },
    "N": {
      "function_type": "pooled_opioid",
      "expression": "q = 1; N_i = (q C / O) S_F(O) / 0.59",
      "expression_latex": "q = 1; N_i = (q C / O) S_F(O) / 0.59",
      "exposure_basis": "measured equilibrated plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "katoh1998"
      ],
      "parameters": {
        "q": 1
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Pooling assumes opioid concentration additivity on a transported common coordinate."
      ],
      "binding": "Cp"
    },
    "derivation": "H: propofol requirement reductions 0.11 and 0.17 at fentanyl 1 and 3 ng/mL; sevoflurane reduction 0.24 at 3. Interpolate the sevoflurane reduction at 1 as 0.08, then equal-background means give 0.095 and 0.205. N: reference coordinate q=1.",
    "implementationBinding": "Selected parent PK supplies Cp. Equilibrium source evidence is transferred to a changing plasma trajectory; no generic effect-site delay is inferred.",
    "evidenceSummary": "H averaged background-specific sparing; N reference curve"
  },
  "remifentanil": {
    "H": {
      "function_type": "piecewise_linear_exponential_tail",
      "expression": "f(C; knots)",
      "expression_latex": "f(C; knots)",
      "exposure_basis": "Minto target effect site Ce",
      "unit": "ng/mL",
      "source_ids": [
        "kuizenga2019"
      ],
      "parameters": {
        "tail_asymptote": 1
      },
      "knots": [
        [
          0,
          0
        ],
        [
          2,
          0.272
        ],
        [
          4,
          0.38974
        ]
      ],
      "status": "candidate",
      "assumptions": [],
      "binding": "Ce"
    },
    "N": {
      "function_type": "pooled_opioid",
      "expression": "q = 1.21897810219; N_i = (q C / O) S_F(O) / 0.59",
      "expression_latex": "q = 1.21897810219; N_i = (q C / O) S_F(O) / 0.59",
      "exposure_basis": "source whole blood / equilibrated remifentanil concentration",
      "unit": "ng/mL",
      "source_ids": [
        "mcewan1993",
        "lang1996"
      ],
      "parameters": {
        "q": 1.218978102189781
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Whole-blood-to-plasma and isoflurane-to-sevoflurane transfer are assumed.",
        "Predicted Minto Ce is used for the dynamic trajectory; source whole-blood equilibrium measurements do not establish this dynamic substitution."
      ],
      "binding": "Ce"
    },
    "derivation": "H: equal means of propofol/sevoflurane requirement savings, 0.28/0.264 at Ce2 and 0.51548/0.264 at Ce4. N: fentanyl 1.67 and remifentanil 1.37 ng/mL each halved isoflurane MAC in different studies; q=1.67/1.37.",
    "implementationBinding": "Minto Ce feeds H and N. The N bridge from equilibrium whole-blood studies to predicted effect-site concentration is an explicit dynamic transfer.",
    "evidenceSummary": "H published interaction model; N cross-study concentration bridge"
  },
  "alfentanil": {
    "H": {
      "function_type": "piecewise_linear_exponential_tail",
      "expression": "f(C; knots)",
      "expression_latex": "f(C; knots)",
      "exposure_basis": "measured plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "vuyk1996"
      ],
      "parameters": {
        "tail_asymptote": 1
      },
      "knots": [
        [
          0,
          0
        ],
        [
          500,
          0.5718232044198895
        ]
      ],
      "status": "candidate",
      "assumptions": [],
      "binding": "Cp"
    },
    "N": {
      "function_type": "pooled_opioid",
      "expression": "q = 0.0172413793103; N_i = (q C / O) S_F(O) / 0.59",
      "expression_latex": "q = 0.0172413793103; N_i = (q C / O) S_F(O) / 0.59",
      "exposure_basis": "measured equilibrated plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "westmoreland1994",
        "glass1993"
      ],
      "parameters": {
        "q": 0.017241379310344827
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Published rounded ratio 58 retained; 57.6 is a sensitivity alternative."
      ],
      "binding": "Cp"
    },
    "derivation": "H: (3.62-1.55)/3.62 = 0.571823 at alfentanil 500 ng/mL. Only one nonzero point is recovered. N: direct same-study reported alfentanil:fentanyl concentration ratio 58:1, so q=1/58.",
    "implementationBinding": "Selected parent PK supplies Cp. The H curve is a single-point secant and an assumed continuation.",
    "evidenceSummary": "H sparse concentration-sparing evidence; N direct but imprecise ratio"
  },
  "sufentanil": {
    "H": {
      "function_type": "piecewise_linear_exponential_tail",
      "expression": "f(C; knots)",
      "expression_latex": "f(C; knots)",
      "exposure_basis": "dedicated predicted hypnosis Ce; equilibrium effect-site target in source",
      "unit": "ng/mL",
      "source_ids": [
        "devalence2018"
      ],
      "parameters": {
        "tail_asymptote": 1
      },
      "knots": [
        [
          0,
          0
        ],
        [
          0.3,
          0.32
        ]
      ],
      "status": "candidate",
      "assumptions": [
        "Fractional saving (2.5−1.7)/2.5≈0.32 is derived from rounded group means at one concentration in patients aged at least 65 years.",
        "Transport to other ages and the dynamic link are investigator-selected approximations."
      ],
      "binding": "sufentanilHypnosis"
    },
    "N": {
      "function_type": "pooled_opioid",
      "expression": "q = 11.5172413793; N_i = (q C / O) S_F(O) / 0.59",
      "expression_latex": "q = 11.5172413793; N_i = (q C / O) S_F(O) / 0.59",
      "exposure_basis": "measured equilibrated plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "mcewan1993",
        "brunner1994"
      ],
      "parameters": {
        "q": 11.517241379310345
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Cross-study potency and isoflurane-to-sevoflurane transfer."
      ],
      "binding": "Cp"
    },
    "derivation": "H: de Valence et al. 2018, sufentanil effect-site target 0.3 ng/mL, propofol Ce at loss of consciousness 2.5 without versus 1.7 µg/mL with sufentanil; (2.5−1.7)/2.5≈0.32 from rounded means. One equilibrium point, elderly population. N: unchanged q=1.67/0.145 from concentrations halving isoflurane MAC.",
    "implementationBinding": "H uses a dedicated hypnosis effect compartment: selected PK plus ke0=0.11/min as a declared composite. The de Valence equilibrium target identifies Ce but does not estimate this delay. N uses parent Cp.",
    "evidenceSummary": "H one-point effect-site sparing calibration; N cross-study concentration bridge"
  },
  "morphine": {
    "H": {
      "function_type": "zero",
      "expression": "0",
      "expression_latex": "0",
      "exposure_basis": "none",
      "unit": "none",
      "source_ids": [
        "katoh1993"
      ],
      "parameters": {
        "coefficient": 0
      },
      "knots": [],
      "status": "deliberate_omission",
      "assumptions": [
        "Omitted H term; this does not mean morphine lacks sedation."
      ],
      "binding": "none"
    },
    "N": {
      "function_type": "pooled_opioid",
      "expression": "q = 0.0402298850575; N_i = (q C / O) S_F(O) / 0.59",
      "expression_latex": "q = 0.0402298850575; N_i = (q C / O) S_F(O) / 0.59",
      "exposure_basis": "steady-state parent plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "schulte2005",
        "westmoreland1994"
      ],
      "parameters": {
        "q": 0.040229885057471264
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Cutaneous hyperalgesia equivalence transferred to MAC; parent-only credit excludes M6G.",
        "Thermal effect-site delay is applied to a parent-plasma equivalence under an explicit equilibrium-to-dynamic transfer."
      ],
      "binding": "morphineThermal"
    },
    "derivation": "N: morphine 30 ng/mL approximately matched alfentanil 70 ng/mL in an experimental pain study; q=(70/30)/58 = 0.0402299. Source morphine 15 ng/mL did not show a detected effect, so a positive linear coordinate below 30 is an assumption.",
    "implementationBinding": "N uses a dedicated thermal effect compartment with ln(2)/42.6 min−1 applied to the selected parent PK. Transferring steady-state hyperalgesia equivalence to this dynamic thermal coordinate is exploratory. M6G is not included.",
    "evidenceSummary": "Multi-source and cross-endpoint approximation"
  },
  "hydromorphone": {
    "H": {
      "function_type": "zero",
      "expression": "0",
      "expression_latex": "0",
      "exposure_basis": "none",
      "unit": "none",
      "source_ids": [
        "olofsen2026"
      ],
      "parameters": {
        "coefficient": 0
      },
      "knots": [],
      "status": "deliberate_omission",
      "assumptions": [
        "Omitted H term; this does not mean hydromorphone lacks sedation."
      ],
      "binding": "none"
    },
    "N": {
      "function_type": "pooled_opioid",
      "expression": "q = 0.42881400209; N_i = (q C / O) S_F(O) / 0.59",
      "expression_latex": "q = 0.42881400209; N_i = (q C / O) S_F(O) / 0.59",
      "exposure_basis": "thermal-effect-site potency coordinate at equilibrium",
      "unit": "ng/mL",
      "source_ids": [
        "olofsen2026",
        "olofsen2026corrigendum",
        "schulte2005",
        "westmoreland1994"
      ],
      "parameters": {
        "q": 0.4288140020898641
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Thermal tolerance to hyperalgesia to MAC transport; effect-site/plasma bridge assumes equilibrium."
      ],
      "binding": "hydromorphoneThermal"
    },
    "derivation": "N: morphine/hydromorphone thermal potency ratio 46.9/4.4, multiplied by morphine q: q=0.428814. These are thermal-limit potency parameters, not generic EC50 values. The corrigendum does not change these two potency values.",
    "implementationBinding": "Jeleazcov PK plus a separate thermal link ln(2)/45 min−1 supplies N. This is a declared composite and a transfer across thermal, hyperalgesia and MAC endpoints.",
    "evidenceSummary": "Longest concentration/endpoint transfer chain; provisional"
  },
  "ketamine": {
    "H": {
      "function_type": "linear",
      "expression": "Ce / 1640",
      "expression_latex": "Ce / 1640",
      "exposure_basis": "model-estimated effect site using a slow-wave-fitted link, evaluated at loss of behavioural responsiveness",
      "unit": "ng/mL",
      "source_ids": [
        "sleigh2019"
      ],
      "parameters": {
        "coefficient": 0.0006097560975609756,
        "anchor": 1640,
        "candidate_equilibration_half_time_s": 23,
        "candidate_ke0_per_min": 1.8082100362433353
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "1640 is mean estimated Ce at loss of response, not a fitted population EC50.",
        "The 23-second equilibration half-time was fitted to slow-wave activity, not independently validated as a behavioural-response ke0."
      ],
      "binding": "ketamineHypnosis"
    },
    "N": {
      "function_type": "separate_reference_curve",
      "expression": "S_F(0.0135124133066 Cp) / 0.59",
      "expression_latex": "S_F(0.0135124133066 Cp) / 0.59",
      "exposure_basis": "measured serum in source; parent Cp proxy proposed",
      "unit": "ng/mL",
      "source_ids": [
        "tucker2005",
        "katoh1998"
      ],
      "parameters": {
        "q": 0.013512413306556628
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Electrical-pain equivalence transported through a fentanyl MAC-sparing curve; same maximum/shape is imposed, not measured for ketamine."
      ],
      "binding": "Cp"
    },
    "derivation": "H: inverse of mean Ce 1.64 microgram/mL at loss of behavioural responsiveness. N: digitized monotherapy group means give slopes betaF=0.141335486 and betaK=0.00190978350; qK=betaK/betaF=0.0135124. Zero-intercept fit is a local approximation. Placebo-adjusted qK=0.0126856 is sensitivity only.",
    "implementationBinding": "H uses the selected parent PK plus an EEG slow-wave-derived effect link ln(2)/(23/60) min−1. This composite is not an independently established behavioural-response model. N uses parent Cp as a serum proxy.",
    "evidenceSummary": "H direct behavioural anchor with composite-link decision; N digitized cross-endpoint approximation"
  },
  "dexmedetomidine": {
    "H": {
      "function_type": "piecewise_linear_exponential_tail",
      "expression": "f(C; knots)",
      "expression_latex": "f(C; knots)",
      "exposure_basis": "predicted plasma Cp; supported by trial registration and analytical definitions",
      "unit": "ng/mL",
      "source_ids": [
        "xiong2019",
        "nct02853864"
      ],
      "parameters": {
        "tail_asymptote": 1
      },
      "knots": [
        [
          0,
          0
        ],
        [
          0.4,
          0.1711801407141909
        ],
        [
          0.6,
          0.28664353037112894
        ],
        [
          0.8,
          0.38721055925357
        ]
      ],
      "status": "candidate",
      "assumptions": [
        "One Protocol paragraph says effect-site, unlike the abstract, equations and official trial registration. Source dexmedetomidine PK parameters remain unreported."
      ],
      "binding": "Cp"
    },
    "N": {
      "function_type": "piecewise_linear_exponential_tail",
      "expression": "S_D(Cp) / 0.59",
      "expression_latex": "S_D(Cp) / 0.59",
      "exposure_basis": "measured plasma Cp",
      "unit": "ng/mL",
      "source_ids": [
        "fragen1999"
      ],
      "parameters": {
        "tail_asymptote": 1,
        "output_divisor": 0.59
      },
      "knots": [
        [
          0,
          0
        ],
        [
          0.39,
          0.027322404371584723
        ],
        [
          0.7,
          0.1748633879781421
        ]
      ],
      "status": "candidate",
      "assumptions": [
        "Curve returns raw MAC saving S_D; divide by 0.59 to obtain N. The low-concentration arm was not significantly different from control."
      ],
      "binding": "Cp"
    },
    "derivation": "H: calculate (control propofol Ce - with-dex Ce)/control separately for men and women, then average equally at dex 0.4, 0.6, 0.8. N: sevoflurane MAC fell from 1.83 to 1.78 and 1.51 vol% at measured dex Cp0.39 and 0.70; fractional savings are 0.0273224 and 0.1748634.",
    "implementationBinding": "H and N use predicted Cp. H source target plasma is supported by registration NCT02853864, but the source PK parameter set was unreported. Do not substitute Colin Ce.",
    "evidenceSummary": "Concentration-sparing evidence; N stimulus tolerance, not demonstrated general analgesia"
  },
  "midazolam": {
    "H": {
      "function_type": "hill",
      "expression": "Ce^1.25541341094 / (17.3438493092^1.25541341094 + Ce^1.25541341094)",
      "expression_latex": "Ce^1.25541341094 / (17.3438493092^1.25541341094 + Ce^1.25541341094)",
      "exposure_basis": "source-compatible effect site Ce",
      "unit": "ng/mL",
      "source_ids": [
        "liou2023"
      ],
      "parameters": {
        "Emax": 1,
        "K": 17.343849309184137,
        "gamma": 1.255413410942482
      },
      "knots": [],
      "status": "candidate",
      "assumptions": [
        "Emax=1 imposed; moderate-sedation sparing is transferred to H."
      ],
      "binding": "Ce"
    },
    "N": {
      "function_type": "zero",
      "expression": "0",
      "expression_latex": "0",
      "exposure_basis": "none",
      "unit": "none",
      "source_ids": [
        "zacny1996",
        "gilliland1996"
      ],
      "parameters": {
        "coefficient": 0
      },
      "knots": [],
      "status": "deliberate_omission",
      "assumptions": [
        "No instantaneous N map selected; postoperative opioid saving is not a concentration-response coefficient."
      ],
      "binding": "none"
    },
    "derivation": "H: published simulated propofol requirements 1.59, 0.70, 0.32 microgram/mL at midazolam Ce0,21,52 give savings 0.559748 and 0.798742. Fit a two-parameter Hill curve exactly with Emax fixed to 1; gamma=1.25541341 and K=17.3438493. K is half of the assumed sparing ceiling, not a clinical midazolam EC50.",
    "implementationBinding": "Zomorodi PK plus Bührer EEG link (equilibration half-time 4.8 min) supplies Ce. H is a new fit to two published model-predicted sparing points.",
    "evidenceSummary": "New fit to published model predictions, not independent patient validation"
  },
  "rocuronium": {
    "H": {
      "function_type": "zero",
      "expression": "0",
      "expression_latex": "0",
      "exposure_basis": "none",
      "unit": "none",
      "source_ids": [
        "schuller2015"
      ],
      "parameters": {
        "coefficient": 0
      },
      "knots": [],
      "status": "structural_zero",
      "assumptions": [
        "Neuromuscular blockade receives no hypnosis credit."
      ],
      "binding": "none"
    },
    "N": {
      "function_type": "zero",
      "expression": "0",
      "expression_latex": "0",
      "exposure_basis": "none",
      "unit": "none",
      "source_ids": [
        "schuller2015"
      ],
      "parameters": {
        "coefficient": 0
      },
      "knots": [],
      "status": "structural_zero",
      "assumptions": [
        "Neuromuscular blockade receives no antinociception credit."
      ],
      "binding": "none"
    },
    "derivation": "Both coefficients are structurally zero. Keep the rocuronium/TOF model separate; immobility from paralysis cannot be credited as H or N.",
    "implementationBinding": "Neuromuscular output remains separate from H and N.",
    "evidenceSummary": "Structural domain separation"
  }
};
