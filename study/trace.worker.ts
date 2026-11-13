// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { simulate } from './pharmacology';
import { simulateOrganComparisons } from './organ-comparison';
import { clinicalContext } from './clinical-context';

self.onmessage = (event: MessageEvent) => {
  const { id, patient, events, minutes, choice } = event.data;
  try {
    self.postMessage({ id, trace: simulate(patient, events, minutes, choice),
      organ: simulateOrganComparisons(patient, events, minutes, clinicalContext(patient.clinical), choice), error: '' });
  } catch (error) {
    self.postMessage({ id, trace: [], error: error instanceof Error ? error.message : 'Calculation failed.' });
  }
};
