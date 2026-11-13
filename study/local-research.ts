// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/* Copyright (c) 2026 Mohammed Hakami. See LICENSE for terms of use. */
import { eventSnapshot } from './event-snapshot';
import { canonicalStart, validateCaseStart } from './case-time';
import { validatePDContext } from './pd-registry';
import { simulate, RELEASE } from './pharmacology';
import {
  LIVE_VERSION, validateSetup, makeDose, timeline, activeEntries, elapsed,
  validateClinical, type Entry, type LiveSession,
} from './live';

/** Local recording is not an authenticated or externally time-stamped service. */
export const LOCAL_TIME_SOURCE = 'local-device-unverified' as const;
export const LOCAL_RESEARCH_SCHEMA = 'som-local-research-1' as const;
export const LOCAL_BACKUP_SCHEMA = 'som-research-backup-1' as const;

export interface LocalStudy {
  id: string;
  name: string;
  protocol: string;
  created_at: string;
  role: 'local';
}
export interface LocalSession extends LiveSession {
  createdAt: string;
  recorder: string;
  timeSource: typeof LOCAL_TIME_SOURCE;
}
export interface LocalResearchCase {
  session: LocalSession;
  entries: Entry[];
}
export interface LocalFeedback {
  id: string;
  studyId: string;
  author: string;
  created_at: string;
  data: { instrument: string; release: string; ratings: number[]; comment: string; role: string };
}
export interface LocalResearchState {
  schema: typeof LOCAL_RESEARCH_SCHEMA;
  revision: number;
  studies: LocalStudy[];
  cases: LocalResearchCase[];
  feedback: LocalFeedback[];
}
export interface LocalResearchBackup {
  schema: typeof LOCAL_BACKUP_SCHEMA;
  exportedAt: string;
  release: string;
  timeSource: typeof LOCAL_TIME_SOURCE;
  state: LocalResearchState;
}
/** commit must atomically compare the persisted revision before replacing it. */
export interface LocalResearchStorage {
  load(): Promise<LocalResearchState | null>;
  commit(next: LocalResearchState, expectedRevision: number): Promise<void>;
}
export class LocalResearchError extends Error {
  constructor(message: string, public readonly status = 400) {
    super(message);
    this.name = 'LocalResearchError';
  }
}
const fail = (message: string, status = 400): never => { throw new LocalResearchError(message, status); };
const clone = <T>(value: T): T => structuredClone(value);
const fresh = (): LocalResearchState => ({
  schema: LOCAL_RESEARCH_SCHEMA, revision: 0, studies: [], cases: [], feedback: [],
});
const code = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || !/^[-A-Za-z0-9_]{1,60}$/.test(value))
    fail(`${label} must contain 1–60 letters, numbers, hyphens or underscores.`);
  return value as string;
};
const text = (value: unknown, max: number, label: string): string => {
  if (typeof value !== 'string' || value.length > max) fail(`Check ${label}.`);
  return value as string;
};
const record = (value: unknown, label: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`Invalid ${label}.`);
  return value as Record<string, any>;
};
const canonical = (value: unknown): string => JSON.stringify(value, (_key, v) =>
  v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
const localClock = (now: string) => ({
  localNow: now,
  // Compatibility with existing case-response consumers only. This is device time.
  serverNow: now,
  timeSource: LOCAL_TIME_SOURCE,
});
const sortedEntries = (entries: Entry[]) => [...entries].sort((a, b) =>
  a.t - b.t || (a.recordedRevision ?? 0) - (b.recordedRevision ?? 0));
const caseResponse = (value: LocalResearchCase, now: string) => ({
  session: clone(value.session), entries: clone(sortedEntries(value.entries)), ...localClock(now),
});

function checkCohort(cases: LocalResearchCase[], session: LiveSession) {
  if (cases.some(({ session: other }) =>
    other.studyId === session.studyId && other.participant === session.participant &&
    (other.cohort !== session.cohort || (other.synthetic ?? false) !== (session.synthetic ?? false))))
    fail('This participant already has a different cohort or data origin in this study.', 409);
}

/** Injected storage and clock make persistence failure and concurrent-write tests reproducible. */
export function createLocalResearchService(
  storage: LocalResearchStorage,
  options: { now?: () => number; id?: () => string } = {},
) {
  const nowMs = options.now ?? Date.now;
  const newId = options.id ?? (() => crypto.randomUUID());
  const read = async () => {
    const state = await storage.load();
    if (state && state.schema !== LOCAL_RESEARCH_SCHEMA)
      fail('This local database uses an unsupported version. Export it before upgrading.', 409);
    return clone(state ?? fresh());
  };
  const commit = async (state: LocalResearchState) => {
    const previous = state.revision;
    state.revision += 1;
    await storage.commit(state, previous);
  };

  async function api(path: string, body?: unknown): Promise<any> {
    const [route, query = ''] = path.replace(/^\/api\/study/, '').split('?');
    const params = new URLSearchParams(query);
    const input = body === undefined ? {} : record(body, 'request');
    const write = body !== undefined;
    const now = new Date(nowMs()).toISOString();
    const state = await read();
    if (route === '/clock' && !write) return localClock(now);
    if (route === '/studies') {
      if (!write) return clone([...state.studies].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      const id = code(typeof input.id === 'string' ? input.id.trim() : input.name?.trim(), 'Study ID');
      const name = text(input.name ?? id, 120, 'study name').trim();
      const protocol = text(input.protocol ?? '', 2500, 'study protocol');
      if (!name) fail('Enter a study name.');
      const previous = state.studies.find(s => s.id === id);
      if (previous) {
        if (previous.name !== name || previous.protocol !== protocol)
          fail('This study ID already exists with different study information.', 409);
        return clone(previous);
      }
      const study: LocalStudy = { id, name, protocol, created_at: now, role: 'local' };
      state.studies.push(study);
      await commit(state);
      return clone(study);
    }
    const studyId = code(input.studyId ?? params.get('studyId'), 'Study ID');
    if (!state.studies.some(s => s.id === studyId)) fail('Study not found on this device.', 404);
    if (route === '/feedback') {
      if (!write) return {
        rows: clone(state.feedback.filter(v => v.studyId === studyId).sort((a, b) => b.created_at.localeCompare(a.created_at))),
        ...localClock(now),
      };
      validateFeedback(input);
      const row: LocalFeedback = {
        id: code(newId(), 'Feedback ID'), studyId,
        author: code(input.recorder ?? 'local-recorder', 'Recorder code'), created_at: now,
        data: { instrument: 'atlas-usability-v1-custom', release: RELEASE,
          ratings: [...input.ratings], comment: input.comment, role: input.role },
      };
      state.feedback.push(row);
      await commit(state);
      return { id: row.id };
    }
    if (route === '/live-sessions') {
      if (!write) return {
        sessions: state.cases.filter(c => c.session.studyId === studyId)
          .sort((a, b) => b.session.startedAt.localeCompare(a.session.startedAt))
          .map(({ session: s }) => ({ id: s.id, participant: s.participant,
            started_at: s.startedAt, ended_at: s.endedAt, revision: s.revision, synthetic: s.synthetic })),
        ...localClock(now),
      };
      if (input.noticeVersion !== LIVE_VERSION) fail('Accept the model information before starting.');
      const setup = validateSetup(input);
      const id = code(input.id ?? newId(), 'Case ID');
      const recorder = code(input.recorder ?? 'local-recorder', 'Recorder code');
      const requestedStart = input.startedAt == null ? undefined : canonicalStart(input.startedAt);
      const previous = state.cases.find(c => c.session.id === id);
      if (previous) {
        if (previous.session.studyId !== studyId || previous.session.recorder !== recorder ||
          (requestedStart !== undefined && previous.session.startedAt !== requestedStart) ||
          Object.keys(setup).some(k => canonical((previous.session as any)[k]) !== canonical((setup as any)[k])))
          fail('This start identifier belongs to a different case request.', 409);
        return caseResponse(previous, now);
      }
      const session: LocalSession = { ...clone(setup), id, studyId,
        startedAt: requestedStart === undefined ? now : validateCaseStart(requestedStart, Date.parse(now)),
        createdAt: now, endedAt: null, revision: 0, noticeVersion: LIVE_VERSION,
        recorder, timeSource: LOCAL_TIME_SOURCE };
      checkCohort(state.cases, session);
      const item: LocalResearchCase = { session, entries: [] };
      state.cases.push(item);
      await commit(state);
      return caseResponse(item, now);
    }
    if (route !== '/live-session' && route !== '/live-entry') fail('Unknown local research operation.', 404);
    const sessionId = code(input.sessionId ?? params.get('sessionId'), 'Case ID');
    const item = state.cases.find(c => c.session.id === sessionId && c.session.studyId === studyId);
    if (!item) fail('Case not found on this device.', 404);
    const current = item!;
    if (route === '/live-session' && !write) return caseResponse(current, now);
    if (route !== '/live-entry' || !write) fail('Method not allowed.', 405);
    const { session, entries } = current;
    const id = code(input.id, 'Entry ID');
    const author = code(input.recorder ?? session.recorder, 'Recorder code');
    const duplicate = entries.find(e => e.id === id);
    if (duplicate) {
      const original = duplicate.kind === 'drug' ? duplicate.data.entered : duplicate.data;
      const requested = input.kind === 'drug' ? {
        drug: input.data?.drug, mode: input.data?.mode, value: input.data?.value,
        minutes: input.data?.minutes ?? null,
      } : input.kind === 'clinical' ? validateClinical(input.data)
        : input.kind === 'context' ? validatePDContext(input.data)
        : input.kind === 'end' ? {} : input.data;
      if (duplicate.kind !== input.kind || duplicate.author !== author ||
        Date.parse(duplicate.observedAt) !== Date.parse(input.observedAt) || canonical(original) !== canonical(requested))
        fail('This entry identifier belongs to a different request.', 409);
      return caseResponse(current, now);
    }
    if (input.revision !== session.revision)
      fail('This case changed in another window. Refresh and retry the entry.', 409);
    if (session.endedAt) fail('This case has ended.', 409);
    const stamp = Date.parse(canonicalStart(input.observedAt));
    if (!Number.isFinite(stamp) || stamp < Date.parse(session.startedAt) || stamp > Date.parse(now) + 5000 ||
      (input.kind !== 'end' && stamp > Date.parse(session.startedAt) + 86400000))
      fail('Event time must be within this case and no later than the device time.');
    if (input.kind === 'end' && entries.some(e => Date.parse(e.observedAt) > stamp))
      fail('The end time cannot be earlier than an existing recorded event.');
    const t = elapsed(session.startedAt, stamp);
    const { data, snapshot } = prepareEntry(input, session, sortedEntries(entries), t, now);
    const entry: Entry = { id, sessionId, kind: input.kind, t,
      observedAt: new Date(stamp).toISOString(), receivedAt: now, author,
      recordedRevision: session.revision, data, ...(snapshot ? { snapshot } : {}) };
    entries.push(entry);
    session.revision += 1;
    if (input.kind === 'end') session.endedAt = entry.observedAt;
    await commit(state);
    return caseResponse(current, now);
  }

  async function exportBackup(): Promise<LocalResearchBackup> {
    return { schema: LOCAL_BACKUP_SCHEMA, exportedAt: new Date(nowMs()).toISOString(),
      release: RELEASE, timeSource: LOCAL_TIME_SOURCE, state: await read() };
  }

  async function importBackup(value: unknown): Promise<{ imported: number; studies: number }> {
    const incoming = validateBackup(value);
    const state = await read();
    let imported = 0, studies = 0;
    for (const study of incoming.studies) {
      const previous = state.studies.find(s => s.id === study.id);
      if (previous && (previous.name !== study.name || previous.protocol !== study.protocol))
        fail(`Study ${study.id} has different information on this device. Nothing was imported.`, 409);
      if (!previous) { state.studies.push(clone(study)); studies++; }
    }
    for (const item of incoming.cases) {
      const previous = state.cases.find(c => c.session.id === item.session.id);
      if (previous) {
        if (canonical(previous) !== canonical(item))
          fail(`Case ${item.session.id} already exists with different data. Nothing was imported.`, 409);
        continue;
      }
      checkCohort(state.cases, item.session);
      state.cases.push(clone(item));
      imported++;
    }
    for (const row of incoming.feedback) {
      const previous = state.feedback.find(f => f.id === row.id);
      if (previous && canonical(previous) !== canonical(row))
        fail('A feedback identifier conflicts with existing data. Nothing was imported.', 409);
      if (!previous) state.feedback.push(clone(row));
    }
    await commit(state);
    return { imported, studies };
  }
  return { api, exportBackup, importBackup };
}

function validateFeedback(input: any) {
  if (!Array.isArray(input.ratings) || input.ratings.length !== 4 ||
    input.ratings.some((v: unknown) => !Number.isInteger(v) || Number(v) < 1 || Number(v) > 5) ||
    typeof input.comment !== 'string' || input.comment.length > 3000 ||
    typeof input.role !== 'string' || !input.role.trim() || input.role.length > 80)
    fail('Complete all four ratings and a role.');
}

/** Uses the same dose, clinical validation and snapshot functions as the published simulator. */
function prepareEntry(input: any, session: LocalSession, entries: Entry[], t: number, now: string): {
  data: any; snapshot?: Entry['snapshot'];
} {
  if (input.kind === 'drug') {
    const d = record(input.data, 'drug entry');
    const event = makeDose(d.drug, d.mode, d.value, session.patient.weight, t, input.id, d.minutes);
    simulate(session.patient, [event], 0, session.choice);
    return { data: { event, entered: {
      drug: d.drug, mode: d.mode, value: d.value, minutes: d.minutes ?? null,
    } } };
  }
  if (input.kind === 'clinical') {
    const data = validateClinical(input.data);
    const trace = simulate(session.patient, timeline(entries).filter(e => e.t <= t), t / 60, session.choice).at(-1)!;
    return { data, snapshot: {
      ...eventSnapshot(trace, session.choice, session.patient.age, entries, session.patient,
        data.name === 'Neuromuscular reversal' ? t : undefined),
      timelineRevision: session.revision, calculatedAt: now,
      retrospective: Date.parse(now) - Date.parse(input.observedAt) > 30000,
    } };
  }
  if (input.kind === 'context') return { data: validatePDContext(input.data) };
  if (input.kind === 'phase') {
    if (!['induction', 'maintenance', 'emergence'].includes(input.data?.phase)) fail('Unknown phase.');
    return { data: { phase: input.data.phase } };
  }
  if (input.kind === 'end') return { data: {} };
  if (input.kind === 'void') {
    const target = activeEntries(entries).find(e => e.id === input.data?.target && e.kind !== 'end');
    if (!target || typeof input.data.reason !== 'string' || !input.data.reason.trim() || input.data.reason.length > 1000)
      fail('Select an entry and provide a correction reason.');
    return { data: { target: target!.id, reason: input.data.reason } };
  }
  return fail('Unknown event type.');
}

/** Validate structure without recomputing or replacing historical predictions. */
function validateBackup(value: unknown): LocalResearchState {
  const backup = record(value, 'backup');
  if (backup.schema !== LOCAL_BACKUP_SCHEMA || backup.timeSource !== LOCAL_TIME_SOURCE)
    fail('Choose a SOM Research Edition JSON backup.');
  if (JSON.stringify(value).length > 100_000_000) fail('Backup exceeds the 100 MB import limit.');
  const state = record(backup.state, 'backup state') as LocalResearchState;
  if (state.schema !== LOCAL_RESEARCH_SCHEMA || !Number.isInteger(state.revision) || state.revision < 0 ||
    !Array.isArray(state.studies) || !Array.isArray(state.cases) || !Array.isArray(state.feedback) ||
    state.studies.length > 10000 || state.cases.length > 10000 || state.feedback.length > 100000)
    fail('Invalid backup structure.');
  const studyIds = new Set<string>(), caseIds = new Set<string>(), feedbackIds = new Set<string>();
  for (const study of state.studies) {
    record(study, 'study');
    code(study.id, 'Study ID');
    text(study.name, 120, 'study name');
    text(study.protocol, 2500, 'study protocol');
    canonicalStart(study.created_at);
    if (study.role !== 'local' || studyIds.has(study.id)) fail('Invalid or repeated study in backup.');
    studyIds.add(study.id);
  }
  const checkedCases: LocalResearchCase[] = [];
  for (const item of state.cases) {
    record(item, 'case');
    const s = record(item.session, 'case metadata') as LocalSession;
    code(s.id, 'Case ID');
    code(s.recorder, 'Recorder code');
    validateSetup(s);
    canonicalStart(s.createdAt);
    canonicalStart(s.startedAt);
    if (!studyIds.has(s.studyId) || caseIds.has(s.id) || s.timeSource !== LOCAL_TIME_SOURCE ||
      s.noticeVersion !== LIVE_VERSION || !Array.isArray(item.entries) || item.entries.length > 20000 ||
      !Number.isInteger(s.revision) || s.revision !== item.entries.length)
      fail('Invalid case metadata or repeated case in backup.');
    if (s.endedAt !== null) canonicalStart(s.endedAt);
    caseIds.add(s.id);
    const ids = new Set<string>(), previous: Entry[] = [];
    const ordered = [...item.entries].sort((a, b) => (a.recordedRevision ?? -1) - (b.recordedRevision ?? -1));
    for (let i = 0; i < ordered.length; i++) {
      const e = record(ordered[i], 'entry') as Entry;
      code(e.id, 'Entry ID');
      code(e.author, 'Recorder code');
      canonicalStart(e.observedAt);
      canonicalStart(e.receivedAt);
      const stamp = Date.parse(e.observedAt);
      if (e.sessionId !== s.id || ids.has(e.id) || e.recordedRevision !== i ||
        stamp < Date.parse(s.startedAt) || !Number.isInteger(e.t) || e.t !== elapsed(s.startedAt, stamp) ||
        (e.kind !== 'end' && e.t > 86400) || (s.endedAt !== null && stamp > Date.parse(s.endedAt)))
        fail('Invalid entry order, identifier or time in backup.');
      if (e.kind === 'clinical') {
        validateClinical(e.data);
        const snap = record(e.snapshot, 'clinical snapshot');
        record(snap.cp, 'snapshot concentrations');
        record(snap.ce, 'snapshot concentrations');
        if (snap.traceAtSeconds !== e.t || snap.timelineRevision !== i || typeof snap.release !== 'string')
          fail('Clinical snapshot does not match its recorded event.');
        canonicalStart(snap.calculatedAt);
      } else if (e.kind === 'drug') {
        const entered = record(e.data?.entered, 'entered dose');
        const expected = makeDose(entered.drug, entered.mode, entered.value, s.patient.weight, e.t, e.id,
          entered.minutes === null ? undefined : entered.minutes);
        if (canonical(expected) !== canonical(e.data.event)) fail('Stored dose does not match its entered units.');
      } else if (e.kind === 'context') validatePDContext(e.data);
      else if (e.kind === 'phase') {
        if (!['induction', 'maintenance', 'emergence'].includes(e.data?.phase)) fail('Unknown phase in backup.');
      } else if (e.kind === 'void') {
        const target = activeEntries(previous).find(v => v.id === e.data?.target && v.kind !== 'end');
        if (!target || typeof e.data.reason !== 'string' || !e.data.reason.trim() || e.data.reason.length > 1000)
          fail('Invalid correction history in backup.');
      } else if (e.kind === 'end') {
        if (i !== ordered.length - 1 || s.endedAt !== e.observedAt) fail('Invalid case completion record.');
      } else fail('Unknown event in backup.');
      ids.add(e.id);
      previous.push(e);
    }
    if ((s.endedAt !== null) !== (ordered.at(-1)?.kind === 'end')) fail('Case completion record is missing.');
    checkCohort(checkedCases, s);
    checkedCases.push(item);
  }
  for (const row of state.feedback) {
    record(row, 'feedback');
    code(row.id, 'Feedback ID');
    code(row.author, 'Recorder code');
    canonicalStart(row.created_at);
    if (!studyIds.has(row.studyId) || feedbackIds.has(row.id)) fail('Invalid feedback record.');
    validateFeedback(row.data);
    feedbackIds.add(row.id);
  }
  // JSON round-trip rejects runtime objects and detaches the caller's mutable input.
  return JSON.parse(JSON.stringify(state)) as LocalResearchState;
}

/** IndexedDB read/write transactions protect the whole local store across tabs. */
export function indexedDBResearchStorage(): LocalResearchStorage {
  async function open(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined') fail('This browser cannot store research cases locally.', 503);
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('som-research-edition-v1', 1);
      let blocked = false;
      request.onupgradeneeded = () => request.result.createObjectStore('research');
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () => reject(new LocalResearchError('Unable to open local research storage. Check browser storage settings.', 503));
      request.onblocked = () => {
        blocked = true;
        reject(new LocalResearchError('Close other SOM windows and retry opening local storage.', 409));
      };
    });
  }
  return {
    async load() {
      const db = await open();
      return new Promise<LocalResearchState | null>((resolve, reject) => {
        const tx = db.transaction('research', 'readonly');
        const request = tx.objectStore('research').get('root');
        let value: LocalResearchState | null = null;
        request.onsuccess = () => { value = request.result ?? null; };
        tx.oncomplete = () => { db.close(); resolve(value); };
        tx.onabort = () => { db.close(); reject(new LocalResearchError('Unable to read local research storage.', 503)); };
      });
    },
    async commit(next, expectedRevision) {
      const db = await open();
      return new Promise<void>((resolve, reject) => {
        const tx = db.transaction('research', 'readwrite');
        const store = tx.objectStore('research');
        const request = store.get('root');
        let conflict = false;
        request.onsuccess = () => {
          if ((request.result?.revision ?? 0) !== expectedRevision) {
            conflict = true;
            tx.abort();
          } else store.put(next, 'root');
        };
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onabort = () => {
          db.close();
          reject(new LocalResearchError(conflict
            ? 'Local records changed in another window. Refresh and retry.'
            : 'Local storage could not be written. The entry was not saved; free storage or export a backup and retry.', conflict ? 409 : 503));
        };
      });
    },
  };
}

const browserService = createLocalResearchService(indexedDBResearchStorage());
export const localResearchApi = browserService.api;
export const exportLocalResearchBackup = browserService.exportBackup;
export const importLocalResearchBackup = browserService.importBackup;
