// Copyright (c) 2026 Mohammed Hakami. SPDX-License-Identifier: MIT
'use client';
import type { ReactNode } from 'react';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
export function Choice({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string }[];
  label: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => v !== null && onChange(v)}>
      <SelectTrigger aria-label={label} className="choice">
        <SelectValue>
          {items.find((i) => i.value === value)?.label ?? value}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {items.map((i) => (
          <SelectItem key={i.value} value={i.value}>
            {i.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent
        showCloseButton={false}
        className={'modal ' + (wide ? 'wide' : '')}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <button type="button" onClick={onClose}>
          Close
        </button>
      </DialogContent>
    </Dialog>
  );
}
export const fmt = (v: number | null | undefined, n = 2) =>
  v == null ? '—' : v.toFixed(n);
export function Evidence({
  kind = 'not-modeled',
  children,
}: {
  kind?: string;
  children?: ReactNode;
}) {
  return (
    <span className={'evidence ' + kind}>
      <i />
      {children ??
        {
          published: 'Published model',
          approximation: 'Literature-derived approximation',
          experimental: 'Experimental extrapolation',
          'not-modeled': 'Not modeled',
        }[kind] ??
        kind}
    </span>
  );
}
export function Probability({
  label,
  value,
}: {
  label: string;
  value: number | null;
}) {
  return (
    <div className="probability">
      <div>
        <span>{label}</span>
        <b>{value === null ? 'Not modeled' : fmt(value * 100, 1) + '%'}</b>
      </div>
      <div className={'prob-track ' + (value === null ? 'missing' : '')}>
        <span style={{ width: (value ?? 0) * 100 + '%' }} />
      </div>
    </div>
  );
}
