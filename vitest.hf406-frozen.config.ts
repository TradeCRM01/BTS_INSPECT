// HF-403-768 FROZEN kill (CoS) — do not edit.
// Runs src/test/hf406.frozen.{chromium,webkit}.kill.tsx (Node + Playwright 1.48.2 imported directly).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    include: [
      'src/test/hf406.frozen.chromium.kill.tsx',
      'src/test/hf406.frozen.webkit.kill.tsx',
    ],
    testTimeout: 900_000,
    hookTimeout: 900_000,
    fileParallelism: false,
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    alias: [
      { find: /^npm:@supabase\/supabase-js@2$/, replacement: path.join(root, 'src/lib/aiEdgeHarness/sbStub.ts') },
      { find: /^jsr:.*$/, replacement: path.join(root, 'src/lib/aiEdgeHarness/empty.ts') },
    ],
  },
});
