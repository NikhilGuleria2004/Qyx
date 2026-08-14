import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@qyx/schemas': path.resolve(__dirname, '../../packages/schemas/src/index.ts'),
      '@qyx/crypto': path.resolve(__dirname, '../../packages/crypto/src/index.ts'),
      '@qyx/ui': path.resolve(__dirname, '../../packages/ui/src/index.ts'),
      '@qyx/config': path.resolve(__dirname, '../../packages/config/src/index.ts'),
    },
  },
});
