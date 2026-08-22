import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'apps/**/*.test.ts', 'apps/**/*.test.tsx', 'workers/**/*.test.ts', 'workers/**/*.test.tsx'],
    exclude: [
      '**/e2e/**',
      '**/node_modules/**',
      '**/*.spec.ts',
      '**/*.spec.tsx',
      '**/dist/**',
    ],
  },
});
