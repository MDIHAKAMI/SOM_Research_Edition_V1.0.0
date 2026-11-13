// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import {
  Engine,
  clockLabel,
  type CaseData,
  type Sample,
} from '../simulation/engine';
import { registry } from '../pharmacology/models/registry';
import { bmi, lbm } from '../pharmacology/pk/models';
const cell = (v: unknown) => {
  if (v === null || v === undefined) return '';
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/^[=+@\-]/.test(s) && typeof v !== 'number') s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
};
export function csvTable(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  return (
    keys.map(cell).join(',') +
    '\r\n' +
    rows.map((r) => keys.map((k) => cell(r[k])).join(',')).join('\r\n')
  );
}
export function flatten(c: CaseData, s: Sample) {
  return {
    case_id: c.id,
    elapsed_s: s.t,
    case_clock: clockLabel(c.startClock, s.t),
    age_years: c.patient.age,
    biological_sex: c.patient.sex,
    weight_kg: c.patient.weight,
    height_cm: c.patient.height,
    bmi_kg_m2: bmi(c.patient),
    james_lbm_kg: lbm(c.patient),
    sevo_et_percent: s.et,
    age_adjusted_MAC: s.mac,
    sevo_BIS_lag_percent: s.sevoCe,
    sevo_BIS_lag_MAC: s.sevoCeMAC,
    propofol_cp_ug_ml: s.drugs.propofol.cp,
    propofol_ce_ug_ml: s.drugs.propofol.ce,
    fentanyl_cp_ng_ml: s.drugs.fentanyl.cp,
    fentanyl_ce_ng_ml: s.drugs.fentanyl.ce,
    dex_cp_ng_ml: s.drugs.dexmedetomidine.cp,
    dex_ce_ng_ml: s.drugs.dexmedetomidine.ce,
    propofol_mg_min: s.drugs.propofol.rate,
    fentanyl_ug_min: s.drugs.fentanyl.rate,
    dex_ug_min: s.drugs.dexmedetomidine.rate,
    propofol_total_mg: s.drugs.propofol.total,
    fentanyl_total_ug: s.drugs.fentanyl.total,
    dex_total_ug: s.drugs.dexmedetomidine.total,
    p_verbal_response: s.responsiveness,
    p_laryngoscopy_tolerance: s.laryngoscopy,
    p_movement_incision: s.movement,
    p_hemodynamic_response_incision: s.hemodynamic,
    p_incision_tolerance: s.antinociceptiveState,
    overall_state: s.overallState,
    evidence: s.evidence,
    unavailable_reason: s.reason,
    clinical_events: c.entries
      .filter((e) => e.t === s.t && e.kind === 'event')
      .map((e) => e.label)
      .join(' | '),
    timeline_entries: c.entries.filter((e) => e.t === s.t),
    model_versions: c.versions,
    sevo_lag_enabled: c.sevoLag,
    is_synthetic_demo: c.demo,
  };
}
export function exportData(engine: Engine, interval = 1) {
  if (!Number.isInteger(interval) || interval < 1)
    throw Error('Export interval must be a positive integer.');
  const c = { ...engine.data, elapsed: engine.t };
  const samples = engine.samples.filter(
    (s) => s.t % interval === 0 || s.t === engine.t,
  );
  const clinicalEvents = engine.events.map((ev) => {
    const { pairReference, ...sample } = ev.sample;
    return { ...ev, sample };
  });
  return {
    schema: 'ass-export-1',
    case: c,
    units: {
      propofol: 'µg/mL',
      fentanyl: 'ng/mL',
      dexmedetomidine: 'ng/mL',
      sevo: 'vol.%',
      time: 'seconds',
      probability: '0–1',
    },
    missing: 'null/blank means not modeled or unavailable, never zero',
    intervalSeconds: interval,
    modelRegistry: registry,
    parameters: engine.params,
    timeSeries: samples.map((s) => flatten(c, s)),
    clinicalEvents,
    administrations: c.entries.filter((e) =>
      ['bolus', 'loading', 'infusion', 'record'].includes(e.kind),
    ),
    etHistory: c.entries.filter((e) => e.kind === 'sevo'),
  };
}
export const timeSeriesCSV = (e: Engine, interval = 1) =>
  csvTable(exportData(e, interval).timeSeries);
export const eventsCSV = (e: Engine) =>
  csvTable(
    e.events.map((ev) => ({
      event_id: ev.entry.id,
      event: ev.entry.label,
      ...flatten(e.data, ev.sample),
    })),
  );
export const historyCSV = (e: Engine) =>
  csvTable(
    e.data.entries.map((en) => ({
      case_id: e.data.id,
      entry_id: en.id,
      elapsed_s: en.t,
      clock: clockLabel(e.data.startClock, en.t),
      kind: en.kind,
      drug: en.drug ?? '',
      value: en.value ?? null,
      unit: en.unit ?? '',
      duration_s: en.duration ?? null,
      label: en.label,
      model_versions: e.data.versions,
    })),
  );
export function download(
  name: string,
  content: string,
  type = 'application/json',
) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
