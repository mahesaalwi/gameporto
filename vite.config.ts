import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['**/*.webp', '**/*.json'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,webp,json,woff2}'],
        // Exclude GLB from precache — too large, use runtimeCaching instead
        globIgnores: ['**/*.glb', '**/*.gltf'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB for non-GLB assets
        runtimeCaching: [
          {
            urlPattern: /\.(?:glb|gltf)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: '3d-assets',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: /\.(?:webp|png|jpg)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'texture-assets',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Cyberpunk Portfolio - Kaze',
        short_name: 'CyberPorto',
        description: 'Interactive 3D Cyberpunk Portfolio',
        theme_color: '#050510',
        background_color: '#050510',
        display: 'fullscreen',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('three')) {
              return 'three';
            }
            if (id.includes('@dimforge/rapier3d-compat')) {
              return 'rapier';
            }
          }
        },
      },
    },
  },
  server: {
    host: true, // Allow mobile testing via local network
  },
  assetsInclude: ['**/*.glb', '**/*.gltf'],
});
