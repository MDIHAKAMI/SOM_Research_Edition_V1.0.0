// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { createCase, type Entry } from './engine';
export function demoCase() {
  const c = createCase({ age: 29, sex: 'male', weight: 100, height: 190 });
  c.demo = true;
  c.sevoLag = true;
  c.elapsed = 3000;
  c.phase = 'maintenance';
  const rows: Omit<Entry, 'id'>[] = [
    {
      t: 0,
      kind: 'record',
      label: 'Midazolam 2 mg IV · recorded, effect not modeled',
      value: 2,
      unit: 'mg',
    },
    {
      t: 900,
      kind: 'bolus',
      drug: 'propofol',
      value: 200,
      label: 'Propofol 200 mg IV',
      unit: 'mg',
    },
    {
      t: 900,
      kind: 'bolus',
      drug: 'fentanyl',
      value: 200,
      label: 'Fentanyl 200 µg IV',
      unit: 'µg',
    },
    { t: 900, kind: 'event', label: 'Induction' },
    {
      t: 1080,
      kind: 'sevo',
      value: 2.31,
      label: 'Measured ET sevo 2.31%',
      unit: '%',
    },
    {
      t: 2100,
      kind: 'bolus',
      drug: 'fentanyl',
      value: 50,
      label: 'Fentanyl 50 µg IV',
      unit: 'µg',
    },
    {
      t: 2700,
      kind: 'infusion',
      drug: 'dexmedetomidine',
      value: 40 / 60,
      label: 'Dexmedetomidine 40 µg/h · synthetic demo assumption',
      unit: 'µg/min',
    },
  ];
  c.entries = rows.map((r, i) => ({ ...r, id: 'demo-' + i }));
  return c;
}
