# Pharmacology and model outputs

This document describes the active SOM Research Edition scientific release `som-4.3.0`, PK version `som-pk-2.2.0`, Ce version `som-ce-2.2.0`, and H/N registry `som-hn-3.0.0`. The active inventory is defined in `study/pharmacology.ts`. The older three-drug helper in `pharmacology/pk/models.ts` is not the complete application inventory.

The release contains 13 agents and 15 model variants, counting the alternative propofol and ketamine models. These are deterministic population-model calculations. They are not measured concentrations, individual dose recommendations, or validation of the complete application.

## Current inventory

| Agent | Implemented source model or exposure | Available outputs and important qualifications |
|---|---|---|
| Propofol | [Schnider 1998/1999](https://pubmed.ncbi.nlm.nih.gov/9605675/); selectable adult Diprifusor parameterization labelled **Marsh · PK comparison** | Cp and Ce. Schnider uses the declared fixed EEG-linked ke0; the adult Diprifusor comparison uses its declared separate linkage. Population and body-size limitations remain. Switching models can make source-specific pair references unavailable. |
| Remifentanil | [Minto 1997](https://pubmed.ncbi.nlm.nih.gov/9009935/) | Cp and age-dependent Ce. Age and lean-body-mass terms follow the selected model. These concentrations do not define a generic opioid-equivalence conversion. |
| Fentanyl | [Shafer](https://pubmed.ncbi.nlm.nih.gov/2248388/), original STANPUMP microparameter convention | Cp. Generic Ce is unavailable because a compatible fixed linkage is unresolved. The sevoflurane–fentanyl reference uses Cp, with its own endpoint and equilibrium limitations. |
| Alfentanil | [Maitre](https://pubmed.ncbi.nlm.nih.gov/3099604/), original STANPUMP microparameter convention | Cp with the implemented age, sex and weight covariates. Generic Ce is unavailable. |
| Sufentanil | [Gepts 1995](https://pubmed.ncbi.nlm.nih.gov/8533912/) plus a separately named hypnosis effect-site link | Cp and a hypnosis-linked research Ce. Generic Ce remains unavailable. The named Gepts/Scott combination is an exploratory composite, not proof of identity with a jointly estimated PK/PD model. |
| Dexmedetomidine | [Hannivoort PK](https://doi.org/10.1097/ALN.0000000000000740), with [Colin](https://doi.org/10.1093/bja/aex085) links | Cp, BIS-linked Ce using ke0 = 0.12/min, and separate MOAA/S-linked Ce using 0.0428/min. These are endpoint-specific links, not universal cardiovascular or analgesic effect sites. |
| Ketamine | [Domino or Clements 250](https://pmc.ncbi.nlm.nih.gov/articles/PMC3838936/) plus a named hypnosis effect-site link | Racemic parent Cp and a hypnosis-linked research Ce with the declared 23-second equilibration half-time. Generic Ce, active metabolites and enantiomer-specific effects are not modeled. |
| Morphine | [Pierre 2017 parent submodel](https://pmc.ncbi.nlm.nih.gov/articles/PMC5445229/) plus a named thermal-response effect site | Parent serum concentration and thermal-response research Ce with the declared 42.6-minute equilibration half-time. Enter morphine base equivalent. Generic Ce, metabolite effects and renal metabolite accumulation are not modeled. |
| Midazolam | [Zomorodi 1998](https://pubmed.ncbi.nlm.nih.gov/9856717/) plus [Bührer EEG linkage](https://pubmed.ncbi.nlm.nih.gov/2225714/) | Cp and EEG-linked Ce with the declared 4.8-minute equilibration half-time. The separately sourced combination is explicit; active metabolites and additional disease corrections are not included. |
| Hydromorphone | [Jeleazcov 2014](https://pubmed.ncbi.nlm.nih.gov/23958818/) plus a named thermal-response effect site | Cp and thermal-response research Ce with the declared 45-minute equilibration half-time. Generic Ce, metabolites, dialysis and organ-dysfunction models are not included. |
| Sevoflurane | Entered measured end-tidal values; [Mapleson age adjustment](https://doi.org/10.1093/bja/76.2.179) | Held ET percentage and age-adjusted MAC fraction, using MAC40 = 1.8%. No uptake, washout or brain effect-site model. |
| Desflurane | Entered measured end-tidal values; [Mapleson age adjustment](https://doi.org/10.1093/bja/76.2.179) | Held ET percentage and age-adjusted MAC fraction, using MAC40 = 6.6%. Its exposure remains distinct from sevoflurane. No uptake, washout or brain effect-site model. |
| Rocuronium | Rocuronium-alone component of [Kleijn 2011](https://doi.org/10.1111/j.1365-2125.2011.04000.x) | Cp and Ce in µmol/L, and raw/normalized train-of-four ratio within the implemented scope. Clinical input is bromide mg. Reversal and other blockers limit availability. Rocuronium contributes structural zero to H and N. |

The exact parameters, source conventions, units and model identifiers are in `study/pharmacology.ts` and its imported modules. Named H/N effect sites and their linkage sources are in `study/hn-effect-sites.ts`. Combining a PK model with a delay from another source is a declared model assumption. Numerical agreement verifies its implementation, not clinical validity of that combination.

## Calculation and time conventions

IV models use central and peripheral amounts, with Cp obtained from the central amount and volume. For a three-compartment model with time in minutes:

```
dA1/dt = R − (CL+Q2+Q3)A1/V1 + Q2 A2/V2 + Q3 A3/V3
dA2/dt = Q2 A1/V1 − Q2 A2/V2
dA3/dt = Q3 A1/V1 − Q3 A3/V3
```

The appropriate reduced structure is used for two-compartment models. An enabled effect site follows `dCe/dt = ke0 × (Cp − Ce)` and is massless. The common linear solver uses matrix-exponential transitions; constant input is represented in the augmented system. The case engine advances at one-second steps. Boluses enter at their recorded second. An infusion rate is held until replaced, including replacement by zero. Finite-duration delivery adds to an existing continuous infusion and stops at its specified end.

All concentration states begin at zero. A prior-medication note does not add an initial amount. To represent earlier exposure, enter its known administration history within the case window. The concentration window is 24 hours. Scientific model choices and patient setup are fixed for a recorded research case.

Input units are printed in the interface. `study/live.ts` converts entered push, finite-delivery and weight-normalized infusion values to the engine's amount/time convention. Propofol Cp/Ce use µg/mL; other IV drugs use ng/mL except rocuronium, which uses µmol/L. Morphine's parent output is from a serum model. Volatile values are ET percentages, not plasma concentrations. Cp, Ce, serum, whole blood and ET must not be substituted silently.

Age-adjusted volatile MAC uses `MACage = MAC40 × 10^(−0.00269 × (age − 40))`. The last entered ET is held until updated. Stopping a vaporizer or recording an event does not predict washout or change an ET measurement automatically.

## H and N

H and N are active, separately versioned constructed scores. H summarizes declared hypnosis/responsiveness-related exposure credits. N summarizes declared antinociception/stimulus-tolerance-related exposure credits. They are not response probabilities, BIS equivalents or calibrated clinical adequacy thresholds.

The complete formulas, coefficients, curve continuation rules, concentration bindings, intentional omissions and source links are in `study/hn-coefficients.ts` and [HN_MODEL_NOTES.md](HN_MODEL_NOTES.md). `study/multimodal.ts` evaluates them; `study/pd-registry.ts` supplies matching provenance. The opioid coordinate is pooled before its reference response curve. Midazolam N and morphine/hydromorphone H are deliberate omissions in this version, not evidence that these biological effects are absent.

Unknown required input must not become zero. Where an active component lacks a required input, the affected total is unavailable and its known subtotal and exclusions are retained. Missingness, source-to-score transfers and alternative curve continuation can materially affect interpretation.

## Other pharmacodynamic outputs

These modules are separate from H/N:

- `study/pair-registry.ts` includes executable propofol–remifentanil unresponsiveness and laryngoscopy references, sevoflurane–remifentanil unresponsiveness, and sevoflurane–fentanyl movement and hemodynamic incision references. Each has its own endpoint, inputs, sources and qualifications. Algebraic availability is distinct from eligibility for a case. Unsupported listed pairs are not executable.
- The displayed propofol–sevoflurane–remifentanil extension is identified as a structural hypothesis. It does not establish arbitrary multidrug validity.
- `study/respiratory.ts` implements a separate exploratory propofol–remifentanil respiratory-compromise surface. Its source endpoint includes severe respiratory-rate reduction and/or obstruction; it is not a general apnea probability. Mapping current PK/ke0 choices to that surface is explicitly qualified.
- `study/organ-comparison.ts` provides a separate label-based dexmedetomidine hepatic clearance comparison. That Cp-only scenario does not replace baseline H/N or pair-model inputs and is not a validated general organ-dysfunction correction.
- `study/rocuronium.ts` calculates the implemented spontaneous-recovery TOF ratio under its stated context. This is not a probability of paralysis or a measure of consciousness. Reversal and other blockers are not simulated as complete combined pharmacology.

There is no calibrated all-agent probability for emergence or extubation readiness. Research recording of an event does not establish a predictive model for that event. Source citations describe the underlying evidence; they do not validate every application population, transient phase or drug mixture.

## Records and verification

Research clinical events preserve their original exposure and model snapshots. Later corrections change the reconstructed trajectory without replacing those original snapshots. Excel exports distinguish the two. The authoritative local research workflow is `study/local-research.ts`; the active UI is `ui/CaseWorkspace.tsx`. Older low-level component tests must not be read as a description of this complete workflow.

See [VALIDATION.md](VALIDATION.md) and `verification/README.md` for computational checks. None supplies clinical outcome validation, patient-specific uncertainty intervals, automatic measured concentrations or approval for dose selection. Independently observed endpoints, measured-concentration checks where feasible, prespecified analysis and external evaluation are separate research needs.
