// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
export interface PairResult {
  toleranceIncision: number;
  movementIncision: number;
  toleranceHemodynamic: number;
  hemodynamicResponse: number;
}
/** Vereecke 2013 equations 1–4; Table 1 control-group column, no N2O. */
export function sevoFentanyl(sevo: number, fentanyl: number): PairResult {
  if (![sevo, fentanyl].every((v) => Number.isFinite(v) && v >= 0))
    throw Error('Invalid concentration');
  const tol = (cs: number, cf: number) => {
    const u = (sevo / cs) * (1 + (fentanyl / cf) ** 0.931);
    if (u === 0) return 0;
    return 1 / (1 + Math.exp(-6.4 * Math.log(u)));
  };
  const a = tol(1.73, 2.07),
    b = tol(4.6, 0.43);
  return {
    toleranceIncision: a,
    movementIncision: 1 - a,
    toleranceHemodynamic: b,
    hemodynamicResponse: 1 - b,
  };
}
/** Infrastructure only: fractions must represent incremental contributions to the SAME endpoint.
 * No pharmacological coefficients are supplied and no live multidrug estimate is enabled. */
export function boundedNormalizedAddition(
  effects: { endpoint: string; fraction: number; source: string }[],
) {
  if (!effects.length) return null;
  if (new Set(effects.map((e) => e.endpoint)).size !== 1)
    throw Error('Cannot combine different endpoints');
  if (
    effects.some(
      (e) =>
        !e.source ||
        !Number.isFinite(e.fraction) ||
        e.fraction < 0 ||
        e.fraction > 1,
    )
  )
    throw Error('Evidence-linked effect fractions required');
  return {
    value: Math.min(
      1,
      effects.reduce((s, e) => s + e.fraction, 0),
    ),
    evidence: 'experimental',
    label:
      'Experimental multidrug estimate — additive interaction assumed; not clinically validated.',
  };
}
