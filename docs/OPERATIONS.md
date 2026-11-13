# Install and run SOM Research Edition

This source distribution runs the simulator and research recorder in a web browser. It needs no account, case database service or external application API. `npm start` serves the built files on your own computer; calculations and research storage remain in the browser.

## Requirements

- Node.js 22.12 or newer compatible with the supplied dependency lockfile.
- npm, included with Node.js.
- A modern browser with JavaScript, IndexedDB and file-download support.
- Internet access for the first dependency installation. Once installed and built, local use does not require internet access. External reference links need internet access.

Run commands from the package directory containing `package.json`.

## Install, check and build

```sh
npm ci
npm run typecheck
npm test
npm run build
npm start
```

Open `http://127.0.0.1:4173/` and leave the terminal open. Press Ctrl+C to stop the local file service. Do not open `index.html` directly from the filesystem. The built app is in `dist/`; the included local launcher binds to `127.0.0.1`.

Use the same address, port and browser profile for recording. `localhost` and `127.0.0.1` have different browser storage. Before moving the app to another address or computer, export a JSON research backup and import it at the new location.

## Development

```sh
npm run dev
```

Open the address printed by Vite. Development and built-app ports have separate browser storage. The development script can bind beyond the loopback interface; use synthetic data for development. Run `npm run build` again after source changes.

## Numerical verification

`npm test` runs the supplied TypeScript software tests. `npm run verify` invokes the separate Python verification program and writes results under `work/verification`. Follow the instructions and requirements in the verification materials before that run. These checks evaluate software implementation; they are not clinical validation.

## Data and recovery

Research records use IndexedDB. Workspace recovery preserves the selected case and a pending-entry copy; it does not provide a remote backup. Use **Download research backup** for all local research records and **Export Excel** for completed-case analysis files. Confirm downloads and practice **Import research backup** with synthetic records.

The app does not provide passwords, access roles, encryption, independently trusted timestamps or automatic device integration. Its local revision history is not a tamper-proof audit service. Institutional protocol and device/file security requirements still apply to observation collection.

A failed storage write is reported as not saved. Preserve the pending-entry recovery file, fix the issue, and retry or reload the saved case. Do not clear site data before taking backups. Use the recorded void-and-replace procedure for ordinary corrections rather than editing the browser database manually.

## Before using a new build

Export JSON research backups and Excel files. Record distribution and scientific model versions. Test a synthetic case through start, administration, event, correction, completion, Excel export, reload and JSON restore. Preserve the original data and release used for analysis. Do not silently recalculate original event snapshots under a changed formula.

See [USER_GUIDE.md](USER_GUIDE.md) for the recording workflow. The same guide is available from **About → Open user guide**.
