// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useMemo } from 'react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { Patient } from '@/pharmacology/pk/models';
import { clinicalContext, rocContext } from '@/study/clinical-context';
import { activeEntries, type Entry } from '@/study/live';
import { drugs, type PKChoice, type Trace } from '@/study/pharmacology';
import { respiratoryEstimate } from '@/study/respiratory';
import {
  ROCURONIUM_SOURCE,
  rocuroniumParameters,
  rocuroniumTOFR,
} from '@/study/rocuronium';

export interface ClinicalEndpointProps {
  trace: Trace[];
  patient: Patient;
  choice: PKChoice;
  cursor: number;
  entries?: Entry[];
  osa?: boolean;
}

/** The whole recorded curve uses the first reversal, even when the cursor is earlier. */
export function rocuroniumReversalTime(patient: Patient, entries: Entry[]): number | null {
  return activeEntries(entries)
    .filter((entry) => entry.kind === 'clinical' &&
      entry.data?.name === 'Neuromuscular reversal' &&
      Number.isFinite(entry.t) && entry.t >= 0)
    .reduce<number | null>((earliest, entry) =>
      earliest === null ? entry.t : Math.min(earliest, entry.t),
      rocContext(patient.clinical).reversalAt);
}

const fmt = (n: number | null | undefined, digits = 3) =>
  n == null || !Number.isFinite(n) ? '—' : n.toFixed(digits);

function concentration(trace: Trace, compartment: 'cp' | 'ce', drug: string) {
  return (trace[compartment] as Record<string, number | null>)[drug];
}

