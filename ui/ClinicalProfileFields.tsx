// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import type { Patient } from '@/pharmacology/pk/models';
import {
  clinicalContext,
  type ClinicalContext,
} from '@/study/clinical-context';
import { NumberField } from './atlas-controls';

export interface ClinicalProfileFieldsProps {
  value: Patient;
  onChange: (patient: Patient) => void;
  readonly?: boolean;
}

function CheckField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 18, height: 18, minHeight: 18, flexShrink: 0 }}
      />
      {label}
    </label>
  );
}

const optionalNumber = (value: string) => value === '' ? null : Number(value);

/** Clinical context only; no model choice or demographic values are inferred. */
export function ClinicalProfileFields({
  value,
  onChange,
  readonly = false,
}: ClinicalProfileFieldsProps) {
  const context = clinicalContext(value.clinical);
  const change = (update: Partial<ClinicalContext>) =>
    onChange({ ...value, clinical: { ...context, ...update } });
  const changeNmb = (update: Partial<ClinicalContext['nmb']>) =>
    change({ nmb: { ...context.nmb, ...update } });
  const renalField = (
    <NumberField
      label="Creatinine clearance · mL/min (optional)"
      value={context.crcl ?? ''}
      onChange={(v) => change({ crcl: optionalNumber(v) })}
      min={0}
      max={300}
    />
  );

  return (
    <fieldset
      disabled={readonly}
      aria-label="Organ function and neuromuscular model context"
      style={{ border: 0, padding: 0, margin: '20px 0', minWidth: 0 }}
    >
      <div className="as-grid">
        <div>
          <CheckField
            label="Known liver disease"
            checked={context.knownLiverDisease}
            onChange={(checked) => change({ knownLiverDisease: checked })}
          />
          {context.knownLiverDisease && (
            <div style={{ marginTop: 12 }}>
              <NumberField
                label="Child–Pugh score (optional)"
                value={context.childPughScore ?? ''}
                onChange={(v) => change({ childPughScore: optionalNumber(v) })}
                min={5}
                max={15}
                step="1"
              />
            </div>
          )}
        </div>
        <div>
          <CheckField
            label="Known kidney disease"
            checked={context.knownKidneyDisease}
            onChange={(checked) => change({
              knownKidneyDisease: checked,
              dialysis: checked ? context.dialysis : false,
            })}
          />
          {context.knownKidneyDisease && (
            <div style={{ marginTop: 12 }}>
              {renalField}
              <p className="as-caption">
                Use unindexed CrCl in mL/min, not eGFR in mL/min/1.73 m².
              </p>
              <CheckField
                label="Receiving dialysis"
                checked={context.dialysis}
                onChange={(checked) => change({ dialysis: checked })}
              />
            </div>
          )}
        </div>
      </div>
      <details style={{ marginTop: 20 }}>
        <summary>Neuromuscular model context</summary>
        <div className="as-grid" style={{ marginTop: 14 }}>
          <label>
            Rocuronium anesthesia scenario
            <select
              value={context.nmb.sevo}
              onChange={(event) => changeNmb({
                sevo: event.target.value as ClinicalContext['nmb']['sevo'],
              })}
            >
              <option value="none">No sevoflurane · reference scenario</option>
              <option value="sevo">Fixed sevoflurane scenario</option>
            </select>
          </label>
          <label>
            Original model population coefficient
            <select
              value={context.nmb.race}
              onChange={(event) => changeNmb({
                race: event.target.value as ClinicalContext['nmb']['race'],
              })}
            >
              <option value="reference">Non-Asian reference coefficient</option>
              <option value="asian">Asian coefficient</option>
            </select>
          </label>
          {!context.knownKidneyDisease && renalField}
          <NumberField
            label="Reversal given · minutes from case start (optional)"
            value={context.nmb.reversalAt === null ? '' : context.nmb.reversalAt / 60}
            onChange={(v) => changeNmb({
              reversalAt: v === '' ? null : Math.round(Number(v) * 60),
            })}
            min={0}
            max={1440}
          />
          <CheckField
            label="Another neuromuscular blocker was given"
            checked={context.nmb.otherBlocker}
            onChange={(checked) => changeNmb({ otherBlocker: checked })}
          />
        </div>
        <p className="as-caption">
          Fixed source scenarios, independent of the current end tidal value.
          Population coefficients are not assigned from nationality. CrCl is
          unindexed; when blank, the rocuronium model uses the source age
          imputation. TOF prediction stops at the recorded reversal time and is
          unavailable with another blocker.
        </p>
      </details>
    </fieldset>
  );
}
