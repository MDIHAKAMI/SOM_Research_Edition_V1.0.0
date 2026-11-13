// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
// Copyright (c) 2026 Mohammed Hakami. See LICENSE.
import { useRef, useState } from 'react';
import { exportLocalResearchBackup, importLocalResearchBackup } from '@/study/local-research';

interface Props {
  busy: boolean;
  onAction: (action: () => Promise<void>) => void;
  onImported: () => Promise<void>;
}

/** Downloaded backups are a separate copy of the browser's local research records. */
export function LocalBackup({ busy, onAction, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  return <section className="som-local-backup" aria-label="Research backups">
    <h2>Research backups</h2>
    <p>Save a JSON backup to keep raw records and original snapshots. Import a backup to restore cases on this or another device. Existing cases are not overwritten.</p>
    <div className="as-row">
      <button type="button" disabled={busy} onClick={() => onAction(async () => {
        setMessage('');
        const backup = await exportLocalResearchBackup();
        const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `SOM_research_backup_${new Date().toISOString().slice(0, 10)}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setMessage('Backup download started. Keep the file in your approved research storage.');
      })}>Download research backup</button>
      <button type="button" disabled={busy} onClick={() => input.current?.click()}>Import research backup</button>
      <input ref={input} type="file" accept=".json,application/json" aria-label="Research backup file" className="som-file-input" onChange={(event) => {
        const file = event.target.files?.[0];
        event.target.value = '';
        if (!file) return;
        onAction(async () => {
          setMessage('');
          if (file.size > 100 * 1024 * 1024) throw Error('This backup is larger than 100 MB. Import a smaller study backup.');
          let data: unknown;
          try { data = JSON.parse(await file.text()); }
          catch { throw Error('The backup is not a valid JSON file.'); }
          const result = await importLocalResearchBackup(data);
          await onImported();
          setMessage(`Imported ${result.imported} case(s). Open Saved cases to select a study and resume or export its records.`);
        });
      }} />
    </div>
    {message && <p role="status">{message}</p>}
  </section>;
}