function EndpointPlot({
  rows,
  cursor,
  entries,
  label,
  percent = false,
  reversalAt,
}: {
  rows: { minute: number; value: number | null }[];
  cursor: number;
  entries: Entry[];
  label: string;
  percent?: boolean;
  reversalAt?: number | null;
}) {
  return (
    <div className="as-chart" role="img" aria-label={`${label} over time in minutes`}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ top: 16, right: 22, left: 8, bottom: 8 }}>
          <CartesianGrid stroke="#e4ebf2" vertical={false} />
          <XAxis
            dataKey="minute"
            type="number"
            domain={['dataMin', 'dataMax']}
            tickFormatter={(v) => Number(v).toFixed(0)}
            tick={{ fontSize: 12 }}
          />
          <YAxis
            width={52}
            domain={percent ? [0, 100] : [0, 1.1]}
            ticks={percent ? [0, 25, 50, 75, 100] : [0, 0.2, 0.4, 0.6, 0.8, 1, 1.1]}
            tickFormatter={(v) => percent ? `${v}%` : String(v)}
            tick={{ fontSize: 12 }}
            allowDataOverflow
          />
          <Tooltip
            labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
            formatter={(value: unknown) => [
              fmt(typeof value === 'number' ? value : null, percent ? 1 : 3) + (percent ? '%' : ''),
              label,
            ]}
            contentStyle={{ borderRadius: 10, color: '#18344c' }}
          />
          <Line
            dataKey="value"
            name={label}
            stroke={percent ? '#9a5b25' : '#2e6981'}
            strokeWidth={2.5}
            type="linear"
            dot={false}
            isAnimationActive={false}
            connectNulls={false}
          />
          {activeEntries(entries).filter((e) => e.kind === 'clinical').map((event) => (
            <ReferenceLine key={event.id} x={event.t / 60} stroke="#bccbd8" strokeDasharray="3 4" />
          ))}
          {reversalAt != null && (
            <ReferenceLine
              x={reversalAt / 60}
              stroke="#a86543"
              strokeDasharray="3 3"
              label={{ value: 'Reversal', position: 'insideTopRight', fontSize: 11 }}
            />
          )}
          <ReferenceLine x={cursor / 60} stroke="#516478" strokeDasharray="5 4" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function NeuromuscularEndpoint({
  trace,
  patient,
  cursor,
  entries = [],
}: ClinicalEndpointProps) {
  const result = useMemo(() => {
    const context = rocContext(patient.clinical);
    context.reversalAt = rocuroniumReversalTime(patient, entries);
    try {
      const parameters = rocuroniumParameters(patient, context);
      const exposed = trace.some((s) =>
        (concentration(s, 'cp', 'rocuronium') ?? 0) > 1e-8 ||
        (concentration(s, 'ce', 'rocuronium') ?? 0) > 1e-8,
      );
      const rows = trace.map((s) => ({
        minute: s.t / 60,
        value: exposed ? rocuroniumTOFR(
          concentration(s, 'ce', 'rocuronium') ?? NaN,
          parameters, context, s.t,
        ).raw : null,
      }));
      const current = trace.findLast((s) => s.t <= cursor);
      const currentCe = current ? concentration(current, 'ce', 'rocuronium') : null;
      const estimate = current && exposed
        ? rocuroniumTOFR(currentCe ?? NaN, parameters, context, cursor)
        : null;
      return { context, parameters, rows, currentCe, estimate, exposed, error: '' };
    } catch (error) {
      return {
        context, parameters: null, rows: [], currentCe: null,
        estimate: null, exposed: false,
        error: error instanceof Error ? error.message : 'Rocuronium model inputs are unavailable.',
      };
    }
  }, [trace, patient, cursor, entries]);
  const clinical = clinicalContext(patient.clinical);
  const notes = result.estimate?.notes ?? result.parameters?.notes ?? [];
  const rangeNotes = notes.filter((note) =>
    note.startsWith('Outside') || note.startsWith('Severe renal'),
  );
  const afterReversal = result.context.reversalAt !== null && cursor >= result.context.reversalAt;
  const unavailable = result.error || (
    result.context.otherBlocker ? 'Unavailable with another neuromuscular blocker.' :
    afterReversal ? 'Prediction stops at reversal; reversal effects are not modeled.' :
    !result.exposed ? 'Add rocuronium to display its predicted TOF ratio.' :
    !result.estimate?.available ? 'Effect site concentration is unavailable at this time.' : ''
  );

  return (
    <div aria-label="Neuromuscular endpoint">
      <div className="as-section-head">
        <div>
          <h3>Rocuronium · predicted TOF ratio</h3>
          <small>
            {result.context.sevo === 'sevo' ? 'Fixed sevoflurane scenario' : 'No-sevoflurane reference scenario'}
          </small>
        </div>
        <strong>{result.estimate?.available ? fmt(result.estimate.raw) : 'Unavailable'}</strong>
      </div>
      <p className="as-caption">
        TOF ratio is T4/T1, not probability of paralysis. The curve is the
        rocuronium-alone prediction, separate from hypnosis and analgesia.
      </p>
      {unavailable && <p className="as-caption" role="status">{unavailable}</p>}
      {result.context.reversalAt !== null && (
        <p className="as-caption">Rocuronium concentrations and TOF ratio after reversal are not modeled.</p>
      )}
      {!result.error && <EndpointPlot rows={result.rows} cursor={cursor} entries={entries} label="Predicted TOF ratio" reversalAt={result.context.reversalAt} />}
      <div className="as-row">
        <span>Rocuronium Ce: {result.estimate?.available ? fmt(result.currentCe) : '—'} µmol/L</span>
        <small>Raw ratio · source baseline 1.04</small>
      </div>
      {result.context.crcl === null && (
        <p className="as-caption">CrCl is imputed from age; no measured renal value was entered.</p>
      )}
      {rangeNotes.length > 0 && (
        <p className="as-caption">Outside the spontaneous TOFR source range; applicability is limited. See model details.</p>
      )}
      {result.context.sevo === 'sevo' && (
        <p className="as-caption">Spontaneous-recovery prediction was less accurate in the source sevoflurane group.</p>
      )}
      {(clinical.knownLiverDisease || clinical.dialysis) && (
        <p className="as-caption">
          {clinical.knownLiverDisease ? 'No cirrhosis-specific TOFR adjustment. ' : ''}
          {clinical.dialysis ? 'Dialysis effects are not modeled.' : ''}
        </p>
      )}
      <details style={{ marginTop: 16 }}>
        <summary>Model &amp; evidence</summary>
        <p className="as-caption">
          Kleijn et al. (2011), rocuronium-alone component. Predicted raw TOFR =
          1.04 / [1 + (Ce / EC50)<sup>7.52</sup>]; EC50 = {fmt(result.parameters?.ec50, 4)} µmol/L.
          The source used acceleromyography at the adductor pollicis. A predicted
          ratio cannot replace measured neuromuscular recovery.
        </p>
        {notes.length > 0 && <ul>{notes.map((note) => <li key={note}>{note}</li>)}</ul>}
        <p className="as-caption">
          Doses are rocuronium bromide mg, converted with 609.7 g/mol. The
          original executable was not recovered; this is an implementation of
          the published equations. Changing volatile concentrations, other
          blockers and reversal are not modeled.
        </p>
        <a href={ROCURONIUM_SOURCE} target="_blank" rel="noreferrer">Kleijn et al. · original model</a>
      </details>
    </div>
  );
}

