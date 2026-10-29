import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      workbox: {
        runtimeCaching: [
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
        display: 'standalone',
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
  },
});
