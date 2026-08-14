import React from 'react';

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & {
  variant?: 'default' | 'signal' | 'amber' | 'violet' | 'red';
};

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  const variants: Record<string, string> = {
    default: 'bg-raised text-text-secondary border border-hairline',
    signal: 'bg-signal-cipher-dim text-signal-cipher border border-signal-cipher/30',
    amber: 'bg-signal-amber/10 text-signal-amber border border-signal-amber/30',
    violet: 'bg-signal-violet/10 text-signal-violet border border-signal-violet/30',
    red: 'bg-signal-red/10 text-signal-red border border-signal-red/30',
  };

  return (
    <span
      className={`inline-flex items-center font-mono text-xs px-1.5 py-0.5 ${variants[variant]} ${className || ''}`}
      {...props}
    />
  );
}
