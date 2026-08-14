import React from 'react';
import * as PopoverPrimitive from '@radix-ui/react-popover';

export function Popover({ open, onOpenChange, trigger, children }: { open: boolean; onOpenChange: (v: boolean) => void; trigger: React.ReactNode; children: React.ReactNode }) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="rounded border border-hairline bg-raised p-2 shadow-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
