// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { MAC40 } from '../pharmacology/pd/constants';
import {
  LEGACY_FIT_DRUG_IDS as DRUG_IDS,
  ENDPOINTS,
  drugs,
  prior,
  ageMAC,
  zeroExposure,
  RELEASE,
  type Agent,
  type Exposure,
  type Endpoint,
  type DrugEvent,
  type PKChoice,
  defaultChoice,
} from './pharmacology';
import { validatePatient, type Patient } from '../pharmacology/pk/models';
export interface Covariates {
  asa: number;
  egfr: number;
  opioidTolerance: boolean;
  osa: boolean;
  phase: 'induction' | 'maintenance' | 'emergence';
  minutesSinceOff: number;
}
export const defaultCov: Covariates = {
  asa: 2,
  egfr: 90,
  opioidTolerance: false,
  osa: false,
  phase: 'maintenance',
  minutesSinceOff: 0,
};
export interface StudyCase {
  id: string;
  participant: string;
  site: string;
  cohort: 'development' | 'validation';
  synthetic: boolean;
  patient: Patient;
  covariates: Covariates;
  events: DrugEvent[];
  choice: PKChoice;
  createdAt: string;
}
export interface Observation {
  choice: PKChoice;
  id: string;
  caseId: string;
  participant: string;
  endpoint: Endpoint;
  t: number;
  y: number | null;
  reason: string;
  exposure: Exposure;
  patient: Patient;
  covariates: Covariates;
  cohort: 'development' | 'validation';
  synthetic: boolean;
  createdAt: string;
  runId: string | null;
  prediction: number | null;
  assessment: {
    nmb: boolean;
    spontaneous: boolean;
    windowSeconds: number;
    rr: number | null;
    tof: number | null;
    checklist: boolean | null;
  };
}
export interface Metrics {
  n: number;
  cases: number;
  auc: number | null;
  brier: number;
  logLoss: number;
  calibration: { predicted: number; observed: number; n: number }[];
}
export interface Fit {
  choice: PKChoice;
  featureMin: number[];
  featureMax: number[];
  schema: 'asl-fit-2';
  id: string;
  endpoint: Endpoint;
  release: string;
  createdAt: string;
  synthetic: boolean;
  featureNames: string[];
  beta: number[];
  lambda: number;
  intercept: number;
  trainCases: string[];
  testCases: string[];
  trainObservationIds: string[];
  metrics: Metrics;
  baselineMetrics: Metrics;
  converged: boolean;
  iterations: number;
}
// Legacy fitting workflow, not used by the current research interface.
// Labels follow the mixed exposure coordinate: Cp where generic Ce is unavailable.
export const featureNames = [
  'Intercept',
  ...DRUG_IDS.map((d) =>
    d === 'sevoflurane' || d === 'desflurane'
      ? `${d}: age MAC`
      : ['ketamine', 'morphine', 'fentanyl', 'alfentanil', 'sufentanil'].includes(d)
        ? `${d}: Cp`
        : `${d}: Ce`,
  ),
  'Age',
  'BMI',
  'ASA',
  'eGFR',
  'Opioid tolerance',
  'OSA',
  'Emergence',
  'Minutes since off',
  ...DRUG_IDS.flatMap((d, i) =>
    DRUG_IDS.slice(i + 1).map((b) => `${d} × ${b}`),
  ),
  'propofol × remifentanil × dexmedetomidine',
  'sevoflurane × fentanyl × dexmedetomidine',
];
export function features(e: Exposure, p: Patient, c: Covariates) {
  const v = DRUG_IDS.map((d) =>
    Math.log1p(
      e[d] /
        (['sevoflurane', 'desflurane'].includes(d)
          ? ageMAC(d, p.age)
          : drugs[d].scale),
    ),
  );
  return [
    1,
    ...v,
    (p.age - 40) / 20,
    (p.weight / (p.height / 100) ** 2 - 25) / 10,
    c.asa - 2,
    Math.log1p(c.egfr / 90) - Math.log(2),
    +c.opioidTolerance,
    +c.osa,
    +(c.phase === 'emergence'),
    Math.log1p(c.minutesSinceOff / 10),
    ...v.flatMap((x, i) => v.slice(i + 1).map((y) => x * y)),
    v[0] * v[5] * v[4],
    v[1] * v[6] * v[4],
  ];
}
export const sigmoid = (x: number) =>
  x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
