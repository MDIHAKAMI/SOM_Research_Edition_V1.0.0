// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useState } from 'react';
import { Choice } from './controls';
import { titles } from './Charts';
import { DRUGS, type Drug } from '@/pharmacology/pk/models';
import {
  clockLabel,
  newId,
  type Entry,
  type CaseData,
} from '@/simulation/engine';
const others = [
  'Midazolam',
  'Ketamine',
  'Remifentanil',
  'Alfentanil',
  'Sufentanil',
  'Morphine',
  'Hydromorphone',
  'Thiopental',
  'Etomidate',
  'Lidocaine',
  'Paracetamol',
  'NSAID',
  'Dexamethasone',
  'Local anesthetic',
  'Regional anesthesia',
];
export default function EntryForm({
  type,
  initialDrug,
  c,
  add,
}: {
  type: string;
  initialDrug: string;
  c: CaseData;
  add: (entries: Entry[]) => void;
}) {
  const [drug, setDrug] = useState(initialDrug),
    [kind, setKind] = useState(
      initialDrug === 'dexmedetomidine' ? 'infusion' : 'bolus',
    ),
    [amount, setAmount] = useState(''),
    [unit, setUnit] = useState('absolute'),
    [duration, setDuration] = useState('600'),
    [time, setTime] = useState(clockLabel(c.startClock, c.elapsed).slice(-8)),
    [day, setDay] = useState(
      clockLabel(c.startClock, c.elapsed).startsWith('D+') ? '1' : '0',
    ),
    [error, setError] = useState('');
  return (
    <form
      className="entry-form"
      onSubmit={(e) => {
        e.preventDefault();
        try {
          if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time))
            throw Error('Enter an exact HH:MM:SS timestamp.');
          const seconds = (v: string) =>
              v.split(':').reduce((a, b) => a * 60 + Number(b), 0),
            t = seconds(time) - seconds(c.startClock) + Number(day) * 86400;
          if (t < 0 || t > 86400)
            throw Error(
              'Timestamp outside the case; select day +1 after midnight.',
            );
          const v = Number(amount);
          let en: Entry;
          if (type === 'sevo')
            en = {
              id: newId(),
              t,
              kind: 'sevo',
              value: v,
              unit: '%',
              label: 'Measured ET sevo ' + v + '%',
            };
          else if (type === 'record')
            en = {
              id: newId(),
              t,
              kind: 'record',
              label:
                drug +
                (amount.trim() ? ' · ' + amount.trim() : '') +
                ' · effect not modeled',
            };
          else {
            if (v <= 0 && kind !== 'infusion')
              throw Error('A simulated dose must be positive.');
            const d = drug as Drug,
              u = d === 'propofol' ? 'mg' : 'µg';
            en = {
              id: newId(),
              t,
              kind: kind as Entry['kind'],
              drug: d,
              value:
                kind === 'infusion'
                  ? (v * (unit === 'weight' ? c.patient.weight : 1)) / 60
                  : v,
              unit: kind === 'infusion' ? u + '/min' : u,
              label:
                titles[d] +
                ' ' +
                v +
                ' ' +
                u +
                (kind === 'infusion'
                  ? unit === 'weight'
                    ? '/kg/h'
                    : '/h'
                  : '') +
                ' · ' +
                kind,
              ...(kind === 'loading' ? { duration: Number(duration) } : {}),
            };
          }
          add([en]);
        } catch (e) {
          setError(String(e));
        }
      }}
    >
      {type === 'drug' && (
        <>
          <label>
            Drug
            <Choice
              label="Drug"
              value={drug}
              onChange={(v) => {
                setDrug(v);
                if (v === 'dexmedetomidine' && kind === 'bolus')
                  setKind('loading');
              }}
              items={DRUGS.map((d) => ({ value: d, label: titles[d] }))}
            />
          </label>
          <label>
            Administration
            <Choice
              label="Administration type"
              value={kind}
              onChange={setKind}
              items={(drug === 'dexmedetomidine'
                ? ['loading', 'infusion']
                : ['bolus', 'infusion', 'loading']
              ).map((v) => ({
                value: v,
                label:
                  v === 'bolus'
                    ? 'IV bolus'
                    : v === 'infusion'
                      ? 'Continuous infusion / rate change'
                      : 'Timed loading infusion',
              }))}
            />
          </label>
        </>
      )}
      {type === 'record' && (
        <label>
          Agent / intervention
          <Choice
            label="Unmodeled agent"
            value={drug}
            onChange={setDrug}
            items={others.map((d) => ({ value: d, label: d }))}
          />
        </label>
      )}
      <div className="form-grid">
        <label>
          Timestamp
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
        <label>
          Case day
          <Choice
            label="Case day"
            value={day}
            onChange={setDay}
            items={[
              { value: '0', label: 'Day 0' },
              { value: '1', label: 'Day +1' },
            ]}
          />
        </label>
      </div>
      <label>
        {type === 'sevo'
          ? 'Measured end-tidal concentration · %'
          : type === 'record'
            ? 'Dose / route or intervention detail (no identifiers)'
            : kind === 'infusion'
              ? 'Infusion rate · ' +
                (drug === 'propofol' ? 'mg' : 'µg') +
                (unit === 'weight' ? '/kg/h' : '/h')
              : 'Total simulated dose · ' + (drug === 'propofol' ? 'mg' : 'µg')}
        <input
          required={type !== 'record'}
          type={type === 'record' ? 'text' : 'number'}
          step="any"
          min="0"
          max={type === 'sevo' ? 10 : 1000000}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={type === 'record' ? 'e.g. 2 mg IV' : 'Enter value'}
          autoFocus
        />
      </label>
      {type === 'drug' && kind === 'infusion' && (
        <>
          <Choice
            label="Infusion units"
            value={unit}
            onChange={setUnit}
            items={[
              {
                value: 'absolute',
                label: drug === 'propofol' ? 'mg/h' : 'µg/h',
              },
              {
                value: 'weight',
                label: drug === 'propofol' ? 'mg/kg/h' : 'µg/kg/h',
              },
            ]}
          />
          <p className="small">
            Enter 0 to stop continuous infusion. Compartment amounts are
            preserved. Timed loading infusions finish independently.
          </p>
        </>
      )}
      {type === 'drug' && kind === 'loading' && (
        <label>
          Loading duration · seconds
          <input
            required
            type="number"
            min="1"
            step="1"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
          />
        </label>
      )}
      {type === 'sevo' && (
        <p className="small">
          Enter the measured workstation reading. Vaporizer OFF does not imply
          an immediate ET concentration of zero.
        </p>
      )}
      {type === 'record' && (
        <p className="small">
          Recorded without a numerical concentration or composite effect.
        </p>
      )}
      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <button type="submit" className="primary">
        Add to case timeline
      </button>
    </form>
  );
}
