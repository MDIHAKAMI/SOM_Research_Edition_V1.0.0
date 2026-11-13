// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import { WORKED_CASES } from '@/study/worked-cases';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DRUG_IDS,
  drugs,
  simulate,
  defaultChoice,
  type Agent,
  type PKChoice,
} from '@/study/pharmacology';
import { defaultCov } from '@/study/model';
import {
  LIVE_VERSION,
  clinicalEvents,
  stimulusEvents,
  activeEntries,
  timeline,
  makeDose,
  doseUnit,
  riyadh,
  clockDuration,
  elapsed,
  validateClinical,
  type LiveSession,
  type Entry,
  type DoseMode,
  type ClinicalName,
} from '@/study/live';
import { Sheet, NumberField, SheetError } from './atlas-controls';
import { caseStartAt, occurrenceAt, riyadhInput } from '@/study/case-time';
import { SomBrand } from './SomBrand';
import { LocalBackup } from './LocalBackup';
import { localResearchApi } from '@/study/local-research';
import { exportWorkbook } from '@/study/workbook';
import { validatePatient, type Patient } from '@/pharmacology/pk/models';
import { ClinicalProfileFields } from './ClinicalProfileFields';
import { OrganComparison } from './OrganComparison';
import { DrugForecast } from './DrugForecast';
import { rocuroniumReversalTime } from './ClinicalEndpoints';
import { clinicalContext } from '@/study/clinical-context';
import { respiratoryDrugContext } from '@/study/respiratory';
import { analgesiaContext, ANALGESIA_CONTEXT_SOURCE } from '@/study/clinical-meaning';
import { Charts, ink } from './atlas-charts';
import { eventSnapshot } from '@/study/event-snapshot';
import { validatePDContext } from '@/study/pd-registry';
import { openRecoveryStorage, parsed, type RecoveryStorage } from '@/study/workspace-recovery';
import { useCaseTrace } from './useCaseTrace';
import { HN_EFFECT_SITES } from '@/study/hn-effect-sites';
import './workspace.css';
import './research-edition.css';
type Mode =
  | 'home'
  | 'quick'
  | 'quick-setup'
  | 'setup'
  | 'live'
  | 'education'
  | 'cases'
  | 'feedback';
const patientDefault: Patient = {
  age: 40,
  weight: 70,
  height: 175,
  sex: 'male' as 'male' | 'female',
};
const EMPTY_ENTRIES: Entry[] = [];
type QuickCase = {
  id: string; startedAt: string; endedAt: string | null;
  patient: typeof patientDefault; choice: PKChoice; entries: Entry[]; confirmed: boolean;
};
type ResearchSelection = { studyId: string; sessionId: string };
const num = (v: number | undefined | null) =>
  v == null || !Number.isFinite(v) ? '—' : v.toFixed(v > 0 && v < 0.1 ? 3 : 2);
// Display rounding only; recorded doses and calculation inputs retain full precision.
const doseNumber = (v: number) =>
  Number.isFinite(v) ? Number(v.toPrecision(12)).toString() : '—';
