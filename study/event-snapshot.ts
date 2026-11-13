// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { type Trace, type PKChoice, RELEASE, PK_VERSION, CE_VERSION, ageMAC } from './pharmacology';
import { combined, activeEntries, type Entry } from './live';
import { modelProvenance } from './model-provenance';
import type { Patient } from '../pharmacology/pk/models';
import { DRUG_IDS } from './pharmacology';
import { rocContext } from './clinical-context';
import { multimodal, contextAt } from './multimodal';
import { HN_VERSION, PUBLISHED_PD_VERSION } from './pd-registry';
import { publishedPairs } from './pair-registry';
// A saved observation is immutable. Later replay uses a separate reconstruction pathway.
export function eventSnapshot(
  trace: Trace,
  choice: PKChoice,
  age: number,
  entries: Entry[],
  patient?: Patient,
  additionalReversalAt?: number,
) {
  const context = contextAt(entries, trace.t);
  const configured = patient ? rocContext(patient.clinical).reversalAt : null;
  const reversals = [configured, additionalReversalAt,
    ...activeEntries(entries).filter(e => e.kind === 'clinical' && e.data?.name === 'Neuromuscular reversal').map(e => e.t)]
    .filter((t): t is number => typeof t === 'number' && Number.isFinite(t) && t >= 0);
  const reversalAt = reversals.length ? Math.min(...reversals) : null;
  const afterReversal = reversalAt !== null && trace.t >= reversalAt;
  const reversalReason = 'Unavailable after neuromuscular reversal; reversal disposition is not modeled.';
  return {
    release: RELEASE,
    selectedModels: { ...choice },
    traceAtSeconds: trace.t,
    inputEntryIds: activeEntries(entries).filter(e => e.t <= trace.t).map(e => e.id),
    modelProvenance: patient ? DRUG_IDS.map(d => modelProvenance(d, patient, choice)) : undefined,
    versions: { pk: PK_VERSION, ce: CE_VERSION, publishedPD: PUBLISHED_PD_VERSION, hn: HN_VERSION },
    rocuroniumAvailability: { status: afterReversal ? reversalReason : 'Original no-reversal trajectory', reversalAt,
      ...(afterReversal ? { unadjustedCounterfactual: { cp: trace.cp.rocuronium, ce: trace.ce.rocuronium } } : {}) },
    ceUnavailableReason: afterReversal ? { ...trace.ceUnavailableReason, rocuronium: reversalReason } : trace.ceUnavailableReason,
    cp: { ...trace.cp, rocuronium: afterReversal ? null : trace.cp.rocuronium },
    ce: { ...trace.ce, rocuronium: afterReversal ? null : trace.ce.rocuronium },
    endpointCe: trace.endpointCe ? { ...trace.endpointCe } : undefined,
    mac: {
      sevoflurane: trace.cp.sevoflurane / ageMAC('sevoflurane', age),
      desflurane: trace.cp.desflurane / ageMAC('desflurane', age),
    },
    // Historical structure retained for readers of old records; current display uses interactions below.
    effects: {
      ...combined(trace, choice),
      lor: null,
      laryngoscopy: null,
      incision: null,
      kind: 'Legacy fields retired; use named interactions',
    },
    multimodal: multimodal(trace, choice, age, context),
    interactions: publishedPairs(trace, choice, age, context),
  };
}
