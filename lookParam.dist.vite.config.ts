import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const mocks = path.join(root, 'src/components/layout/s2Shell.chromium.mocks.ts');
const outDir = process.env.LOOK_DIST_OUT;
if (!outDir) throw new Error('LOOK_DIST_OUT is required');

export default defineConfig({
  root,
  publicDir: false,
  envDir: path.join(root, 'src/lib'),
  mode: 'production',
  plugins: [
    react(),
    {
      name: 'look-dist-mocks',
      enforce: 'pre' as const,
      resolveId(id: string) {
        const spec = id.replace(/\\/g, '/');
        if (/(?:AuthContext|useCompanyAiKey|DevConsole|GlobalSearch|aiSettingsClient|(?:^|[./])supabase)$/.test(spec)) {
          return mocks;
        }
        return null;
      },
    },
  ],
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.SSR': 'false',
    'import.meta.env.MODE': '"production"',
    'import.meta.env.VITE_LOOK_PROOF': process.env.VITE_LOOK_PROOF === '1' ? '"1"' : 'undefined',
    'import.meta.env.VITE_SUPABASE_URL': '"https://example.supabase.co"',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '"test-anon-key"',
  },
  build: {
    outDir,
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    rollupOptions: {
      input: path.join(root, 'src/lib/lookParam.dist.html'),
    },
  },
});
