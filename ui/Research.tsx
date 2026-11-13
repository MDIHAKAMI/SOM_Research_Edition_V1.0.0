// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useState } from 'react';
import { Download, ArrowUpRight } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Choice, Evidence, Probability } from './controls';
import { Engine, clockLabel, type Sample } from '@/simulation/engine';
import { registry } from '@/pharmacology/models/registry';
import {
  download,
  exportData,
  timeSeriesCSV,
  eventsCSV,
  historyCSV,
} from '@/research-export/export';
/** @deprecated Legacy panel; the current research interface is CaseWorkspace. */
export function Research({
  engine,
  snap,
}: {
  engine: Engine;
  snap: (s: Sample) => void;
}) {
  const [interval, setInterval] = useState('1'),
    [reference, setReference] = useState(false);
  const c = engine.data,
    s = engine.current;
  const exportFile = (type: string) => {
    const prefix = 'anesthesia-' + c.id.slice(0, 8);
    if (type === 'json')
      download(
        prefix + '.json',
        JSON.stringify(exportData(engine, Number(interval)), null, 2),
      );
    else
      download(
        prefix + '-' + type + '.csv',
        type === 'events'
          ? eventsCSV(engine)
          : type === 'history'
            ? historyCSV(engine)
            : timeSeriesCSV(engine, Number(interval)),
        'text/csv;charset=utf-8',
      );
  };
  return (
    <section className="research-grid">
      <div className="panel research-card">
        <div className="eyebrow">REPRODUCIBLE CASE DATA</div>
        <h2>Research export</h2>
        <p>
          Export inputs, population-model estimates and observed endpoints.
          Empty CSV cells and JSON nulls indicate unavailable predictions.
        </p>
        <div className="stats">
          <div>
            <b>{engine.samples.length.toLocaleString()}</b>
            <span>one-second samples</span>
          </div>
          <div>
            <b>{engine.events.length}</b>
            <span>clinical snapshots</span>
          </div>
          <div>
            <b>{c.entries.filter((e) => e.kind === 'sevo').length}</b>
            <span>ET updates</span>
          </div>
        </div>
        <label className="field-label">
          Time-series interval
          <Choice
            label="Export interval"
            value={interval}
            onChange={setInterval}
            items={[1, 5, 10, 30, 60].map((v) => ({
              value: String(v),
              label: v + ' seconds',
            }))}
          />
        </label>
        <div className="export-buttons">
          <button className="primary" onClick={() => exportFile('json')}>
            <Download size={16} />
            Complete JSON
          </button>
          <button onClick={() => exportFile('timeseries')}>
            Time-series CSV
          </button>
          <button onClick={() => exportFile('events')}>
            Event snapshots CSV
          </button>
          <button onClick={() => exportFile('history')}>
            Input history CSV
          </button>
        </div>
        <p className="small">
          Complete JSON retains every administration and exact event snapshot at
          all export intervals. Counterfactual references are excluded from
          patient predictions. Files remain on your device until you choose to
          share them.
        </p>
        <h3>Observed clinical endpoints</h3>
        {engine.events.map((ev) => (
          <button
            className="case-item"
            key={ev.entry.id}
            onClick={() => snap(ev.sample)}
          >
            {ev.entry.label}
            <time>{clockLabel(c.startClock, ev.entry.t)}</time>
          </button>
        ))}
        {!engine.events.length && (
          <p className="empty">
            Marked endpoints and extubation snapshots will appear here.
          </p>
        )}
      </div>
      <div className="panel research-card">
        <div className="eyebrow">MODEL EXPLORATION</div>
        <h2>Pairwise reference surface</h2>
        <p>
          Vereecke 2013, control group without nitrous oxide. This reference
          treats current ET sevo and predicted fentanyl Cp as equilibrium
          inputs.
        </p>
        <label className="switch-label">
          <Switch checked={reference} onCheckedChange={setReference} />
          Show counterfactual pairwise reference
        </label>
        {reference && (
          <div className="counterfactual">
            <Evidence kind="experimental">
              Counterfactual · not a patient prediction
            </Evidence>
            <p className="small">
              Excludes all other drugs, assumes equilibrium and ignores
              population mismatch. This is not the combined anesthetic state.
            </p>
            <Probability
              label="Pairwise incision tolerance"
              value={s.pairReference?.toleranceIncision ?? null}
            />
            <Probability
              label="Pairwise hemodynamic tolerance"
              value={s.pairReference?.toleranceHemodynamic ?? null}
            />
          </div>
        )}
        <h3>Multidrug heuristic</h3>
        <Evidence />
        <p>
          This legacy panel does not calculate H/N. The current case workspace
          displays the exploratory H/N indices; they are not validated response
          probabilities.
        </p>
        <h3>Saudi population research</h3>
        <p className="small">
          Observed outcomes are preserved alongside fixed model versions. No
          Saudi calibration or prospective clinical validation is claimed.
          Optional study covariates remain off and require a later
          protocol-driven extension.
        </p>
      </div>
    </section>
  );
}
export function Models() {
  return (
    <>
      <div className="model-intro">
        <div>
          <div className="eyebrow">TRACEABLE BY DESIGN</div>
          <h2>Model registry</h2>
          <p>
            Published equations, explicit assumptions and unavailable modules.
            “Published model” describes the source, not validation of this
            software.
          </p>
        </div>
        <button
          onClick={() =>
            download(
              'anesthesia-model-registry.json',
              JSON.stringify(registry, null, 2),
            )
          }
        >
          <Download size={16} />
          Export registry
        </button>
      </div>
      <div className="legend">
        <Evidence kind="published" />
        <Evidence kind="approximation" />
        <Evidence kind="experimental" />
        <Evidence />
      </div>
      <div className="model-grid">
        {registry.map((m) => (
          <article className="panel model-card" key={m.id}>
            <div className="section-heading">
              <span className="eyebrow">{m.drug}</span>
              <span className="secondary">
                v{m.version} · {m.status}
              </span>
            </div>
            <h2>{m.name}</h2>
            <Evidence kind={m.category} />
            <p>{m.endpoint}</p>
            <dl>
              <dt>Population</dt>
              <dd>{m.population}</dd>
              <dt>Age / weight</dt>
              <dd>
                {m.ageRange} · {m.weightRange}
              </dd>
              <dt>Covariates</dt>
              <dd>{m.covariates.join(', ') || 'None / not applicable'}</dd>
              <dt>ke0</dt>
              <dd>
                {m.ke0 === null
                  ? 'Not implemented / not applicable'
                  : m.ke0 + ' min⁻¹'}
              </dd>
            </dl>
            <details>
              <summary>Equations & coefficients</summary>
              <pre>{JSON.stringify(m.coefficients, null, 2)}</pre>
            </details>
            <p className="small">{m.notes}</p>
            <div className="limitations">{m.limitations}</div>
            <p className="small">{m.publication}</p>
            <div className="sources">
              {m.sources.map((url, i) => (
                <a key={url} href={url} target="_blank" rel="noreferrer">
                  Source {i + 1}
                  <ArrowUpRight size={13} />
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
