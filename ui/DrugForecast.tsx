// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Patient } from '@/pharmacology/pk/models';
import {
  DRUG_IDS,
  drugs,
  type Agent,
  type DrugEvent,
  type PKChoice,
} from '@/study/pharmacology';
import { doseUnit, type DoseMode } from '@/study/live';
import type { ForecastRequest, ForecastResult } from '@/study/forecast';
import { analgesiaContext, ANALGESIA_CONTEXT_SOURCE } from '@/study/clinical-meaning';
import { respiratoryDrugContext, RESPIRATORY_SOURCE, type RespiratoryEstimate } from '@/study/respiratory';
import { ROCURONIUM_SOURCE } from '@/study/rocuronium';
import { DEX_HEPATIC_SOURCE } from '@/study/organ-comparison';
import { HN_EFFECT_SITES } from '@/study/hn-effect-sites';
import ForecastWorker from '../study/forecast.worker?worker';
import { NumberField } from './atlas-controls';

export interface DrugForecastProps {
  patient: Patient;
  events: DrugEvent[];
  choice: PKChoice;
  now: number;
  osa?: boolean;
  close: () => void;
}

interface PreviewState {
  result: ForecastResult;
  request: ForecastRequest;
  patient: Patient;
  events: DrugEvent[];
  choice: PKChoice;
  now: number;
}

const format = (value: number | null | undefined, digits = 3) =>
  value == null || !Number.isFinite(value) ? '—' : value.toFixed(digits);
const probability = (value: number | null, estimate: RespiratoryEstimate | null) => {
  if (value === null) return 'Unavailable';
  const status = [
    estimate?.excluded.length ? 'pair only' : 'adapted',
    estimate?.status.includes('extrapolation') ? 'outside source conditions' : '',
  ].filter(Boolean).join(' · ');
  return `${format(100 * value, 1)}% · ${status}`;
};

