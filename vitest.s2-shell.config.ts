import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'node',
    setupFiles: ['src/test/requestSignalStrip.ts'],
    include: [
      'src/components/layout/s2Shell.chromium.kill.tsx',
      'src/components/layout/p1Dashboard.chromium.kill.tsx',
      'src/pages/hfLand1.chromium.kill.tsx',
    ],
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
