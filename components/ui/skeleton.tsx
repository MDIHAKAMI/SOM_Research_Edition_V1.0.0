// SPDX-License-Identifier: MIT
// Includes shadcn/ui components: Copyright (c) 2023 shadcn. See THIRD_PARTY_NOTICES.txt.
import { cn } from '@/lib/utils';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
