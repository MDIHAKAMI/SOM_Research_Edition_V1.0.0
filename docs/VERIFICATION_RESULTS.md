# Verification results — SOM Research Edition 1.0.0

The released source passed all **484,781** declared calculation and export comparisons. The total includes **306,839 numerical** comparisons and **177,942 categorical** comparisons. A separate malformed-input suite passed **60/60 assertions** across 20 cases. These are software checks, not patient counts.

## Scenarios and comparison method

Nine synthetic 120-minute histories cover 11 intravenous drugs, two held volatile inputs, three covariate profiles and the selected alternative propofol and ketamine models. Another 1,484 static states cover concentration sweeps, seeded mixtures, anchors, opioid splits and missing links. There are also 33 simulated-dose forecasts and three worked recording/export cases. No patient records were used.

The application propagates the model at one-second steps. A separate Python implementation uses event-to-event matrix exponentials from SciPy and a separate transcription of the declared coefficients. It imports no application functions. This is computational separation, not independent expert review. Shared source assumptions can still be wrong even when both implementations agree.

## Declared calculation and export comparisons

| Comparison group | Numerical | Categorical | Failed |
| --- | ---: | ---: | ---: |
| Dose forecast | 6,072 | 2,112 | 0 |
| Forecast isolation | 0 | 33 | 0 |
| H/N availability | 0 | 8,904 | 0 |
| H/N contributions | 115,722 | 30 | 0 |
| H/N known subtotal | 8,904 | 0 | 0 |
| H/N monotonicity | 0 | 7,800 | 0 |
| H/N totals | 8,883 | 21 | 0 |
| Mass conservation | 23,958 | 0 | 0 |
| Opioid split invariance | 63 | 0 | 0 |
| PK parameters | 639 | 54 | 0 |
| PK trajectory | 50,094 | 17,424 | 0 |
| Published PD | 2,205 | 0 | 0 |
| Record correction | 0 | 15 | 0 |
| Research H/N snapshot | 6 | 0 | 0 |
| Research concentrations | 138 | 48 | 0 |
| Research snapshot serialization | 0 | 6 | 0 |
| Rocuronium PD | 9,696 | 0 | 0 |
| State corrections | 2,178 | 0 | 0 |
| Worked-case H/N | 1,086 | 0 | 0 |
| XLSX roundtrip | 77,195 | 141,495 | 0 |

The workbook group compares sheet names and typed cells after reopening three application-generated XLSX files with openpyxl. Original observation snapshots and corrected reconstructions are checked separately. The six research snapshot serialization checks cover both the reconstructed JSON identity and the Excel text-cell size limit.

## Tolerances and selected differences

- PK and forecasts: absolute error no greater than `1e-9 + 1e-10 × abs(reference)` in each output’s native unit.
- H/N: `1e-12 + 1e-12 × abs(reference)` index units.
- Published probabilities and TOFR: `1e-12` absolute.
- Mass conservation: `1e-7` in the native engine amount unit.
- Missing values and categories: exact agreement. Empty spreadsheet text and blank cells are treated as the same blank; other typed values are preserved.

The maximum H/N total difference was 5.3291 × 10⁻¹⁵ index units. The maximum published probability difference was 2.2204 × 10⁻¹⁶. Propofol Cp and Ce differences were at most 1.3056 × 10⁻¹³ and 1.3589 × 10⁻¹³ µg/mL. Remifentanil Cp and Ce differences were at most 4.8295 × 10⁻¹⁴ and 6.0174 × 10⁻¹⁴ ng/mL. The ketamine named hypnosis effect-site difference was at most 7.1694 × 10⁻¹¹ ng/mL. Outputs with different units should not be combined into one clinical accuracy estimate.

## Additional guards and sensitivity analysis

For each volatile agent, the guard suite rejects nulls, booleans, strings, missing values, NaN, infinity and negative values before MAC division. It also confirms that valid numerical zero remains zero. This prevents JavaScript coercion from turning an unavailable input into a numerical N credit. These 60 assertions are reported separately and are not added to the 484,781-comparison total.

The sensitivity analysis evaluates 17 hypothetical changes across the three worked cases, producing 9,231 time-variant rows. These include alternate tails, changed anchors or equivalence weights, alternate opioid pooling and changed effect-site rates. They are structural stress tests, not confidence intervals or evidence of clinical equivalence.

## Source identity and reproducibility

All 81 frozen input, source and compiled-file identities remained unchanged during the run. The package version is 1.0.0; retained calculation identifiers are `som-4.3.0`, `som-pk-2.2.0`, `som-ce-2.2.0`, `som-hn-3.0.0` and `som-published-pd-1.0.0`. The recorded environment used v24.22.1 for Node, Python 3.12.14, NumPy 2.3.5 and SciPy 1.17.0.

```sh
npm ci
python3 -m pip install -r verification/requirements.txt
python3 verification/reproduce.py --output /absolute/path/to/new-results
```

The output directory must be new. The driver records source identities, portable representations of executed commands, comparison outcomes and a post-run integrity check. Full-precision inputs, raw application outputs, every comparison, research workbooks, figures and summaries can be regenerated using the commands above. `SoftwareX_Full_Verification_Evidence.zip` is a separate evidence archive, not included in this source package; its identity is recorded in `results/Full_evidence_archive.json`. Condensed results are included in `results/`.

## Interpretation

These results support implementation of the declared equations in the tested scenarios. They do not establish accurate patient concentrations, clinical H/N thresholds, prediction of responsiveness or awareness, safe dosing, educational benefit, or added value beyond existing models. The held volatile inputs do not model uptake, washout or brain equilibration. The source-to-score transfers and composite effect-site links remain assumptions.

This calculation harness does not exercise browser interaction, local-storage persistence or concurrent tabs. Automated application tests (`npm test`) and observed browser workflows provide separate evidence for those functions. Historical server/API/database tests do not establish the behaviour of the local research controller. Earlier verification archives also contain acknowledged diagnostic exceptions and should not be described as universally passing.