export function RespiratoryEndpoint({
  trace,
  patient,
  choice,
  cursor,
  entries = [],
  osa,
}: ClinicalEndpointProps) {
  const result = useMemo(() => {
    const clinical = clinicalContext(patient.clinical);
    const context = {
      knownLiverDisease: clinical.knownLiverDisease,
      knownKidneyDisease: clinical.knownKidneyDisease,
      osa,
      bmi: patient.weight / (patient.height / 100) ** 2,
    };
    const rows = trace.map((sample) => {
      const estimate = respiratoryEstimate(sample, choice, patient.age, context);
      return { minute: sample.t / 60, value: estimate.probability === null ? null : 100 * estimate.probability };
    });
    const current = trace.findLast((sample) => sample.t <= cursor);
    return {
      rows,
      current,
      estimate: current ? respiratoryEstimate(current, choice, patient.age, context) : null,
    };
  }, [trace, patient, choice, cursor, osa]);
  const estimate = result.estimate;
  const names = estimate?.excluded.map((drug) => drugs[drug]?.name ?? drug) ?? [];

  return (
    <div aria-label="Exploratory respiratory endpoint">
      <div className="as-section-head">
        <div>
          <h3>Respiratory compromise · exploratory</h3>
          <small>Propofol / remifentanil pair · adapted exposure linkage</small>
        </div>
        <strong>{estimate?.probability == null ? 'Unavailable' : `${fmt(100 * estimate.probability, 1)}%`}</strong>
      </div>
      <p className="as-caption">
        Model probability of RR ≤4/min or airway obstruction under the source
        conditions. This is not an isolated-apnea probability.
        Low-stimulation, near-equilibrium model; rapid bolus effects may be underestimated.
      </p>
      {names.length > 0 && (
        <p className="as-caption">
          Pair-only estimate. Excluded: {names.join(', ')}. Their respiratory
          effects are not included in this number.
        </p>
      )}
      {estimate?.status.includes('extrapolation') && (
        <p className="as-caption">Outside one or more source conditions; see model details.</p>
      )}
      {estimate?.probability == null && (
        <p className="as-caption" role="status">{estimate?.note ?? 'Concentrations are unavailable at this time.'}</p>
      )}
      <EndpointPlot rows={result.rows} cursor={cursor} entries={entries} label="Exploratory respiratory compromise" percent />
      <div className="as-row">
        <span>Propofol Ce: {fmt(result.current?.ce.propofol)} µg/mL</span>
        <span>Remifentanil Ce: {fmt(result.current?.ce.remifentanil)} ng/mL</span>
      </div>
      <details style={{ marginTop: 16 }}>
        <summary>Model &amp; evidence</summary>
        <p className="as-caption">{estimate?.note ?? 'The LaPierre surface requires propofol and remifentanil effect site concentrations.'}</p>
        <p className="as-caption">
          LaPierre et al. (2012): p = propofol Ce / (4.3 µg/mL), r = remifentanil
          Ce / (6.7 ng/mL), z = p + r + 9.7pr; probability = z² / (1 + z²).
          The published surface is applied to this app’s Schnider/Minto Ce;
          equivalence to the original effect site implementation is not established.
          Zero Ce gives the equation’s baseline, not zero clinical risk.
        </p>
        <a href={estimate?.source ?? 'https://doi.org/10.1097/ALN.0b013e31825fb1b2'} target="_blank" rel="noreferrer">
          LaPierre et al. · original respiratory endpoint
        </a>
      </details>
    </div>
  );
}