const clinicalBlank = (name: ClinicalName) => ({
  name,
  response: null as string | null,
  nmb: 'unknown',
  ventilation: 'unknown',
  rr: null as number | null,
  spo2: null as number | null,
  etco2: null as number | null,
  pain: null as number | null,
  oaas: null as number | null,
  responsivenessScale: 'moaas-0-5',
  windowSeconds: null as number | null,
  notes: '',
});
export default function CaseWorkspace({
  initialMode = 'home',
}: {
  initialMode?: Mode;
}) {
  const navigation = useRef(0);
  const [mode, setModeState] = useState<Mode>(initialMode),
    [studies, setStudies] = useState<any[]>([]),
    [studyId, setStudyId] = useState(''),
    [studyName, setStudyName] = useState(''),
    [protocol, setProtocol] = useState(''),
    [quickState, setQuickState] = useState<QuickCase | null>(null),
    [restored, setRestored] = useState(false),
    [researchRecovery, setResearchRecovery] = useState<ResearchSelection | null>(null),
    [visible, setVisible] = useState(true),
    [displayNow, setDisplayNow] = useState(0),
    [session, setSession] = useState<LiveSession | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [cases, setCases] = useState<any[]>([]),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(''),
    [modal, setModal] = useState(''),
    [previewAt, setPreviewAt] = useState(0),
    [afterPatientDrug, setAfterPatientDrug] = useState<Agent | null>(null),
    [now, setNow] = useState(0),
    [patient, setPatient] = useState(patientDefault),
    [cov, setCov] = useState({ ...defaultCov }),
    [participant, setParticipant] = useState(''),
    [recorder, setRecorder] = useState('LOCAL-01'),
    [synthetic, setSynthetic] = useState(true),
    [site, setSite] = useState('KSA-01'),
    [cohort, setCohort] = useState('development'),
    [priorDrugs, setPriorDrugs] = useState(''),
    [choice, setChoice] = useState<PKChoice>({ ...defaultChoice }),
    [simEntries, setSimEntries] = useState<Entry[]>([]),
    [cursor, setCursor] = useState(0),
    [playing, setPlaying] = useState(false),
    [speed, setSpeed] = useState(10),
    [duration, setDuration] = useState(120),
    [workedCaseId, setWorkedCaseId] = useState(WORKED_CASES[0].id),
    [extra, setExtra] = useState<Agent[]>([]),
    [drug, setDrug] = useState<Agent>('propofol'),
    [delivery, setDelivery] = useState<DoseMode>('push'),
    [amount, setAmount] = useState(''),
    [minutes, setMinutes] = useState('1'),
    [eventTime, setEventTime] = useState('0'),
    [occurredAt, setOccurredAt] = useState(''),
    [startWhen, setStartWhen] = useState<'now' | 'before'>('now'),
    [startMinutes, setStartMinutes] = useState('15'),
    [entryStamp, setEntryStamp] = useState(0),
    [clinical, setClinical] = useState(
      clinicalBlank('Loss of verbal responsiveness'),
    ),
    [edit, setEdit] = useState<Entry | null>(null),
    [reason, setReason] = useState(''),
    [ratings, setRatings] = useState([0, 0, 0, 0]),
    [comment, setComment] = useState(''),
    [role, setRole] = useState('Consultant'),
    [feedbackRows, setFeedbackRows] = useState<any[]>([]);
  function setMode(next: Mode) {
    navigation.current++;
    try { recovery.current?.setItem('som-mode', next); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save the current view.'); }
    setModeState(next);
  }
  function loadWorkedCase(id: string) {
    const worked = WORKED_CASES.find(c => c.id === id);
    if (!worked) return;
    setWorkedCaseId(worked.id);
    setPatient({ ...worked.patient });
    setChoice({ ...worked.choice });
    setPlaying(false);
    setExtra([]);
    setSimEntries([
      { id: `${worked.id}-context`, sessionId: 'simulation', kind: 'context', t: 0,
        observedAt: new Date(0).toISOString(), receivedAt: new Date(0).toISOString(), author: 'synthetic', data: { ...worked.context } },
      ...worked.events.map((e): Entry => ({
        id: e.id,
        sessionId: 'simulation',
        kind: 'drug',
        t: e.t,
        observedAt: '',
        receivedAt: '',
        author: 'simulation',
        data: { event: { ...e } },
      })),
    ]);
    setCursor(0);
    setDuration(worked.duration_seconds / 60);
    setError('');
    setMode('education');
  }
  const recovery = useRef<RecoveryStorage | null>(null);
  const storage = () => {
    if (!recovery.current) throw Error('Case recovery storage is not available. Reload before starting a case.');
    return recovery.current;
  };
  function saveQuick(value: QuickCase) {
    storage().patch({ 'som-quick': JSON.stringify(value), 'som-mode': 'quick' });
    setQuickState(value);
  }
  const startCommand = useRef(''),
    startDraft = useRef<any>(null),
    accepted = useRef({ id: '', revision: -1 }),
    lock = useRef(false),
    pending = useRef<any>(null);
  const simulated = mode === 'education',
    quick = mode === 'quick';
  const activeSession = quick ? quickState : session;
  const pendingHere =
    mode === 'live' && pending.current?.sessionId === session?.id;
  function persistPending() {
    if (pending.current) storage().setItem('som-pending', JSON.stringify(pending.current));
    else storage().removeItem('som-pending');
  }
  async function api(path: string, body?: any) {
    const data = await localResearchApi(path, body);
    setNow(Date.now());
    return data;
  }
  // Both occurrence and recording times use this device's clock.
  const trueNow = () => Date.now();
  const caseNow = () => (quick ? Date.now() : trueNow());
  function accept(data: any) {
    if (
      accepted.current.id === data.session.id &&
      data.session.revision < accepted.current.revision
    )
      return;
    // An unchanged poll must not invalidate an open counterfactual preview.
    if (accepted.current.id === data.session.id &&
        data.session.revision === accepted.current.revision && session) {
      setResearchRecovery(null);
      setSaved(pending.current ? 'Unsaved entry · retry required' : 'Saved on this device');
      return true;
    }
    try {
      const previous = parsed<ResearchSelection>(storage().getItem('som-research'));
      storage().patch({
        'som-research': JSON.stringify({ studyId: data.session.studyId, sessionId: data.session.id }),
        'som-mode': 'live',
        ...(previous?.sessionId !== data.session.id ? { 'som-research-cache': null } : {}),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save the recovery link.');
      return false;
    }
    accepted.current = { id: data.session.id, revision: data.session.revision };
    try {
      storage().setItem('som-research-cache', JSON.stringify({ session: data.session, entries: data.entries }));
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save an offline copy.'); }
    setSession(data.session);
    setEntries(data.entries);
    setResearchRecovery(null);
    setSaved(
      pending.current
        ? 'Unsaved entry · retry required'
        : 'Saved on this device',
    );
    return true;
  }
  async function guarded(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to complete action.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function getStudies() {
    try {
      const data = await api('/studies');
      setStudies(data);
      setStudyId((s) => s || data[0]?.id || '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to read local studies.');
    }
  }
  useEffect(() => {
    let lastDisplay = 0;
    const tick = () => {
      const foreground = document.visibilityState !== 'hidden';
      setVisible(foreground);
      if (!foreground) return;
      const time = trueNow();
      setNow(time);
      if (time - lastDisplay >= 10000 || !lastDisplay) {
        lastDisplay = time;
        setDisplayNow(time);
      }
    };
    const resume = () => { lastDisplay = 0; tick(); };
    tick();
    const id = setInterval(tick, 1000);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      clearInterval(id);
      window.removeEventListener('pageshow', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    let release = () => {};
    const restore = async () => { try {
      const opened = await openRecoveryStorage();
      if (cancelled) { opened.release(); return; }
      release = opened.release;
      const store = opened.storage;
      recovery.current = store;
      if (opened.warning) setError(opened.warning);
      startCommand.current = store.getItem('som-start-id') || '';
      startDraft.current = parsed(store.getItem('som-start-draft'));
      const q = parsed<QuickCase>(store.getItem('som-quick'));
      const validQuick = q?.id && Number.isFinite(Date.parse(q.startedAt)) && q.patient && q.choice && Array.isArray(q.entries);
      if (validQuick) setQuickState(q);
      pending.current = parsed(store.getItem('som-pending'));
      const selection = parsed<ResearchSelection>(store.getItem('som-research'));
      const cache = parsed<{ session: LiveSession; entries: Entry[] }>(store.getItem('som-research-cache'));
      const lastMode = store.getItem('som-mode');
      if (lastMode === 'quick' && validQuick) setModeState('quick');
      if (lastMode === 'quick' && !validQuick)
        setError('The previous case could not be restored. Its recovery copy has been kept.');
      if (selection?.sessionId && selection.studyId) {
        setStudyId(selection.studyId);
        setResearchRecovery(selection);
        if (cache?.session?.id === selection.sessionId && cache.session.studyId === selection.studyId && Array.isArray(cache.entries)) {
          accepted.current = { id: cache.session.id, revision: cache.session.revision };
          setSession(cache.session);
          setEntries(cache.entries);
        }
        if (lastMode === 'live' || pending.current?.sessionId === selection.sessionId) {
          setModeState('live');
          setSaved('Restoring the locally saved record…');
        }
      }
      setNow(trueNow());
      setDisplayNow(trueNow());
    } catch (e) {
      if (!cancelled) setError(e instanceof Error ? e.message : 'Unable to restore this browser workspace.');
    }
    // The workspace lock prevents one tab from taking over another tab's recovery state.
    if (!cancelled) setRestored(true);
    };
    void restore();
    return () => { cancelled = true; release(); };
  }, []);
  useEffect(() => {
    if (['setup', 'cases', 'feedback'].includes(mode)) void getStudies();
  }, [mode]);
  useEffect(() => {
    if (!restored) return;
    let cancelled = false, refreshing = false;
    const restoringAt = navigation.current;
    const target = session ? { studyId: session.studyId, sessionId: session.id } : researchRecovery;
    const refresh = async () => {
      if (document.visibilityState === 'hidden' || refreshing) return;
      setNow(trueNow());
      if (mode !== 'live' || !target || lock.current) return;
      refreshing = true;
      try {
        const data = await api(`/live-session?studyId=${target.studyId}&sessionId=${target.sessionId}`);
        if (cancelled || navigation.current !== restoringAt || data.session.id !== target.sessionId) return;
        accept(data);
        if (pending.current?.sessionId === target.sessionId) {
          pending.current.revision = data.session.revision;
          persistPending();
        }
      } catch {
        if (!cancelled && navigation.current === restoringAt)
          setSaved('Unable to refresh local record · recovery copy retained');
      } finally { refreshing = false; }
    };
    void refresh();
    const id = setInterval(() => void refresh(), 15000);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener('pageshow', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [restored, mode, session?.id, researchRecovery?.sessionId]);
  useEffect(() => {
    if (!playing || !simulated) return;
    const id = setInterval(
      () =>
        setCursor((v) => {
          const next = Math.min(duration * 60, v + speed);
          if (next === duration * 60) setPlaying(false);
          return next;
        }),
      1000,
    );
    return () => clearInterval(id);
  }, [playing, simulated, speed, duration]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (pending.current) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const p = simulated ? patient : (activeSession?.patient ?? patient),
    selectedChoice = simulated ? choice : (activeSession?.choice ?? choice),
    workingEntries = simulated
      ? simEntries
      : quick
        ? (quickState?.entries ?? EMPTY_ENTRIES)
        : entries;
  const drugEvents = useMemo(() => timeline(workingEntries), [workingEntries]);
  const reversalAt = useMemo(() => rocuroniumReversalTime(p, workingEntries), [p, workingEntries]);
  const knownOsa = simulated ? cov.osa : quick ? false : session?.covariates.osa ?? false;
  const forecastPatient = useMemo(() => {
    const reversal = activeEntries(workingEntries).filter(e => e.kind === 'clinical' && e.data?.name === 'Neuromuscular reversal' && e.t <= previewAt).map(e => e.t);
    if (!reversal.length) return p;
    const c = clinicalContext(p.clinical);
    return { ...p, clinical: { ...c, nmb: { ...c.nmb, reversalAt: Math.min(c.nmb.reversalAt ?? Infinity, ...reversal) } } };
  }, [p, workingEntries, previewAt]);
  const t = simulated
    ? cursor
    : activeSession
      ? elapsed(
          activeSession.startedAt,
          activeSession.endedAt
            ? Date.parse(activeSession.endedAt)
            : quick
              ? Date.now()
              : now,
        )
      : 0;
  const displayTime = simulated ? cursor : activeSession ? elapsed(activeSession.startedAt,
    activeSession.endedAt ? Date.parse(activeSession.endedAt) : displayNow) : 0;
  const horizon = simulated ? duration : Math.max(Math.min(Math.max(0, displayTime), 86400), drugEvents.at(-1)?.t ?? 0) / 60;
  const calculation = useCaseTrace(p, drugEvents, horizon, selectedChoice,
    simulated ? 'simulation' : activeSession?.id ?? '',
    visible && restored && (simulated || ((quick || mode === 'live') && !!activeSession)));
  const trace = calculation.trace,
    windowEnded = !simulated && t > 86400,
    current = windowEnded ? undefined : trace.findLast((s) => s.t <= t) ?? trace[0];
  const phase =
    activeEntries(entries)
      .filter((e) => e.kind === 'phase')
      .at(-1)?.data.phase ?? 'induction';
  const active = DRUG_IDS.filter(
    (d) => drugEvents.some((e) => e.drug === d) || extra.includes(d),
  );
  const shown = Array.from(
    new Set<Agent>([
      'sevoflurane',
      'desflurane',
      'propofol',
      'remifentanil',
      ...active,
    ]),
  );
  const readonly = !simulated && !!activeSession?.endedAt;
  const rocUnavailable = reversalAt !== null && t >= reversalAt;
  const stamp = () =>
    simulated
      ? cursor
      : Math.max(0, elapsed(activeSession!.startedAt, activeSession?.endedAt ? Date.parse(activeSession.endedAt) : caseNow()));
  function openDrug(d: Agent) {
    if (quick && quickState && !quickState.confirmed) {
      setPatient({ ...quickState.patient });
      setChoice({ ...quickState.choice });
      setAfterPatientDrug(d);
      setModal('sim-patient');
      return;
    }
    setDrug(d);
    setDelivery(
      ['sevoflurane', 'desflurane'].includes(d)
        ? 'et'
        : ['propofol', 'remifentanil', 'dexmedetomidine'].includes(d)
          ? 'infusion'
          : 'push',
    );
    setAmount('');
    setMinutes('1');
    setEventTime((stamp() / 60).toFixed(3));
    setOccurredAt(riyadhInput(caseNow()));
    setEntryStamp(caseNow());
    setModal('drug');
    setError('');
  }
  function openClinical(name: ClinicalName) {
    setClinical(clinicalBlank(name));
    setEventTime((stamp() / 60).toFixed(3));
    setOccurredAt(riyadhInput(caseNow()));
    setEntryStamp(caseNow());
    setModal('clinical');
    setError('');
  }
  async function commit(kind: Entry['kind'], data: any, customT?: number, exactObservedAt?: string) {
    const at =
      customT ??
      (simulated
        ? cursor
        : elapsed(activeSession!.startedAt, entryStamp || caseNow()));
    if (!Number.isInteger(at) || at < 0 || (at > 86400 && kind !== 'end'))
      throw Error('Enter an event time within the 24-hour case window.');
    const observedAt = simulated ? new Date().toISOString() : exactObservedAt ?? new Date(Date.parse(activeSession!.startedAt) + at * 1000).toISOString();
    if (!simulated && (Date.parse(observedAt) < Date.parse(activeSession!.startedAt) || Date.parse(observedAt) > caseNow() + 5000))
      throw Error('Enter a time within this case, no later than now.');
    if (kind === 'clinical') validateClinical(data);
    if (kind === 'context') validatePDContext(data);
    if (simulated || quick) {
      if (quick && activeSession?.endedAt) throw Error('This case has ended.');
      const id = crypto.randomUUID();
      const value =
        kind === 'drug'
          ? {
              event: makeDose(
                data.drug,
                data.mode,
                data.value,
                p.weight,
                at,
                id,
                data.minutes,
              ),
              entered: data,
            }
          : data;
      const next: Entry = {
        id,
        sessionId: quick ? quickState!.id : 'simulation',
        kind,
        t: at,
        observedAt,
        receivedAt: new Date().toISOString(),
        author: 'simulation',
        data: value,
      };
      simulate(
        p,
        timeline([...workingEntries, next]),
        quick ? Math.min(at, 86400) / 60 : duration,
        selectedChoice,
      );
      if (kind === 'clinical') {
        const observed = simulate(
          p,
          timeline(workingEntries).filter((e) => e.t <= at),
          at / 60,
          selectedChoice,
        ).at(-1)!;
        next.snapshot = eventSnapshot(
          observed,
          selectedChoice,
          p.age,
          workingEntries,
          p,
          value.name === 'Neuromuscular reversal' ? at : undefined,
        );
      }
      if (quick && quickState)
        saveQuick({ ...quickState, entries: [...quickState.entries, next],
          endedAt: kind === 'end' ? next.observedAt : quickState.endedAt });
      else setSimEntries((v) => [...v, next]);
      setSaved(quick ? 'Saved on this device' : 'Added to simulation');
      setModal('');
      return;
    }
    if (pending.current && pending.current.sessionId !== session?.id)
      throw Error(
        'Resolve the unsaved entry from the other research case first.',
      );
    if (kind === 'end' && pending.current)
      throw Error('Retry or dismiss the unsaved entry before ending this case.');
    const command = pending.current ?? {
      id: crypto.randomUUID(),
      studyId: session!.studyId,
      sessionId: session!.id,
      revision: session!.revision,
      kind,
      data,
      observedAt,
    };
    pending.current = command;
    persistPending();
    setSaved('Saving…');
    try {
      const result = await api('/live-entry', command);
      accept(result);
      pending.current = null;
      persistPending();
      setModal('');
      if (kind === 'end') downloadCompletedCase(result.session, result.entries);
    } catch (e) {
      if ((e as any)?.status === 400 || (e as any)?.status === 403) {
        pending.current = null;
        persistPending();
        setSaved('Not saved · correct the entry');
      } else setSaved('Not saved · retry required');
      if ((e as any)?.status === 409 && !String(e).includes('ended')) {
        const latest = await api(
          `/live-session?studyId=${session!.studyId}&sessionId=${session!.id}`,
        );
        accept(latest);
        command.revision = latest.session.revision;
        persistPending();
        setSaved('Case refreshed · retry the unsaved entry');
      }
      throw e;
    }
  }
  async function retryPending() {
    const command = pending.current;
    if (!command) return;
    try {
      const latest = await api(
        `/live-session?studyId=${command.studyId}&sessionId=${command.sessionId}`,
      );
      command.revision = latest.session.revision;
      persistPending();
      const result = await api('/live-entry', command);
      if (accepted.current.id === command.sessionId) accept(result);
      pending.current = null;
      persistPending();
      setSaved('Entry saved on this device');
      setModal('');
      if (command.kind === 'end') downloadCompletedCase(result.session, result.entries);
    } catch (e) {
      setSaved('Unsaved entry · retry required');
      throw e;
    }
  }
  async function listCases() {
    await guarded(async () => {
      let selected = studyId;
      if (!selected) {
        const available = await api('/studies');
        setStudies(available);
        selected = available[0]?.id;
        if (!selected) return;
        setStudyId(selected);
      }
      const data = await api('/live-sessions?studyId=' + selected);
      setCases(data.sessions);
    });
  }
  async function startCase() {
    await guarded(async () => {
      if (!/^[-A-Za-z0-9_]{1,60}$/.test(studyId)) throw Error('Enter a study ID using letters, numbers, hyphens or underscores.');
      const knownStudies = await api('/studies');
      if (!knownStudies.some((item: { id: string }) => item.id === studyId)) {
        await api('/studies', { id: studyId, name: studyId, protocol: protocol.trim() || 'Local research study' });
        await getStudies();
      }
      if (pending.current)
        throw Error(
          'Resolve the unsaved entry before starting another research case.',
        );
      startCommand.current ||= crypto.randomUUID();
      const request = startDraft.current ?? {
        id: startCommand.current,
        studyId,
        participant,
        site,
        patient,
        covariates: { ...cov, phase: 'induction' },
        choice,
        cohort,
        priorDrugs,
        startedAt: caseStartAt(trueNow(), startWhen === 'before' ? startMinutes : 0),
        noticeVersion: LIVE_VERSION,
        recorder,
        synthetic,
      };
      startDraft.current = request;
      storage().patch({ 'som-start-id': startCommand.current, 'som-start-draft': JSON.stringify(request) });
      try {
        if (!accept(await api('/live-sessions', request)))
          throw Error('The case was saved locally, but its recovery link could not be saved in this browser workspace. Keep this page open and retry after resolving the storage warning.');
      } catch (e) {
        if ([400, 403].includes((e as any).status)) {
          startDraft.current = null;
          startCommand.current = '';
          try {
            storage().removeItem('som-start-draft');
            storage().removeItem('som-start-id');
          } catch {}
        }
        throw e;
      }
      startDraft.current = null;
      try {
        storage().removeItem('som-start-draft');
      } catch {}
      startCommand.current = '';
      try {
        storage().removeItem('som-start-id');
      } catch {}
      setMode('live');
    });
  }
  function download(name: string, data: any, csv = false) {
    const blob = new Blob([csv ? data : JSON.stringify(data, null, 2)], {
      type: csv ? 'text/csv' : 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function prepareResearch() {
    const draft = startDraft.current;
    setParticipant(draft?.participant ?? '');
    setPriorDrugs(draft?.priorDrugs ?? '');
    setPatient({ ...(draft?.patient ?? patientDefault) });
    setCov({ ...(draft?.covariates ?? defaultCov) });
    setChoice({ ...(draft?.choice ?? defaultChoice) });
    setCohort(draft?.cohort ?? 'development');
    setRecorder(draft?.recorder ?? 'LOCAL-01');
    setSynthetic(draft?.synthetic ?? true);
    setStartWhen(draft?.startedAt ? 'before' : 'now');
    setStartMinutes(draft?.startedAt ? String(Math.max(0, Math.floor((trueNow() - Date.parse(draft.startedAt)) / 60000))) : '15');
    setExtra([]);
    if (draft?.studyId) setStudyId(draft.studyId);
    setMode('setup');
    setModal('');
    setError('');
  }
  function startQuick() {
    if (quickState && !quickState.endedAt) {
      setMode('quick');
      setError('');
      return;
    }
    setPatient({ ...patientDefault });
    setChoice({ ...defaultChoice });
    setStartWhen('now');
    setStartMinutes('15');
    setMode('quick-setup');
    setError('');
  }
  function confirmQuick() {
    validatePatient(patient);
    const startedAt = caseStartAt(Date.now(), startWhen === 'before' ? startMinutes : 0);
    saveQuick({
        id: crypto.randomUUID(),
        startedAt,
        endedAt: null,
        patient: { ...patient },
        choice: { ...choice },
        entries: [],
        confirmed: true,
      });
    setMode('quick');
    setError('');
    setExtra([]);
  }
  function downloadCompletedCase(completed: LiveSession, recorded: Entry[]) {
    try {
      exportWorkbook(completed, recorded);
      setSaved('Case saved. Excel download started; use Export Excel to download it again.');
    } catch (e) {
      setSaved('Case saved. Excel export needs attention.');
      setError('The case is saved locally, but Excel export failed: ' + (e instanceof Error ? e.message : String(e)));
    }
  }
  async function exportResearch() {
    await guarded(async () => {
      if (!session?.endedAt) throw Error('End the case before exporting.');
      const data = await api(
        `/live-session?studyId=${session.studyId}&sessionId=${session.id}`,
      );
      downloadCompletedCase(data.session, data.entries);
    });
  }
  const studyPicker = (
    <label>
      Study
      <select
        value={studyId}
        onChange={(e) => {
          setStudyId(e.target.value);
          setCases([]);
        }}
      >
        <option value="">Select study</option>
        {studies.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
  const patientFields = (
    <><div className="as-grid as-four">
      <NumberField
        label="Age · years"
        value={patient.age}
        onChange={(v) => setPatient({ ...patient, age: Number(v) })}
        min={18}
        max={90}
        required
      />
      <NumberField
        label="Weight · kg"
        value={patient.weight}
        onChange={(v) => setPatient({ ...patient, weight: Number(v) })}
        min={35}
        max={200}
        required
      />
      <NumberField
        label="Height · cm"
        value={patient.height}
        onChange={(v) => setPatient({ ...patient, height: Number(v) })}
        min={140}
        max={210}
        required
      />
      <label>
        Sex
        <select
          value={patient.sex}
          onChange={(e) =>
            setPatient({ ...patient, sex: e.target.value as any })
          }
        >
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
      </label>
    </div><ClinicalProfileFields value={patient} onChange={setPatient} /></>
  );
  const modelFields = (
    <div className="as-grid">
      <label>
        Propofol model
        <select
          value={choice.propofol}
          onChange={(e) =>
            setChoice({ ...choice, propofol: e.target.value as any })
          }
        >
          <option value="schnider">Schnider</option>
          <option value="marsh">Marsh · PK comparison</option>
        </select>
      </label>
      <label>
        Ketamine model
        <select
          value={choice.ketamine}
          onChange={(e) =>
            setChoice({ ...choice, ketamine: e.target.value as any })
          }
        >
          <option value="domino">Domino</option>
          <option value="clements250">Clements 250</option>
        </select>
      </label>
    </div>
  );
  const startTimeFields = (
    <div className="as-panel som-start-time">
      <h2>Case start</h2>
      <div className="as-segments">
        <button type="button" aria-pressed={startWhen === 'now'} onClick={() => setStartWhen('now')}>Start now</button>
        <button type="button" aria-pressed={startWhen === 'before'} onClick={() => setStartWhen('before')}>Started earlier</button>
      </div>
      {startWhen === 'before' && <>
        <NumberField label="Minutes ago" value={startMinutes} onChange={setStartMinutes} min={0} max={1439} step="1" required />
        <div className="som-time-presets">{[5, 10, 15, 30, 60].map((v) => <button key={v} type="button" aria-pressed={Number(startMinutes) === v} onClick={() => setStartMinutes(String(v))}>{v} min</button>)}</div>
      </>}
      <small>Riyadh · UTC+3</small>
    </div>
  );
  const entryTimeFields = simulated ? (
    <NumberField label="Event time · minutes from start" value={eventTime} onChange={setEventTime} max={duration} required />
  ) : (
    <div className="som-entry-time">
      <label>Time · Riyadh (UTC+3)
        <input type="datetime-local" step="1" required value={occurredAt} min={activeSession ? riyadhInput(activeSession.startedAt) : undefined} max={riyadhInput(caseNow())} onChange={(e) => setOccurredAt(e.target.value)} />
      </label>
      <button type="button" onClick={() => setOccurredAt(riyadhInput(caseNow()))}>Now</button>
      <small>Enter the actual time, including earlier administrations.</small>
    </div>
  );
  const chosenOccurrence = () => simulated
    ? { t: Math.round(Number(eventTime) * 60), observedAt: undefined }
    : occurrenceAt(occurredAt, activeSession!.startedAt, caseNow());
  const contextHandler = useRef<(ctx: Parameters<typeof validatePDContext>[0]) => Promise<void>>(async () => {});
  contextHandler.current = async (ctx) => { await commit('context', ctx, stamp()); };
  const recordContext = useCallback(async (ctx: Parameters<typeof validatePDContext>[0]) => { await contextHandler.current(ctx); }, []);
  return (
    <SheetError.Provider
      value={{
        error,
        retry: pending.current
          ? () => void guarded(() => retryPending())
          : undefined,
      }}
    >
      <main className="as-work">
        <header className="as-header">
          <button
            className="as-brand"
            onClick={() => {
              setMode('home');
              setPlaying(false);
            }}
          >
            <SomBrand />
          </button>
          <div className="as-row">
            <span className="as-clock">
              {now ? riyadh(now) : '—'} <small>Device time · UTC+3</small>
            </span>
            <button onClick={() => { setMode('cases'); void listCases(); }}>Saved cases</button>
            <button onClick={() => setModal('about')}>About</button>
            <button
              onClick={() => setModal('models')}
              aria-label="Models and evidence"
            >
              <span>Models</span>
            </button>
          </div>
        </header>
        {(error || (pending.current && !quick && !simulated)) && (
          <div className="as-global-error" role="alert">
            <span>{error || 'A research entry is waiting to be saved.'}</span>
            {pending.current ? (
              <>
                <button
                  disabled={busy}
                  onClick={() => void guarded(() => retryPending())}
                >
                  Retry saving
                </button>
                <button
                  disabled={busy}
                  onClick={() => {
                    download('unsaved-entry.json', pending.current);
                  }}
                >
                  Export unsaved entry
                </button>
                <button
                  disabled={busy}
                  onClick={() => setModal('discard-pending')}
                >
                  Dismiss unsaved entry
                </button>
              </>
            ) : (
              <button onClick={() => setError('')}>Dismiss</button>
            )}
          </div>
        )}
        {!restored && <p className="as-content" role="status">Restoring your workspace…</p>}
        {restored && mode === 'live' && !session && researchRecovery && (
          <section className="as-content as-panel" role="status">
            <h1>Resuming your case</h1>
            <p>{saved || 'Reading the locally saved record…'}</p>
          </section>
        )}
        {restored && mode === 'home' && (
          <section className="as-home">
            <h1>Anesthesia simulation and research recording</h1>
            <p>Explore drug concentrations, record observed events and export a case for research. Calculations and case records stay on this device.</p>
            <div className="as-start-options">
              <button onClick={startQuick}>
                <h2>{quickState && !quickState.endedAt ? 'Resume local case' : 'Quick local case'}</h2>
                <p>Follow a case locally without research identifiers.</p>
              </button>
              <button
                onClick={() => {
                  setError('');
                  setModal('notice');
                }}
              >
                <h2>Research mode</h2>
                <p>Record events under a study ID and download an Excel workbook.</p>
              </button>
              <button
                onClick={() => {
                  setMode('education');
                  setError('');
                }}
              >
                <h2>Simulator / education</h2>
                <p>Replay synthetic examples or build a simulated timeline.</p>
              </button>
            </div>
            <div className="as-home-links">
              <button onClick={() => setMode('feedback')}>
                Record usability feedback
              </button>
            </div>
            <LocalBackup busy={busy} onAction={(action) => void guarded(action)} onImported={getStudies} />
            {(session && !session.endedAt || researchRecovery) && (
              <button className="as-resume" onClick={() => setMode('live')}>
                Resume {session?.participant ?? 'research case'} · started{' '}
                {session ? riyadh(session.startedAt) : 'saved session'}
              </button>
            )}
            <footer className="som-footer">Created by Mohammed Hakami <span>2026 · Research edition</span></footer>
          </section>
        )}
        {mode === 'quick-setup' && (
          <section className="as-content as-setup">
            <div className="as-section-head"><h1>Start a case</h1><button onClick={() => setMode('home')}>Cancel</button></div>
            <form onSubmit={(e) => { e.preventDefault(); void guarded(async () => confirmQuick()); }}>
              <div className="as-panel"><h2>Patient</h2>{patientFields}</div>
              {startTimeFields}
              <button className="as-primary as-start-case" disabled={busy}>Start case</button>
            </form>
          </section>
        )}
        {mode === 'setup' && (
          <section className="as-content as-setup">
            <div className="as-section-head">
              <div>
                <div className="as-eyebrow">NEW CASE</div>
                <h1>Research case</h1>
              </div>
              <button onClick={() => setMode('home')}>Cancel</button>
            </div>
            <p className="as-caption">Cases are saved in this browser on this device. Clearing browser data can erase them. Export a backup regularly. Use coded identifiers and an approved protocol for patient observations.</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void startCase();
              }}
            >
              <div className="as-panel">
                <div className="as-grid">
                  <label>Study ID
                    <input required list="local-study-ids" value={studyId} onChange={(e) => setStudyId(e.target.value)} pattern="[A-Za-z0-9_\-]{1,60}" maxLength={60} placeholder="e.g. STUDY01" />
                    <datalist id="local-study-ids">{studies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</datalist>
                  </label>
                  <label>Recorder code
                    <input required value={recorder} onChange={(e) => setRecorder(e.target.value)} pattern="[A-Za-z0-9_\-]{1,60}" maxLength={60} />
                  </label>
                  <label>Record type
                    <select value={synthetic ? 'synthetic' : 'observed'} onChange={(e) => setSynthetic(e.target.value === 'synthetic')}>
                      <option value="synthetic">Synthetic example or software test</option>
                      <option value="observed">Recorded observations under an approved protocol</option>
                    </select>
                  </label>
                  <label>
                    Participant code
                    <input
                      required
                      value={participant}
                      onChange={(e) => setParticipant(e.target.value)}
                      placeholder="e.g. KSA-0001"
                      pattern="[A-Za-z0-9\-]{1,60}"
                    />
                  </label>
                  <label>
                    Site code
                    <input
                      required
                      value={site}
                      onChange={(e) => setSite(e.target.value)}
                      pattern="[A-Za-z0-9\-]{1,60}"
                    />
                  </label>
                </div>
                <p className="as-caption">
                  Use coded identifiers, without patient names or medical record
                  numbers.
                </p>
              </div>
              <div className="as-panel">
                <h2>Patient</h2>
                {patientFields}
                <details>
                  <summary>Additional covariates &amp; models</summary>
                  <div className="as-grid">
                    <NumberField
                      label="ASA class"
                      value={cov.asa}
                      onChange={(v) => setCov({ ...cov, asa: Number(v) })}
                      min={1}
                      max={5}
                    />
                    <NumberField
                      label="eGFR · mL/min/1.73 m²"
                      value={cov.egfr}
                      onChange={(v) => setCov({ ...cov, egfr: Number(v) })}
                      max={200}
                    />
                    <label>
                      Opioid tolerance
                      <select
                        value={String(cov.opioidTolerance)}
                        onChange={(e) =>
                          setCov({
                            ...cov,
                            opioidTolerance: e.target.value === 'true',
                          })
                        }
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </label>
                    <label>
                      Obstructive sleep apnea
                      <select
                        value={String(cov.osa)}
                        onChange={(e) =>
                          setCov({ ...cov, osa: e.target.value === 'true' })
                        }
                      >
                        <option value="false">No</option>
                        <option value="true">Yes</option>
                      </select>
                    </label>
                    <label>
                      Cohort
                      <select
                        value={cohort}
                        onChange={(e) => setCohort(e.target.value)}
                      >
                        <option value="development">Model development</option>
                        <option value="validation">Reserved validation</option>
                      </select>
                    </label>
                  </div>
                  {modelFields}
                </details>
                <label>
                  Medication before recording · optional
                  <textarea
                    maxLength={1000}
                    value={priorDrugs}
                    onChange={(e) => setPriorDrugs(e.target.value)}
                    placeholder="Premedication / prior doses. Concentrations start at zero; this note does not add doses."
                  />
                </label>
              </div>
              {startTimeFields}
              <button className="as-primary as-start-case" disabled={busy}>Start case</button>
            </form>
          </section>
        )}
        {(mode === 'live' && !!session || mode === 'quick' && !!quickState || mode === 'education') && (
          <section className="as-content as-case">
            <div className="as-casebar">
              <div>
                <div className="as-eyebrow">
                  {simulated
                    ? 'SIMULATOR / EDUCATION'
                    : readonly
                      ? 'COMPLETED CASE'
                      : quick
                        ? 'CASE'
                        : 'RESEARCH MODE'}
                </div>
                <h1>
                  {simulated
                    ? 'Explore the timeline'
                    : quick
                      ? 'Current case'
                      : session?.participant}
                </h1>
                <small>
                  {p.age} yr · {p.weight} kg · {p.height} cm · {p.sex}
                  {!simulated && !quick ? ` · ${phase}` : ''}
                  {quick && !quickState?.confirmed ? ' · Default patient' : ''}
                </small>
              </div>
              <div className="as-case-time">
                <b>{clockDuration(t)}</b>
                <small>
                  {simulated
                    ? 'Simulation time'
                    : activeSession?.endedAt
                      ? 'Final duration'
                      : quick
                        ? 'Elapsed · KSA'
                        : saved || 'Local record'}
                </small>
              </div>
              <div className="as-row">
                {(simulated || quick) && (
                  <button
                    onClick={() => {
                      setAfterPatientDrug(null);
                      if (quickState && quick) {
                        setPatient({ ...quickState.patient });
                        setChoice({ ...quickState.choice });
                      }
                      setModal('sim-patient');
                    }}
                  >
                    Patient &amp; models
                  </button>
                )}
                {!simulated && !readonly && (
                  <button disabled={busy || !!pendingHere} onClick={() => setModal('end')}>End case</button>
                )}
                {!simulated && !quick && readonly && (
                  <button disabled={busy} onClick={() => void exportResearch()}>
                    Export Excel
                  </button>
                )}
              </div>
            </div>
            {simulated && (
              <div className="as-panel as-sim-controls">
                <button
                  className="as-primary"
                  onClick={() => setPlaying((v) => !v)}
                >
                  {playing ? 'Pause' : 'Play'}
                </button>
                <select
                  aria-label="Simulation speed"
                  value={speed}
                  onChange={(e) => setSpeed(Number(e.target.value))}
                >
                  {[1, 10, 30, 60].map((v) => (
                    <option key={v} value={v}>
                      {v}× speed
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Simulation time in seconds"
                  type="range"
                  min={0}
                  max={duration * 60}
                  step={1}
                  value={cursor}
                  onChange={(e) => {
                    setCursor(Number(e.target.value));
                    setPlaying(false);
                  }}
                />
                <NumberField
                  label="Duration · min"
                  value={duration}
                  onChange={(v) => {
                    const n = Math.max(1, Math.min(1440, Number(v)));
                    setDuration(n);
                    setCursor((c) => Math.min(c, n * 60));
                  }}
                  min={1}
                  max={1440}
                />
                <label>
                  Synthetic worked case
                  <select value={workedCaseId} onChange={e => setWorkedCaseId(e.target.value)}>
                    {WORKED_CASES.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </select>
                </label>
                <button
                  onClick={() => loadWorkedCase(workedCaseId)}
                >
                  Load synthetic case
                </button>
                <button
                  onClick={() => {
                    setSimEntries([]);
                    setCursor(0);
                    setPlaying(false);
                  }}
                >
                  Clear
                </button>
              </div>
            )}
            {!simulated && !quick && !readonly && (
              <div className="as-phase-strip">
                <span>Phase</span>
                {['induction', 'maintenance', 'emergence'].map((v) => (
                  <button
                    key={v}
                    aria-pressed={phase === v}
                    disabled={busy || !!pendingHere}
                    onClick={() =>
                      void guarded(() =>
                        commit(
                          'phase',
                          { phase: v },
                          elapsed(activeSession!.startedAt, caseNow()),
                        ),
                      )
                    }
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
            <div className="as-section-head">
              <h2>Drugs</h2>
              <div className="as-row">
              <button disabled={windowEnded || busy} onClick={() => { setPreviewAt(stamp()); setPlaying(false); setError(''); setModal('forecast'); }}>Simulate a drug</button>
              <button
                disabled={readonly || busy}
                onClick={() => setModal('add')}
              >
                Add a drug
              </button>
              </div>
            </div>
            <div className="as-drugs">
              {shown.map((d) => {
                const last = drugEvents
                  .filter(
                    (e) =>
                      e.drug === d &&
                      e.t <= t &&
                      ['infusion', 'et'].includes(e.kind),
                  )
                  .at(-1);
                const volatile = ['sevoflurane', 'desflurane'].includes(d);
                const namedEffectSite = HN_EFFECT_SITES.find(link => link.drug === d);
                const rate =
                  last?.kind === 'infusion'
                    ? (last.value /
                        (p.weight * (d === 'dexmedetomidine' ? 1 : 60))) *
                      (['propofol', 'ketamine', 'morphine', 'hydromorphone', 'midazolam', 'rocuronium'].includes(d)
                        ? 1000
                        : 1)
                    : null;
                return (
                  <article
                    className="as-drug"
                    key={d}
                    style={{ '--drug-ink': ink[d] } as any}
                  >
                    <div className="as-drug-title">
                      <h3>
                        {drugs[d].name}
                        {d === 'dexmedetomidine' && <small> Precedex</small>}
                      </h3>
                      <button
                        aria-label={'About ' + drugs[d].name}
                        onClick={() => {
                          setDrug(d);
                          setModal('meaning');
                        }}
                      >
                        Details
                      </button>
                    </div>
                    <div className="as-concs">
                      <div>
                        <small>{volatile ? 'ET' : 'Cp'}</small>
                        <b>{num(d === 'rocuronium' && rocUnavailable ? null : current?.cp[d])}</b>
                      </div>
                      {!volatile && (
                        <div>
                          <small>Ce</small>
                          <b>{num(d === 'rocuronium' && rocUnavailable ? null : current?.ce[d])}</b>
                        </div>
                      )}
                      {namedEffectSite && <div><small>{namedEffectSite.domain} endpoint Ce</small><b>{num(current?.endpointCe?.[namedEffectSite.key])}</b></div>}
                      <small>{drugs[d].unit}</small>
                    </div>
                    {d === 'rocuronium' && rocUnavailable && <p className="as-caption">Concentrations after reversal are not modeled.</p>}
                    <div className="as-rate">
                      {volatile
                        ? last
                          ? `ET entered at ${clockDuration(last.t)}`
                          : 'No ET measurement'
                        : rate === null
                          ? 'No infusion recorded'
                          : `${num(rate)} ${doseUnit(d, 'infusion')}`}
                    </div>
                    <button
                      className="as-drug-action"
                      disabled={readonly || busy || !!pendingHere}
                      onClick={() => openDrug(d)}
                    >
                      {volatile ? 'Update end-tidal' : 'Record dose / rate'}
                    </button>
                  </article>
                );
              })}
            </div>
            {!quick && !readonly && (
              <section className="as-panel as-events">
                <div className="as-section-head">
                  <h2>Record an event</h2>
                  <small>Time captured when tapped</small>
                </div>
                <div className="as-event-buttons">
                  {clinicalEvents.map((name) => (
                    <button
                      key={name}
                      disabled={busy || !!pendingHere}
                      onClick={() => openClinical(name)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {!windowEnded && calculation.updating && <p className="as-caption" role="status">Updating concentrations…</p>}
            {!simulated && trace.length > 0 && <p className="as-caption">Concentrations calculated through {clockDuration(trace.at(-1)!.t)} · updates every 10 seconds</p>}
            {windowEnded ? (
              <p className="as-error" role="status">The 24-hour concentration window has ended. You can close this case; research exports retain the full record and concentration estimates through hour 24.</p>
            ) : calculation.error ? (
              <p className="as-error">{calculation.error}</p>
            ) : (
              <Charts
                trace={trace}
                choice={selectedChoice}
                age={p.age}
                patient={p}
                osa={knownOsa}
                entries={workingEntries}
                cursor={simulated ? t : trace.at(-1)?.t ?? 0}
                education={simulated}
                readonly={readonly || busy || !!pendingHere}
                onContext={recordContext}
              />
            )}
            {!quick && (
              <section className="as-panel">
                <div className="as-section-head">
                  <h2>Case timeline</h2>
                  <small>{workingEntries.length} entries</small>
                </div>
                {!workingEntries.length ? (
                  <p>Drug changes and clinical events will appear here.</p>
                ) : (
                  <div className="as-timeline">
                    {[...workingEntries]
                      .sort((a, b) => b.t - a.t)
                      .map((e) => {
                        const voided =
                          !activeEntries(workingEntries).some(
                            (a) => a.id === e.id,
                          ) && e.kind !== 'void';
                        return (
                          <div
                            className={
                              'as-timeline-row ' + (voided ? 'as-voided' : '')
                            }
                            key={e.id}
                          >
                            <time>
                              {clockDuration(e.t)}
                              {!simulated && (
                                <small>{riyadh(e.observedAt)} KSA</small>
                              )}
                            </time>
                            <div>
                              <strong>
                                {e.kind === 'drug'
                                  ? drugs[e.data.event.drug as Agent].name
                                  : e.kind === 'clinical'
                                    ? e.data.name
                                    : e.kind === 'phase'
                                      ? e.data.phase
                                      : e.kind === 'void'
                                        ? 'Correction'
                                        : e.kind === 'context'
                                          ? 'PD reference context'
                                          : 'Case ended'}
                              </strong>
                              <p>
                                {e.kind === 'drug'
                                  ? `${doseNumber(e.data.event.value)} ${drugs[e.data.event.drug as Agent].doseUnit}${e.data.event.kind === 'infusion' ? '/hr' : e.data.event.durationSeconds ? ` over ${doseNumber(e.data.event.durationSeconds / 60)} min` : e.data.event.kind === 'bolus' ? ' IV push' : ''}`
                                  : e.kind === 'clinical'
                                    ? e.data.response || 'Recorded'
                                    : e.kind === 'void'
                                      ? e.data.reason
                                      : ''}
                                {voided ? ' · voided' : ''}
                              </p>
                            </div>
                            <button
                              onClick={() => {
                                setEdit(e);
                                setReason('');
                                setModal('entry');
                              }}
                            >
                              Details
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </section>
            )}
          </section>
        )}
        {mode === 'cases' && (
          <section className="as-content">
            <div className="as-section-head">
              <h1>Saved cases</h1>
              <button onClick={() => setModal('notice')}>
                New research case
              </button>
            </div>
            <div className="as-panel as-row">
              {studyPicker}
              <button disabled={busy} onClick={() => void listCases()}>
                Load cases
              </button>
              <button onClick={() => setModal('study')}>Create study</button>
            </div>
            <div className="as-panel">
              {cases.length ? (
                cases.map((c) => (
                  <button
                    className="as-case-list"
                    key={c.id}
                    onClick={() =>
                      void guarded(async () => {
                        accept(
                          await api(
                            `/live-session?studyId=${studyId}&sessionId=${c.id}`,
                          ),
                        );
                        setMode('live');
                      })
                    }
                  >
                    <strong>{c.participant}</strong>
                    <span>
                      {new Date(c.started_at).toLocaleDateString('en-GB', {
                        timeZone: 'Asia/Riyadh',
                      })}{' '}
                      · {riyadh(c.started_at)}
                    </span>
                    <span>{c.ended_at ? 'Completed' : 'In progress'}</span>
                  </button>
                ))
              ) : (
                <p>
                  Select a study to load its cases. New cases appear here after
                  their start is saved.
                </p>
              )}
            </div>
            <LocalBackup busy={busy} onAction={(action) => void guarded(action)} onImported={getStudies} />
          </section>
        )}
        {mode === 'feedback' && (
          <section className="as-content as-setup">
            <h1>Your experience matters.</h1>
            <p>Record feedback locally for this study. Nothing is submitted to an external service.</p>
            <form
              className="as-panel"
              onSubmit={(e) => {
                e.preventDefault();
                void guarded(async () => {
                  if (!studyId) throw Error('Select a study.');
                  await api('/feedback', { studyId, ratings, comment, role });
                  setSaved('Thank you. Your feedback is saved.');
                  setRatings([0, 0, 0, 0]);
                  setComment('');
                });
              }}
            >
              <div className="as-grid">
                {studyPicker}
                <label>
                  Your role
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  >
                    {[
                      'Consultant',
                      'Specialist',
                      'Resident',
                      'Fellow',
                      'Other clinician',
                    ].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </label>
              </div>
              {[
                'The interface was easy to understand.',
                'Recording drugs and events was quick.',
                'The concentration displays were useful.',
                'I would use this app again.',
              ].map((q, i) => (
                <fieldset className="as-rating" key={q}>
                  <legend>{q}</legend>
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      type="button"
                      key={v}
                      aria-pressed={ratings[i] === v}
                      onClick={() =>
                        setRatings((a) => a.map((x, k) => (k === i ? v : x)))
                      }
                    >
                      {v}
                    </button>
                  ))}
                  <small>1 strongly disagree · 5 strongly agree</small>
                </fieldset>
              ))}
              <label>
                What should we improve?
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  maxLength={3000}
                />
              </label>
              <p className="as-caption">
                Custom questionnaire. Feedback is saved locally under the study ID, separately from case events.
              </p>
              <button
                className="as-primary"
                disabled={busy || ratings.some((v) => !v)}
              >
                Save feedback locally
              </button>
              <p role="status">{saved}</p>
            </form>
            <div className="as-row">
              <button
                onClick={() =>
                  void guarded(async () => {
                    const data = await api('/feedback?studyId=' + studyId);
                    setFeedbackRows(data.rows);
                  })
                }
              >
                Load study feedback
              </button>
              <button
                disabled={!feedbackRows.length}
                onClick={() =>
                  download('anesthesiologist-feedback.json', feedbackRows)
                }
              >
                Export feedback ({feedbackRows.length})
              </button>
            </div>
          </section>
        )}
        <Sheet open={modal === 'about'} close={() => setModal('')} title="SOM Research Edition">
          <p>Project creator: Mohammed Hakami. Copyright 2026.</p>
          <p>This edition runs the simulation and research recording tools on your device without user accounts or a remote case database.</p>
          <p>Concentrations and H/N values are model predictions. H/N are exploratory research scores, not clinical targets or probabilities of response.</p>
          <p>Case times come from the device clock. The application retains corrections and original snapshots, but local files are not independently authenticated or tamper-proof.</p>
          <p>Keep downloaded backups. Source code, model documentation, licence terms and citation information accompany the release.</p>
          <a href="./user-guide.html" target="_blank" rel="noreferrer">Open user guide</a>
        </Sheet>
        <Sheet
          open={modal === 'notice'}
          close={() => setModal('')}
          title="Before starting a case"
          description="Model information · shown once when starting each case"
        >
          <p>
            PK models estimate population concentrations from recorded doses.
            Validation differs by model and population; it does not validate
            the complete website or its clinical use.
          </p>
          <ul className="as-notice-list">
            <li>
              <b>Published PK:</b> Schnider/Marsh propofol, Minto remifentanil,
              Shafer fentanyl, Maitre alfentanil, Gepts sufentanil and
              Hannivoort dexmedetomidine, Zomorodi midazolam and Jeleazcov hydromorphone. Ce links have endpoint-specific
              limitations.
            </li>
            <li>
              <b>Limited scope:</b> Domino/Clements ketamine and parent-only
              morphine, without generic Ce. Named ketamine, morphine, hydromorphone and sufentanil effect sites support H/N through declared model combinations. Volatiles use measured end-tidal
              inputs and age-adjusted MAC.
            </li>
            <li>
              <b>Combined effects:</b> Published pair surfaces are identified.
              The all-agent index is an exposure hypothesis without a calibrated
              clinical scale. The respiratory panel is a separate exploratory propofol/remifentanil model. Arbitrary combinations and extubation readiness have no calibrated thresholds here.
            </li>
          </ul>
          <p>
            Record observations alongside standard monitoring; do not use this
            display to choose doses or replace clinical assessment. Patient data
            collection requires your approved institutional protocol and data
            arrangements. Concentrations begin at zero when recording starts.
          </p>
          <button
            className="as-primary"
            onClick={() => {
              prepareResearch();
            }}
          >
            I understand · continue to case setup
          </button>
        </Sheet>
        <Sheet
          open={modal === 'study'}
          close={() => setModal('')}
          title="Create a study"
          description="A study ID groups cases on this device. It is not a login."
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guarded(async () => {
                const r = await api('/studies', { id: studyName, name: studyName, protocol: protocol.trim() || 'Local research study' });
                await getStudies();
                setStudyId(r.id);
                setModal('');
              });
            }}
          >
            <label>
              Study ID
              <input
                required
                maxLength={60}
                pattern="[A-Za-z0-9_\-]{1,60}"
                value={studyName}
                onChange={(e) => setStudyName(e.target.value)}
              />
            </label>
            <label>
              Protocol reference / description
              <textarea
                maxLength={2500}
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
              />
            </label>
            <button className="as-primary" disabled={busy}>
              Create study
            </button>
          </form>
        </Sheet>
        <Sheet
          open={modal === 'add'}
          close={() => setModal('')}
          title="Add a drug"
        >
          <div className="as-add-list">
            {DRUG_IDS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setExtra((v) => Array.from(new Set([...v, d])));
                  openDrug(d);
                }}
              >
                <span style={{ color: ink[d] }}>●</span>
                {drugs[d].name}
                {d === 'dexmedetomidine' ? ' / Precedex' : ''}
              </button>
            ))}
          </div>
        </Sheet>
        <Sheet
          open={modal === 'drug'}
          close={() => {
            if (!pendingHere) setModal('');
          }}
          title={drugs[drug].name}
          description={
            simulated
              ? 'Add a simulated administration'
              : 'Record the dose and actual administration time.'
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guarded(async () => {
                if (amount.trim() === '') throw Error('Enter a dose or rate.');
                const occurrence = chosenOccurrence();
                await commit(
                  'drug',
                  {
                    drug,
                    mode: delivery,
                    value: Number(amount),
                    minutes: Number(minutes),
                  },
                  occurrence.t,
                  occurrence.observedAt,
                );
              });
            }}
          >
            {!['sevoflurane', 'desflurane'].includes(drug) && (
              <div className="as-segments as-delivery">
                {[
                  ['push', 'IV push'],
                  ['loading', 'Bolus over minutes'],
                  ['infusion', 'IV infusion'],
                ].map(([v, l]) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={delivery === v}
                    onClick={() => {
                      setDelivery(v as DoseMode);
                      setAmount('');
                    }}
                  >
                    {l}
                  </button>
                ))}
              </div>
            )}
            <NumberField
              label={
                delivery === 'et'
                  ? 'Measured end-tidal · %'
                  : `${delivery === 'infusion' ? 'New infusion rate' : 'Total dose'} · ${doseUnit(drug, delivery)}`
              }
              value={amount}
              onChange={setAmount}
              required
            />
            {drug === 'fentanyl' && delivery === 'infusion' && amount.trim() !== '' && Number.isFinite(Number(amount)) && Number(amount) >= 0 && (
              <p className="as-caption" aria-live="polite">Equivalent to {doseNumber(Number(amount) * p.weight * 60)} µg/hour for {doseNumber(p.weight)} kg. The case timeline shows this total hourly rate.</p>
            )}
            {delivery === 'loading' && (
              <NumberField
                label="Delivery duration · minutes"
                value={minutes}
                onChange={setMinutes}
                min={1 / 60}
                max={1440}
                required
              />
            )}
            {entryTimeFields}
            <p className="as-caption">
              {delivery === 'infusion'
                ? 'Replaces the recorded infusion rate. Enter 0 when the infusion stops.'
                : delivery === 'loading'
                  ? 'The timed bolus runs alongside any ongoing infusion.'
                  : delivery === 'et'
                    ? 'Measured end-tidal concentration, not vaporizer setting. Held until the next measurement.'
                    : 'Record the total administered dose.'}
            </p>
            <button className="as-primary" disabled={busy || !!pendingHere}>
              {busy
                ? 'Saving…'
                : simulated
                  ? 'Add to simulation'
                  : 'Save administration'}
            </button>
          </form>
        </Sheet>
        <Sheet
          open={modal === 'clinical'}
          close={() => {
            if (!pendingHere) setModal('');
          }}
          title={clinical.name}
          description={
            simulated
              ? 'Simulated event'
              : 'Record the actual event time.'
          }
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void guarded(async () => {
                const occurrence = chosenOccurrence();
                await commit(
                  'clinical',
                  clinical,
                  occurrence.t,
                  occurrence.observedAt,
                );
              });
            }}
          >
            {(stimulusEvents.includes(clinical.name) ||
              clinical.name === 'Pain') && (
              <label>
                Observed response
                <select
                  required
                  value={clinical.response ?? ''}
                  onChange={(e) =>
                    setClinical({ ...clinical, response: e.target.value })
                  }
                >
                  <option value="">Select response</option>
                  {(clinical.name === 'Pain'
                    ? ['unassessable']
                    : ['tolerated', 'not tolerated', 'unassessable']
                  ).map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                  {clinical.name === 'Pain' && (
                    <option value="tolerated">
                      Patient-reported score available
                    </option>
                  )}
                </select>
              </label>
            )}
            {clinical.name === 'Pain' && (
              <NumberField
                label="Patient-reported pain · 0–10"
                value={clinical.pain ?? ''}
                onChange={(v) =>
                  setClinical({
                    ...clinical,
                    pain: v === '' ? null : Number(v),
                  })
                }
                max={10}
              />
            )}
            <div className="as-grid">
              <label>
                Neuromuscular blockade
                <select
                  value={clinical.nmb}
                  onChange={(e) =>
                    setClinical({ ...clinical, nmb: e.target.value })
                  }
                >
                  <option value="unknown">Unknown / not entered</option>
                  <option value="none">None / recovered</option>
                  <option value="active">Active</option>
                </select>
              </label>
              <label>
                Ventilation
                <select
                  value={clinical.ventilation}
                  onChange={(e) =>
                    setClinical({ ...clinical, ventilation: e.target.value })
                  }
                >
                  <option value="unknown">Unknown / not entered</option>
                  <option value="spontaneous">Spontaneous</option>
                  <option value="assisted">Assisted</option>
                  <option value="controlled">Controlled</option>
                </select>
              </label>
            </div>
            <details
              open={['Apnea', 'Return of spontaneous ventilation'].includes(
                clinical.name,
              )}
            >
              <summary>Observation details</summary>
              <div className="as-grid">
                {[
                  ['rr', 'Respiratory rate · /min', 100],
                  ['spo2', 'SpO₂ · %', 100],
                  ['etco2', 'EtCO₂ · mmHg', 120],
                  ['oaas', 'Modified OAA/S (MOAA/S) · 0–5', 5],
                  ['windowSeconds', 'Observation window · seconds', 3600],
                ].map(([k, label, max]) => (
                  <NumberField
                    key={k}
                    label={String(label)}
                    value={(clinical as any)[k] ?? ''}
                    onChange={(v) =>
                      setClinical({
                        ...clinical,
                        [k]: v === '' ? null : Number(v),
                      })
                    }
                    max={Number(max)}
                  />
                ))}
              </div>
              <label>
                Observed signs / notes
                <textarea
                  value={clinical.notes}
                  onChange={(e) =>
                    setClinical({ ...clinical, notes: e.target.value })
                  }
                  maxLength={2000}
                />
              </label>
            </details>
            {entryTimeFields}
            <p className="as-caption">
              {['Laryngoscopy', 'Skin incision', 'Major surgical stimulus'].includes(
                clinical.name,
              )
                ? 'Tolerance refers to no purposeful movement or cough. Use unassessable during muscle relaxation; record hemodynamic signs in notes.'
                : clinical.name === 'Apnea'
                  ? 'Record observed apnea and its duration/context. Controlled ventilation alone does not establish drug-induced apnea.'
                  : clinical.name === 'Extubation'
                    ? 'Records actual extubation, separately from readiness.'
                    : 'Optional details can be left blank for a timing-only observation.'}
            </p>
            <button className="as-primary" disabled={busy || !!pendingHere}>
              Save event
            </button>
          </form>
        </Sheet>
        <Sheet
          open={modal === 'entry'}
          close={() => setModal('')}
          title="Timeline entry"
        >
          <p>
            {edit?.kind === 'clinical' ? edit.data.name : edit?.kind} ·{' '}
            {edit && clockDuration(edit.t)}
          </p>
          {edit?.snapshot && (
            <>
              {edit.snapshot.multimodal && (
                <p>
                  Saved H: {num(edit.snapshot.multimodal.H.value)} H-units · N:{' '}
                  {num(edit.snapshot.multimodal.N.value)} N-units ·{' '}
                  {edit.snapshot.multimodal.version}
                </p>
              )}
              <p>Saved at event: Cp / Ce</p>
              <div className="as-snapshot">
                {DRUG_IDS.map((d) => (
                  <span key={d}>
                    {drugs[d].name}
                    <b>
                      {num(edit.snapshot!.cp[d])} / {num(edit.snapshot!.ce[d])}{' '}
                      {drugs[d].unit}
                    </b>
                  </span>
                ))}
              </div>
              <p className="as-caption">
                Stored predictions stay unchanged when later corrections change
                the reconstructed timeline.
              </p>
            </>
          )}
          <details>
            <summary>Full recorded details</summary>
            <pre>{JSON.stringify(edit, null, 2)}</pre>
          </details>
          {!readonly && edit?.kind !== 'void' && edit?.kind !== 'end' && (
            <>
              <label>
                Correction reason
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
                />
              </label>
              <button
                disabled={busy || !reason.trim()}
                onClick={() =>
                  void guarded(() =>
                    commit(
                      'void',
                      { target: edit!.id, reason },
                      simulated
                        ? cursor
                        : elapsed(activeSession!.startedAt, caseNow()),
                    ),
                  )
                }
              >
                Void entry · preserve audit trail
              </button>
            </>
          )}
        </Sheet>
        <Sheet
          open={modal === 'end'}
          close={() => setModal('')}
          title="End this case?"
          description={
            quick
              ? 'Stops the case clock.'
              : 'Saves the completed record and starts the Excel download.'
          }
        >
          <p>This does not stop a physical infusion or device.</p>
          <button
            className="as-primary"
            disabled={busy || !!pendingHere}
            onClick={() =>
              void guarded(() =>
                commit('end', {}, elapsed(activeSession!.startedAt, caseNow())),
              )
            }
          >
            {quick ? 'End case now' : 'End case and download Excel'}
          </button>
        </Sheet>
        <Sheet open={modal === 'forecast'} close={() => setModal('')} title="Simulate a drug" description="Hypothetical administration · never added to this case">
          {modal === 'forecast' && <DrugForecast patient={forecastPatient} events={drugEvents} choice={selectedChoice} now={previewAt} osa={knownOsa} close={() => setModal('')} />}
        </Sheet>
        <Sheet
          open={modal === 'meaning'}
          close={() => setModal('')}
          title={drugs[drug].name + ' · clinical context'}
        >
          <div className="as-meaning-number">
            {num(drug === 'rocuronium' && rocUnavailable ? null : current?.cp[drug])}
            <small>
              {drugs[drug].unit} ·{' '}
              {['sevoflurane', 'desflurane'].includes(drug)
                ? 'end-tidal'
                : 'plasma'}
            </small>
          </div>
          {drug === 'rocuronium' && rocUnavailable && <p className="as-caption">Concentrations after reversal are not modeled.</p>}
          {(calculation.organ.overlays.some(o => o.drug === drug) || calculation.organ.unavailable.some(o => o.drug === drug)) && <p className="as-caption">Additional organ function tool: outside the verification analyses reported in the study.</p>}
          <OrganComparison drug={drug} trace={trace} result={calculation.organ} cursor={t} />
          <p>{drugs[drug].description}</p>
          {analgesiaContext(drug) && <><p>{analgesiaContext(drug)}</p><details><summary>Analgesia range source</summary><p>{ANALGESIA_CONTEXT_SOURCE}</p></details></>}
          <p>{respiratoryDrugContext(drug)}</p>
          <p>{drugs[drug].anchor}</p>
          <p>{drugs[drug].limitations}</p>
          <a href={drugs[drug].source} target="_blank" rel="noreferrer">
            Model source
          </a>
          <p className="as-caption">
            Cp is plasma exposure; Ce is a model-linked effect compartment where
            available. Neither alone establishes adequate anesthesia for a
            patient and stimulus.
          </p>
        </Sheet>
        <Sheet
          open={modal === 'models'}
          close={() => setModal('')}
          title="Models & evidence"
        >
          <div className="as-model-list">
            {DRUG_IDS.map((d) => (
              <div key={d}>
                <b>{drugs[d].name}</b>
                <a href={drugs[d].source} target="_blank" rel="noreferrer">
                  {drugs[d].model}
                </a>
              </div>
            ))}
          </div>
          <p>
            Published response surfaces cover selected pairs. The all-agent
            index is an exposure hypothesis with no established clinical
            threshold.
          </p>
          <p><a href="./user-guide.html" target="_blank" rel="noreferrer">Research edition user guide</a></p>
          <p>Full model sources, equations and verification records are provided with the release.</p>
        </Sheet>
        <Sheet
          open={modal === 'sim-patient'}
          close={() => setModal('')}
          title={quick ? 'Patient & models' : 'Simulation patient & models'}
        >
          {patientFields}
          {modelFields}
          <button
            className="as-primary"
            onClick={() => {
              try {
                validatePatient(patient);
                if (quick && quickState)
                  saveQuick({ ...quickState, patient: { ...patient }, choice: { ...choice }, confirmed: true });
                if (afterPatientDrug) {
                  setDrug(afterPatientDrug);
                  setDelivery(
                    ['sevoflurane', 'desflurane'].includes(afterPatientDrug)
                      ? 'et'
                      : [
                            'propofol',
                            'remifentanil',
                            'dexmedetomidine',
                          ].includes(afterPatientDrug)
                        ? 'infusion'
                        : 'push',
                  );
                  setAmount('');
                  setMinutes('1');
                  setEventTime((stamp() / 60).toFixed(3));
                  setOccurredAt(riyadhInput(caseNow()));
                  setEntryStamp(caseNow());
                  setAfterPatientDrug(null);
                  setModal('drug');
                } else setModal('');
              } catch (e) {
                setError(String(e));
              }
            }}
          >
            Done
          </button>
          <p className="as-caption">
            Changing weight replays existing absolute doses. New
            weight-normalised entries use the updated weight.
          </p>
        </Sheet>
        <Sheet
          open={modal === 'discard-pending'}
          close={() => setModal('')}
          title="Dismiss this unsaved entry?"
        >
          <p>
            The entry has not been confirmed by local storage. Export a copy
            first if you need to reconcile it with the case record.
          </p>
          <button
            onClick={() => download('unsaved-entry.json', pending.current)}
          >
            Export a copy
          </button>
          <button
            onClick={() => void guarded(async () => {
              storage().removeItem('som-pending');
              pending.current = null;
              setSaved('Unsaved entry dismissed');
              setModal('');
            })}
          >
            Dismiss unsaved entry
          </button>
        </Sheet>
      </main>
    </SheetError.Provider>
  );
}
