import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // push イベントを自前で処理するため injectManifest（sw.ts）を使う
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
      },
      includeAssets: ['favicon.svg', 'robots.txt'],
      manifest: {
        name: 'THE CONCIERGE',
        short_name: 'CONCIERGE',
        description: 'お客様だけのコンシェルジュ。声でご指示を承ります。',
        theme_color: '#0f223b',
        background_color: '#fdfcf8',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        lang: 'ja',
        // PNGを先頭に置く。iOSはSVGアイコンを解釈できず、通知アイコンにも使われるため
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
        ],
      },
    }),
  ],
  server: {
    host: true,
    port: 5174,
    allowedHosts: ['.trycloudflare.com', 'localhost', '127.0.0.1'],
  },
})
