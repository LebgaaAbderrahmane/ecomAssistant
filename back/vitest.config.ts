import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@ecom/shared': path.resolve(__dirname, '../shared'),
    },
  },
  test: {
    include: [
      'src/modules/ai/__tests__/**/*.test.ts',
      'src/modules/orders/__tests__/**/*.test.ts',
    ],
    globals: false,
  },
});
