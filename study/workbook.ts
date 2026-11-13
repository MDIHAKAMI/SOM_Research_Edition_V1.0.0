// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { DRUG_IDS, drugs, RELEASE, PK_VERSION, CE_VERSION, ceReason, simulate, ageMAC } from './pharmacology';
import {
  activeEntries,
  timeline,
  elapsed,
  riyadh,
  doseUnit,
  type Entry,
  type LiveSession,
} from './live';
import { STATE_ESTIMATE_VERSION } from './state-estimates';
import { modelProvenance } from './model-provenance';
import { hnSheets } from './hn-workbook';
import { PD_VERSION, PUBLISHED_PD_VERSION } from './pd-registry';
import { clinicalContext, rocContext, CLINICAL_EXTENSION_VERSION } from './clinical-context';
import { ROCURONIUM_SOURCE, rocuroniumParameters, rocuroniumTOFR } from './rocuronium';
import { respiratoryEstimate, RESPIRATORY_VERSION, RESPIRATORY_SOURCE } from './respiratory';
import { simulateOrganComparisons, DEX_HEPATIC_SOURCE } from './organ-comparison';
import { HN_EFFECT_SITES } from './hn-effect-sites';

type Cell = string | number | boolean | null | undefined;
export type SheetData = { name: string; rows: Cell[][] };
/** Keep immutable snapshot JSON complete while respecting Excel's 32,767-character cell limit. */
function snapshotParts(value: unknown): string[] {
  if (value == null) return [];
  const text = JSON.stringify(value), parts: string[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 30000, text.length);
    // Do not split a UTF-16 surrogate pair across XML text cells.
    const last = text.charCodeAt(end - 1);
    if (end < text.length && last >= 0xd800 && last <= 0xdbff) end--;
    parts.push(text.slice(start, end));
    start = end;
  }
  return parts;
}
const xml = (v: unknown) =>
  String(v ?? '')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
const ksaDate = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Riyadh',
    dateStyle: 'medium',
    timeStyle: 'medium',
    hour12: false,
  }).format(new Date(iso));
