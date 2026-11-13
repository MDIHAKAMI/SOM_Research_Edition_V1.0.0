# SOM Research Edition — user guide

Created by Mohammed Hakami. Distribution version 1.0.0; scientific release `som-4.3.0`; H/N registry `som-hn-3.0.0`.

SOM estimates drug concentrations from entered administrations and records observations along the same timeline. It displays exploratory H and N scores and selected published pharmacodynamic references. These are model outputs, not measured concentrations, clinical targets or instructions for choosing a dose. Software verification does not establish clinical accuracy.

## 1. Open the application

Follow `docs/OPERATIONS.md` to install and build the source package. Run `npm start`, leave the terminal open, and open `http://127.0.0.1:4173/`. Use the same address and browser profile each time to reach the same records. There is no sign-in. Calculations and research storage run on your device.

| Home-screen path | Purpose |
|---|---|
| **Quick local case** | A simple local concentration timeline without a study ID. Use Research mode for the complete observation and Excel workflow. |
| **Research mode** | Cases grouped by study ID, coded participants, clinical events, original snapshots, corrections, Excel exports and JSON backups. |
| **Simulator / education** | Artificial examples, editable timelines, playback and hypothetical exploration. These are not patient observations. |

Use **Models** for equations, sources and qualifications, **About** for release information, and **Saved cases** to reopen research records.

## 2. Start a research case

1. Select **Research mode**, read the model information, and select **I understand · continue to case setup**.
2. Enter a **Study ID**, such as `SOM-PILOT-01`. An existing ID selects its local study; a new ID creates a local study when the case starts. Study and recorder codes accept letters, numbers, hyphens and underscores, up to 60 characters. To add a protocol description first, use **Saved cases → Create study**.
3. Enter a **Recorder code**. This is a typed code, not a verified identity.
4. Choose **Record type**: **Synthetic example or software test** for testing, or **Recorded observations under an approved protocol** for actual observations. Do not label simulated outcomes as observed data.
5. Enter coded **Participant code** and **Site code** values, using letters, numbers and hyphens. Do not enter names or medical record numbers. Keep any identification key separately in approved storage.
6. Enter the patient details and relevant clinical profile. Open **Additional covariates & models** to review model choices, other covariates and **Cohort**. A participant stays in one cohort and one record type within the study. These labels help organize later analysis; this edition does not automatically fit or validate H/N.
7. Review **Medication before recording**. This optional note does not add a dose or initial concentration. Concentrations begin at zero. To include earlier administrations, choose an earlier start and enter the administrations at their actual times. Unknown previous exposure remains a limitation.
8. Under **Case start**, choose **Start now** or **Started earlier**, then enter **Minutes ago**. Review all setup values before selecting **Start case**. Patient and model setup is fixed for a research case; correct a setup mistake by starting a properly labelled replacement case and documenting the reason in your study records.

The display uses Riyadh time (UTC+3), regardless of your local time zone. Both occurrence and recording times come from the device clock. Check that clock before starting. The concentration window is limited to 24 hours from case start.

## 3. Record administrations

Four cards appear initially: sevoflurane, desflurane, propofol and remifentanil. Select **Add a drug** for fentanyl, alfentanil, sufentanil, morphine, hydromorphone, ketamine, dexmedetomidine, midazolam or rocuronium. Support differs by drug and endpoint; read each card's **Details**.

For an IV drug, select **Record dose / rate**, then choose:

- **IV push:** enter the total dose in the displayed unit.
- **Bolus over minutes:** enter the total dose and delivery duration. This is added alongside any existing infusion.
- **IV infusion:** enter the new rate in the displayed unit. It replaces the previous continuous rate. Enter **0** when the infusion stops.

Always use the unit printed beside the input. The timeline can show a converted total hourly rate while the input uses a weight-normalized rate. Do not copy a value between different units without conversion.

For a volatile agent, select **Update end-tidal** and enter the measured end-tidal percentage. It is held until the next measurement. A vaporizer setting is not an end-tidal measurement. The app does not infer washout when a vaporizer is turned off; continue entering measured values, including measured zero when appropriate.

Check **Time · Riyadh (UTC+3)** and select **Save administration**. The form initially captures its opening time. Use **Now** for the current device time, or enter the actual earlier time within the case. A late entry is not a prospective observation. Check the saved status and timeline before continuing.

## 4. Record observations and context

Use the **Phase** buttons for induction, maintenance and emergence. Under **Record an event**, select the observed event. Enter the response where requested, neuromuscular blockade and ventilation context, and available **Observation details**. These can include respiratory rate, SpO₂, EtCO₂, MOAA/S, observation window, pain score and notes. Leave unavailable measurements blank rather than entering a false zero.

Use **unassessable** when the chosen response cannot be assessed. Absence of movement under active neuromuscular blockade is not evidence of tolerance. Actual extubation is separate from readiness. Check the actual time and select **Save event**.

