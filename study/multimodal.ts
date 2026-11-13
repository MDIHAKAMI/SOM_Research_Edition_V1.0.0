// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  ANCHORS, PD_VERSION, DEFAULT_PD_CONTEXT,
  type Anchor, type Domain, type PDContext, type Rho,
} from './pd-registry';
import {
  DEFAULT_TAIL_POLICY, HN_COEFFICIENTS, REFERENCE_CURVE,
  type CoefficientSpec, type TailPolicy,
} from './hn-coefficients';
import { DRUG_IDS, ageMAC, type Agent, type Trace, type PKChoice } from './pharmacology';
import type { Entry } from './live';

export function contextAt(entries: Entry[], t: number): PDContext {
  const voided = new Set(entries.filter((e) => e.kind === 'void').map((e) => e.data.target));
  return {
    ...DEFAULT_PD_CONTEXT,
    ...entries.filter((e) => e.kind === 'context' && e.t <= t && !voided.has(e.id))
      .sort((a, b) => a.t - b.t || a.receivedAt.localeCompare(b.receivedAt)).at(-1)?.data,
  };
}
const valid = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= 0;
const endpointsByDrug: Partial<Record<Agent, (keyof NonNullable<Trace['endpointCe']>)[]>> = {
  ketamine: ['ketamineHypnosis'], sufentanil: ['sufentanilHypnosis'],
  morphine: ['morphineThermal'], hydromorphone: ['hydromorphoneThermal'],
  dexmedetomidine: ['dexmedetomidineMoaas'],
};
export function isActive(s: Trace, drug: Agent): boolean {
  // A missing plasma entry is unknown, never a declaration of absence.
  if (!valid(s.cp[drug])) return true;
  if (s.ce[drug] !== null && s.ce[drug] !== undefined && !valid(s.ce[drug])) return true;
  const endpoints = (endpointsByDrug[drug] ?? []).map((key) => s.endpointCe?.[key]);
  if (endpoints.some((x) => x !== undefined && !valid(x))) return true;
  return [s.cp[drug], s.ce[drug], ...endpoints].some((x) => typeof x === 'number' && x > 0);
}

export interface Contribution {
  drug: Agent;
  domain: Domain;
  active: boolean;
  value: number | null;
  exposure: number | null;
  anchor: Anchor | null;
  /** Retained only to read historical snapshots. Always null for H/N 3.0. */
  rho: Rho | null;
  status: 'direct' | 'constructed' | 'omitted' | 'structural-zero' | 'unavailable';
  reason: string;
  formula: string;
  flags: string[];
  sourceIds: string[];
  exposureBasis: string;
  opioidCoordinate: number | null;
}

