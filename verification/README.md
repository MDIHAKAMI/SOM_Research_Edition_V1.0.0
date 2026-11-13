# Reproducing the State of Mind calculation verification

From the application root, install the locked Node dependencies and the listed
Python packages. Use a new result directory for each run:

```bash
npm ci
python -m pip install -r verification/requirements.txt
python verification/reproduce.py --output /absolute/path/to/new-results
```

The driver compiles the application, writes the deterministic synthetic input
file, hashes the application source, compiled JavaScript and verification code,
executes the application adapter, evaluates the separate numerical reference, creates
figures and checks that the recorded source identities did not change.

## What is compared

- Nine 120-minute histories cover all 11 intravenous drugs, two held volatile
  exposures, three covariate profiles and the selected alternative propofol and
  ketamine models. Boluses, overlapping finite delivery, infusion changes and
  same-second changes are included. The reference propagates each constant-input
  segment with SciPy's matrix exponential. The application propagates at one
  second. Parameters, Cp, generic Ce, named endpoint Ce and mass are checked.
- 1,484 static concentration snapshots include 101 values for each of 13 drugs,
  137 seeded mixtures, seven anchor examples, 21 opioid pool splits and six
  missing-link cases. Each is evaluated with exponential, hold and linear tails.
  H/N totals, individual credits, known subtotals and availability are checked.
- Published pair equations are independently evaluated on five 21-by-21 grids.
  Rocuronium raw and normalized TOFR are checked over 48 covariate/context
  combinations and 101 concentrations. These are algebra checks, not patient
  predictions or newly fitted PD models.
- Thirty-three simulated-dose scenarios cover push, finite delivery and infusion
  for each intravenous drug. Four forecast anchors are checked against independent
  replay. The fixtures include a future administration that must be ignored.
- Three worked cases include immutable observation snapshots, later correction
  of a preceding dose and a separate reconstructed trajectory. The exported XLSX
  files are reopened independently. Empty inline strings and empty cells are
  treated as the same blank. Every other cell retains its type and value.
- A separate 20-case guard check applies invalid values and valid zero to both
  volatile agents. Its 60 assertions confirm that nulls, booleans, strings,
  missing values and non-finite or negative values cannot become numerical MAC
  credits. These checks are reported separately in `Input_guard_checks.json`.

## Criteria and interpretation

PK and forecast numerical comparisons allow an absolute difference of
`1e-9 + 1e-10 × abs(reference)` in the native concentration units. H/N comparisons
allow `1e-12 + 1e-12 × abs(reference)` index units. Published probabilities and
TOFR allow `1e-12`. Parameter nulls, availability and other categories must match
exactly. Mass-conservation residuals must not exceed `1e-7` in the engine's amount
units. Missing numerical values are categorical checks, not zero numerical error.

The separate Python implementation imports no application functions or runtime
registry. Its coefficients are a separate transcription of the declared model.
This is computational separation, not independent expert review. Agreement
supports implementation of that specification in the tested scenarios. It does not validate
the source-to-score transfers, the composite effect-site links or clinical H/N
thresholds. Synthetic checks and dense output samples are not independent patients.

## Sensitivity

Seventeen structural variants are evaluated across the three worked cases: hold
and linear tails; ±20% direct H anchors, opioid equivalence, ketamine equivalence,
dexmedetomidine credits in each domain and the assumed midazolam ceiling;
separate saturation of each opioid; and half/double named effect-site rates.
These are hypothetical stress tests, not confidence intervals. The primary
opioid construction applies the reference curve after pooling exposures.

## Output files

`Verification_summary.json` and `Comparison_summary.csv` retain separate check
denominators. `Comparison_by_output.csv` separates native outputs.
`All_comparisons.csv.gz` retains every observed/reference pair and its criterion.
`application_*.jsonl` retains the application output without rounding. The input
JSON, research XLSX files, structural sensitivity CSV, publication figures and
their captions are generated. `Prefinal_freeze.json` and `Postrun_integrity.json`
identify the executed source. `execution.json` records portable representations of
the executed commands and their outcomes; host executable and directory paths are
normalized and the path symbols are identified in the file.

