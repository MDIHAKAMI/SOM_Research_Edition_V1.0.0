# Exploratory H and N indices

Release `som-4.3.0`; H/N registry `som-hn-3.0.0`.

H summarizes hypnosis/responsiveness-related exposure credits. N summarizes antinociception/stimulus-tolerance-related exposure credits. They are two constructed research scores, not probabilities or clinical adequacy targets. Published response-surface probabilities remain separate.

## Equations

`H = sum h_i(E_i,H)`.

`N = [S_F(O) + S_F(q_K Cp_K) + a_P Cp_P + S_D(Cp_D) + MAC_sevo + MAC_des] / 0.59`.

`S_F(x) = 0.8670718232044199 x / (1.4088397790055254 + x)`.

`O = Cp_F + 1.21897810219 Ce_R + Cp_A/58 + 11.5172413793 Cp_S + 0.0402298850575 Ce_M,thermal + 0.428814002090 Ce_Hy,thermal`.

The opioid coordinate is pooled before evaluating the reference curve. Its displayed per-drug shares are allocated in proportion to each weighted exposure; these are bookkeeping shares, not separately identified causal effects. Ketamine and other non-opioid terms remain present even when no reference opioid or hypnotic is administered.

The complete precision coefficients, knots, sources, derivations, exposure bases and assumptions are in `study/hn-coefficients.ts`. `study/multimodal.ts` evaluates that registry. `study/pd-registry.ts` exposes matching metadata for the interface and exports. There is no active logarithmic H/N transformation or cross-domain rho multiplier.

## Drug contribution rules

Propofol H uses Cp/1.85, sevoflurane H uses ET/0.9, and ketamine H uses its named hypnosis effect-site concentration/1640 (ng/mL). Desflurane H is a constructed transfer. Fentanyl, remifentanil, alfentanil, sufentanil and dexmedetomidine H use specified sparing points. Midazolam H uses a Hill curve fitted to published model-predicted sparing values with a fixed ceiling. In this version, morphine and hydromorphone H and midazolam N are deliberately omitted terms, not claims of biological absence. Rocuronium has structural zero H and N; neuromuscular blockade remains a separate output.

For sparse sparing data, interpolate linearly between declared knots. The default continuation above the last knot is value- and slope-continuous and approaches an assumed ceiling of one. Holding the final value and continuing the final slope are sensitivity alternatives. The ceiling and continuation are modeling choices, not measured concentration-response laws.

Sufentanil H uses the de Valence 2018 equilibrium observation at Ce 0.3 ng/mL. A credit of 0.32 is calculated from rounded propofol means of 2.5 and 1.7 micrograms/mL in elderly patients. It replaces the previously unresolved source basis. Its extension to other concentrations, populations and backgrounds remains explicit.

## Concentration bindings

Midazolam uses Zomorodi PK with the Bührer EEG equilibration half-time of 4.8 minutes. Ketamine H uses a named 23-second slow-wave EEG delay attached to the selected parent PK model. Morphine and hydromorphone N use named thermal-response delays of 42.6 and 45 minutes, respectively, attached to their parent PK models. Sufentanil H uses a separately labelled Gepts/Scott composite with ke0 0.11/min. These newly assembled links are declared composites; their numerical verification does not show identity with the original jointly estimated study models.

The named states are defined in `study/hn-effect-sites.ts` and exported separately from generic Ce. Cp, Ce, arterial blood, serum and end-tidal measurements are not interchangeable. In particular, propofol N transfers an arterial-blood trade-off to the application's source-model concentration convention; this is recorded as a proxy assumption.

Unknown or invalid required inputs do not become zero. A missing active-drug input makes the affected total unavailable and preserves the known subtotal and exclusions. An incomplete opioid coordinate invalidates the pooled opioid contribution. Deliberate omissions are identified separately. 

## Research and reproducibility

Current event snapshots include the H/N version, individual contributions, concentration basis, coefficients, sources, curve continuation and named endpoint states. Corrections preserve original observations; a reconstructed series is exported separately. Historical snapshots retain their recorded equations, values and version. Fitted model features retain the original ten-drug order so previously saved coefficients are not silently reinterpreted.

