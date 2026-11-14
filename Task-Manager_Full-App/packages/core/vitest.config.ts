import { defineConfig } from 'vitest/config';

// Tests run in Philippine time on purpose: it catches "UTC instead of local date" bugs.
export default defineConfig({
  test: { globalSetup: ['./test-utils/timezone.ts'], include: ['test/**/*.test.ts'] },
});
