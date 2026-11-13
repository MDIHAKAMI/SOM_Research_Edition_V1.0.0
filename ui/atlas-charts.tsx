// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { memo, useMemo, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  DRUG_IDS,
  drugs,
  ageMAC,
  type Trace,
  type Agent,
  type PKChoice,
} from '@/study/pharmacology';
import { publishedPairs, PAIR_MODELS } from '@/study/pair-registry';
import { contextAt } from '@/study/multimodal';
import { activeEntries, type Entry } from '@/study/live';
import type { PDContext } from '@/study/pd-registry';
import { HNGraph } from './hn-graph';
import type { Patient } from '@/pharmacology/pk/models';
import { NeuromuscularEndpoint, RespiratoryEndpoint, rocuroniumReversalTime } from './ClinicalEndpoints';
import { HN_EFFECT_SITES } from '@/study/hn-effect-sites';
export const ink: Record<Agent, string> = {
  propofol: '#007c91',
  sevoflurane: '#3377c9',
  desflurane: '#7452b5',
  remifentanil: '#dc6e24',
  fentanyl: '#c04968',
  dexmedetomidine: '#9b4ca0',
  ketamine: '#957012',
  alfentanil: '#4f7629',
  morphine: '#5c667d',
  hydromorphone: '#946194',
  midazolam: '#148775',
  sufentanil: '#93381e',
  rocuronium: '#657943',
};
const colors = ['#007c91', '#a86428', '#3377c9', '#7452b5', '#9b4ca0'];
const pairLabels: Record<string, string> = {
  'prop-remi-h': 'Prop/remi · unresponsiveness',
  'prop-remi-airway': 'Prop/remi · laryngoscopy tolerance',
  'sevo-remi-h': 'Sevo/remi · unresponsiveness',
  'sevo-fent-movement': 'Sevo/fent · no incision movement',
  'sevo-fent-bar': 'Sevo/fent · no HR/SBP response',
};
const fmt = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(3);
export const Charts = memo(function Charts({
  trace,
  choice,
  age,
  patient,
  osa,
  entries,
  cursor,
  education = false,
  onContext,
  readonly = false,
}: {
  trace: Trace[];
  choice: PKChoice;
  age: number;
  patient: Patient;
  osa?: boolean;
  entries: Entry[];
  cursor: number;
  education?: boolean;
  onContext: (ctx: PDContext) => Promise<void>;
  readonly?: boolean;
}) {
  const [selected, setSelected] = useState<Agent>('propofol'),
    [view, setView] = useState('all'),
    [hidden, setHidden] = useState<string[]>([]);
  const active = DRUG_IDS.filter((d) => trace.some((s) => s.cp[d] > 1e-8));
  const namedEffectSite = HN_EFFECT_SITES.find((link) => link.drug === selected);
  const reversalAt = useMemo(() => rocuroniumReversalTime(patient, entries), [patient, entries]);
  const currentRocUnavailable = reversalAt !== null && cursor >= reversalAt;
  const rows = useMemo(
    () =>
      trace.map((s) => ({
        minute: s.t / 60,
        Cp: selected === 'rocuronium' && reversalAt !== null && s.t >= reversalAt ? null : s.cp[selected],
        Ce: selected === 'rocuronium' && reversalAt !== null && s.t >= reversalAt
          ? null : Number.isFinite(s.ce[selected]) ? s.ce[selected] : null,
        dexMoaas:
          selected === 'dexmedetomidine'
            ? s.endpointCe?.dexmedetomidineMoaas
            : null,
        hnEffectSite: namedEffectSite ? s.endpointCe?.[namedEffectSite.key] ?? null : null,
        MAC: ['sevoflurane', 'desflurane'].includes(selected)
          ? s.cp[selected] / ageMAC(selected, age)
          : null,
        ...Object.fromEntries(
          publishedPairs(s, choice, age, contextAt(entries, s.t)).map((p) => [
            p.modelId,
            p.probability === null ? null : 100 * p.probability,
          ]),
        ),
        ...Object.fromEntries(
          DRUG_IDS.map((d) => [
            d,
            d === 'rocuronium' && reversalAt !== null && s.t >= reversalAt ? null : s.effect[d] /
              (['sevoflurane', 'desflurane'].includes(d)
                ? ageMAC(d, age)
                : drugs[d].scale),
          ]),
        ),
      })),
    [trace, selected, choice, age, entries, reversalAt, namedEffectSite],
  );
  const c = trace.findLast((s) => s.t <= cursor) ?? trace[0],
    pairs = c ? publishedPairs(c, choice, age, contextAt(entries, c.t)) : [],
    volatile = ['sevoflurane', 'desflurane'].includes(selected);
  const toggle = (key: string) =>
    setHidden((v) =>
      v.includes(key) ? v.filter((k) => k !== key) : [...v, key],
    );
  return (
    <>
      <HNGraph
        trace={trace}
        choice={choice}
        age={age}
        entries={entries}
        cursor={cursor}
        onContext={onContext}
        readonly={readonly}
      />
      <section
        className="as-panel as-charts"
        aria-label="Graph 2: concentrations and published endpoint models"
      >
        <div className="as-section-head">
          <div>
            <small>GRAPH 2 · PK / PUBLISHED PD</small>
            <h2>Concentrations &amp; named endpoints</h2>
            <small>
              {education ? 'Simulated time' : 'Time since case start'} · minutes
            </small>
          </div>
          <div className="as-segments">
            {[
              ['all', 'All drugs'],
              ['single', 'Individual drug'],
              ['effects', 'Published endpoints'],
              ['nmb', 'Neuromuscular'],
              ['respiratory', 'Respiratory · exploratory'],
            ].map(([v, l]) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        {view === 'nmb' ? <NeuromuscularEndpoint trace={trace} patient={patient} choice={choice} cursor={cursor} entries={entries} /> :
          view === 'respiratory' ? <><p className="as-caption">Additional respiratory tool: outside the verification analyses reported in the study.</p><RespiratoryEndpoint trace={trace} patient={patient} choice={choice} cursor={cursor} entries={entries} osa={osa} /></> : <>
        {view === 'single' && (
          <div className="as-row as-chart-select">
            <label>
              Drug
              <select
                value={selected}
                onChange={(e) => setSelected(e.target.value as Agent)}
              >
                {DRUG_IDS.map((d) => (
                  <option key={d} value={d}>
                    {drugs[d].name}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {drugs[selected].unit} ·{' '}
              {volatile
                ? 'ET left axis / age-adjusted MAC right axis'
                : 'Cp solid / Ce dashed'}
            </span>
          </div>
        )}
        {view === 'all' && (
          <>
            <p className="as-caption">
              Separate curves: exposure ÷ display reference; volatiles use
              age-adjusted MAC. Curves are not added and do not represent
              equivalent potency. Predicted concentrations in their original units appear below.
            </p>
            <div className="as-segments hn-toggles">
              {active.map((d) => (
                <button
                  key={d}
                  aria-pressed={!hidden.includes(d)}
                  onClick={() => toggle(d)}
                  style={{ borderBottomColor: ink[d] }}
                >
                  {drugs[d].name}
                </button>
              ))}
            </div>
          </>
        )}
        {view === 'effects' && (
          <p className="as-caption">
            Endpoint-specific population probabilities for the named pair only.
            Additional drugs are listed as excluded. These probabilities do not
            predict the full regimen.
          </p>
        )}
        {reversalAt !== null && ((view === 'all' && active.includes('rocuronium')) || (view === 'single' && selected === 'rocuronium')) && (
          <p className="as-caption">Rocuronium concentrations after reversal are not modeled; those parts of the curves are omitted.</p>
        )}
        <div className="as-chart">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={rows}
              margin={{ top: 16, right: 22, left: 8, bottom: 8 }}
            >
              <CartesianGrid stroke="#e4ebf2" vertical={false} />
              <XAxis
                dataKey="minute"
                type="number"
                domain={['dataMin', 'dataMax']}
                tickFormatter={(v) => Number(v).toFixed(0)}
              />
              <YAxis
                yAxisId="left"
                width={48}
                domain={view === 'effects' ? [0, 100] : [0, 'auto']}
                tick={{ fontSize: 12 }}
              />
              {view === 'single' && volatile && (
                <YAxis
                  yAxisId="mac"
                  orientation="right"
                  width={45}
                  domain={[0, 'auto']}
                  tick={{ fontSize: 12 }}
                />
              )}
              <Tooltip
                labelFormatter={(v) => `${Number(v).toFixed(1)} min`}
                formatter={(v: any, n: any) => [
                  fmt(Number(v)) + (view === 'effects' ? '%' : ''),
                  n,
                ]}
                contentStyle={{ borderRadius: 10, color: '#18344c' }}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
              {view === 'effects' ? (
                pairs.map((p, i) => (
                  <Line
                    yAxisId="left"
                    key={p.modelId}
                    dataKey={p.modelId}
                    name={pairLabels[p.modelId]}
                    stroke={colors[i]}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                ))
              ) : view === 'all' ? (
                active
                  .filter((d) => !hidden.includes(d))
                  .map((d) => (
                    <Line
                      yAxisId="left"
                      key={d}
                      dataKey={d}
                      name={drugs[d].name}
                      stroke={ink[d]}
                      strokeWidth={2}
                      dot={false}
                      isAnimationActive={false}
                    />
                  ))
              ) : (
                <>
                  <Line
                    yAxisId="left"
                    dataKey="Cp"
                    name={
                      volatile
                        ? 'Measured ET · %'
                        : 'Cp · ' + drugs[selected].unit
                    }
                    stroke={ink[selected]}
                    strokeWidth={2.5}
                    dot={false}
                    isAnimationActive={false}
                  />
                  {!volatile && (
                    <Line
                      yAxisId="left"
                      dataKey="Ce"
                      name={
                        selected === 'dexmedetomidine'
                          ? 'Ce · BIS'
                          : 'Ce · ' + drugs[selected].unit
                      }
                      stroke={ink[selected]}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}{' '}
                  {namedEffectSite && (
                    <Line
                      yAxisId="left"
                      dataKey="hnEffectSite"
                      name={`${namedEffectSite.domain} endpoint Ce · ${namedEffectSite.key}`}
                      stroke={ink[selected]}
                      strokeWidth={2}
                      strokeDasharray="2 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                  {selected === 'dexmedetomidine' && (
                    <Line
                      yAxisId="left"
                      dataKey="dexMoaas"
                      name="Ce · MOAA/S (0.0428/min)"
                      stroke="#497153"
                      strokeWidth={2}
                      strokeDasharray="2 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}{' '}
                  {volatile && (
                    <Line
                      yAxisId="mac"
                      dataKey="MAC"
                      name="MAC fraction · right axis"
                      stroke="#667788"
                      strokeDasharray="5 4"
                      dot={false}
                      isAnimationActive={false}
                    />
                  )}
                </>
              )}
              {activeEntries(entries)
                .filter((e) => e.kind === 'clinical')
                .map((e) => (
                  <ReferenceLine
                    yAxisId="left"
                    key={e.id}
                    x={e.t / 60}
                    stroke="#bccbd8"
                    strokeDasharray="3 4"
                  />
                ))}
              <ReferenceLine
                yAxisId="left"
                x={cursor / 60}
                stroke="#516478"
                strokeDasharray="5 4"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {view === 'effects' ? (
          <div className="hn-pairs">
            {pairs.map((p) => (
              <article key={p.modelId}>
                <div className="as-section-head">
                  <h3>
                    {PAIR_MODELS.find((m) => m.id === p.modelId)!
                      .drugs.map((d) => drugs[d].name)
                      .join(' / ')}
                  </h3>
                  <strong>
                    {p.probability === null
                      ? 'Unavailable'
                      : (p.probability * 100).toFixed(1) + '%'}
                  </strong>
                </div>
                <p>{p.endpoint}</p>
                <small>
                  {p.reason || p.interpretation}
                  {p.excluded.length > 0
                    ? ' Excluded: ' +
                      p.excluded.map((d) => drugs[d].name).join(', ') +
                      '.'
                    : ''}
                  {p.contextExcluded.length > 0
                    ? ' Excluded background: ' +
                      p.contextExcluded.join(', ') +
                      '.'
                    : ''}
                </small>
                <details>
                  <summary>Model &amp; evidence</summary>
                  <p>{p.exposure}</p>
                  <p>{PAIR_MODELS.find((m) => m.id === p.modelId)!.equation}</p>
                  <p>
                    {Object.entries(p.parameters)
                      .map(([k, v]) => `${k}=${v}`)
                      .join('; ')}
                  </p>
                  <p>{p.limitations}</p>
                  <a href={p.source} target="_blank" rel="noreferrer">
                    Source · {p.evidenceGrade}
                  </a>
                </details>
              </article>
            ))}
          </div>
        ) : (
          c && (
            <div className="hn-table-wrap">
              <table className="hn-table">
                <thead>
                  <tr>
                    <th>Drug</th>
                    <th>Cp / ET</th>
                    <th>Ce</th>
                    <th>Units</th>
                    <th>MAC / endpoint Ce</th>
                  </tr>
                </thead>
                <tbody>
                  {active.map((d) => (
                    <tr key={d}>
                      <td>{drugs[d].name}</td>
                      <td>{fmt(d === 'rocuronium' && currentRocUnavailable ? null : c.cp[d])}</td>
                      <td>{fmt(d === 'rocuronium' && currentRocUnavailable ? null : c.ce[d])}</td>
                      <td>{drugs[d].unit}</td>
                      <td>
                        {['sevoflurane', 'desflurane'].includes(d)
                          ? fmt(c.cp[d] / ageMAC(d, age)) + ' MAC'
                          : d === 'dexmedetomidine'
                            ? fmt(c.endpointCe?.dexmedetomidineMoaas) +
                              ' ng/mL MOAA/S'
                            : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
        <details className="hn-literature">
          <summary>Interaction literature registry</summary>
          <p>
            No published pair output is added to Graph 1. No continuous curve is
            invented from a few MAC-sparing points. No universal model for
            arbitrary three-or-more-drug regimens is claimed.
          </p>
          {PAIR_MODELS.map((m) => (
            <p key={m.id}>
              <a href={m.source} target="_blank" rel="noreferrer">
                {m.drugs.map((d) => drugs[d].name).join(' / ')} · {m.endpoint}
              </a>
              <br />
              {m.executable
                ? 'Executable named endpoint model'
                : 'Literature only'}{' '}
              · {m.limitations}
            </p>
          ))}
        </details>
        </>}
      </section>
      <aside className="hn-notice">
        <strong>Research/Educational Simulation</strong>
        <p>
          PK/PD outputs are population-model estimates. Exploratory H/N indices
          are not validated measures of anesthetic adequacy. Clinical decisions
          must not be based solely on these calculations.
        </p>
      </aside>
    </>
  );
});
