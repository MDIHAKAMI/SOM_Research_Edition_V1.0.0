// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend } from 'recharts';
import type { Agent, Trace } from '@/study/pharmacology';
import type { OrganComparisonResult } from '@/study/organ-comparison';

export function OrganComparison({ drug, trace, result, cursor }: {
  drug: Agent; trace: Trace[]; result: OrganComparisonResult; cursor: number;
}) {
  const overlays = result.overlays.filter(o => o.drug === drug);
  const unavailable = result.unavailable.filter(o => o.drug === drug);
  if (!overlays.length && !unavailable.length) return null;
  return <section className="som-organ-comparison">
    <h3>Organ function comparison</h3>
    {overlays.map(o => {
      const current = o.points.findLast(s => s.t <= cursor);
      const base = trace.findLast(s => s.t <= cursor);
      const standard = new Map(trace.map(s => [s.t, s.cp[drug]]));
      const rows = o.points.map(s => ({ minute: s.t / 60, standard: standard.get(s.t), comparison: s.cp }));
      return <div key={o.id}>
        <div className="som-comparison-values">
          <div><small>Usual model · Cp</small><strong>{base?.cp[drug].toFixed(3) ?? '—'}</strong><small>{o.unit}</small></div>
          <div><small>{o.label} · probable Cp</small><strong>{current?.cp.toFixed(3) ?? '—'}</strong><small>{o.unit}</small></div>
        </div>
        <div className="as-chart som-small-chart">
          <ResponsiveContainer width="100%" height="100%"><LineChart data={rows}>
            <CartesianGrid stroke="#e4ebf2" vertical={false}/><XAxis dataKey="minute" type="number" domain={['dataMin','dataMax']} tickFormatter={v => Number(v).toFixed(0)}/><YAxis domain={[0,'auto']} width={48}/>
            <Tooltip labelFormatter={v => `${Number(v).toFixed(1)} min`} formatter={(v: any,n: any) => [Number(v).toFixed(3)+' '+o.unit,n]}/><Legend/>
            <Line dataKey="standard" name="Usual Cp" stroke="#007c91" dot={false} isAnimationActive={false}/>
            <Line dataKey="comparison" name="Hepatic scenario Cp" stroke="#9a5b25" strokeDasharray="6 3" dot={false} isAnimationActive={false}/>
          </LineChart></ResponsiveContainer>
        </div>
        <p className="as-caption">{o.limitations[0]}</p>
        <details><summary>Comparison basis</summary>{o.limitations.slice(1).map(t => <p key={t}>{t}</p>)}<a href={o.source} target="_blank" rel="noreferrer">Source</a></details>
      </div>;
    })}
    {unavailable.map(u => <p className="as-caption" key={u.organ}>{u.organ === 'renal' ? 'Kidney' : 'Liver'}: {u.reason}</p>)}
  </section>;
}
