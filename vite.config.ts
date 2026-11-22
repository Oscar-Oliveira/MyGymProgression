import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// package.json is the single source of the version; `npm run deploy:pages` raises it.
const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version), __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)) },
  plugins: [
    { name: 'app-version', transformIndexHtml: (html: string) => html.replaceAll('%APP_VERSION%', version) },
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        runtimeCaching: [
          {
            // v2 library media (exercises-dataset on jsDelivr, CORS): downloaded on the device when the user asks (src/ui/media.ts).
            // Only normal (200) responses: opaque ones would use far more storage quota.
            urlPattern: ({ url }) => url.href.startsWith('https://cdn.jsdelivr.net/gh/hasaneyldrm/exercises-dataset@'),
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-media', expiration: { maxEntries: 3000 }, cacheableResponse: { statuses: [200] }, matchOptions: { ignoreVary: true } },
          },
          {
            // Exercise images from other sites (library files may link to full-size images).
            urlPattern: ({ request, url }) => request.destination === 'image' && url.origin !== self.location.origin,
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-images', expiration: { maxEntries: 500 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      manifest: {
        name: 'MyGymProgression',
        short_name: 'GymProg',
        description: 'Training plans, workout logging and progression',
        theme_color: '#5b4cf5',
        background_color: '#5b4cf5',
        display: 'fullscreen',
        start_url: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // With Node 26, the default pools of Vitest 5.0.5 fail before any test runs ("reading 'config'"); vmThreads works.
    pool: 'vmThreads',
  },
});
