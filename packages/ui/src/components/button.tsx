import React from 'react';

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'ghost' | 'signal';
};

export function Button({ variant = 'default', className, ...props }: ButtonProps) {
  const base = 'inline-flex items-center justify-center font-mono text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal-cipher focus-visible:ring-offset-2 focus-visible:ring-offset-void disabled:opacity-50 disabled:pointer-events-none';
  
  const variants: Record<string, string> = {
    default: 'bg-raised text-text-primary border border-hairline hover:bg-focus active:bg-surface',
    ghost: 'bg-transparent text-text-secondary hover:text-text-primary hover:bg-raised border border-transparent',
    signal: 'bg-signal-cipher text-void font-medium hover:bg-signal-cipher/90 active:bg-signal-cipher/80',
  };

  return (
    <button
      className={`${base} ${variants[variant]} rounded px-3 py-1.5 ${className || ''}`}
      {...props}
    />
  );
}
