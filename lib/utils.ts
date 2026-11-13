// SPDX-License-Identifier: MIT
// Includes shadcn/ui utility code: Copyright (c) 2023 shadcn. See THIRD_PARTY_NOTICES.txt.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
