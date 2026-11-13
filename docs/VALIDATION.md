# Software verification and its limits

This document describes the checks supplied with SOM Research Edition. It does not claim clinical validation. Current run identities, result denominators and outcomes belong to the accompanying generated verification reports, not to an undated test-count statement here.

## Automated software tests

From the application root:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The test runner compiles and executes the supplied TypeScript tests. Their scope includes numerical propagation, unit conversion, finite delivery, model guards, H/N contribution rules, named effect-site states, drug forecasts, clinical extensions and workbook preservation. Local-controller tests separately cover start/entry idempotency, participant grouping, event-time rules, correction history, original snapshots, storage failure, conflicting writers and backup validation/import.

Workspace-recovery tests cover the separate browser-workspace storage and locking layer. They do not replace checking the interface in a real browser. Some retained tests exercise older low-level engine components; their behavior is not the definition of the current 13-agent research interface. The current model inventory is in [PHARMACOLOGY.md](PHARMACOLOGY.md), `study/pharmacology.ts` and the H/N registries.

## Separate numerical reference

Follow `verification/README.md` for Python requirements and execution:

```sh
python3 -m pip install -r verification/requirements.txt
python3 verification/reproduce.py --output /absolute/path/to/new-results
```

The separate reference transcribes the declared coefficients and uses SciPy matrix exponentials. It imports no application functions or runtime registry. The comparison covers nine deterministic concentration histories across the active drug inventory and selected alternative models, static H/N snapshots and mixtures, executable published pair equations, rocuronium outputs, hypothetical-dose scenarios, corrected research records and exported XLSX cells. Invalid volatile-input guards and structural sensitivities are reported separately.

The verification README states the numerical tolerances, category checks and separate denominators. Generated results identify inputs, executed source and compiled code, commands and post-run integrity. Repeated time samples and synthetic mixtures are software checks, not independent patients.

Computational separation does not constitute independent expert review. Agreement shows that the tested implementation matches the declared specification within the stated criteria. It does not validate the specification's source-to-score transfers, composite effect-site links, extrapolations, arbitrary combinations or clinical H/N thresholds.

## Browser and operational checks

Use `npm start` to serve the built application on `http://127.0.0.1:4173/`. Exercise the intended browser and device with synthetic data: start a research case, record administrations and an event, correct an entry, reload, end the case, inspect its Excel file, export a JSON backup, and restore that backup in a separate browser origin or profile. Check that the original snapshot and correction history survive. Also test the simulator and hypothetical preview without changing the recorded dose history.

These are operational acceptance steps, not a claim that every browser, device, storage failure or institutional environment has been tested. Current browser observations are reported separately in the release QA material. The application has no remote case database; historical server or team-access tests do not establish local-storage behavior.

## Interpretation

Calculated concentrations and H/N remain model outputs. Observed events are stored separately. Blank or unavailable values are not zero. Synthetic demonstration cases do not establish calibration, discrimination, clinical usefulness or safety. A clinical evaluation needs independently observed outcomes, a fixed model version, a prespecified analysis, appropriate handling of repeated observations and missing inputs, and suitable external validation.
