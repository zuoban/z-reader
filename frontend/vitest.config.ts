import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      include: [
        'src/hooks/useCoverUrl.ts',
        'src/hooks/useProgress.ts',
        'src/hooks/useShelfData.ts',
        'src/lib/api.ts',
        'src/lib/reader-page.ts',
        'src/lib/shelf-grid.ts',
        'src/lib/tts-helpers.ts',
        'src/lib/tts-queue.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
