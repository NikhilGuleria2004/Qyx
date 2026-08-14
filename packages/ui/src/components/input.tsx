import React from 'react';

type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={`flex h-8 w-full rounded border border-hairline bg-surface px-2 py-1 font-mono text-sm text-text-primary placeholder:text-text-dim focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cipher focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-50 ${className || ''}`}
      {...props}
    />
  );
}
