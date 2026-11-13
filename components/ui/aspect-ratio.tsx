// SPDX-License-Identifier: MIT
// Includes shadcn/ui components: Copyright (c) 2023 shadcn. See THIRD_PARTY_NOTICES.txt.
import { cn } from '@/lib/utils';

function AspectRatio({
  ratio,
  className,
  ...props
}: React.ComponentProps<'div'> & { ratio: number }) {
  return (
    <div
      data-slot="aspect-ratio"
      style={
        {
          '--ratio': ratio,
        } as React.CSSProperties
      }
      className={cn('relative aspect-(--ratio)', className)}
      {...props}
    />
  );
}

export { AspectRatio };
