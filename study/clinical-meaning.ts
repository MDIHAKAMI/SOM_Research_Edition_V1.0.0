// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
import type { Agent } from './pharmacology';
/** Contextual ranges from supplied Miller Table24.8: not EC50s or dosing targets. */
export function analgesiaContext(drug: Agent): string | null {
  if (drug === 'fentanyl') return 'Approximate plasma context: analgesia 1–2 ng/mL; minor surgery 3–6 and major surgery 4–10 ng/mL in the cited textbook table. These ranges overlap and depend on the background anesthetic and stimulus.';
  if (drug === 'alfentanil') return 'Approximate plasma context: analgesia 50–150 ng/mL; minor surgery 50–200 and major surgery 200–400 ng/mL. These are contextual ranges, not probabilities of pain relief.';
  if (drug === 'sufentanil') return 'Approximate plasma context: analgesia 0.2–0.4 ng/mL; minor surgery 0.25–1 and major surgery 1–3 ng/mL. The ranges depend on the anesthetic technique and stimulus.';
  if (drug === 'remifentanil') return 'The cited textbook reports approximate whole-blood ranges: analgesia 0.2–0.4 ng/mL, minor surgery 1–3 and major surgery 2–4 ng/mL. This is a different exposure basis from Ce; no automatic analgesia classification is made from the displayed Ce.';
  if (drug === 'morphine') return 'The current parent-only model does not include M6G. No new analgesia or respiratory probability is assigned from parent concentration.';
  return null;
}
export const ANALGESIA_CONTEXT_SOURCE = 'Bailey, Egan & Stanley, Intravenous opioid anesthetics, Miller’s Anesthesia, 8th ed. (2015), p895; approximate ranges reproduced in supplied Table24.8.';
