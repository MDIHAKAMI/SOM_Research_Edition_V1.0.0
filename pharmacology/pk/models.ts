// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { validateClinicalContext, type ClinicalContext } from '../../study/clinical-context';
export type Drug = 'propofol' | 'fentanyl' | 'dexmedetomidine';
export const DRUGS: Drug[] = ['propofol', 'fentanyl', 'dexmedetomidine'];
export interface Patient {
  age: number;
  sex: 'male' | 'female';
  weight: number;
  height: number;
  clinical?: ClinicalContext;
}
export interface PKParameters {
  v1: number;
  v2: number;
  v3: number;
  cl: number;
  q2: number;
  q3: number;
  ke0: number | null;
  model: string;
}
export const bmi = (p: Patient) => p.weight / (p.height / 100) ** 2;
export const lbm = (p: Patient) =>
  p.sex === 'male'
    ? 1.1 * p.weight - 128 * (p.weight / p.height) ** 2
    : 1.07 * p.weight - 148 * (p.weight / p.height) ** 2;
export function validatePatient(p: Patient) {
  validateClinicalContext(p.clinical);
  if (
    !['male', 'female'].includes(p.sex) ||
    ![p.age, p.weight, p.height].every(Number.isFinite) ||
    p.age < 18 ||
    p.age > 90 ||
    p.weight < 35 ||
    p.weight > 200 ||
    p.height < 140 ||
    p.height > 210 ||
    lbm(p) <= 0
  )
    throw Error(
      'Prototype input range: age 18–90, weight 35–200 kg, height 140–210 cm; positive lean body mass required. These are software limits, not model validity ranges.',
    );
}
export function parameters(drug: Drug, p: Patient): PKParameters {
  validatePatient(p);
  let r: PKParameters;
  if (drug === 'propofol')
    r = {
      v1: 4.27,
      v2: 18.9 - 0.391 * (p.age - 53),
      v3: 238,
      cl:
        1.89 +
        0.0456 * (p.weight - 77) -
        0.0681 * (lbm(p) - 59) +
        0.0264 * (p.height - 177),
      q2: 1.29 - 0.024 * (p.age - 53),
      q3: 0.836,
      ke0: 0.456,
      model: 'schnider-1998-1999',
    };
  else if (drug === 'fentanyl')
    r = {
      v1: 6.09,
      v2: 28.1,
      v3: 228,
      cl: 0.504,
      q2: 2.87,
      q3: 1.37,
      ke0: 0.147,
      model: 'shafer-scott',
    };
  else {
    const w = p.weight / 70,
      c = w ** 0.75;
    r = {
      v1: 1.78 * w,
      v2: 30.3 * w,
      v3: 52 * w,
      cl: 0.686 * c,
      q2: 2.98 * c,
      q3: 0.602 * c,
      ke0: null,
      model: 'hannivoort-2015',
    };
  }
  if (
    [r.v1, r.v2, r.v3, r.cl, r.q2, r.q3].some(
      (v) => !Number.isFinite(v) || v <= 0,
    )
  )
    throw Error(
      'Covariates produce an invalid PK parameter. This patient cannot be simulated with the selected models.',
    );
  return r;
}
export function modelWarnings(p: Patient): string[] {
  const w: string[] = [];
  if (
    p.age < 25 ||
    p.age > 81 ||
    p.weight < 44 ||
    p.weight > 123 ||
    p.height < 155 ||
    p.height > 196
  )
    w.push('Propofol: outside Schnider development demographics.');
  if (p.weight < 40 || p.weight > 90)
    w.push(
      'Fentanyl: outside the 40–90 kg reference range; PK is extrapolated.',
    );
  if (
    p.age < 20 ||
    p.age > 70 ||
    p.weight < 51 ||
    p.weight > 110 ||
    bmi(p) < 20.6 ||
    bmi(p) > 29.3
  )
    w.push('Dexmedetomidine: outside Hannivoort development demographics.');
  if (bmi(p) > 30) w.push('James lean body mass has limitations in obesity.');
  return w;
}
