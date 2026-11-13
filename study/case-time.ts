// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
// Calendar inputs use Riyadh time explicitly, independent of the device time zone.
const WINDOW_MS = 86400000;
export function riyadhInput(stamp: number | string) {
  return new Date((typeof stamp === 'string' ? Date.parse(stamp) : stamp) + 10800000)
    .toISOString().slice(0, 19);
}
export function parseRiyadhInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(value))
    throw Error('Enter a valid Riyadh date and time.');
  const normalized = value.length === 16 ? value + ':00' : value;
  const stamp = Date.parse(normalized + '+03:00');
  if (!Number.isFinite(stamp) || riyadhInput(stamp) !== normalized)
    throw Error('Enter a valid Riyadh date and time.');
  return new Date(stamp).toISOString();
}
export function caseStartAt(now: number, minutesBefore: string | number = 0) {
  if (String(minutesBefore).trim() === '') throw Error('Enter how many minutes ago the case started.');
  const minutes = Number(minutesBefore);
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1439)
    throw Error('Enter a start within the past 1,439 minutes.');
  return new Date(Math.floor((now - minutes * 60000) / 1000) * 1000).toISOString();
}
export function canonicalStart(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value)))
    throw Error('Enter a valid case start time.');
  return new Date(value).toISOString();
}
export function validateCaseStart(value: unknown, now: number) {
  const iso = canonicalStart(value), stamp = Date.parse(iso);
  if (stamp > now + 5000 || stamp < now - WINDOW_MS)
    throw Error('The case must start within the past 24 hours, not in the future.');
  return iso;
}
export function occurrenceAt(value: string, start: string, now: number) {
  const observedAt = parseRiyadhInput(value), stamp = Date.parse(observedAt), origin = Date.parse(start);
  if (stamp < origin) throw Error('This time is before the case start. Enter a time within this case.');
  if (stamp > now) throw Error('The administration time cannot be in the future.');
  if (stamp > origin + WINDOW_MS) throw Error('Enter a time within the 24-hour case window.');
  return { observedAt, t: Math.floor((stamp - origin) / 1000) };
}