const utf = new TextEncoder();
function col(n: number): string {
  return n < 26
    ? String.fromCharCode(65 + n)
    : col(Math.floor(n / 26) - 1) + col(n % 26);
}
function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (const v of b) {
    c ^= v;
    for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
// A standards-compliant uncompressed ZIP package; all clinical text is an inline string, never a formula.
function zip(files: [string, string][]) {
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let offset = 0,
    directorySize = 0;
  for (const [path, content] of files) {
    const name = utf.encode(path),
      data = utf.encode(content),
      crc = crc32(data);
    const local = new Uint8Array(30 + name.length),
      l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true);
    l.setUint16(4, 20, true);
    l.setUint16(6, 0x800, true);
    l.setUint16(12, 33, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);
    const cd = new Uint8Array(46 + name.length),
      d = new DataView(cd.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint16(14, 33, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    cd.set(name, 46);
    parts.push(local, data);
    central.push(cd);
    offset += local.length + data.length;
    directorySize += cd.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, directorySize, true);
  e.setUint32(16, offset, true);
  const out = new Uint8Array(offset + directorySize + 22);
  let pos = 0;
  for (const b of [...parts, ...central, end]) {
    out.set(b, pos);
    pos += b.length;
  }
  return out;
}
export function xlsx(sheets: SheetData[]) {
  const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`,
    ],
    [
      '_rels/.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets>${sheets.map((s, i) => `<sheet name="${xml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${rel}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="styles" Type="${rel}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      `<styleSheet xmlns="${ns}"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF234B5D"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyAlignment="1"><alignment wrapText="1" vertical="center"/></xf><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ],
  ];
  sheets.forEach((sheet, i) => {
    const width = Math.max(1, ...sheet.rows.map((r) => r.length)),
      height = Math.max(1, sheet.rows.length),
      range = `A1:${col(width - 1)}${height}`;
    const rows = sheet.rows
      .map(
        (r, ri) =>
          `<row r="${ri + 1}"${ri === 0 ? ' ht="34" customHeight="1"' : ''}>${r
            .map((c, ci) => {
              if (c == null || (typeof c === 'number' && !Number.isFinite(c)))
                return '';
              const ref = `${col(ci)}${ri + 1}`;
              if (typeof c === 'number')
                return `<c r="${ref}" s="${ri === 0 ? 1 : 0}"><v>${c}</v></c>`;
              if (typeof c === 'boolean')
                return `<c r="${ref}" t="b"><v>${c ? 1 : 0}</v></c>`;
              return `<c r="${ref}" s="${ri === 0 ? 1 : 0}" t="inlineStr"><is><t xml:space="preserve">${xml(c)}</t></is></c>`;
            })
            .join('')}</row>`,
      )
      .join('');
    files.push([
      `xl/worksheets/sheet${i + 1}.xml`,
      `<worksheet xmlns="${ns}"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="16"/><cols>${Array.from({ length: width }, (_, c) => `<col min="${c + 1}" max="${c + 1}" width="${sheet.name === 'Case' ? (c === 0 ? 29 : 80) : Math.min(36, Math.max(18, String(sheet.rows[0]?.[c] ?? '').length + 2))}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData><autoFilter ref="${range}"/></worksheet>`,
    ]);
  });
  return zip(files);
}
export function researchSheets(
  session: LiveSession,
  entries: Entry[],
): SheetData[] {
  if (!session.endedAt) throw Error('End the case before exporting.');
  if (entries.some((e) => e.sessionId !== session.id))
    throw Error('The export contains entries from another case.');
  const active = activeEntries(entries),
    seconds = elapsed(session.startedAt, Date.parse(session.endedAt));
  const coverage = Math.min(seconds, 86400), events = timeline(entries);
  const clinical = clinicalContext(session.patient.clinical), roc = rocContext(session.patient.clinical);
  // Use the earliest surviving recorded reversal or configured reversal. Voided
  // records remain in Audit but do not change the reconstructed trajectory.
  roc.reversalAt = active.filter(e => e.kind === 'clinical' &&
    e.data?.name === 'Neuromuscular reversal' && Number.isFinite(e.t) && e.t >= 0)
    .reduce<number | null>((first, e) => first === null ? e.t : Math.min(first, e.t), roc.reversalAt);
  const sampleAtSeconds = [
    ...active.filter(e => e.kind === 'clinical').map(e => e.t),
    ...(roc.reversalAt === null ? [] : [roc.reversalAt]),
  ].filter(t => Number.isInteger(t) && t >= 0 && t <= coverage);
  const traces = simulate(
    session.patient,
    events,
    coverage / 60,
    session.choice,
    { sampleAtSeconds },
  );
  const rocParameters = rocuroniumParameters(session.patient, roc);
  const organ = simulateOrganComparisons(session.patient, events, coverage / 60, clinical, session.choice, { sampleAtSeconds });
  const dexOverlay = organ.overlays.find(o => o.drug === 'dexmedetomidine');
  const dexPoints = new Map(dexOverlay?.points.map(p => [p.t, p.cp]) ?? []);
  const dexUnavailable = organ.unavailable.find(o => o.drug === 'dexmedetomidine' && o.organ === 'hepatic');
  const afterReversal = (t: number) => roc.reversalAt !== null && t >= roc.reversalAt;
  const snapshot = (e: Entry) => e.snapshot as any;
  const auditSnapshotParts = new Map(entries.map(e => [e.id, snapshotParts(e.snapshot)]));
  const snapshotPartCount = Math.max(1, ...Array.from(auditSnapshotParts.values(), parts => parts.length));
  return [
    {
      name: 'Case',
      rows: [
        ['Field', 'Value'],
        ['Case ID', session.id],
        ['Study ID', session.studyId],
        ['Software author', 'Mohammed Hakami'],
        ['Distribution', 'SOM Research Edition'],
        ['Clock source', 'Local device clock; occurrence and recording times are not independently verified'],
        ['Participant', session.participant],
        ['Site', session.site],
        ['Cohort', session.cohort],
        ['Synthetic data', session.synthetic ?? null],
        ['Data origin', session.synthetic === true ? 'Synthetic; no patient observations' : session.synthetic === false ? 'Recorded case' : 'Not recorded in legacy session'],
        ['Started UTC', session.startedAt],
        ['Started KSA', ksaDate(session.startedAt)],
        ['Ended UTC', session.endedAt],
        ['Ended KSA', ksaDate(session.endedAt)],
        ['Time zone', 'Asia/Riyadh (UTC+03:00)'],
        ['Duration seconds', seconds],
        ['Concentration coverage seconds', Math.min(seconds, 86400)],
        ['Concentration window', seconds > 86400 ? 'First 24 hours only; no estimates after this boundary.' : 'Entire case'],
        ['Revision', session.revision],
        ...Object.entries(session.patient).filter(([key]) => key !== 'clinical') as [string, Cell][],
        ...Object.entries(clinicalContext(session.patient.clinical)).filter(([key]) => key !== 'nmb') as [string, Cell][],
        ...Object.entries(clinicalContext(session.patient.clinical).nmb).map(([key, value]) => [`NMB ${key}`, value] as Cell[]),
        ...Object.entries(session.covariates),
        ['PK models', JSON.stringify(session.choice)],
        ['Prior drugs', session.priorDrugs],
        ['Export software', RELEASE],
        ['Clinical extensions version', CLINICAL_EXTENSION_VERSION],
        ['Respiratory comparison version', RESPIRATORY_VERSION],
        ['Effective rocuronium reversal seconds', roc.reversalAt],
        ['Rocuronium CrCl basis', roc.crcl === null ? 'Source age imputation; not a measured renal assessment' : 'Entered unindexed CrCl (mL/min)'],
        ['Rocuronium model', rocParameters.pk.model],
        ['Rocuronium source', ROCURONIUM_SOURCE],
        ['Respiratory comparison source', RESPIRATORY_SOURCE],
        ['Dex hepatic comparison source', DEX_HEPATIC_SOURCE],
        ['H/N registry version', PD_VERSION],
        ['PK version', PK_VERSION],
        ['Effect-site linkage version', CE_VERSION],
        ['Published PD version', PUBLISHED_PD_VERSION],
        ['Legacy exposure index version', STATE_ESTIMATE_VERSION],
        ['Exported UTC', new Date().toISOString()],
        ['Reconstruction reason', 'Recalculated at export from the final corrected timeline using the export software and selected models above. Original snapshots are retained separately.'],
        ['Snapshot JSON storage', 'In Audit, concatenate Original snapshot JSON and its numbered continuation columns in order. Parts contain at most 30,000 characters; no snapshot text is discarded.'],
        [
          'Concentration series',
          'Reconstructed from the final corrected timeline. Concentrations are predictions, not measurements.',
        ],
        [
          'Event snapshots',
          'Original saved event-time predictions; remain unchanged by subsequent corrections. Blank means unavailable.',
        ],
        [
          'Rocuronium after reversal',
          'Reconstructed Cp, Ce and TOFR are unavailable from the earliest configured or active recorded reversal. Reversal disposition is not modeled.',
        ],
        [
          'Historical rocuronium snapshots',
          'Any saved rocuronium values are the original no-reversal trajectory, not a modeled reversal response. Original event snapshots and audit records are not retroactively edited.',
        ],
        [
          'Clinical extensions series',
          'Reconstructed from final corrected records. TOFR is a ratio; respiratory output is an adapted propofol/remifentanil pair probability, not isolated apnea or the full combination. Dex hepatic Cp is a clearance-only scenario.',
        ],
        [
          'Probability units',
          'Fractions 0–1. Published reference uses its named pair only. Index is not a probability.',
        ],
      ],
    },
    {
      name: 'Exposure provenance',
      rows: [['Drug','Cp or ET units','Ce availability','Reason unavailable','PK version','Ce version','Full source and linkage metadata'],
      ...DRUG_IDS.map(d => [d,drugs[d].unit,ceReason(d) ? 'Unavailable' : 'Modeled linkage',ceReason(d),PK_VERSION,CE_VERSION,JSON.stringify(modelProvenance(d,session.patient,session.choice))])],
    },
    {
      name: 'Drugs',
      rows: [
        [
          'Entry ID',
          'Seconds',
          'Observed UTC',
          'Observed KSA',
          'Drug',
          'Delivery',
          'Entered value',
          'Entered unit',
          'Duration seconds',
          'Internal amount or rate',
          'Internal unit',
          'Author',
          'Received UTC',
          'Recorded revision',
        ],
        ...active
          .filter((e) => e.kind === 'drug')
          .map((e) => {
            const d = e.data.event,
              a = e.data.entered;
            return [
              e.id,
              e.t,
              e.observedAt,
              riyadh(e.observedAt),
              drugs[d.drug as keyof typeof drugs].name,
              a?.mode ?? d.kind,
              a?.value,
              a ? doseUnit(d.drug, a.mode) : null,
              d.durationSeconds ?? null,
              d.value,
              drugs[d.drug as keyof typeof drugs].doseUnit +
                (d.kind === 'infusion' ? '/hr' : ''),
              e.author,
              e.receivedAt,
              e.recordedRevision,
            ];
          }),
      ],
    },
    {
      name: 'Events',
      rows: [
        [
          'Entry ID',
          'Seconds',
          'Observed UTC',
          'Observed KSA',
          'Event',
          'Response',
          'NMB',
          'Ventilation',
          'RR per min',
          'SpO2 percent',
          'EtCO2 mmHg',
          'Pain 0-10',
          'Responsiveness score (see scale column)',
          'Window seconds',
          'Legacy snapshot LOR fraction',
          'Snapshot LOR model',
          'Laryngoscopy tolerance fraction',
          'Incision tolerance fraction',
          'Published prop-remi fraction',
          'Published sevo-remi fraction',
          'Legacy exposure index',
          'Index version',
          'Retrospective',
          'Snapshot release',
          'Notes',
          'Author',
          'Responsiveness scale',
          'Received UTC',
          'Recorded revision',
        ],
        ...active
          .filter((e) => e.kind === 'clinical')
          .map((e) => {
            const v = snapshot(e);
            return [
              e.id,
              e.t,
              e.observedAt,
              riyadh(e.observedAt),
              e.data.name,
              e.data.response,
              e.data.nmb,
              e.data.ventilation,
              e.data.rr,
              e.data.spo2,
              e.data.etco2,
              e.data.pain,
              e.data.oaas,
              e.data.windowSeconds,
              v?.effects?.lor,
              v?.effects?.kind,
              v?.effects?.laryngoscopy,
              v?.effects?.incision,
              v?.state?.publishedPropRemi,
              v?.state?.publishedSevoRemi,
              v?.state?.index,
              v?.state?.version,
              v?.retrospective,
              v?.release,
              e.data.notes,
              e.author,
              e.data.responsivenessScale ?? 'unrecorded',
              e.receivedAt,
              e.recordedRevision,
            ];
          }),
      ],
    },
    {
      name: 'Event concentrations',
      rows: [
        [
          'Entry ID',
          'Seconds',
          'Drug',
          'Cp or ET',
          'Ce',
          'Unit',
          'Snapshot release',
          'Cp-ET availability',
          'Ce availability reason',
          'Recorded PK variant',
          'Snapshot PK version',
          'Snapshot Ce version',
          'Observed UTC',
          'Received UTC',
        ],
        ...active
          .filter((e) => e.kind === 'clinical')
          .flatMap((e) =>
            DRUG_IDS.map((d) => [
              e.id,
              e.t,
              drugs[d].name,
              e.snapshot?.cp[d],
              e.snapshot?.ce[d],
              drugs[d].unit,
              e.snapshot?.release,
              e.snapshot?.cp[d] == null ? (d === 'rocuronium' && e.snapshot?.rocuroniumAvailability?.unadjustedCounterfactual
                ? e.snapshot.rocuroniumAvailability.status : 'No original concentration recorded') : 'Recorded prediction',
              !e.snapshot ? 'No original snapshot recorded' : e.snapshot.ce[d] == null
                ? e.snapshot.ceUnavailableReason?.[d] ?? 'Unavailable in original snapshot' : 'Recorded prediction',
              (e.snapshot?.modelProvenance as any[] | undefined)?.find(p => p.drug === d)?.pkVariant,
              e.snapshot?.versions?.pk,
              e.snapshot?.versions?.ce,
              e.observedAt,
              e.receivedAt,
            ]),
          ),
      ],
    },
    {
      name: 'Event endpoint concentrations',
      rows: [
        ['Entry ID', 'Seconds', 'Endpoint effect site', 'Ce ng-mL', 'Snapshot release', 'Origin'],
        ...active.filter(e => e.kind === 'clinical').flatMap(e => [
          [e.id, e.t, 'dexmedetomidineMoaas', e.snapshot?.endpointCe?.dexmedetomidineMoaas, e.snapshot?.release, 'Original immutable event snapshot'],
          ...HN_EFFECT_SITES.map(link => [e.id, e.t, link.key, e.snapshot?.endpointCe?.[link.key], e.snapshot?.release, 'Original immutable event snapshot']),
        ]),
      ],
    },
    {
      name: 'Concentration series',
      rows: [
        [
          'Seconds',
          'UTC',
          'KSA',
          ...DRUG_IDS.flatMap((d) => [
            `${d} Cp-ET ${drugs[d].unit}`,
            `${d} Ce ${drugs[d].unit}`,
          ]),
          'dexmedetomidineMoaas endpoint Ce ng-mL',
          ...HN_EFFECT_SITES.map(link => `${link.key} endpoint Ce ng-mL`),
        ],
        ...traces.map((t) => {
          const at = new Date(
            Date.parse(session.startedAt) + t.t * 1000,
          ).toISOString();
          return [
            t.t,
            at,
            riyadh(at),
            ...DRUG_IDS.flatMap((d) => d === 'rocuronium' && afterReversal(t.t)
              ? [null, null] : [t.cp[d], t.ce[d]]),
            t.endpointCe?.dexmedetomidineMoaas,
            ...HN_EFFECT_SITES.map(link => t.endpointCe?.[link.key]),
          ];
        }),
      ],
    },
    {
      name: 'Clinical extensions',
      rows: [
        ['Seconds', 'UTC', 'Rocuronium Cp µmol/L', 'Rocuronium Ce µmol/L',
          'TOFR raw ratio', 'TOFR baseline-normalized ratio', 'Rocuronium status',
          'Respiratory pair probability 0-1', 'Respiratory status', 'Respiratory excluded drugs',
          'Dex hepatic Cp ng/mL', 'Dex hepatic status', 'Clinical version', 'Respiratory version',
          'Known liver disease', 'Child–Pugh score', 'Known kidney disease', 'CrCl mL/min',
          'Dialysis', 'Other neuromuscular blocker', 'Sevo model scenario', 'Race model scenario',
          'Effective reversal seconds', 'Origin'],
        ...traces.map(t => {
          const exposed = events.some(e => e.drug === 'rocuronium' && e.value > 0 && e.t <= t.t);
          const tofr = exposed ? rocuroniumTOFR(t.ce.rocuronium ?? NaN, rocParameters, roc, t.t) : null;
          const respiratory = respiratoryEstimate(t, session.choice, session.patient.age, {
            ...clinical, osa: session.covariates.osa,
            bmi: session.patient.weight / (session.patient.height / 100) ** 2,
          });
          const rocStatus = afterReversal(t.t) ? 'Unavailable after reversal' :
            !exposed ? 'No rocuronium administered' : roc.otherBlocker ? 'Unavailable with another neuromuscular blocker' :
              tofr?.available ? 'Modeled rocuronium-alone ratio' : 'Unavailable';
          return [t.t, new Date(Date.parse(session.startedAt) + t.t * 1000).toISOString(),
            afterReversal(t.t) ? null : t.cp.rocuronium,
            afterReversal(t.t) ? null : t.ce.rocuronium,
            tofr?.raw ?? null, tofr?.normalized ?? null, rocStatus,
            respiratory.probability, respiratory.status, respiratory.excluded.join('; '),
            dexPoints.get(t.t) ?? null,
            dexOverlay?.label ?? dexUnavailable?.reason ??
              (clinical.knownLiverDisease ? 'No dexmedetomidine administered' : 'Hepatic comparison not selected'),
            CLINICAL_EXTENSION_VERSION, RESPIRATORY_VERSION,
            clinical.knownLiverDisease, clinical.childPughScore, clinical.knownKidneyDisease,
            clinical.crcl, clinical.dialysis, roc.otherBlocker, roc.sevo, roc.race, roc.reversalAt,
            'Reconstructed; not an original event snapshot'];
        }),
      ],
    },
    {
      name: 'Models',
      rows: [
        [
          'Drug',
          'PK model',
          'Unit',
          'Display reference (legacy scale)',
          'Reference meaning',
          'Source',
        ],
        ...DRUG_IDS.map((d) => [
          drugs[d].name,
          drugs[d].model,
          drugs[d].unit,
          ['sevoflurane', 'desflurane'].includes(d)
            ? ageMAC(d, session.patient.age)
            : drugs[d].scale,
          ['sevoflurane', 'desflurane'].includes(d)
            ? 'Actual patient-age-adjusted MAC; see equation'
            : 'Software normalization scale, not EC50 or equal potency',
          drugs[d].source,
        ]),
        [
          'Legacy index equation (pre H-N)',
          'Sum log2(1 + concentration/reference). Ce when available; Cp for ketamine/morphine; measured ET for volatiles.',
        ],
        [
          'MAC age equation',
          'MAC40 * 10^(-0.00269 * (age-40)); sevo 1.8%, des 6.6%.',
        ],
        [
          'Clinical meaning',
          'Exposure feature for prospective calibration. No established anesthesia, apnea or extubation threshold.',
        ],
        [
          'Published pairs',
          'Separate propofol/remifentanil (Schnider only) and sevoflurane/remifentanil columns. Each excludes other drugs. Do not add these probabilities.',
        ],
        [
          'Propofol/remifentanil',
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC3050649/',
        ],
        [
          'Sevo/remifentanil',
          'https://pmc.ncbi.nlm.nih.gov/articles/PMC2888734/',
        ],
      ],
    },
    {
      name: 'Audit',
      rows: [
        [
          'Entry ID',
          'Kind',
          'Seconds',
          'Observed UTC',
          'Received UTC',
          'Author',
          'Active',
          'Recorded data JSON',
          'Original snapshot JSON',
          'Recorded revision',
          'Synthetic data',
          'Snapshot JSON parts',
          ...Array.from({ length: snapshotPartCount - 1 }, (_, i) => `Original snapshot JSON part ${i + 2}`),
        ],
        ...entries.map((e) => [
          e.id,
          e.kind,
          e.t,
          e.observedAt,
          e.receivedAt,
          e.author,
          active.some((a) => a.id === e.id),
          JSON.stringify(e.data),
          auditSnapshotParts.get(e.id)?.[0] ?? null,
          e.recordedRevision,
          session.synthetic ?? null,
          auditSnapshotParts.get(e.id)?.length ?? 0,
          ...Array.from({ length: snapshotPartCount - 1 }, (_, i) => auditSnapshotParts.get(e.id)?.[i + 1] ?? null),
        ]),
      ],
    },
    ...hnSheets(session, entries, traces),
  ];
}
export function exportWorkbook(session: LiveSession, entries: Entry[]) {
  const bytes = xlsx(researchSheets(session, entries));
  const url = URL.createObjectURL(
    new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  const safe = (value: string) => value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
  a.download = `SOM_${safe(session.studyId)}_${safe(session.participant)}_${session.id.slice(0, 8)}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
