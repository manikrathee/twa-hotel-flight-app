import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const TOKEN_ENDPOINT = 'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token'

function openskyAuthProxy(mode) {
  const env = loadEnv(mode, process.cwd(), '')
  const clientId = env.OPENSKY_CLIENT_ID || env.VITE_OPENSKY_CLIENT_ID || process.env.OPENSKY_CLIENT_ID || process.env.VITE_OPENSKY_CLIENT_ID
  const clientSecret = env.OPENSKY_CLIENT_SECRET || env.VITE_OPENSKY_CLIENT_SECRET || process.env.OPENSKY_CLIENT_SECRET || process.env.VITE_OPENSKY_CLIENT_SECRET

  return {
    name: 'opensky-auth-proxy',
    configureServer(server) {
      server.middlewares.use('/api/opensky-auth', async (req, res, next) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'Method Not Allowed' }))
          return
        }

        if (!clientId || !clientSecret) {
          res.statusCode = 503
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: 'OpenSky credentials not configured on server' }))
          return
        }

        try {
          const body = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
          })
          const upstream = await fetch(TOKEN_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: AbortSignal.timeout(12000),
          })
          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(text)
        } catch (error) {
          next(error)
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fallbackFeedProxyTarget = env.VITE_FALLBACK_FEED_PROXY_TARGET
  const fallbackFeedProxyPath = env.VITE_FALLBACK_FEED_PROXY_PATH || '/api/jfk-fallback'
  const fallbackFeedProxy = fallbackFeedProxyTarget
    ? {
        [fallbackFeedProxyPath]: {
          target: fallbackFeedProxyTarget,
          changeOrigin: true,
          rewrite: (path) => path.startsWith(fallbackFeedProxyPath)
            ? path.slice(fallbackFeedProxyPath.length) || '/'
            : path,
          secure: true,
        },
      }
      : {}

    return {
      plugins: [react(), openskyAuthProxy(mode)],
      build: {
        // MapLibre ships as a single large prebuilt module; keep warning signal for others.
        chunkSizeWarningLimit: 1200,
      rolldownOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return
            if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) {
              return 'react-vendor'
            }
            if (id.includes('/node_modules/maplibre-gl/')) {
              return 'maplibre-vendor'
            }
            return 'vendor'
          },
        },
      },
    },
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
        ...fallbackFeedProxy,
      },
    },
  }
})
