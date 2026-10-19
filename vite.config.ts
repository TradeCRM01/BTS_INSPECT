/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_NAME } from './src/lib/brand';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  test: {
    environment: 'node',
    setupFiles: ['src/test/requestSignalStrip.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'workers/**/*.test.ts'],
    env: {
      VITE_SUPABASE_URL: 'https://example.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'test-anon-key',
    },
    alias: [
      { find: /^npm:@supabase\/supabase-js@2$/, replacement: path.join(root, 'src/lib/aiEdgeHarness/sbStub.ts') },
      { find: /^jsr:.*$/, replacement: path.join(root, 'src/lib/aiEdgeHarness/empty.ts') },
    ],
  },
  plugins: [
    react(),
    {
      name: 'brand-html',
      transformIndexHtml(html) {
        return html.replaceAll('%BRAND_NAME%', BRAND_NAME);
      },
    },
    VitePWA({
      // Unregister broken SWs that were causing Chrome ERR_FAILED on navigations.
      // Re-enable offline caching later once clients have recovered.
      selfDestroying: true,
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.svg',
        'icon.svg',
        'icon-192.png',
        'icon-512.png',
        'icon-maskable-512.png',
        'apple-touch-icon.png',
        'fonts/Geist-Variable.woff2',
        'fonts/OFL.txt',
      ],
      manifest: {
        name: BRAND_NAME,
        short_name: BRAND_NAME,
        description: 'Field inspection and reporting platform',
        theme_color: '#0A0A0B',
        background_color: '#F5F5F7',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,woff,ttf}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/functions\/v1\//],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/[a-z0-9]+\.supabaseusercontent\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'supabase-storage-cache',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name]-[hash]-r2.js',
        entryFileNames: 'assets/[name]-[hash]-r2.js',
        assetFileNames: 'assets/[name]-[hash]-r2[extname]',
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-pdf': ['@react-pdf/renderer', 'pdfjs-dist', 'pdf-lib'],
          'vendor-dnd': ['@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
          'vendor-supabase': ['@supabase/supabase-js'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,
      },
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react', 'pdfjs-dist'],
    include: ['react', 'react-dom', 'react-router-dom'],
  },
});
