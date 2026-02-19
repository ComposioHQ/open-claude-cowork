import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      // server/ has its own node_modules — force all imports to resolve to the
      // same path so vi.mock() intercepts transitive imports from source files
      '@supabase/supabase-js': path.resolve(__dirname, 'server/node_modules/@supabase/supabase-js'),
      'playwright': path.resolve(__dirname, 'server/node_modules/playwright'),
      '@anthropic-ai/claude-agent-sdk': path.resolve(__dirname, 'server/node_modules/@anthropic-ai/claude-agent-sdk')
    }
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup/setup-env.js'],
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    exclude: ['tests/e2e/**'],
    coverage: {
      provider: 'v8',
      include: ['server/**/*.js'],
      exclude: ['server/node_modules/**']
    },
    testTimeout: 15000,
    hookTimeout: 15000
  }
});
