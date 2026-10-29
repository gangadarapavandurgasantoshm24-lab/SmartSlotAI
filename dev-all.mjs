import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { createServer } from 'vite'
import { mongoLogger } from './src/server/mongoAuditLogger.mjs'

// Simple .env loader
if (fs.existsSync('.env')) {
  try {
    const envLines = fs.readFileSync('.env', 'utf8').split('\n')
    for (const line of envLines) {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const [k, ...v] = trimmed.split('=')
        if (k && v.length > 0) {
          process.env[k.trim()] = v.join('=').trim().replace(/^["']|["']$/g, '')
        }
      }
    }
  } catch {}
}

function freePorts(ports) {
  if (process.platform !== 'win32') return
  try {
    const output = execSync('netstat -ano', { encoding: 'utf8' })
    const pidsToKill = new Set()
    for (const port of ports) {
      const regex = new RegExp(`[:.]${port}\\s+.*LISTENING\\s+(\\d+)`, 'gi')
      let match
      while ((match = regex.exec(output)) !== null) {
        const pid = parseInt(match[1], 10)
        if (pid && pid !== process.pid && pid !== process.ppid) {
          pidsToKill.add(pid)
        }
      }
    }
    for (const pid of pidsToKill) {
      try {
        console.log(`\x1b[33mFreeing port in use (terminating existing PID ${pid})...\x1b[0m`)
        execSync(`taskkill /F /PID ${pid} >nul 2>&1`)
      } catch {}
    }
  } catch {}
}

process.on('uncaughtException', (err) => {
  console.error('\x1b[31mUncaught exception in dev-all:\x1b[0m', err)
})

process.on('unhandledRejection', (reason) => {
  console.error('\x1b[31mUnhandled rejection in dev-all:\x1b[0m', reason)
})

const ROLES = [
  {
    id: 'picker',
    port: 5173,
    hmrPort: 25173,
    icon: '📦',
    title: 'ORDER PICKER TERMINAL',
    character: 'Alex Morgan (Cart P-07)',
    desc: 'Handheld scanner, active pick route, 3D target bin highlight & issue reports',
  },
  {
    id: 'supplier',
    port: 5174,
    hmrPort: 25174,
    icon: '🚚',
    title: 'SUPPLIER HUB',
    character: 'Medline Industries & Vendors',
    desc: 'Incoming purchase orders, 3D receiving dock visualizer & dispatch tracking',
  },
  {
    id: 'manager',
    port: 5175,
    hmrPort: 25175,
    icon: '🏢',
    title: 'WAREHOUSE MANAGER CENTER',
    character: 'Jordan Mitchell & Jamie Rivera',
    desc: 'Full 3D digital twin, inventory overview, receiving dock & layout approval',
  },
  {
    id: 'analyst',
    port: 5176,
    hmrPort: 25176,
    icon: '📊',
    title: 'ANALYST STUDIO & INTELLIGENCE',
    character: 'Warehouse Operations Intelligence',
    desc: '3D velocity heatmap, demand forecasting, SKU turnover & layout impact',
  },
]

// Shared real-time sync event bus
const sseClients = new Set()
let cachedSharedState = null

function broadcast(data) {
  const message = `data: ${JSON.stringify(data)}\n\n`
  for (const client of sseClients) {
    try {
      client.write(message)
    } catch {
      sseClients.delete(client)
    }
  }
}

// Periodic keep-alive ping for SSE
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n')
    } catch {
      sseClients.delete(client)
    }
  }
}, 15000)

