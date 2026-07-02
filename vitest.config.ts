import { defineConfig } from 'vitest/config';

// The engine under test (src/lib/snake.ts) is pure TypeScript with no Astro or
// DOM dependencies, so a plain node-environment Vitest config keeps unit tests
// fast and decoupled from the Astro/Vite build pipeline.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
