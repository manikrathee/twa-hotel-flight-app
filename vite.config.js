import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/opensky': {
        target: 'https://opensky-network.org',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/opensky/, '/api'),
        secure: true,
      },
      '/api/adsbdb': {
        target: 'https://api.adsbdb.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/adsbdb/, ''),
        secure: true,
      },
      '/api/weather': {
        target: 'https://api.open-meteo.com',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api\/weather/, ''),
        secure: true,
      },
    },
  },
})