function createRoleSyncPlugin(role) {
  return {
    name: `smartslot-role-${role.id}`,
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <script>window.__SMARTSLOT_ROLE__ = "${role.id}"; window.__SMARTSLOT_PORT__ = ${role.port};</script>`,
      )
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0]

        // Handle CORS safely: only allow local development origins
        const origin = req.headers.origin || ''
        const isLocalOrigin = !origin || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)

        if (isLocalOrigin) {
          res.setHeader('Access-Control-Allow-Origin', origin || '*')
        } else {
          res.setHeader('Access-Control-Allow-Origin', 'null')
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

        if (req.method === 'OPTIONS') {
          res.statusCode = 204
          res.end()
          return
        }

        if (url === '/api/events' && req.method === 'GET') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            Connection: 'keep-alive',
          })
          res.write('data: {"type":"CONNECTED"}\n\n')
          if (cachedSharedState) {
            res.write(`data: ${JSON.stringify({ type: 'SYNC_STATE', payload: cachedSharedState })}\n\n`)
          }
          sseClients.add(res)
          req.on('close', () => {
            sseClients.delete(res)
          })
          return
        }

        if (url === '/api/state' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(cachedSharedState || {}))
          return
        }

        if (url === '/api/mongodb/status' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify(mongoLogger.getStatus()))
          return
        }

        if (url === '/api/mongodb/logs' && req.method === 'GET') {
          mongoLogger.getRecentLogs(50).then((logs) => {
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ logs, status: mongoLogger.getStatus() }))
          }).catch((err) => {
            res.writeHead(500, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: err.message }))
          })
          return
        }

        if (url === '/api/mongodb/connect' && req.method === 'POST') {
          if (!isLocalOrigin) {
            res.writeHead(403, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ ok: false, error: 'Forbidden: External or cross-origin access is rejected.' }))
            return
          }

          let body = ''
          req.on('data', (c) => { body += c })
          req.on('end', async () => {
            try {
              const { uri, dbName } = JSON.parse(body || '{}')
              // Prefer server-side configuration from .env if uri is omitted
              const targetUri = uri ? uri.trim() : (process.env.MONGODB_URI || '')
              if (!targetUri) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: false, error: 'No MongoDB URI configured in server .env or provided.' }))
                return
              }

              // Disallow dangerous schemes or internal network scanning
              if (!targetUri.startsWith('mongodb+srv://') && !targetUri.startsWith('mongodb://')) {
                res.writeHead(400, { 'Content-Type': 'application/json' })
                res.end(JSON.stringify({ ok: false, error: 'Invalid MongoDB connection scheme. Must start with mongodb:// or mongodb+srv://' }))
                return
              }

              const isAtlasCloud = targetUri.includes('.mongodb.net')
              const isLocalhost = targetUri.startsWith('mongodb://localhost') || targetUri.startsWith('mongodb://127.0.0.1')
              if (!isAtlasCloud && !isLocalhost) {
                const privateIpPatterns = [/169\.254\./, /10\.\d+\./, /192\.168\./, /172\.(1[6-9]|2\d|3[01])\./, /0\.0\.0\.0/]
                if (privateIpPatterns.some(p => p.test(targetUri))) {
                  res.writeHead(403, { 'Content-Type': 'application/json' })
                  res.end(JSON.stringify({ ok: false, error: 'Forbidden: Internal network and cloud metadata IP targets are blocked.' }))
                  return
                }
              }

              if (dbName) mongoLogger.dbName = dbName.trim()
              const result = await mongoLogger.connect(targetUri)
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ...result, status: mongoLogger.getStatus() }))
            } catch (err) {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false, error: err.message }))
            }
          })
          return
        }

        if (url === '/api/sync' && req.method === 'POST') {
          const startTime = Date.now()
          let body = ''
          req.on('data', (chunk) => {
            body += chunk
          })
          req.on('end', () => {
            try {
              const parsed = JSON.parse(body)
              if (parsed && parsed.payload) {
                cachedSharedState = {
                  ...(cachedSharedState || {}),
                  ...parsed.payload,
                }
                broadcast(parsed)

                // Log command to MongoDB
                mongoLogger.logCommand({
                  type: parsed.type || 'STATE_SYNC',
                  role: role.id,
                  port: role.port,
                  action: parsed.type,
                  payload: parsed.payload,
                  status: 'SUCCESS',
                })

                // Log HTTP request/response to MongoDB
                mongoLogger.logHttpRequest({
                  method: 'POST',
                  url: '/api/sync',
                  port: role.port,
                  headers: req.headers,
                  body: parsed,
                  response: { ok: true },
                  statusCode: 200,
                  durationMs: Date.now() - startTime,
                })
              }
              res.writeHead(200, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: true }))
            } catch {
              res.writeHead(400, { 'Content-Type': 'application/json' })
              res.end(JSON.stringify({ ok: false }))
            }
          })
          return
        }

        next()
      })
    },
  }
}

async function startAll() {
  console.log('\n\x1b[1;36mInitializing SmartSlot AI Multi-Character Workspaces...\x1b[0m\n')

  const allPorts = ROLES.flatMap((r) => [r.port, r.hmrPort])
  freePorts(allPorts)

  const servers = []

  for (const role of ROLES) {
    try {
      const server = await createServer({
        cacheDir: `node_modules/.vite-${role.id}`,
        plugins: [createRoleSyncPlugin(role)],
        server: {
          port: role.port,
          strictPort: true,
          hmr: { port: role.hmrPort },
        },
      })
      await server.listen()
      servers.push(server)
    } catch (err) {
      console.error(`\x1b[31mFailed to start server for ${role.id} on port ${role.port}:\x1b[0m`, err)
    }
  }

  console.log('\x1b[1;32m' + '═'.repeat(74) + '\x1b[0m')
  console.log('  \x1b[1;37m🚀 SMARTSLOT AI — ALL 4 CHARACTER LOCALHOSTS ARE ACTIVE & RUNNING\x1b[0m')
  console.log('\x1b[1;32m' + '═'.repeat(74) + '\x1b[0m\n')

  for (const role of ROLES) {
    console.log(
      `  ${role.icon}  \x1b[1;33m[${role.title}]\x1b[0m\n` +
      `     👤 Character: \x1b[1;37m${role.character}\x1b[0m\n` +
      `     🔗 Localhost: \x1b[1;34mhttp://localhost:${role.port}\x1b[0m\n` +
      `     📋 Features:  \x1b[90m${role.desc}\x1b[0m\n`,
    )
  }

  console.log('\x1b[1;32m' + '═'.repeat(74) + '\x1b[0m')
  console.log('  \x1b[1;35m✨ Real-Time Cross-Localhost Event Synchronization Active\x1b[0m')
  console.log('  \x1b[90mActions on any port (Pick, Replenish, Dispatch) sync automatically.\x1b[0m')
  console.log('\x1b[1;32m' + '═'.repeat(74) + '\x1b[0m\n')

  const shutdown = async () => {
    console.log('\nGracefully shutting down all SmartSlot AI servers...')
    for (const server of servers) {
      try {
        await server.close()
      } catch {}
    }
    process.exit(0)
  }

  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

startAll()
