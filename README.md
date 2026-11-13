# State of Mind Research Edition 1.0.0

Created by **Mohammed Hakami**. Contact: **mohdhakami4@gmail.com**.

A browser application for multidrug anesthesia simulation and local research records. The release retains the State of Mind calculation engine and case workflow, with a local database and file exports. It requires no account or remote research server. The hosted website and this distribution have separate interfaces and release histories.

## Open the supplied application

The release ZIP contains a prebuilt `dist` folder. Install Node.js 24 LTS (or a compatible version >=22.12), unzip the complete release, and open `Start_Windows.cmd` on Windows or run this command from its folder on macOS/Linux:

```bash
node scripts/serve.mjs
```

Open **http://127.0.0.1:4173/**. Keep the terminal open while using it. This small server serves local static files only; research records and calculations remain in the browser. No npm packages or internet connection are needed to run the supplied build after Node.js is installed. Opening `index.html` directly as a file is not supported because browser workers and storage need a consistent origin.

## Build from source

```bash
npm ci
npm run build
npm start
```

For development use `npm run dev` instead. Exact dependencies are in `package-lock.json`. The delivered build was checked with Node.js 24.22.1 and npm 11.9.0 on Linux. Other desktop systems require testing in their own environment. Chrome was used for the browser checks; a current browser with IndexedDB, Web Worker and Web Locks support is required.

## Try the research workflow

1. Open **Research mode** and acknowledge the model information.
2. Enter a **Study ID**, **Recorder code** and **Participant code**. Keep **Synthetic example or software test** selected for practice.
3. Start the case. Enter actual or simulated doses with their units and times. Add observed events using the event buttons.
4. Review the dose timeline, concentrations, H/N contributions and named endpoint models. A **Simulate a drug** preview leaves the recorded history unchanged.
5. Click **End case**. Confirm the case end and download the Excel workbook. Its filename contains your study and participant codes. A saved case can be reopened for re-export.
6. Download a **research JSON backup** to retain the structured case and original snapshots. Import this JSON to restore the case in another browser or device. Excel is an analysis export, not the restore format.

A complete importable synthetic example and matching workbook are in `examples/`. See the [user guide](docs/USER_GUIDE.md) for dose corrections, timing and recovery.

## Included functions

- Eleven intravenous drugs and two entered end-tidal volatile agents; 15 supported model variants across 13 drugs.
- Full recorded dose history, effect-site delays where defined, published interaction outputs, and separate neuromuscular and respiratory displays.
- Fixed exploratory H/N 3.0.0 scores with individual contributions, sources, omissions and assumptions.
- Dose previews at 5, 15, 30 and 60 minutes.
- Local research studies, coded participants, occurrence and entry times, event snapshots, revision history, Excel workbooks and JSON backup/import.
- Synthetic examples, automated tests, separate reference calculations and reproducible results.



## Reproduce the checks

```bash
npm ci
npm test
python3 -m pip install -r verification/requirements.txt
python3 verification/reproduce.py --output work/my-verification-run
```

Use a new output directory for each verification run. Python 3.12.14 was used for the packaged reference results. See [verification methods](verification/README.md), [release results](docs/VERIFICATION_RESULTS.md) and the supplied `results` files. Numerical comparisons, automated application tests and browser checks are separate kinds of evidence. Large numbers of sampled outputs do not represent independent patients.

## Model and data limits

This is research and educational software. Concentrations are population-model predictions. H/N are evidence-informed constructed scores without established clinical thresholds. 

SOM can be hosted on your own or your institution’s web server, allowing users and researchers to access it through a consistent web address. Use HTTPS for remote hosting; plain HTTP on a remote server is not supported. The supplied localhost address is suitable for local use. Research records in this release remain stored in each user’s browser, so regular backup exports are still needed. Developers can extend the code to save records in a secure server database, with controlled access and automatic backups. These features require additional development and are not included in this release.

## Scientific provenance and reuse

Publication distribution: **1.0.0**. Scientific engine: **som-4.3.0**; H/N registry: **som-hn-3.0.0**. Source models, parameters and assumptions are described in `docs/`, source registries and the accompanying manuscript supplement.

The source is offered under the MIT licence in `Licence.txt` and `LICENSE`. Copyright notices must be retained when substantial portions are redistributed. Third-party components keep their own notices. `CITATION.cff` provides author and release information. No article DOI or public repository address is invented in this prepared release.
