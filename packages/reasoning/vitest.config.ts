import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'examples/**/*.example.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/._*', '**/._*/**'],
  },
});
