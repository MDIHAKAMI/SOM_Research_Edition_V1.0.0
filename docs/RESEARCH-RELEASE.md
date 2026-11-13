# SOM Research Edition — release scope

Distribution 1.0.0. Scientific release `som-4.3.0`; H/N registry `som-hn-3.0.0`. Created by Mohammed Hakami.

The active entry point is `main.tsx`, which opens `ui/CaseWorkspace.tsx`. See [USER_GUIDE.md](USER_GUIDE.md) for use and [OPERATIONS.md](OPERATIONS.md) for installation.

## Included workflows

- Local simulation with patient/model selection, synthetic worked cases, editable administration timelines, playback, concentration graphs and hypothetical drug previews.
- Research cases grouped by user-entered study ID, with coded participants and recorders, explicit synthetic/observed origin and cohort labels.
- Timestamped drug entries, clinical events, context, original model snapshots and recorded corrections.
- Browser persistence, reload recovery, completed-case Excel downloads and raw JSON research backup/import.
- Local clinician feedback, separate from clinical event records.

The active scientific inventory contains 13 agents: propofol, sevoflurane, desflurane, ketamine, dexmedetomidine, remifentanil, fentanyl, alfentanil, morphine, sufentanil, midazolam, hydromorphone and rocuronium. A listed drug does not imply a validated effect-site model or a contribution to every endpoint. Rocuronium has structural zero H/N contribution and separate neuromuscular outputs.

Research records use IndexedDB on the device. No account or remote case database is required. Occurrence and recording times use the device clock. Original snapshots and correction entries are retained, but local records are not independently authenticated or tamper-proof. JSON is the restore format; Excel is the analysis export.

## Scientific limits

The edition preserves the fixed equations and scientific source registries. H/N are exploratory exposure-based scores, not calibrated probabilities, BIS equivalents or dosing targets. Named endpoint effect-site combinations, population transfer, missing inputs and deliberate omissions are documented in [HN_MODEL_NOTES.md](HN_MODEL_NOTES.md). Published pairwise references and separate respiratory, organ-function and neuromuscular calculations retain their own qualifications.

Research mode collects observations; it does not automatically fit or optimize H/N. Cohort labels do not establish independent validation. Prespecify endpoints and timing, keep participants and synthetic data separated appropriately, and use separately versioned statistical analyses for model development and external evaluation.

The concentration window is 24 hours. All inputs are manual. Volatiles use entered end-tidal values held until updated, without a gas washout model. Concentrations start at zero; a prior-medication note does not create exposure. Observations are distinct from numerical forecasts.

## Source documentation

Current definitions are in `study/hn-coefficients.ts`, `study/hn-effect-sites.ts`, `study/multimodal.ts`, `study/pharmacology.ts`, `study/pd-registry.ts` and related modules. Historical source audits are explicitly dated and must not be read as the current feature inventory. Retained primary-source links document scientific choices; implementation verification does not establish clinical validity.
