import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  esbuild: {
    drop: process.env.NODE_ENV === 'production' ? ['console', 'debugger'] : [],
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          // Match three-family packages by path segment, not substring: a bare
          // includes('three') also caught zustand (a dep shared with
          // @react-three/fiber), which made the player store statically import
          // this chunk — 864 KB of three.js preloaded on first paint for the
          // lazy party-mode feature.
          if (/node_modules[\\/](three|three-stdlib|three-mesh-bvh|@react-three|troika-three-[^\\/]+)[\\/]/.test(id)) return 'vendor-three'
          // zustand is shared by the app store AND @react-three/fiber; without
          // an explicit assignment rolldown merges it into vendor-three, which
          // made the store chunk statically import 864 KB of three.js on first
          // paint. Keep it in its own tiny chunk both sides can depend on.
          if (id.includes('node_modules/zustand/')) return 'vendor-state'
          if (id.includes('framer-motion')) return 'vendor-motion'
          if (id.includes('lucide-react')) return 'vendor-icons'
          if (id.includes('react-dom') || id.includes('/react/')) return 'vendor-react'
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        navigateFallback: '/index.html',
        globIgnores: [
          '**/vendor-three*.js',
          '**/PartyMode*.js',
          '**/vendor-motion*.js',
          '**/videos/**',
          '**/*.mp4',
        ],
        maximumFileSizeToCacheInBytes: 512000,
        runtimeCaching: [
          {
            urlPattern: /^https?:\/\/.*\/api\/.*/i,
            handler: 'NetworkOnly',
          },
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-pages',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 },
            },
          },
        ],
      },
      manifest: {
        name: 'FlacAud',
        short_name: 'FlacAud',
        theme_color: '#0a0a10',
        background_color: '#0a0a10',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/flacaud_logo.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/flacaud_logo.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
  },
  server: {
    proxy: process.env.CI ? undefined : {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  preview: {
    proxy: process.env.CI ? undefined : {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
})
