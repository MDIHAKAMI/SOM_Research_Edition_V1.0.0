// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import {
  DRUG_IDS,
  drugs,
  type Trace,
  type PKChoice,
} from '@/study/pharmacology';
import { multimodal, contextAt, type Contribution } from '@/study/multimodal';
import {
  ANCHORS,
  N_PROFILES,
  PD_VERSION,
  validatePDContext,
  type PDContext,
} from '@/study/pd-registry';
import { activeEntries, type Entry } from '@/study/live';
import { HN_SOURCES, HN_MODEL_ASSUMPTIONS, REFERENCE_CURVE } from '@/study/hn-coefficients';
import { Sheet, NumberField } from './atlas-controls';
const fmt = (n: number | null | undefined) =>
  n == null || !Number.isFinite(n) ? '—' : n.toFixed(3);
function ContributionDetail({ c }: { c: Contribution }) {
  return (
    <article className="hn-contribution">
      <div className="as-section-head">
        <h3>
          {drugs[c.drug].name} · {c.domain}
        </h3>
        <strong>
          {fmt(c.value)} {c.domain}-units
        </strong>
      </div>
      <p>{c.reason || c.anchor?.endpoint}</p>
      <dl className="hn-data">
        <dt>Calculation</dt><dd>{c.formula}</dd>
        <dt>Input</dt><dd>{fmt(c.exposure)} · {c.exposureBasis}</dd>
        <dt>Status</dt><dd>{c.status}</dd>
        {c.opioidCoordinate != null && <><dt>Opioid coordinate</dt><dd>{fmt(c.opioidCoordinate)} fentanyl-reference units</dd></>}
        {c.flags.length > 0 && <><dt>Assumptions / range</dt><dd>{c.flags.join('; ')}</dd></>}
      </dl>
      {c.anchor && (
        <dl className="hn-data">
          <dt>Reference</dt>
          <dd>{c.anchor.endpoint}</dd>
          <dt>Reference parameter</dt>
          <dd>
            {c.anchor.value ?? 'See formula'} {c.anchor.units} ·{' '}
            {c.anchor.exposureType}
          </dd>
          <dt>Anchor type</dt>
          <dd>{c.anchor.anchorType}</dd>
          <dt>Evidence / mapping</dt>
          <dd>
            {c.status} · literature-derived construction; H/N remains exploratory
          </dd>
          <dt>Context</dt>
          <dd>{c.anchor.clinicalContext || c.anchor.backgroundDrugs}</dd>
          <dt>Population</dt>
          <dd>{c.anchor.population}</dd>
          <dt>Age / weight</dt>
          <dd>
            {c.anchor.ageAdjustment}; {c.anchor.weightAdjustment}
          </dd>
          <dt>Limits</dt>
          <dd>{c.anchor.limitations}</dd>
          <dt>Sources</dt>
          <dd>
            {c.sourceIds.map(id => {
              const source = HN_SOURCES[id];
              return source ? <p key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.study}</a>{source.pmid ? ` · PMID ${source.pmid}` : ''}</p> : <p key={id}>{id}</p>;
            })}
            {c.sourceIds.length === 0 && <span>Structural zero or omitted coefficient; see the stated reason.</span>}
          </dd>
          <dt>Version</dt>
          <dd>
            {c.anchor.id} · {c.anchor.version}
          </dd>
        </dl>
      )}
    </article>
  );
}
export function HNGraph({
  trace,
  choice,
  age,
  entries,
  cursor,
  onContext,
  readonly = false,
}: {
  trace: Trace[];
  choice: PKChoice;
  age: number;
  entries: Entry[];
  cursor: number;
  onContext: (ctx: PDContext) => Promise<void>;
  readonly?: boolean;
}) {
  const [inspect, setInspect] = useState(''),
    [map, setMap] = useState(false),
    [settings, setSettings] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const currentContext = contextAt(entries, cursor),
    [draft, setDraft] = useState<PDContext>(currentContext);
  const rows = useMemo(
    () =>
      trace.map((s) => {
        const v = multimodal(s, choice, age, contextAt(entries, s.t));
        return { minute: s.t / 60, H: v.H.value, N: v.N.value };
      }),
    [trace, choice, age, entries],
  );
  const c = trace.findLast((s) => s.t <= cursor) ?? trace[0];
  if (!c) return null;
  const state = multimodal(c, choice, age, currentContext),
    markers = activeEntries(entries).filter((e) => e.kind === 'clinical');
  const tail = rows.filter(
      (r) =>
        r.minute <= cursor / 60 &&
        r.minute >= cursor / 60 - 10 &&
        r.H !== null &&
        r.N !== null,
    ),
    xmax = Math.max(1, ...tail.map((v) => v.H!)),
    ymax = Math.max(1, ...tail.map((v) => v.N!));
  const before = rows.findLast((r) => r.minute <= cursor / 60 - 1);
  const trend = (d: 'H' | 'N') => {
    const a = state[d].value,
      b = before?.[d];
    if (a == null || b == null) return 'Trend unavailable';
    return Math.abs(a - b) < 0.005
      ? 'Stable over 1 min'
      : a > b
        ? 'Rising over 1 min'
        : 'Falling over 1 min';
  };
  return (
    <section
      className="as-panel hn-panel"
      aria-label="Graph 1: two-domain exploratory state"
    >
      <div className="as-section-head">
        <div>
          <small>GRAPH 1 · EXPLORATORY</small>
          <h2>Exploratory Multimodal State</h2>
        </div>
        <button
          disabled={readonly}
          onClick={() => {
            setDraft(currentContext);
            setSettings(true);
            setError('');
          }}
        >
          Record context
        </button>
      </div>
      <p className="as-caption">
        H adds each drug’s hypnosis contribution. N combines stimulus-tolerance contributions,
        with opioids pooled through one reference curve. Both are exploratory indices;
        neither has an established clinical adequacy threshold.
      </p>
      {(['H', 'N'] as const).map((domain) => (
        <div className="hn-domain" key={domain}>
          <div className="as-section-head">
            <div>
              <h3>
                {domain === 'H'
                  ? 'Hypnosis / Responsiveness'
                  : 'Antinociception / Stimulus Tolerance'}
              </h3>
              <small>
                {state[domain].complete
                  ? 'All applicable active-drug calculations available'
                  : 'Partial index · ' +
                    state[domain].excluded
                      .map((d) => drugs[d].name)
                      .join(', ') +
                    ' unquantified'}
              </small>
              {state[domain].omitted.length > 0 && <small className="hn-trend">No assigned {domain} credit: {state[domain].omitted.map(d => drugs[d].name).join(', ')}</small>}
              <small className="hn-trend">{state.version} · {state.tailPolicy} extrapolation</small>
            </div>
            <button
              className="hn-value"
              onClick={() => setInspect(domain)}
              aria-label={`Inspect ${domain} contributions`}
            >
              {fmt(state[domain].value)} <span>{domain}-units</span>
              <small className="hn-trend">{trend(domain)}</small>
            </button>
          </div>
          <div className="hn-chart">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={rows}
                margin={{ top: 10, right: 18, left: 8, bottom: 8 }}
              >
                <CartesianGrid stroke="#e4ebf2" vertical={false} />
                <XAxis
                  dataKey="minute"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  tickFormatter={(v) => Number(v).toFixed(0)}
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  width={58}
                  label={{
                    value: domain + '-units',
                    angle: -90,
                    position: 'insideLeft',
                    fontSize: 11,
                  }}
                  domain={[0, 'auto']}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
                  formatter={(v: any) => [
                    fmt(Number(v)) + ` ${domain}-units`,
                    domain,
                  ]}
                />
                <Line
                  dataKey={domain}
                  stroke={domain === 'H' ? '#007c91' : '#a86428'}
                  strokeWidth={2.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls={false}
                />
                {markers.map((e) => (
                  <ReferenceLine
                    key={e.id}
                    x={e.t / 60}
                    stroke="#bdc7ce"
                    strokeDasharray="2 5"
                  />
                ))}
                <ReferenceLine
                  x={cursor / 60}
                  stroke="#475f70"
                  strokeDasharray="5 3"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ))}
      <div className="as-row hn-actions">
        <small>Time since start · minutes</small>
        <button onClick={() => setMap(!map)}>
          {map ? 'Hide' : 'Show'} H/N state map
        </button>
        <button onClick={() => setInspect('registry')}>
          Coefficients &amp; equations
        </button>
      </div>
      {map && (
        <figure className="hn-map">
          <svg
            viewBox="0 0 440 255"
            role="img"
            aria-label="Exploratory Multimodal State Map: hypnosis on horizontal axis, antinociception on vertical axis, preceding ten minutes"
          >
            <path d="M50 15 V210 H425" fill="none" stroke="#738798" />
            <text x="170" y="250">
              Hypnosis · H-units
            </text>
            <text x="15" y="160" transform="rotate(-90 15 160)">
              Antinociception · N-units
            </text>
            <text x="35" y="227">
              0
            </text>
            <text x="380" y="227">
              {xmax.toFixed(1)}
            </text>
            <text x="20" y="25">
              {ymax.toFixed(1)}
            </text>
            <polyline
              points={tail
                .map(
                  (r) =>
                    `${50 + (365 * r.H!) / xmax},${210 - (185 * r.N!) / ymax}`,
                )
                .join(' ')}
              fill="none"
              stroke="#007c91"
              strokeWidth="2.5"
            />
            {tail.length > 0 && (
              <circle
                cx={50 + (365 * tail.at(-1)!.H!) / xmax}
                cy={210 - (185 * tail.at(-1)!.N!) / ymax}
                r="5"
                fill="#007c91"
              />
            )}
          </svg>
          <figcaption>
            Exploratory Multimodal State Map · previous 10 minutes. Axes rescale
            to shown exposures. No adequate/inadequate zones.
          </figcaption>
        </figure>
      )}
      <Sheet
        open={!!inspect}
        close={() => setInspect('')}
        title={
          inspect === 'registry'
            ? 'Coefficient registry & equations'
            : `${inspect} contributions at ${(cursor / 60).toFixed(1)} min`
        }
        description="Each contribution retains its concentration basis, equation and supporting evidence."
      >
        {inspect === 'registry' ? (
          <>
            <p><b>H = sum of drug-specific hypnosis credits.</b> Direct reference concentrations and hypnotic-sparing relationships determine the individual functions.</p>
            <p><b>N = [opioid pool + ketamine + propofol + dexmedetomidine + volatile MAC terms] / 0.59.</b> The opioid pool and ketamine coordinate are each passed through the fentanyl reference curve. Opioids share one pooled curve so splitting an equivalent opioid exposure does not create extra points.</p>
            <p>A drug can contribute even when the reference drug is absent. Published pair probabilities remain separate. Recorded stimulus context does not change H/N.</p>
            <details><summary>Reference curve and modeling assumptions</summary><pre>{JSON.stringify(REFERENCE_CURVE, null, 2)}</pre><pre>{JSON.stringify(HN_MODEL_ASSUMPTIONS, null, 2)}</pre></details>
            <div className="hn-table-wrap">
              <table className="hn-table">
                <thead>
                  <tr>
                    <th>Drug / domain</th>
                    <th>Equation / input</th>
                    <th>Endpoint &amp; evidence</th>
                    <th>Assumptions and parameters</th>
                  </tr>
                </thead>
                <tbody>
                  {ANCHORS.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {drugs[a.drug].name} · {a.domain}
                      </td>
                      <td>
                        {a.formula}
                        <br />
                        {a.binding} · {a.units}
                      </td>
                      <td>
                        {a.endpoint}
                        <br />
                        {a.anchorType}
                        <br />
                        {a.sourceIds?.map(id => {
                          const source = HN_SOURCES[id];
                          return source ? <p key={id}><a href={source.url} target="_blank" rel="noreferrer">{source.study}</a></p> : null;
                        })}
                      </td>
                      <td>
                        {a.enabled ? 'Calculated from the specified exposure' : 'No assigned contribution'}
                        <br />
                        {a.limitations}
                        <details>
                          <summary>Derivation, parameters and population</summary>
                          <p>{a.derivation}</p>
                          <pre>{JSON.stringify({ parameters: a.parameters, knots: a.knots, assumptions: a.assumptions }, null, 2)}</pre>
                          <p>{a.population}</p>
                          <p>
                            {a.clinicalContext}; {a.backgroundDrugs}
                          </p>
                          <p>
                            {a.ageAdjustment}; {a.weightAdjustment}
                          </p>
                          <p>
                            {a.citation} · DOI {a.doi || 'not verified'} ·{' '}
                            {a.id} · {a.version}
                          </p>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>Registry {PD_VERSION}. The numerical coefficients are traceable to the listed studies and declared approximations. This does not establish clinical thresholds for the combined indices.</p>
          </>
        ) : (
          <>
            {state.contributions
              .filter((v) => v.domain === inspect && v.active)
              .map((c) => (
                <ContributionDetail key={c.drug} c={c} />
              ))}
            {!state.contributions.some((v) => v.active) && (
              <p>No active drug exposure.</p>
            )}
            <details>
              <summary>Inactive drugs</summary>
              {DRUG_IDS.filter(
                (d) =>
                  !state.contributions.some((c) => c.drug === d && c.active),
              ).map((d) => (
                <p key={d}>{drugs[d].name}: no active exposure</p>
              ))}
            </details>
          </>
        )}
      </Sheet>
      <Sheet
        open={settings}
        close={() => !saving && setSettings(false)}
        title="Record observation context"
        description="Context is stored with observations and used by published pair models where applicable. It does not change H/N or PK."
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setSaving(true);
            setError('');
            try {
              await onContext(validatePDContext(draft));
              setSettings(false);
            } catch (err) {
              setError(String(err));
            } finally {
              setSaving(false);
            }
          }}
        >
          <label>
            Recorded stimulus category
            <select
              value={draft.nProfile}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  nProfile: e.target.value as PDContext['nProfile'],
                })
              }
            >
              {Object.entries(N_PROFILES).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <NumberField
            label="Nitrous oxide · % (blank = unknown; 0 = none)"
            value={draft.n2oPercent ?? ''}
            max={100}
            onChange={(v) =>
              setDraft({ ...draft, n2oPercent: v === '' ? null : Number(v) })
            }
          />
          <label>
            Spinal bupivacaine
            <select
              value={
                draft.spinalBupivacaine === null
                  ? 'unknown'
                  : String(draft.spinalBupivacaine)
              }
              onChange={(e) =>
                setDraft({
                  ...draft,
                  spinalBupivacaine:
                    e.target.value === 'unknown'
                      ? null
                      : e.target.value === 'true',
                })
              }
            >
              <option value="unknown">Not recorded</option>
              <option value="true">Present</option>
              <option value="false">Absent</option>
            </select>
          </label>
          <NumberField
            label="Observed BIS · 0–100 (optional)"
            value={draft.bis ?? ''}
            max={100}
            onChange={(v) =>
              setDraft({ ...draft, bis: v === '' ? null : Number(v) })
            }
          />
          <p className="as-caption">
            Changes apply from the current case time. Earlier event snapshots
            remain unchanged. Selecting an endpoint does not make a missing
            model available.
          </p>
          {error && <p className="as-error">{error}</p>}
          <button className="as-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save reference context'}
          </button>
        </form>
      </Sheet>
    </section>
  );
}
