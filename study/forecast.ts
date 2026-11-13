// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import type { Patient } from '../pharmacology/pk/models';
import { simulate, type Agent, type DrugEvent, type PKChoice, type Trace } from './pharmacology';
import { makeDose, type DoseMode } from './live';
import { clinicalContext, rocContext } from './clinical-context';
import { rocuroniumParameters, rocuroniumTOFR } from './rocuronium';
import { respiratoryEstimate, type RespiratoryEstimate } from './respiratory';
import { simulateOrganComparisons } from './organ-comparison';

export const FORECAST_OFFSETS = [5, 15, 30, 60] as const;
export interface ForecastRequest {
  patient: Patient; events: DrugEvent[]; choice: PKChoice; now: number;
  drug: Agent; mode: DoseMode; value: number; minutes: number;
  osa?: boolean;
}
export interface ForecastRow {
  minutesAhead: number; t: number; baseline: Trace | null; hypothetical: Trace | null;
  baselineTOFR: number | null; hypotheticalTOFR: number | null;
  baselineRespiratory: number | null; hypotheticalRespiratory: number | null;
  baselineRespiratoryEstimate: RespiratoryEstimate | null;
  hypotheticalRespiratoryEstimate: RespiratoryEstimate | null;
  rocuroniumConcentrationUnavailable: boolean;
  organCp: { label: string; baseline: number; hypothetical: number; unit: string }[];
}
/** A pure counterfactual replay; does not write a case or mutate its history. */
export function forecastDrug(request: ForecastRequest) {
  const { patient, events, choice, now, drug, mode, value, minutes } = request;
  if (!Number.isInteger(now) || now < 0 || now > 86400) throw Error('Forecast time is outside the case window.');
  if (request.osa !== undefined && typeof request.osa !== 'boolean') throw Error('Invalid OSA context.');
  const history = events.filter(e => e.t <= now).map(e => ({ ...e }));
  const hypotheticalEvent = makeDose(drug, mode, value, patient.weight, now, 'hypothetical-only', minutes);
  const end = Math.min(86400, now + 3600);
  if (hypotheticalEvent.durationSeconds && now + hypotheticalEvent.durationSeconds > 86400)
    throw Error('The simulated administration would extend beyond the 24-hour calculation window.');
  const altered = [...history, hypotheticalEvent];
  // Propagation stays at one second, but only requested anchors/events are retained.
  const sampleAtSeconds = FORECAST_OFFSETS.map(m => now + m * 60).filter(t => t <= 86400);
  const sampling = { sampleEverySeconds: 86400, sampleAtSeconds };
  const baseline = simulate(patient, history, end / 60, choice, sampling);
  const hypothetical = simulate(patient, altered, end / 60, choice, sampling);
  const c = clinicalContext(patient.clinical), rc = rocContext(patient.clinical);
  const rp = rocuroniumParameters(patient, rc);
  const bOrg = simulateOrganComparisons(patient, history, end / 60, c, choice, sampling);
  const hOrg = simulateOrganComparisons(patient, altered, end / 60, c, choice, sampling);
  const respiratoryContext = { ...c, knownKidneyDisease: c.knownKidneyDisease || c.dialysis,
    osa: request.osa, bmi: patient.weight / (patient.height / 100) ** 2 };
  const nmbPresent = altered.some(e => e.drug === 'rocuronium' && e.value > 0);
  const rows: ForecastRow[] = FORECAST_OFFSETS.map(minutesAhead => {
    const t = now + minutesAhead * 60;
    const b = baseline.find(s => s.t === t) ?? null, h = hypothetical.find(s => s.t === t) ?? null;
    const baselineRespiratoryEstimate = b ? respiratoryEstimate(b, choice, patient.age, respiratoryContext) : null;
    const hypotheticalRespiratoryEstimate = h ? respiratoryEstimate(h, choice, patient.age, respiratoryContext) : null;
    return { minutesAhead, t, baseline: b, hypothetical: h,
      baselineTOFR: b && nmbPresent ? rocuroniumTOFR(b.ce.rocuronium ?? 0, rp, rc, t).raw : null,
      hypotheticalTOFR: h && nmbPresent ? rocuroniumTOFR(h.ce.rocuronium ?? 0, rp, rc, t).raw : null,
      baselineRespiratory: baselineRespiratoryEstimate?.probability ?? null,
      hypotheticalRespiratory: hypotheticalRespiratoryEstimate?.probability ?? null,
      baselineRespiratoryEstimate, hypotheticalRespiratoryEstimate,
      // Reversal changes free rocuronium disposition; raw replay is only an
      // internal unreversed counterfactual and must not be presented as actual Cp/Ce.
      rocuroniumConcentrationUnavailable: rc.reversalAt !== null && t >= rc.reversalAt,
      organCp: hOrg.overlays.filter(o => o.drug === drug).flatMap(o => {
        const before = bOrg.overlays.find(a => a.id === o.id)?.points.find(a => a.t === t)?.cp ??
          (!history.some(e => e.drug === o.drug && e.value > 0) ? 0 : undefined);
        const after = o.points.find(a => a.t === t)?.cp;
        return before === undefined || after === undefined ? [] : [{ label: o.label, baseline: before, hypothetical: after, unit: o.unit }];
      }),
    };
  });
  const estimates = rows.flatMap(r => [r.baselineRespiratoryEstimate, r.hypotheticalRespiratoryEstimate])
    .filter((e): e is RespiratoryEstimate => e !== null);
  const last = [...rows].reverse().find(r => r.hypotheticalRespiratoryEstimate);
  return { now, drug, rows, nmbPresent,
    respiratory: last?.hypotheticalRespiratoryEstimate ?? null,
    respiratoryNotes: [...new Set(estimates.map(e => e.note))],
    respiratoryExcluded: [...new Set(estimates.flatMap(e => e.excluded))],
    nmbNotes: nmbPresent ? [...rp.notes,
      ...(c.knownLiverDisease ? ['Liver disease has no specific covariate in this rocuronium model; the prediction is not liver-disease adjusted.'] : []),
      ...(c.dialysis ? ['Dialysis removal is not modeled for rocuronium.'] : []),
    ] : [],
    assumptions: 'Recorded history through the preview time is replayed. Existing infusion rates and last entered ET continue; finite boluses finish at their recorded stop times. Future scheduled changes are excluded. A hypothetical infusion replaces that drug’s current rate.',
  };
}
export type ForecastResult = ReturnType<typeof forecastDrug>;
