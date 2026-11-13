// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useState } from 'react';
import { Plus, Play, FolderOpen, ChevronRight, Upload } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Choice, fmt } from './controls';
import { colors } from './Charts';
import { createCase, clockLabel, type CaseData } from '@/simulation/engine';
import { demoCase } from '@/simulation/demo';
import { importCase } from '@/simulation/storage';
import { bmi, lbm, type Patient } from '@/pharmacology/pk/models';
export default function StartCase({
  load,
  saved,
  error,
}: {
  load: (c: CaseData) => void;
  saved: CaseData[];
  error: (e: string) => void;
}) {
  const [p, setP] = useState<Patient>({
      age: 29,
      sex: 'male',
      weight: 100,
      height: 190,
    }),
    [time, setTime] = useState('09:00:00'),
    [lag, setLag] = useState(false);
  return (
    <section className="start-grid">
      <div className="welcome panel">
        <div className="eyebrow">A TRANSPARENT VIEW OF ANESTHESIA</div>
        <h1>
          Every dose. Every second.
          <br />
          Every observed response.
        </h1>
        <p>
          Create a simulated case to explore predicted concentrations and
          capture observed endpoints. No patient identifiers are collected.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            try {
              load(createCase(p, time, lag));
            } catch (e) {
              error(String(e));
            }
          }}
        >
          <div className="form-grid">
            <label>
              Age · years
              <input
                required
                type="number"
                min="18"
                max="90"
                value={p.age}
                onChange={(e) => setP({ ...p, age: Number(e.target.value) })}
              />
            </label>
            <label>
              Biological sex
              <Choice
                value={p.sex}
                onChange={(v) => setP({ ...p, sex: v as Patient['sex'] })}
                label="Biological sex"
                items={[
                  { value: 'male', label: 'Male' },
                  { value: 'female', label: 'Female' },
                ]}
              />
            </label>
            <label>
              Weight · kg
              <input
                required
                type="number"
                step=".1"
                min="35"
                max="200"
                value={p.weight}
                onChange={(e) => setP({ ...p, weight: Number(e.target.value) })}
              />
            </label>
            <label>
              Height · cm
              <input
                required
                type="number"
                step=".1"
                min="140"
                max="210"
                value={p.height}
                onChange={(e) => setP({ ...p, height: Number(e.target.value) })}
              />
            </label>
            <label>
              Case starts at
              <input
                required
                type="time"
                step="1"
                value={time}
                onChange={(e) =>
                  setTime(
                    e.target.value.length === 5
                      ? e.target.value + ':00'
                      : e.target.value,
                  )
                }
              />
            </label>
            <div className="covariates">
              BMI <b>{fmt(bmi(p), 1)}</b> kg/m²
              <br />
              James LBM <b>{fmt(lbm(p), 1)}</b> kg
            </div>
          </div>
          <label className="switch-label">
            <Switch checked={lag} onCheckedChange={setLag} />
            Optional sevoflurane BIS-linked lag estimate
          </label>
          <p className="small">
            Mourisse 2007, ke0 0.48/min. A literature-derived lag surrogate, not
            an incision or brain measurement.
          </p>
          <button className="primary" type="submit">
            <Plus size={18} />
            Create case
          </button>
        </form>
      </div>
      <aside className="start-aside">
        <section className="panel demo-card">
          <div className="eyebrow">EXPLORE THE FRAMEWORK</div>
          <h2>Open the example case</h2>
          <p>
            29 years · male · 100 kg · 190 cm
            <br />
            09:00–09:50 · paused at maintenance
          </p>
          <div className="demo-lines">
            {Object.entries(colors).map(([k, v]) => (
              <span key={k} style={{ color: v }}>
                {k}
              </span>
            ))}
          </div>
          <p className="small">
            The dexmedetomidine rate was unspecified. This synthetic example
            uses 40 µg/h solely to demonstrate accumulation. All curves are
            computed.
          </p>
          <button onClick={() => load(demoCase())}>
            <Play size={16} />
            Load example
          </button>
        </section>
        <section className="panel library">
          <h2>
            <FolderOpen size={20} />
            Saved cases
          </h2>
          {saved.length === 0 ? (
            <p>No cases saved on this browser yet.</p>
          ) : (
            saved.map((c) => (
              <button className="case-item" key={c.id} onClick={() => load(c)}>
                <span>
                  {c.demo ? 'Example case' : 'Simulated case'}
                  <small>
                    {c.patient.age} y · {c.patient.weight} kg ·{' '}
                    {clockLabel(c.startClock, c.elapsed)}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))
          )}
          <label className="upload">
            <Upload size={16} />
            Import case JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={async (e) => {
                try {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 100000000) throw Error('File is too large');
                    load(await importCase(await f.text()));
                  }
                } catch (err) {
                  error(String(err));
                }
                e.target.value = '';
              }}
            />
          </label>
        </section>
      </aside>
    </section>
  );
}