/** Investigator-derived two-point curve, not the original full Katoh PD equation. */
export function referenceSparing(x: number): number | null {
  if (!valid(x)) return null;
  return x === 0 ? 0 : REFERENCE_CURVE.Emax / (1 + REFERENCE_CURVE.K / x);
}
/** Value/slope-continuous continuation at the final knot; ceiling 1 is imposed. */
export function sparseCurve(c: number, knots: readonly (readonly [number, number])[], tail: TailPolicy = DEFAULT_TAIL_POLICY): number | null {
  if (!valid(c) || knots.length < 2) return null;
  if (!['exponential', 'hold', 'linear'].includes(tail)) throw Error('Unknown H/N tail policy.');
  if (c === 0) return 0;
  for (let i = 1; i < knots.length; i++) {
    const [x0, y0] = knots[i - 1], [x1, y1] = knots[i];
    if (c <= x1) return y0 + (y1 - y0) * (c - x0) / (x1 - x0);
  }
  const [x0, y0] = knots.at(-2)!, [xm, ym] = knots.at(-1)!;
  const slope = (ym - y0) / (xm - x0);
  if (tail === 'hold') return ym;
  if (tail === 'linear') return ym + slope * (c - xm);
  return ym - (1 - ym) * Math.expm1(-slope * (c - xm) / (1 - ym));
}
/** Only non-opioid terms are evaluated separately; opioid N is always pooled first. */
export function coefficientTerm(c: number, spec: CoefficientSpec, tail: TailPolicy = DEFAULT_TAIL_POLICY): number | null {
  if (!valid(c)) return null;
  const p = spec.parameters;
  let value: number | null;
  switch (spec.function_type) {
    case 'zero': value = 0; break;
    case 'linear': value = p.coefficient * c; break;
    case 'hill': {
      if (c === 0) return 0;
      const z = p.gamma * (Math.log(c) - Math.log(p.K));
      value = z >= 0 ? p.Emax / (1 + Math.exp(-z)) : p.Emax * Math.exp(z) / (1 + Math.exp(z));
      break;
    }
    case 'piecewise_linear_exponential_tail': {
      const raw = sparseCurve(c, spec.knots, tail);
      value = raw === null ? null : raw / (p.output_divisor ?? 1);
      break;
    }
    case 'separate_reference_curve': {
      const raw = referenceSparing(p.q * c);
      value = raw === null ? null : raw / REFERENCE_CURVE.reference_divisor;
      break;
    }
    case 'pooled_opioid': throw Error('Opioid N terms must be pooled before applying the reference curve.');
  }
  return valid(value) ? value : null;
}
function exposureOf(spec: CoefficientSpec, drug: Agent, s: Trace, age: number): number | null {
  let raw: unknown;
  switch (spec.binding) {
    case 'none': return null;
    case 'Cp': case 'ET': raw = s.cp[drug]; break;
    case 'Ce': raw = s.ce[drug]; break;
    case 'MAC': {
      const denominator = ageMAC(drug, age);
      raw = valid(s.cp[drug]) && valid(age) && denominator > 0 && Number.isFinite(denominator) ? s.cp[drug] / denominator : null;
      break;
    }
    default: raw = s.endpointCe?.[spec.binding];
  }
  return valid(raw) ? raw : null;
}
function contribution(drug: Agent, domain: Domain, s: Trace, age: number, tail: TailPolicy): Contribution {
  const spec = HN_COEFFICIENTS[drug][domain], active = isActive(s, drug);
  const exposure = exposureOf(spec, drug, s, age);
  const flags: string[] = [];
  const omitted = spec.status === 'deliberate_omission', structural = spec.status === 'structural_zero';
  if (active && omitted) flags.push('Omitted term; this is not a biological zero.');
  if (active && exposure !== null && spec.knots.length && exposure > spec.knots.at(-1)![0])
    flags.push(`Above calibration knots; ${tail} continuation.`);
  if (active && exposure !== null && spec.function_type === 'hill' && exposure > 52)
    flags.push('Above the two fitted midazolam concentrations.');
  const value = omitted || structural || !active ? 0 : exposure === null ? null :
    spec.function_type === 'pooled_opioid' ? null : coefficientTerm(exposure, spec, tail);
  if (active && !omitted && !structural && exposure === null)
    flags.push(`Required ${spec.binding} exposure is unavailable or invalid; no concentration substitution was made.`);
  if (active && !omitted && !structural && exposure !== null && value === null && spec.function_type !== 'pooled_opioid')
    flags.push('The coefficient calculation could not produce a finite value.');
  return {
    drug, domain, active, value, exposure: !active && spec.binding !== 'none' ? 0 : exposure,
    anchor: ANCHORS.find((a) => a.drug === drug && a.domain === domain) ?? null,
    rho: null, status: omitted ? 'omitted' : structural ? 'structural-zero' : value === null ? 'unavailable' :
      spec.function_type === 'linear' && spec.parameters.anchor !== undefined ? 'direct' : 'constructed',
    reason: flags.join(' '), formula: spec.expression, flags, sourceIds: [...spec.source_ids],
    exposureBasis: `${spec.exposure_basis}; app binding: ${spec.binding}`, opioidCoordinate: null,
  };
}
export interface MultimodalOptions { tailPolicy?: TailPolicy }
export function multimodal(
  s: Trace,
  _choice: PKChoice,
  age: number,
  context: PDContext = DEFAULT_PD_CONTEXT,
  options: MultimodalOptions = {},
) {
  const tail = options.tailPolicy ?? DEFAULT_TAIL_POLICY;
  if (!['exponential', 'hold', 'linear'].includes(tail)) throw Error('Unknown H/N tail policy.');
  const contributions = DRUG_IDS.flatMap((drug) =>
    (['H', 'N'] as const).map((domain) => contribution(drug, domain, s, age, tail)));
  const opioids = contributions.filter((c) => c.domain === 'N' && HN_COEFFICIENTS[c.drug].N.function_type === 'pooled_opioid');
  const poolUnknown = opioids.some((c) => c.active && c.exposure === null);
  let opioidPool: number | null = poolUnknown ? null : 0;
  if (!poolUnknown) {
    for (const c of opioids) {
      c.opioidCoordinate = c.active ? HN_COEFFICIENTS[c.drug].N.parameters.q * c.exposure! : 0;
      if (!valid(c.opioidCoordinate)) { opioidPool = null; break; }
      opioidPool! += c.opioidCoordinate;
    }
    if (!valid(opioidPool)) opioidPool = null;
  }
  const raw = opioidPool === null ? null : referenceSparing(opioidPool);
  const pooledN = raw === null ? null : raw / REFERENCE_CURVE.reference_divisor;
  for (const c of opioids) {
    if (!c.active) { c.value = 0; c.opioidCoordinate = 0; c.status = 'constructed'; continue; }
    if (opioidPool === null || pooledN === null) {
      c.value = null; c.status = 'unavailable';
      c.flags.push('Pooled opioid contribution is unavailable because a required opioid coordinate is missing, invalid or nonfinite.');
    } else {
      c.value = opioidPool === 0 ? 0 : pooledN * (c.opioidCoordinate! / opioidPool);
      c.status = 'constructed';
    }
    c.reason = c.flags.join(' ');
  }
  const aggregate = (domain: Domain) => {
    const active = contributions.filter((c) => c.domain === domain && c.active);
    const included = active.filter((c) => c.value !== null), excluded = active.filter((c) => c.value === null);
    const knownSubtotal = included.reduce((sum, c) => sum + c.value!, 0);
    const complete = excluded.length === 0 && Number.isFinite(knownSubtotal);
    return {
      value: complete ? knownSubtotal : null,
      complete,
      knownSubtotal: Number.isFinite(knownSubtotal) ? knownSubtotal : null,
      included: included.map((c) => c.drug), excluded: excluded.map((c) => c.drug),
      omitted: active.filter((c) => c.status === 'omitted').map((c) => c.drug),
    };
  };
  return {
    version: PD_VERSION, modelVersion: PD_VERSION, t: s.t, context: { ...context }, tailPolicy: tail, opioidPool,
    H: aggregate('H'), N: aggregate('N'), contributions,
    flags: contributions.flatMap((c) => c.flags.map((flag) => `${c.drug} ${c.domain}: ${flag}`)),
  };
}
export type MultimodalState = ReturnType<typeof multimodal>;