export const logit = (p: number) =>
  Math.log(
    Math.max(0.001, Math.min(0.999, p)) /
      (1 - Math.max(0.001, Math.min(0.999, p))),
  );
function baseline(
  e: Exposure,
  ep: Endpoint,
  intercept: number,
  choice = defaultChoice,
) {
  const v =
    choice.propofol !== 'schnider' && ['lor', 'laryngoscopy'].includes(ep)
      ? null
      : prior(e, ep).p;
  return v === null ? intercept : logit(v);
}
export function predict(f: Fit, e: Exposure, p: Patient, c: Covariates) {
  const x = features(e, p, c);
  return sigmoid(
    baseline(e, f.endpoint, f.intercept, f.choice) +
      x.reduce((s, v, i) => s + v * f.beta[i], 0),
  );
}
export function metrics(rows: Observation[], pred: number[]): Metrics {
  if (!rows.length) throw Error('No evaluable observations.');
  let wins = 0,
    pairs = 0;
  rows.forEach((a, i) => {
    if (a.y === 1)
      rows.forEach((b, j) => {
        if (b.y === 0) {
          pairs++;
          wins += pred[i] > pred[j] ? 1 : pred[i] === pred[j] ? 0.5 : 0;
        }
      });
  });
  return {
    n: rows.length,
    cases: new Set(rows.map((r) => r.participant)).size,
    auc: pairs ? wins / pairs : null,
    brier: pred.reduce((s, p, i) => s + (p - rows[i].y!) ** 2, 0) / rows.length,
    logLoss:
      -pred.reduce(
        (s, p, i) =>
          s +
          (rows[i].y
            ? Math.log(Math.max(1e-12, p))
            : Math.log(Math.max(1e-12, 1 - p))),
        0,
      ) / rows.length,
    calibration: Array.from({ length: 5 }, (_, i) => {
      const a = rows
        .map((r, j) => ({ r, p: pred[j] }))
        .filter((v) => Math.min(4, Math.floor(v.p * 5)) === i);
      return {
        n: a.length,
        predicted: a.length ? a.reduce((s, v) => s + v.p, 0) / a.length : 0,
        observed: a.length ? a.reduce((s, v) => s + v.r.y!, 0) / a.length : 0,
      };
    }),
  };
}
export function fitModel(
  observations: Observation[],
  ep: Endpoint,
  lambda = 1,
): Fit {
  if (!Number.isFinite(lambda) || lambda < 0.01 || lambda > 100)
    throw Error('Prior precision must be 0.01–100.');
  if (observations.length > 5000)
    throw Error('Export larger datasets for full pharmacometric analysis.');
  const rows = observations.filter(
    (r) => r.endpoint === ep && r.y !== null && r.cohort === 'development',
  );
  if (new Set(rows.map((r) => r.synthetic)).size > 1)
    throw Error('Synthetic and observed data cannot be fitted together.');
  if (
    new Set(rows.map((r) => r.choice.propofol + '|' + r.choice.ketamine)).size >
    1
  )
    throw Error('Fit one frozen PK-model configuration at a time.');
  const ids = [
    ...new Set(
      rows
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((r) => r.participant),
    ),
  ];
  if (ids.length < 30)
    throw Error(
      'At least 30 independent participants are required for this exploratory fitting tool; this is not a study sample-size justification.',
    );
  const trainCases = ids.slice(0, Math.floor(ids.length * 0.75)),
    testCases = ids.slice(trainCases.length),
    train = rows.filter((r) => trainCases.includes(r.participant)),
    test = rows.filter((r) => testCases.includes(r.participant));
  if (
    [train, test].some((rs) =>
      [0, 1].some((y) => rs.filter((r) => r.y === y).length < 3),
    )
  )
    throw Error(
      'Both development partitions need at least 3 positive and 3 negative assessments.',
    );
  const intercept = logit(train.reduce((s, r) => s + r.y!, 0) / train.length),
    xs = train.map((r) => features(r.exposure, r.patient, r.covariates)),
    offsets = train.map((r) => baseline(r.exposure, ep, intercept, r.choice)),
    beta = featureNames.map(() => 0);
  // Gaussian zero-centred priors on deviations from the literature offset; MAP, not posterior sampling.
  const weights = train.map(
    (r) => 1 / train.filter((q) => q.participant === r.participant).length,
  );
  const penalty = featureNames.map((_, j) =>
    j === 0 ? 0.1 : lambda * (j >= 19 ? 4 : 1),
  );
  const L =
      0.25 *
        xs.reduce(
          (s, x, i) => s + weights[i] * x.reduce((a, b) => a + b * b, 0),
          0,
        ) +
      Math.max(...penalty),
    lr = 1 / L;
  let converged = false,
    iterations = 0;
  for (let k = 0; k < 6000; k++) {
    const grad = beta.map((b, j) => penalty[j] * b);
    train.forEach((r, i) => {
      const err =
        (sigmoid(offsets[i] + xs[i].reduce((s, v, j) => s + v * beta[j], 0)) -
          r.y!) *
        weights[i];
      xs[i].forEach((v, j) => (grad[j] += err * v));
    });
    let delta = 0;
    beta.forEach((_, j) => {
      const d = lr * grad[j];
      beta[j] -= d;
      delta = Math.max(delta, Math.abs(d));
    });
    iterations = k + 1;
    if (delta < 1e-6) {
      converged = true;
      break;
    }
  }
  const f: Fit = {
    choice: { ...rows[0].choice },
    featureMin: featureNames.map((_, j) => Math.min(...xs.map((x) => x[j]))),
    featureMax: featureNames.map((_, j) => Math.max(...xs.map((x) => x[j]))),
    schema: 'asl-fit-2',
    id: crypto.randomUUID(),
    endpoint: ep,
    release: RELEASE,
    createdAt: new Date().toISOString(),
    synthetic: rows[0].synthetic,
    featureNames: [...featureNames],
    beta,
    lambda,
    intercept,
    trainCases,
    testCases,
    trainObservationIds: train.map((r) => r.id),
    metrics: null as unknown as Metrics,
    baselineMetrics: null as unknown as Metrics,
    converged,
    iterations,
  };
  f.metrics = metrics(
    test,
    test.map((r) => predict(f, r.exposure, r.patient, r.covariates)),
  );
  f.baselineMetrics = metrics(
    test,
    test.map((r) => sigmoid(baseline(r.exposure, ep, intercept, r.choice))),
  );
  return f;
}
export function validateFit(f: Fit) {
  if (
    !f ||
    f.schema !== 'asl-fit-2' ||
    f.release !== RELEASE ||
    !ENDPOINTS.includes(f.endpoint) ||
    f.featureNames?.join('|') !== featureNames.join('|') ||
    f.beta?.length !== featureNames.length ||
    !f.choice ||
    !['schnider', 'marsh'].includes(f.choice.propofol) ||
    !['domino', 'clements250'].includes(f.choice.ketamine) ||
    f.featureMin?.length !== featureNames.length ||
    f.featureMax?.length !== featureNames.length ||
    f.featureMin.some(
      (v, i) =>
        !Number.isFinite(v) ||
        !Number.isFinite(f.featureMax[i]) ||
        v > f.featureMax[i],
    ) ||
    f.beta.some((v) => !Number.isFinite(v) || Math.abs(v) > 1000) ||
    !Number.isFinite(f.intercept) ||
    !Array.isArray(f.trainCases) ||
    !Array.isArray(f.testCases) ||
    f.trainCases.some((x) => f.testCases.includes(x)) ||
    typeof f.synthetic !== 'boolean'
  )
    throw Error('Incompatible or invalid model package.');
}
export function validateCov(c: Covariates) {
  if (
    !c ||
    !Number.isInteger(c.asa) ||
    c.asa < 1 ||
    c.asa > 4 ||
    !Number.isFinite(c.egfr) ||
    c.egfr < 0 ||
    c.egfr > 200 ||
    !['induction', 'maintenance', 'emergence'].includes(c.phase) ||
    !Number.isFinite(c.minutesSinceOff) ||
    c.minutesSinceOff < 0 ||
    c.minutesSinceOff > 1440 ||
    typeof c.osa !== 'boolean' ||
    typeof c.opioidTolerance !== 'boolean'
  )
    throw Error('Invalid covariates.');
}
export function validateCase(c: StudyCase) {
  if (
    !c ||
    !/^[-a-zA-Z0-9]{1,48}$/.test(c.participant) ||
    !/^[-a-zA-Z0-9]{1,32}$/.test(c.site) ||
    !['development', 'validation'].includes(c.cohort) ||
    typeof c.synthetic !== 'boolean' ||
    !Array.isArray(c.events) ||
    c.events.length > 2000 ||
    !['schnider', 'marsh'].includes(c.choice?.propofol) ||
    !['domino', 'clements250'].includes(c.choice?.ketamine)
  )
    throw Error('Invalid case. Use coded participant and site IDs only.');
  validatePatient(c.patient);
  validateCov(c.covariates);
}
export function syntheticObservations(): Observation[] {
  let seed = 210907;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out: Observation[] = [];
  for (let i = 0; i < 120; i++) {
    const patient: Patient = {
        age: 20 + Math.floor(rand() * 55),
        weight: 50 + rand() * 60,
        height: 155 + rand() * 35,
        sex: rand() > 0.5 ? 'male' : 'female',
      },
      e = zeroExposure();
    for (const d of DRUG_IDS)
      e[d] = rand() > 0.45 ? rand() * drugs[d].scale * 2 : 0;
    const covariates: Covariates = {
      ...defaultCov,
      asa: 1 + Math.floor(rand() * 3),
      osa: rand() > 0.7,
      opioidTolerance: rand() > 0.8,
      egfr: 50 + rand() * 70,
      phase: i % 3 === 0 ? 'emergence' : 'maintenance',
      minutesSinceOff: i % 3 === 0 ? rand() * 20 : 0,
    };
    for (const ep of ENDPOINTS) {
      let z = baseline(e, ep, ep === 'extubation' ? -0.5 : 0);
      const load =
        e.propofol / 3 +
        e.sevoflurane / MAC40.sevoflurane +
        e.desflurane / MAC40.desflurane +
        (e.dexmedetomidine / 0.7) * 0.3 +
        (e.ketamine / 200) * 0.2;
      z +=
        ep === 'ror' || ep === 'extubation'
          ? 2 - load + 0.08 * covariates.minutesSinceOff
          : ep === 'movement' || ep === 'laryngoscopy'
            ? -0.2 * load
            : 0.2 * load;
      out.push({
        choice: { ...defaultChoice },
        id: `SYN-${i}-${ep}`,
        caseId: `SYN-${i}`,
        participant: `SYN-${i}`,
        endpoint: ep,
        t: 1800,
        y: rand() < sigmoid(z) ? 1 : 0,
        reason: '',
        exposure: { ...e },
        patient,
        covariates,
        cohort: 'development',
        synthetic: true,
        createdAt: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(),
        runId: null,
        prediction: null,
        assessment: {
          nmb: false,
          spontaneous: true,
          windowSeconds: 60,
          rr: 12,
          tof: 1,
          checklist: null,
        },
      });
    }
  }
  return out;
}
export const emptyCase = (): StudyCase => ({
  id: crypto.randomUUID(),
  participant: 'SIM-' + Math.floor(Math.random() * 1e6),
  site: 'SITE-01',
  cohort: 'development',
  synthetic: true,
  patient: { age: 40, sex: 'male', weight: 70, height: 175 },
  covariates: { ...defaultCov },
  events: [],
  choice: { ...defaultChoice },
  createdAt: new Date().toISOString(),
});
