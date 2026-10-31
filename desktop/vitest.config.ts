import { defineConfig } from 'vitest/config';

// Pure logic only: nothing here needs a DOM. Component rendering is covered by the manual passes.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
