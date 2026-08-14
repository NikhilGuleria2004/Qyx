import { describe, it, expect } from 'vitest';
import { tailwindConfig, viteAliases } from './index.ts';

describe('config', () => {
  it('exports tailwind config', () => {
    expect(tailwindConfig.theme.extend.colors.void).toBe('var(--bg-void)');
  });

  it('exports vite aliases', () => {
    expect(viteAliases['@qyx/schemas']).toBe('packages/schemas/src/index.ts');
  });
});
