// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useEffect, useRef, useState } from 'react';
import { simulate, type DrugEvent, type PKChoice, type Trace } from '@/study/pharmacology';
import type { Patient } from '@/pharmacology/pk/models';
import TraceWorker from '../study/trace.worker?worker';
import { simulateOrganComparisons, type OrganComparisonResult } from '@/study/organ-comparison';
import { clinicalContext } from '@/study/clinical-context';

const EMPTY: Trace[] = [];
const EMPTY_ORGAN: OrganComparisonResult = { overlays: [], unavailable: [] };
// The unchanged one-second integrator runs off the UI thread. Only display
// requests are throttled; dose times and clinical event snapshots remain exact.
export function useCaseTrace(patient: Patient, events: DrugEvent[], minutes: number,
  choice: PKChoice, caseId: string, enabled: boolean) {
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);
  const [result, setResult] = useState<{
    patient: Patient; events: DrugEvent[]; choice: PKChoice; caseId: string;
    minutes: number; trace: Trace[]; organ: OrganComparisonResult; error: string;
  } | null>(null);
  useEffect(() => {
    try { worker.current = new TraceWorker(); }
    catch { worker.current = null; }
    return () => { worker.current?.terminate(); worker.current = null; };
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const id = ++sequence.current;
    let cancelled = false;
    const complete = (trace: Trace[], error: string, organ: OrganComparisonResult = EMPTY_ORGAN) => {
      if (!cancelled && sequence.current === id)
        setResult({ patient, events, choice, caseId, minutes, trace, organ, error });
    };
    const fallback = () => {
      try { complete(simulate(patient, events, minutes, choice), '', simulateOrganComparisons(patient, events, minutes, clinicalContext(patient.clinical), choice)); }
      catch (e) { complete([], e instanceof Error ? e.message : 'Calculation failed.'); }
    };
    const currentWorker = worker.current;
    if (currentWorker) {
      currentWorker.onmessage = (e) => { if (e.data.id === id) complete(e.data.trace, e.data.error, e.data.organ ?? EMPTY_ORGAN); };
      currentWorker.onerror = () => { currentWorker.terminate(); worker.current = null; fallback(); };
      currentWorker.postMessage({ id, patient, events, minutes, choice });
    } else fallback();
    return () => { cancelled = true; };
  }, [patient, events, minutes, choice, caseId, enabled]);
  // Never show another case's trace, or old values after a retrospective edit.
  const valid = result?.caseId === caseId && result?.patient === patient &&
    result?.events === events && result?.choice === choice;
  return { trace: valid ? result.trace : EMPTY, organ: valid ? result.organ : EMPTY_ORGAN, error: valid ? result.error : '',
    updating: enabled && (!valid || result.minutes !== minutes) };
}
