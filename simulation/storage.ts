// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import { validateCase, type CaseData } from './engine';
const DB = 'anesthesia-state-local-v1';
async function database() {
  return await new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore('cases', { keyPath: 'id' });
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
export async function saveCase(c: CaseData) {
  const db = await database();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('cases', 'readwrite');
      tx.objectStore('cases').put(c);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () =>
        reject(tx.error ?? Error('Storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}
export async function allCases(): Promise<CaseData[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const r = db.transaction('cases').objectStore('cases').getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } finally {
    db.close();
  }
}
export async function importCase(text: string) {
  const data = JSON.parse(text);
  const c = data.case ?? data;
  validateCase(c);
  return c as CaseData;
}
