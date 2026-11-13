// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { clockLabel, type Sample, type Entry } from '@/simulation/engine';
export const colors = {
  sevo: '#69dfc2',
  propofol: '#6eb6ff',
  fentanyl: '#d1a0ff',
  dexmedetomidine: '#f6c873',
};
export const titles = {
  sevo: 'Sevoflurane',
  propofol: 'Propofol',
  fentanyl: 'Fentanyl',
  dexmedetomidine: 'Dexmedetomidine',
};
export type Track = keyof typeof colors;
export function Plot({
  samples,
  track,
  startClock,
  entries,
  windowMinutes,
  height = 145,
  showCp = false,
  normalized = false,
}: {
  samples: Sample[];
  track: Track;
  startClock: string;
  entries: Entry[];
  windowMinutes: number;
  height?: number;
  showCp?: boolean;
  normalized?: boolean;
}) {
  const end = samples.at(-1)?.t ?? 0,
    start = windowMinutes ? Math.max(0, end - windowMinutes * 60) : 0;
  const rows = useMemo(() => {
    const all = samples.slice(start);
    const stride = Math.max(1, Math.ceil(all.length / 850));
    const mandatory = new Set(
      entries
        .filter((e) => e.t >= start && e.t <= end)
        .flatMap((e) => [e.t - 1, e.t, e.t + 1]),
    );
    return all
      .filter((s, i) => i % stride === 0 || s.t === end || mandatory.has(s.t))
      .map((s) => ({
        t: s.t,
        cp: track === 'sevo' ? s.et : s.drugs[track].cp,
        ce: track === 'sevo' ? s.sevoCe : s.drugs[track].ce,
        tolerance:
          s.antinociceptiveState === null ? null : s.antinociceptiveState * 100,
        response: s.movement === null ? null : s.movement * 100,
      }));
  }, [samples.length, start, end, track, entries, samples]);
  const unit = normalized
    ? '%'
    : track === 'sevo'
      ? 'vol.%'
      : track === 'propofol'
        ? 'µg/mL'
        : 'ng/mL';
  return (
    <div
      className="plot"
      style={{ height }}
      role="img"
      aria-label={
        normalized
          ? 'Model-predicted incision probabilities over case time'
          : titles[track] + ' concentrations in ' + unit
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={rows}
          margin={{ top: 12, right: 20, bottom: 0, left: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="#273540"
            strokeDasharray="3 5"
          />
          <XAxis
            type="number"
            dataKey="t"
            domain={[start, Math.max(start + 60, end)]}
            tickFormatter={(t) =>
              clockLabel(startClock, Math.round(t)).slice(-8, -3)
            }
            stroke="#859aa9"
            fontSize={12}
            minTickGap={45}
            tickLine={false}
          />
          <YAxis
            domain={normalized ? [0, 100] : [0, 'auto']}
            width={56}
            tickFormatter={(v) => Number(v).toFixed(normalized ? 0 : 1)}
            stroke="#859aa9"
            fontSize={12}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{
              background: '#14232d',
              border: '1px solid #3b5260',
              borderRadius: 8,
              color: '#edf5f8',
            }}
            labelFormatter={(v) =>
              clockLabel(startClock, Math.round(Number(v)))
            }
            formatter={(v, name) => [
              v == null ? 'Not modeled' : Number(v).toFixed(3) + ' ' + unit,
              String(name),
            ]}
          />
          {entries
            .filter((e) => e.kind === 'event' && e.t >= start && e.t <= end)
            .map((e) => (
              <ReferenceLine
                key={e.id}
                x={e.t}
                stroke="#b6c6d0"
                strokeDasharray="3 4"
              />
            ))}
          {normalized ? (
            <>
              <Line
                type="linear"
                dataKey="tolerance"
                name="Predicted incision tolerance"
                stroke="#69dfc2"
                dot={false}
                isAnimationActive={false}
              />
              <Line
                type="linear"
                dataKey="response"
                name="Predicted movement to incision"
                stroke="#ffafb1"
                dot={false}
                isAnimationActive={false}
              />
            </>
          ) : (
            <>
              {(track === 'sevo' || showCp || track === 'dexmedetomidine') && (
                <Line
                  type={track === 'sevo' ? 'stepAfter' : 'linear'}
                  dataKey="cp"
                  name={
                    track === 'sevo' ? 'Measured ET (manual)' : 'Predicted Cp'
                  }
                  stroke={colors[track]}
                  strokeDasharray={track === 'sevo' ? '' : '4 3'}
                  strokeWidth={1.6}
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="linear"
                dataKey="ce"
                name={
                  track === 'sevo' ? 'Estimated BIS-linked lag' : 'Predicted Ce'
                }
                stroke={colors[track]}
                strokeDasharray={track === 'sevo' ? '5 4' : ''}
                strokeWidth={2.3}
                dot={false}
                isAnimationActive={false}
              />
            </>
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
