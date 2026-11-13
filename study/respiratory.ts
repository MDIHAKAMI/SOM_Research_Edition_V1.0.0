// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { DRUG_IDS, type Agent, type PKChoice, type Trace } from './pharmacology';

/** Independent from H/N and the existing responsiveness/airway models. */
export const RESPIRATORY_VERSION = 'som-respiratory-exploratory-1.0.0';
export const RESPIRATORY_SOURCE = 'https://doi.org/10.1097/ALN.0b013e31825fb1b2';
export const RESPIRATORY_LABEL =
  'Exploratory respiratory compromise · propofol/remifentanil';
export const RESPIRATORY_PARAMETERS = Object.freeze({
  propofolCe50UgMl: 4.3,
  remifentanilCe50NgMl: 6.7,
  alpha: 9.7,
  gamma: 2,
});

export interface RespiratoryContext {
  knownLiverDisease?: boolean;
  knownKidneyDisease?: boolean;
  osa?: boolean;
  bmi?: number;
}

export interface RespiratoryEstimate {
  probability: number | null;
  status: string;
  excluded: Agent[];
  note: string;
  source: string;
  adapted: boolean;
}

/**
 * LaPierre2012 categorical Greco surface: z=p+r+alpha*p*r;
 * P=z^gamma/(1+z^gamma), p=propofol Ce[µg/mL]/4.3,
 * r=remifentanil Ce[ng/mL]/6.7. Output is a fraction, not percent.
 * Endpoint: RR<=4/min and/or airway obstruction, not isolated apnea.
 * Pure algebra does not assert population or PK/ke0 compatibility.
 */
export function respiratoryPairProbability(
  propofolCeUgMl: number,
  remifentanilCeNgMl: number,
): number | null {
  if (
    !Number.isFinite(propofolCeUgMl) ||
    !Number.isFinite(remifentanilCeNgMl) ||
    propofolCeUgMl < 0 ||
    remifentanilCeNgMl < 0
  )
    return null;
  if (propofolCeUgMl === 0 && remifentanilCeNgMl === 0) return 0;
  const c = RESPIRATORY_PARAMETERS;
  const lp = propofolCeUgMl > 0
    ? Math.log(propofolCeUgMl) - Math.log(c.propofolCe50UgMl)
    : -Infinity;
  const lr = remifentanilCeNgMl > 0
    ? Math.log(remifentanilCeNgMl) - Math.log(c.remifentanilCe50NgMl)
    : -Infinity;
  const terms = [lp, lr, Math.log(c.alpha) + lp + lr];
  const max = Math.max(...terms);
  const logZ = max + Math.log(terms.reduce((sum, t) => sum + Math.exp(t - max), 0));
  // Log-sum-exp avoids overflowing the interaction product or z^gamma.
  return 1 / (1 + Math.exp(-c.gamma * logZ));
}

function activeOrUnknown(s: Trace, drug: Agent): boolean {
  const cp = s.cp[drug], ce = s.ce[drug];
  if (!Number.isFinite(cp) || cp < 0) return true;
  if (ce !== null && (!Number.isFinite(ce) || ce < 0)) return true;
  return cp > 1e-8 || (typeof ce === 'number' && ce > 1e-8);
}

/**
 * Explicit adaptation: current Schnider fixed ke0=.456/min + complex Minto
 * concentrations feed the published surface. Original STANPUMP author code
 * instead recalculates propofol ke0 for tpeak=1.6min; identity with the study's
 * executable is unproven. No existing effect-site model is changed here.
 */
export function respiratoryEstimate(
  trace: Trace,
  choice: PKChoice,
  age: number,
  context: RespiratoryContext = {},
): RespiratoryEstimate {
  // Include future agents even if the caller adds them before DRUG_IDS changes.
  const agents = [...new Set([...DRUG_IDS, ...Object.keys(trace.cp)])] as Agent[];
  const excluded = agents.filter(
    (drug) => drug !== 'propofol' && drug !== 'remifentanil' && activeOrUnknown(trace, drug),
  );
  const result = (probability: number | null, status: string, note: string): RespiratoryEstimate => ({
    probability, status, excluded, note, source: RESPIRATORY_SOURCE, adapted: true,
  });
  if (choice.propofol !== 'schnider')
    return result(null, 'unavailable', 'Requires the Schnider propofol effect site calculation; the selected Marsh model has a different exposure linkage.');
  if (!Number.isFinite(age) || age < 18 || age > 90)
    return result(null, 'unavailable', 'Age is outside the implemented adult PK input range (18–90 years).');
  for (const drug of ['propofol', 'remifentanil'] as const) {
    const cp = trace.cp[drug], ce = trace.ce[drug];
    if (!Number.isFinite(cp) || cp < 0 || ce === null || !Number.isFinite(ce) || ce < 0)
      return result(null, 'unavailable', `${drug} has missing or invalid concentration data; Cp cannot substitute for the required Ce.`);
  }
  const prop = trace.ce.propofol!;
  const remi = trace.ce.remifentanil!;
  if (!activeOrUnknown(trace, 'propofol') && !activeOrUnknown(trace, 'remifentanil') && excluded.length)
    return result(null, 'unavailable', `No propofol/remifentanil exposure to evaluate. Respiratory effects of ${excluded.join(', ')} are outside this pair model.`);

  const extrapolations: string[] = [];
  if (age < 25 || age > 81)
    extrapolations.push('age outside the Schnider/Minto PK development overlap');
  if (prop > 4.3 || remi > 6.4)
    extrapolations.push('concentration outside the studied target ranges (propofol Ce≤4.3 µg/mL; remifentanil Ce≤6.4 ng/mL)');
  if (context.bmi !== undefined) {
    if (!Number.isFinite(context.bmi) || context.bmi <= 0)
      extrapolations.push('BMI not usable for population assessment');
    else if (context.bmi < 18 || context.bmi > 28)
      extrapolations.push('BMI outside 18–28 kg/m²');
  }
  if (context.osa) extrapolations.push('OSA outside the development population');
  if (context.knownKidneyDisease) extrapolations.push('kidney disease without a model-specific respiratory adjustment');
  if (context.knownLiverDisease) extrapolations.push('liver disease without a model-specific respiratory adjustment');

  const parts = [
    'Published respiratory-compromise equation (RR≤4/min or airway obstruction), adapted to current Schnider/Minto Ce; not isolated apnea.',
    'Developed in 24 young volunteers (age25±4 years), under low stimulation near equilibrium. Rapid bolus effects may be underestimated.',
  ];
  if (excluded.length) {
    parts.push(`Pair-only estimate; excludes ${excluded.join(', ')}. It is not the probability for the full drug combination.`);
    if (excluded.some((drug) => String(drug) === 'rocuronium'))
      parts.push('Rocuronium-related paralysis is a separate cause of absent ventilation and is not quantified by this central-drug model.');
  }
  if (extrapolations.length) parts.push(`Extrapolation: ${extrapolations.join('; ')}.`);
  if (prop === 0 && remi === 0)
    parts.push('Zero is the equation’s zero-Ce baseline, not zero clinical respiratory risk.');
  const status = `${excluded.length ? 'partial-' : ''}adapted${extrapolations.length ? '-extrapolation' : ''}`;
  return result(respiratoryPairProbability(prop, remi), status, parts.join(' '));
}

