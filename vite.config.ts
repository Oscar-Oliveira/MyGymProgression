import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      workbox: {
        // The exercise library (public/library) is large: cached on first use instead of precached.
        globIgnores: ['library/**'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/library/'),
            handler: 'CacheFirst',
            options: { cacheName: 'library', expiration: { maxEntries: 6000 } },
          },
          {
            urlPattern: ({ url }) => url.hostname === 'lyfta.app',
            handler: 'CacheFirst',
            options: { cacheName: 'exercise-images', expiration: { maxEntries: 500 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      manifest: {
        name: 'MyGymProgression',
        short_name: 'GymProg',
        description: 'Training plans, workout logging and progression',
        theme_color: '#1f6feb',
        background_color: '#0d1117',
        display: 'standalone',
        start_url: '.',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
