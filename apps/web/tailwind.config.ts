import type { Config } from 'tailwindcss';

const config: Config = {
  content: {
    relative: true,
    files: [
      './src/**/*.{js,ts,jsx,tsx,mdx}',
      '../../packages/ui/src/**/*.{js,ts,jsx,tsx,mdx}',
    ],
  },
  theme: {
    extend: {
      colors: {
        void: 'var(--bg-void)',
        surface: 'var(--bg-surface)',
        raised: 'var(--bg-raised)',
        'hairline': 'var(--border-hairline)',
        'focus': 'var(--border-focus)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-dim': 'var(--text-dim)',
        'signal-cipher': 'var(--signal-cipher)',
        'signal-amber': 'var(--signal-amber)',
        'signal-violet': 'var(--signal-violet)',
        'signal-red': 'var(--signal-red)',
        'signal-cipher-dim': 'var(--signal-cipher-dim)',
      },
      fontFamily: {
        mono: ['var(--font-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '3px',
      },
      boxShadow: {
        none: 'none',
      },
    },
  },
  plugins: [],
};

export default config;
