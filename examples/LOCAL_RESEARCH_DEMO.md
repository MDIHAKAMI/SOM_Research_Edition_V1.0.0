# Local research example

This is an entirely invented workflow demonstration. It contains no patient data. The drug entries, responsiveness scores and BIS value do not establish clinical accuracy, acceptable dosing or a causal relationship between a calculated score and responsiveness.

- `local-research-demo.json`: a complete backup that can be imported into SOM Research Edition.
- `local-research-demo.xlsx`: the matching workbook produced by the application's own exporter, with all 20 export sheets.
- `generate-local-research-demo.cjs`: the reproducible input sequence and executable checks.

The example uses study `DEMO-SOM-01`, participant `SIM-001`, site and recorder `DEMO`, and `synthetic: true`. The invented participant is a 40-year-old male, 70 kg and 175 cm. The default model choices are retained. Package version is 1.0.0; scientific engine provenance remains `som-4.3.0`; H/N version is `som-hn-3.0.0`. These are separate version identifiers.

## Open the example

Start the application as described in the main README. In Research mode, use the JSON backup import control to select `local-research-demo.json`. Select the study and its completed case. Review its timeline and use **Export Excel** to generate the workbook again. The case is already ended, so it cannot accept new entries. Importing the identical backup again skips the existing case; conflicting case content is rejected.

## Recorded sequence

Times are seconds after the fixed case start, `2026-11-12T10:00:00.000Z`. The case ends at 600 seconds. The generator controls the device clock so that the same history can be rebuilt.

| Occurrence | Recorded | Entry |
|---:|---:|---|
| 0 | 0 | Induction phase |
| 0 | 5 | Propofol 100 mg push, the deliberately incorrect entry |
| 20 | 25 | Remifentanil infusion 0.1 microgram/kg/min |
| 60 | 65 | Invented loss of verbal responsiveness, MOAA/S 1; first saved snapshot |
| 90 | 95 | Invented BIS 42, zero nitrous oxide, no spinal bupivacaine |
| 120 | 120 | Maintenance phase |
| 120 | 130 | Ketamine 20 mg push |
| 180 | 185 | Invented skin-incision observation; second saved snapshot |
| 240 | 240 | Void the incorrect propofol entry, with a correction reason |
| 0 | 245 | Corrected propofol 120 mg push, backdated to the original occurrence |
| 300 | 305 | Invented major-stimulus observation; a snapshot using the corrected history |
| 420 | 420 | Emergence phase |
| 420 | 425 | Remifentanil infusion set to zero |
| 540 | 545 | Invented command-following observation, MOAA/S 5 |
| 600 | 600 | End the case |

## Expected result

The snapshot for `OBS-LOSS` at 60 seconds remains exactly as originally saved. It used the first 100 mg propofol entry. The final reconstruction uses the corrected 120 mg entry. Both records remain visible, and the audit history retains the original entry, void reason and later replacement.

| Quantity at 60 seconds | Original snapshot | Final reconstruction |
|---|---:|---:|
| Propofol Cp, microgram/mL | 9.072236033958 | 10.886683240749 |
| Propofol Ce, microgram/mL | 5.327304908468 | 6.392765890161 |
| H, exploratory score | 4.921385926057 | 5.902168199999 |

Compare **Event concentrations** with **Concentration series**, and **HN event states** with **HN reconstructed series**. The original snapshot and its input IDs are also retained in **Audit**. Concentrations are model predictions. H is an exploratory constructed score, not a validated clinical measurement. All timestamps are local-device timestamps and are not independently verified.

## Regenerate and check

From the project root, run:

```sh
npm test
node examples/generate-local-research-demo.cjs
```

The generator uses the compiled application modules produced by the test command. It checks the immutable snapshot, the expected 1.2-fold change in reconstructed propofol Cp and Ce, exact JSON import preservation, duplicate-safe import, and matching original/reconstructed Excel cells. It then replaces the two example files. The fixed export timestamp makes the artifacts repeatable. The checks verify software behavior only; they are not clinical validation.
