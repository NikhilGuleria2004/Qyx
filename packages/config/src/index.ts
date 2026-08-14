export const tailwindConfig = {
  darkMode: ['class'],
  content: [],
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
    },
  },
  plugins: [],
};

export const viteAliases = {
  '@qyx/schemas': 'packages/schemas/src/index.ts',
  '@qyx/crypto': 'packages/crypto/src/index.ts',
  '@qyx/ui': 'packages/ui/src/index.ts',
  '@qyx/config': 'packages/config/src/index.ts',
};
