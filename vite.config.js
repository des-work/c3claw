import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), ...(mode === 'cloudflare' ? [(await import('@cloudflare/vite-plugin')).cloudflare()] : [])],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001'
    }
  }
}))
