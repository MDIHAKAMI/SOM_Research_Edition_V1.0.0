// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { macAtAge } from './constants';
export const macAge = (age: number) => macAtAge('sevoflurane', age);
export const sevoStep = (ce: number, et: number, seconds = 1) =>
  et + (ce - et) * Math.exp((-0.48 * seconds) / 60);
