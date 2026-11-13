// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
/* Guard checks are separate from the numerical reference comparisons. */
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(process.argv[2]), out = path.resolve(process.argv[3]);
const p = require(path.join(root, 'work/verification-build/study/pharmacology.js'));
const { multimodal } = require(path.join(root, 'work/verification-build/study/multimodal.js'));
const checks = [];
function check(id, observed, expected) {
  try { assert.equal(observed, expected); checks.push({ id, passed: true }); }
  catch (error) { checks.push({ id, passed: false, error: error.message }); }
}
const invalid = [
  ['null', null], ['false', false], ['true', true], ['numeric-string', '1'],
  ['empty-string', ''], ['undefined', undefined], ['NaN', NaN],
  ['infinity', Infinity], ['negative', -1],
];
function blank() {
  return { t: 0, cp: p.zeroExposure(), ce: p.zeroExposure(), endpointCe: {
    ketamineHypnosis: 0, sufentanilHypnosis: 0, morphineThermal: 0,
    hydromorphoneThermal: 0, dexmedetomidineMoaas: 0,
  } };
}
for (const drug of ['sevoflurane', 'desflurane']) {
  for (const [label, value] of invalid) {
    const trace = blank(); trace.cp[drug] = value;
    const result = multimodal(trace, p.defaultChoice, 40);
    const term = result.contributions.find(c => c.drug === drug && c.domain === 'N');
    check(`${drug}/${label}/exposure`, term.exposure, null);
    check(`${drug}/${label}/contribution`, term.value, null);
    check(`${drug}/${label}/N-total`, result.N.value, null);
  }
  const trace = blank(); trace.cp[drug] = 0;
  const result = multimodal(trace, p.defaultChoice, 40);
  const term = result.contributions.find(c => c.drug === drug && c.domain === 'N');
  check(`${drug}/valid-zero/exposure`, term.exposure, 0);
  check(`${drug}/valid-zero/contribution`, term.value, 0);
  check(`${drug}/valid-zero/N-total`, result.N.value, 0);
}
const result = { scope: 'Volatile MAC input validity; no clinical data',
  cases: 20, checks: checks.length, passed: checks.filter(x => x.passed).length,
  failed: checks.filter(x => !x.passed).length, results: checks };
fs.writeFileSync(path.join(out, 'Input_guard_checks.json'), JSON.stringify(result, null, 2));
console.log(`Volatile input guards: ${result.passed}/${result.checks} checks passed.`);
if (result.failed) process.exitCode = 1;