Each clinical event retains a snapshot of the exposures and model outputs available when it was saved. A saved calculation is not proof that a blinded prediction preceded the event. Prespecify event definitions, repeated assessments and timing in the study protocol.

Graph panels provide concentration traces, H/N and selected endpoint references. Cp, generic Ce, named endpoint Ce and end-tidal concentration are not interchangeable. An unavailable output is not zero. Rocuronium is separate from H/N; modeled neuromuscular recovery has important limitations, including reversal.

## 5. Correct an entry

1. In **Case timeline**, select the entry's **Details** button.
2. Review the original information and saved event snapshot.
3. Enter a **Correction reason** and select **Void entry · preserve audit trail**.
4. Add a replacement administration or event at its actual time, if needed.

Voiding retains the original entry and adds a correction. It changes the reconstructed timeline but does not rewrite previously saved event snapshots. The Excel workbook separates original snapshots from the reconstructed concentration series. This local history is not independently authenticated or tamper-proof. Completed cases cannot accept further entries or corrections through the interface.

## 6. End a case and download Excel

Select **End case**, then **End case and download Excel**. This saves the end entry, closes the case to further edits, and starts the workbook download. It does not stop a physical infusion or control a medical device.

The filename includes the study ID, participant code and case identifier, for example `SOM_SOM-PILOT-01_TEST-001_ab12cd34.xlsx`. If the download is blocked or another copy is needed, use **Export Excel** on the completed case.

The workbook includes case metadata, exposure provenance, drug entries, clinical events, event concentrations, named endpoint concentrations, a reconstructed concentration series, clinical extensions, models and audit rows. Some details are structured text. Read the model documentation before analysis. Excel is an analysis copy, not the restore format for the app.

## 7. Resume and recover records

Saved research entries persist in the browser's IndexedDB storage. Reloading normally restores the last workspace. Alternatively, select **Saved cases**, select the study, choose **Load cases**, and open an **In progress** or **Completed** case. An in-progress case continues from its original start; closing the page does not pause real elapsed time.

If an entry shows **Unsaved entry · retry required**, resolve the error and use retry. Do not assume it was saved. A pending-entry recovery download preserves the attempted input, not the complete study. Check the timeline after retrying. Use one active workspace tab; if a conflicting write is rejected, reload the latest saved record before entering it again.

## 8. Back up or move research data

Use **Research backups** on the home or saved-cases screen:

- **Download research backup** creates JSON containing local studies, cases, original entries and snapshots, and local feedback. Save it regularly and before updates, browser changes or device changes.
- **Import research backup** reads that file on the destination browser. Supported records are checked. Existing cases are not overwritten. A conflicting copy is rejected rather than silently merged; preserve the source files and resolve the conflict outside the app.
- After import, use **Saved cases → Load cases** to confirm the intended study and cases are present.

Keep both JSON backups and required Excel files in approved research storage. Research backups do not include the separate quick-case workspace or temporary simulator timeline. Confirm downloads exist and can be read. Test restoration with synthetic records before collecting observations.

## 9. Use the simulator and forecast

Choose **Simulator / education**. Review **Patient & models**, choose a **Synthetic worked case**, and select **Load synthetic case**. Use **Play**, **Pause**, the speed selector and time slider. Add synthetic drug entries and events, change duration, or select **Clear** to remove the current simulated timeline. These actions are separate from saved research cases.

**Simulate a drug** previews a hypothetical administration from the selected case state. It does not enter an administered dose into the case. A forecast is a model comparison, not a recommended treatment plan. H/N remain fixed formulas in this release. Retrospective formula changes need a separately versioned analysis and a distinct validation dataset.

## 10. Storage, privacy and interpretation

- Records stay in this browser and device. There is no remote case database or automatic cross-device backup. A different host, port or browser profile has different storage.
- Clearing site data, private-browsing expiry, device loss, storage failure or browser eviction can remove records. Autosave is not a substitute for downloaded backups.
- There are no user accounts or application access roles. Anyone with access to the browser profile or exported files may read them. The app does not itself encrypt them. Use approved device security, coded identifiers and file storage.
- The app does not connect to pumps, anesthesia machines or clinical monitors. Inputs are manual. Opening an external source link is separate from local case recording.
- H/N are constructed scores with stated assumptions and omissions. They are not BIS equivalents, response probabilities, validated depth measurements or dosing targets. Pairwise references do not validate every combination.
- Missing doses, wrong units, inaccurate times, unrecorded volatile measurements, population-model error and unsupported combinations can materially change outputs. Equation agreement does not establish patient-level predictive performance.

Consult **Models**, `docs/HN_MODEL_NOTES.md` and the supplied source registries for scientific definitions. Evaluate independently observed outcomes, preserve the fixed model version, and keep synthetic results separate from clinical evidence.