/** Study-context explanations, deliberately not additional probability terms. */
export function respiratoryDrugContext(agent: Agent | string): string {
  switch (agent) {
    case 'propofol':
      return 'Propofol contributes to the exploratory propofol/remifentanil respiratory-compromise curve through Ce (µg/mL). Hypnosis and respiratory compromise are separate endpoints; rapid bolus effects may be underestimated.';
    case 'remifentanil':
      return 'Remifentanil contributes through Minto Ce (ng/mL). Miller’s approximate analgesia 0.2–0.4 and spontaneous-ventilation 0.3–0.6 ng/mL bands describe whole blood, not Ce, and are not apnea thresholds.';
    case 'fentanyl':
      return 'Miller’s approximate plasma analgesia 1–2 ng/mL overlaps its spontaneous-ventilation band of 1–3 ng/mL. A small volunteer study found different plasma EC50 values for minute ventilation (6.1 ng/mL) and respiratory rate (3.5 ng/mL); neither is an apnea threshold. Fentanyl is outside this respiratory pair calculation.';
    case 'alfentanil':
      return 'Miller’s approximate plasma analgesia 50–150 ng/mL overlaps concentrations described with spontaneous ventilation (<200 ng/mL). These are contextual ranges, not safety boundaries. No matched alfentanil/hypnotic respiratory probability is implemented.';
    case 'sufentanil':
      return 'Miller’s approximate plasma analgesia 0.2–0.4 ng/mL overlaps its spontaneous-ventilation band (<0.4 ng/mL). Postoperative serum studies report different requirements. No sufentanil respiratory probability or generic effect site linkage is implemented.';
    case 'morphine':
      return 'An early postoperative IV-PCA study reported plasma morphine 21±12 ng/mL with satisfactory analgesia and a calculated minimum effective concentration of 16±9 ng/mL. These are study averages. Parent morphine alone omits M6G, especially relevant in kidney failure, and cannot define an apnea threshold.';
    case 'hydromorphone':
      return 'Hydromorphone contributes to exploratory N through a separately labelled thermal-response effect site. That score does not predict respiratory depression. Hydromorphone is outside the propofol/remifentanil respiratory calculation; no apnea threshold is assigned.';
    case 'midazolam':
      return 'Midazolam contributes to exploratory H through its EEG-linked effect-site concentration. It is outside the propofol/remifentanil respiratory calculation; its H contribution is not an estimate of apnea risk.';
    case 'dexmedetomidine':
      return 'Sedation and respiratory responses are different endpoints. Human studies show reduced hypoxic and hypercapnic ventilatory responses during dexmedetomidine sedation. Its contribution is not quantified by this propofol/remifentanil model and is not assumed to be zero.';
    case 'ketamine':
      return 'A five-volunteer IV study associated plasma ketamine above100 ng/mL with longer pain-free ischemic exercise; this is not a surgical analgesia threshold. Ketamine is not assigned a respiratory-protection coefficient in the pair calculation.';
    case 'sevoflurane':
    case 'desflurane':
      return 'End tidal concentration and age-adjusted MAC describe volatile exposure and an incision-movement endpoint. They do not define an apnea probability. Forecasts hold the entered end tidal value; volatile washout is not modeled.';
    case 'rocuronium':
      return 'Rocuronium may prevent ventilation through neuromuscular paralysis without producing unconsciousness. Its neuromuscular model is separate from centrally mediated respiratory depression and from the propofol/remifentanil probability.';
    default:
      return 'No model-matched concentration–respiratory endpoint has been implemented for this agent.';
  }
}