/** Counterfactual preview only. This component has no recording or saving API. */
export function DrugForecast({ patient, events, choice, now, osa, close }: DrugForecastProps) {
  const [drug, setDrug] = useState<Agent>('propofol');
  const [mode, setMode] = useState<DoseMode>('push');
  const [dose, setDose] = useState('');
  const [minutes, setMinutes] = useState('');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const worker = useRef<Worker | null>(null);
  const sequence = useRef(0);

  const terminate = () => {
    sequence.current += 1;
    worker.current?.terminate();
    worker.current = null;
  };
  const invalidate = () => {
    terminate();
    setPreview(null);
    setBusy(false);
    setError('');
  };

  useEffect(() => {
    sequence.current += 1;
    worker.current?.terminate();
    worker.current = null;
    setPreview(null);
    setBusy(false);
    setError('');
    return () => {
      sequence.current += 1;
      worker.current?.terminate();
      worker.current = null;
    };
  }, [patient, events, choice, now, osa]);

  const volatile = drug === 'sevoflurane' || drug === 'desflurane';
  const delivery: DoseMode = volatile ? 'et' : mode;
  const valid = preview?.patient === patient && preview.events === events &&
    preview.choice === choice && preview.now === now &&
    preview.request.osa === osa &&
    preview.request.drug === drug && preview.request.mode === delivery &&
    preview.request.value === Number(dose) &&
    (delivery !== 'loading' || preview.request.minutes === Number(minutes));
  const result = valid ? preview.result : null;
  const respiratoryRelevant = drug === 'propofol' || drug === 'remifentanil' ||
    events.some((event) => event.t <= now && event.value > 0 &&
      (event.drug === 'propofol' || event.drug === 'remifentanil'));
  const overlayLabels = [...new Set(result?.rows.flatMap((row) => row.organCp.map((o) => o.label)) ?? [])];
  const clinicalMeaning = analgesiaContext(drug);
  const namedEffectSite = HN_EFFECT_SITES.find((link) => link.drug === drug);
  const excludes = result?.respiratoryExcluded.map((agent) => drugs[agent]?.name ?? agent) ?? [];
  const noEffectSite = result?.rows.some((row) => row.hypothetical) &&
    result.rows.every((row) => !row.hypothetical || row.hypothetical.ce[drug] === null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    invalidate();
    const value = Number(dose);
    if (dose.trim() === '' || !Number.isFinite(value) || value < 0) {
      setError('Enter a nonnegative dose or concentration.');
      return;
    }
    const duration = delivery === 'loading' ? Number(minutes) : 1;
    if (delivery === 'loading' && (minutes.trim() === '' || !Number.isFinite(duration) || duration < 1 / 60 || duration > 1440)) {
      setError('Enter a bolus duration from 1 second to 24 hours.');
      return;
    }
    const request: ForecastRequest = {
      patient, events, choice, now, osa, drug, mode: delivery, value, minutes: duration,
    };
    const id = ++sequence.current;
    try {
      const current = new ForecastWorker();
      worker.current = current;
      current.onmessage = (message: MessageEvent<{
        id: number;
        result: ForecastResult | null;
        error: string;
      }>) => {
        if (sequence.current !== id || message.data.id !== id) return;
        current.terminate();
        if (worker.current === current) worker.current = null;
        setBusy(false);
        if (message.data.error || !message.data.result) {
          setError(message.data.error || 'Preview could not be calculated.');
          return;
        }
        setPreview({ result: message.data.result, request, patient, events, choice, now });
      };
      const failed = () => {
        if (sequence.current !== id) return;
        current.terminate();
        if (worker.current === current) worker.current = null;
        setBusy(false);
        setError('Preview unavailable in this browser.');
      };
      current.onerror = failed;
      current.onmessageerror = failed;
      setBusy(true);
      current.postMessage({ id, request });
    } catch {
      terminate();
      setBusy(false);
      setError('Preview unavailable in this browser.');
    }
  }

  return (
    <div aria-label="Drug preview">
      <p className="as-caption">
        Preview at {format(now / 60, 1)} minutes from case start. Nothing is added
        to the case record.
      </p>
      <form onSubmit={submit}>
        <div className="as-grid">
          <label>
            Drug
            <select value={drug} onChange={(event) => {
              invalidate();
              const next = event.target.value as Agent;
              setDrug(next);
              setDose('');
              setMode(next === 'sevoflurane' || next === 'desflurane' ? 'et' : 'push');
            }}>
              {DRUG_IDS.map((agent) => <option key={agent} value={agent}>{drugs[agent].name}</option>)}
            </select>
          </label>
          {!volatile && (
            <label>
              Administration
              <select value={mode} onChange={(event) => {
                invalidate();
                setMode(event.target.value as DoseMode);
                setDose('');
              }}>
                <option value="push">IV push</option>
                <option value="loading">IV bolus over minutes</option>
                <option value="infusion">IV infusion</option>
              </select>
            </label>
          )}
          <NumberField
            label={`${volatile ? 'End tidal concentration' : delivery === 'infusion' ? 'Infusion rate' : 'Dose'} · ${doseUnit(drug, delivery)}`}
            value={dose}
            onChange={(value) => { invalidate(); setDose(value); }}
            min={0}
            required
          />
          {delivery === 'loading' && (
            <NumberField
              label="Bolus duration · minutes"
              value={minutes}
              onChange={(value) => { invalidate(); setMinutes(value); }}
              min={1 / 60}
              max={1440}
              required
            />
          )}
        </div>
        <div className="as-row" style={{ marginTop: 18 }}>
          <button type="submit" className="as-primary" disabled={busy}>
            {busy ? 'Calculating…' : 'Preview only'}
          </button>
          <button type="button" onClick={() => { terminate(); close(); }}>Back to case</button>
        </div>
      </form>
      {busy && <p className="as-caption" role="status">Calculating the two timelines in the background…</p>}
      {error && <p className="as-error" role="alert" style={{ marginTop: 16 }}>{error}</p>}
      {result && (
        <section aria-label="Preview comparison" style={{ marginTop: 24 }}>
          <h3>{drugs[result.drug].name} · 5–60 minute preview</h3>
          <p className="as-caption">
            Recorded continuation → with preview. Calculated from minute{' '}
            {format(result.now / 60, 1)}. {result.assumptions}
          </p>
          <div className="hn-table-wrap">
            <table className="hn-table">
              <thead>
                <tr>
                  <th>Minutes ahead</th>
                  <th>{volatile ? 'ET' : 'Cp'} · {drugs[drug].unit}<br />Baseline → preview</th>
                  {!volatile && <th>Ce with preview<br />{drugs[drug].unit}</th>}
                  {namedEffectSite && <th>{namedEffectSite.domain} endpoint Ce<br />Baseline → preview</th>}
                  {result.nmbPresent && <th>Predicted TOF ratio<br />Baseline → preview</th>}
                  {respiratoryRelevant && <th>Respiratory pair only<br />Baseline → preview</th>}
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.minutesAhead}>
                    <td>+{row.minutesAhead} min</td>
                    <td>{drug === 'rocuronium' && row.rocuroniumConcentrationUnavailable
                      ? 'Unavailable after reversal'
                      : `${format(row.baseline?.cp[drug])} → ${format(row.hypothetical?.cp[drug])}`}</td>
                    {!volatile && <td>{drug === 'rocuronium' && row.rocuroniumConcentrationUnavailable
                      ? 'Unavailable after reversal'
                      : row.hypothetical?.ce[drug] === null ? 'Unavailable' : format(row.hypothetical?.ce[drug])}</td>}
                    {namedEffectSite && <td>{format(row.baseline?.endpointCe?.[namedEffectSite.key])} → {format(row.hypothetical?.endpointCe?.[namedEffectSite.key])}</td>}
                    {result.nmbPresent && <td>{format(row.baselineTOFR)} → {format(row.hypotheticalTOFR)}</td>}
                    {respiratoryRelevant && <td>
                      <span title={row.baselineRespiratoryEstimate?.note}>{probability(row.baselineRespiratory, row.baselineRespiratoryEstimate)}</span>
                      {' → '}
                      <span title={row.hypotheticalRespiratoryEstimate?.note}>{probability(row.hypotheticalRespiratory, row.hypotheticalRespiratoryEstimate)}</span>
                    </td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {noEffectSite && <p className="as-caption">This drug model has no generic effect site calculation; Ce is unavailable.</p>}
          {namedEffectSite && <p className="as-caption">The named {namedEffectSite.domain} endpoint effect site uses {namedEffectSite.key} in ng/mL. {namedEffectSite.linkage}</p>}
          {result.rows.some((row) => !row.hypothetical) && <p className="as-caption">Values beyond the 24-hour calculation window are unavailable.</p>}
          {result.nmbPresent && (
            <p className="as-caption">
              TOF ratio is raw T4/T1 (source baseline 1.04), not probability of paralysis. Predictions are
              unavailable after recorded reversal or with another blocker.
              {result.nmbNotes.some((note) => note.startsWith('Outside') || note.startsWith('Severe renal'))
                ? ' This profile is outside the spontaneous TOFR source range.' : ''}
              {result.nmbNotes.filter((note) => note.startsWith('Liver disease') || note.startsWith('Dialysis')).map((note) => ` ${note}`).join('')}
            </p>
          )}
          {drug === 'rocuronium' && result.rows.some((row) => row.rocuroniumConcentrationUnavailable) && (
            <p className="as-caption">Free rocuronium Cp/Ce after reversal are unavailable because reversal pharmacokinetics are not included.</p>
          )}
          {respiratoryRelevant && (
            <p className="as-caption">
              Exploratory propofol/remifentanil probability of RR ≤4/min or
              airway obstruction, using adapted Ce. Not isolated apnea or a
              probability for the full regimen.
              Low-stimulation, near-equilibrium model; rapid bolus effects may be underestimated.
              {excludes.length > 0 ? ` Excluded: ${excludes.join(', ')}.` : ''}
            </p>
          )}
          {overlayLabels.length > 0 && (
            <>
              <h3>Organ model comparisons · Cp</h3>
              <div className="hn-table-wrap">
                <table className="hn-table">
                  <thead><tr><th>Minutes ahead</th>{overlayLabels.map((label) => <th key={label}>{label}<br />Baseline → preview</th>)}</tr></thead>
                  <tbody>{result.rows.map((row) => (
                    <tr key={row.minutesAhead}>
                      <td>+{row.minutesAhead} min</td>
                      {overlayLabels.map((label) => {
                        const overlay = row.organCp.find((item) => item.label === label);
                        return <td key={label}>{overlay ? `${format(overlay.baseline)} → ${format(overlay.hypothetical)} ${overlay.unit}` : '—'}</td>;
                      })}
                    </tr>
                  ))}</tbody>
                </table>
              </div>
              <p className="as-caption">Separate Cp comparison scenarios; these curves do not replace the reference concentrations or change H/N.</p>
            </>
          )}
          <h3 style={{ marginTop: 20 }}>Concentration context</h3>
          {clinicalMeaning && <p className="as-caption">{clinicalMeaning}</p>}
          <p className="as-caption">{respiratoryDrugContext(drug)}</p>
          <details>
            <summary>Models &amp; sources</summary>
            <p className="as-caption">{drugs[drug].model}. {drugs[drug].limitations}</p>
            <p><a href={drugs[drug].source} target="_blank" rel="noreferrer">{drugs[drug].name} · source model</a></p>
            {clinicalMeaning && <p className="as-caption">{ANALGESIA_CONTEXT_SOURCE}</p>}
            {overlayLabels.length > 0 && drug === 'dexmedetomidine' && (
              <p className="as-caption">
                The hepatic comparison applies the label’s total-clearance ratio
                to the reference PK model, with other parameters unchanged. No
                corresponding Ce or PD adjustment is assumed.{' '}
                <a href={DEX_HEPATIC_SOURCE} target="_blank" rel="noreferrer">Dexmedetomidine label</a>
              </p>
            )}
            {result.nmbPresent && (
              <>
                <ul>{result.nmbNotes.map((note) => <li key={note}>{note}</li>)}</ul>
                <p><a href={ROCURONIUM_SOURCE} target="_blank" rel="noreferrer">Kleijn et al. · rocuronium TOF model</a></p>
              </>
            )}
            {respiratoryRelevant && (
              <>
                {result.respiratoryNotes.map((note) => <p key={note} className="as-caption">{note}</p>)}
                <a href={RESPIRATORY_SOURCE} target="_blank" rel="noreferrer">LaPierre et al. · respiratory-compromise surface</a>
              </>
            )}
          </details>
        </section>
      )}
    </div>
  );
}
