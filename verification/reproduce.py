# Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
"""Repeat the released calculation verification using deterministic synthetic cases.

Run after npm ci and installation of verification/requirements.txt.
No clinical data, remote service, or account is used. Use a new output directory.
"""
from pathlib import Path
import argparse
import datetime
import hashlib
import json
import subprocess
import sys

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--output', required=True)
p.add_argument('--node', default='node')
args = p.parse_args()
root = Path(__file__).resolve().parent.parent
out = Path(args.output).resolve()
if out.exists():
    raise SystemExit('Use a new output directory; existing results will not be overwritten.')
out.mkdir(parents=True)
steps = []

def portable_command(cmd):
    """Record a portable command description without host-specific paths."""
    result = []
    for i, value in enumerate(cmd):
        value = str(value)
        if i == 0:
            value = 'python3' if value == sys.executable else Path(value).name
        elif value == str(root):
            value = '<SOURCE>'
        elif value == str(out):
            value = '<OUTPUT>'
        else:
            value = value.replace(str(root) + '/', '').replace(str(out) + '/', '<OUTPUT>/')
        result.append(value)
    return result

def run(label, cmd):
    print('RUN', label, flush=True)
    result = subprocess.run(cmd, cwd=root, check=False)
    steps.append({'step': label, 'command': portable_command(cmd), 'exit_code': result.returncode})
    (out / 'execution.json').write_text(json.dumps({
        'updated_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'command_format': 'Portable representations of executed commands; host executable and directory paths are normalized.',
        'path_symbols': {'<SOURCE>': 'Application source directory', '<OUTPUT>': 'New verification result directory'},
        'steps': steps,
        'clinical_observations_used': False,
    }, indent=2))
    if result.returncode:
        raise SystemExit(f'{label} failed with exit code {result.returncode}.')

run('Compile the calculation and export modules', [args.node, 'node_modules/typescript/bin/tsc', '-p', 'verification/tsconfig.json'])
(root / 'work/verification-build/package.json').write_text('{"type":"commonjs"}')
run('Prepare deterministic synthetic inputs', [sys.executable, 'verification/prepare_inputs.py', str(out)])

def identities():
    files = [out / 'inputs.json', root / 'package.json', root / 'package-lock.json']
    for folder, pattern in [
        ('verification', '*.py'), ('verification', '*.cjs'), ('verification', '*.json'),
        ('study', '*.ts'), ('pharmacology', '*.ts'), ('simulation', '*.ts'),
        ('work/verification-build/study', '*.js'), ('work/verification-build/pharmacology', '*.js'),
        ('work/verification-build/simulation', '*.js'),
    ]:
        files.extend((root / folder).rglob(pattern))
    return {
        str(f.relative_to(root)) if f.is_relative_to(root) else str(f): hashlib.sha256(f.read_bytes()).hexdigest()
        for f in sorted(set(files)) if f.is_file()
    }

before = identities()
(out / 'Prefinal_freeze.json').write_text(json.dumps({
    'time_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'package_version': json.loads((root / 'package.json').read_text())['version'],
    'files': before,
}, indent=2))
run('Execute released application calculations', [args.node, 'verification/run_application.cjs', str(root), str(out)])
run('Check invalid volatile inputs', [args.node, 'verification/check_input_guards.cjs', str(root), str(out)])
run('Compare with separately implemented reference', [sys.executable, 'verification/analyze.py', str(out)])
run('Calculate structural sensitivity and figures', [sys.executable, 'verification/sensitivity_figures.py', str(out)])
after = identities()
changed = [name for name in sorted(set(before) | set(after)) if before.get(name) != after.get(name)]
(out / 'Postrun_integrity.json').write_text(json.dumps({
    'changed_files': changed, 'unchanged': not changed, 'checked_files': len(before),
}, indent=2))
if changed:
    raise SystemExit('Source changed during the run: ' + str(changed))
summary = json.loads((out / 'Verification_summary.json').read_text())
if summary['failed']:
    raise SystemExit(f"{summary['failed']} comparisons failed; inspect Failures.csv.")
print('All declared numerical/export checks passed. Results:', out)
