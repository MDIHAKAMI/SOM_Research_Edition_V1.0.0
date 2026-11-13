// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { createContext, useContext, type ReactNode } from 'react';
export const SheetError = createContext<{ error: string; retry?: () => void }>({
  error: '',
});
export function Sheet({
  open,
  title,
  description = '',
  close,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  close: () => void;
  children: ReactNode;
}) {
  const state = useContext(SheetError);
  return (
    <Dialog open={open} onOpenChange={(v) => !v && close()}>
      <DialogContent showCloseButton={false} className="as-work as-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {state.error && (
          <div className="as-error" role="alert">
            {state.error}
            {state.retry && <button onClick={state.retry}>Retry saving</button>}
          </div>
        )}
        {children}
        <button type="button" onClick={close}>
          Close
        </button>
      </DialogContent>
    </Dialog>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 'any',
  required = false,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string;
  required?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        required={required}
      />
    </label>
  );
}
