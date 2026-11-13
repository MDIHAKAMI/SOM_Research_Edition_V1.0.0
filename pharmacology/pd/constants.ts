// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
// Existing MAC convention, centralized without numerical changes.
export const MAC40 = { sevoflurane: 1.8, desflurane: 6.6 } as const;
export const MAC_AGE_SLOPE = -0.00269;
export const macAtAge = (drug: keyof typeof MAC40, age: number) =>
  MAC40[drug] * 10 ** (MAC_AGE_SLOPE * (age - 40));
// Colin 2017, Table 1: different endpoints require different effect compartments.
export const DEX_MOAAS_KE0 = 0.0428;
