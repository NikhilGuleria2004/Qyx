import React from 'react';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';

export function Dropdown({ trigger, children }: { trigger: React.ReactNode; children: React.ReactNode }) {
  return (
    <DropdownPrimitive.Root>
      <DropdownPrimitive.Trigger asChild>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content className="rounded border border-hairline bg-raised p-1 shadow-none">
          {children}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function DropdownItem({ children, ...props }: React.ComponentPropsWithoutRef<typeof DropdownPrimitive.Item>) {
  return (
    <DropdownPrimitive.Item
      className="flex cursor-pointer items-center rounded px-2 py-1.5 font-mono text-sm text-text-primary outline-none hover:bg-surface focus:bg-surface data-[disabled]:opacity-50"
      {...props}
    >
      {children}
    </DropdownPrimitive.Item>
  );
}
