import React from 'react';

type CommandProps = React.HTMLAttributes<HTMLDivElement> & {
  children: React.ReactNode;
};

export function Command({ children, className, ...props }: CommandProps) {
  return (
    <div
      className={`flex h-full w-full flex-col overflow-hidden rounded border border-hairline bg-raised ${className || ''}`}
      {...props}
    >
      {children}
    </div>
  );
}

type CommandInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  onValueChange?: (value: string) => void;
};

export function CommandInput({ onValueChange, ...props }: CommandInputProps) {
  return (
    <input
      className="flex h-9 w-full border-b border-hairline bg-transparent px-3 font-mono text-sm text-text-primary placeholder:text-text-dim focus-visible:outline-none"
      onChange={(e) => onValueChange?.(e.target.value)}
      {...props}
    />
  );
}

export function CommandList({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="max-h-72 overflow-y-auto p-1" {...props}>
      {children}
    </div>
  );
}

export function CommandItem({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className="flex cursor-pointer items-center rounded px-2 py-1.5 font-mono text-sm text-text-primary outline-none hover:bg-surface data-[selected=true]:bg-surface"
      {...props}
    >
      {children}
    </div>
  );
}
