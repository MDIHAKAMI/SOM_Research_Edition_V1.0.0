// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import type { PKParameters } from './models';
export type Matrix = number[][];
export const identity = (n: number): Matrix =>
  Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
const mul = (a: Matrix, b: Matrix): Matrix =>
  a.map((row) =>
    b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)),
  );
/** Scaling-and-squaring Taylor exponential. Norm <= 0.5 before expansion; double precision. */
export function expm(a: Matrix): Matrix {
  const norm = Math.max(
    ...a.map((r) => r.reduce((s, v) => s + Math.abs(v), 0)),
  );
  const scale = Math.max(0, Math.ceil(Math.log2(norm / 0.5)));
  const b = a.map((r) => r.map((v) => v / 2 ** scale));
  let sum = identity(a.length),
    term = identity(a.length);
  for (let k = 1; k <= 30; k++) {
    term = mul(term, b).map((r) => r.map((v) => v / k));
    sum = sum.map((r, i) => r.map((v, j) => v + term[i][j]));
  }
  for (let s = 0; s < scale; s++) sum = mul(sum, sum);
  return sum;
}
/** State [A1,A2,A3,Ce,inputPerMinute]. Effect compartment has negligible mass. */
export function transition(p: PKParameters, seconds = 1): Matrix {
  const { v1, v2, v3, cl, q2, q3 } = p,
    k = p.ke0 ?? 0;
  const a = [
    [-(cl + q2 + q3) / v1, q2 / v2, q3 / v3, 0, 1],
    [q2 / v1, -q2 / v2, 0, 0, 0],
    [q3 / v1, 0, -q3 / v3, 0, 0],
    [k / v1, 0, 0, -k, 0],
    [0, 0, 0, 0, 0],
  ];
  return expm(a.map((r) => r.map((v) => (v * seconds) / 60)));
}
export function step(m: Matrix, state: number[], rate: number, onResidual?: (raw: number[], corrected: number[]) => void) {
  const x = [...state, rate];
  const y = m.slice(0, state.length).map((r) => r.reduce((s, v, j) => s + v * x[j], 0));
  if (y.some((v) => !Number.isFinite(v) || v < -1e-9))
    throw Error('Numerical state invalid; simulation halted.');
  const corrected = y.map((v) => Math.max(0, v));
  if (y.some(v => v < 0)) onResidual?.([...y], [...corrected]);
  return corrected;
}
/** Disposition plus massless Ce and independently integrated eliminated amount. */
export function transitionWithMass(p: PKParameters, seconds = 1): Matrix {
  const { v1, v2, v3, cl, q2, q3 } = p, k = p.ke0 ?? 0;
  const a = [
    [-(cl+q2+q3)/v1, q2/v2, q3/v3, 0, 0, 1],
    [q2/v1, -q2/v2, 0, 0, 0, 0],
    [q3/v1, 0, -q3/v3, 0, 0, 0],
    [k/v1, 0, 0, -k, 0, 0],
    [cl/v1, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0],
  ];
  return expm(a.map(r => r.map(v => v * seconds / 60)));
}
