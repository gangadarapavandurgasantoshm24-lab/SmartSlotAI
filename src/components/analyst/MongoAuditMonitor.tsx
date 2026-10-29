import { useEffect, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Database,
  ExternalLink,
  Key,
  RefreshCw,
  Server,
  Terminal,
  Zap,
} from 'lucide-react'
import type { FC } from 'react'
import { Badge, Card, Metric } from '../ui'

interface MongoStatus {
  connected: boolean
  status: string
  uriConfigured: boolean
  maskedUri: string
  dbName: string
  bufferedCount: number
  totalCommandsLogged: number
  totalRequestsLogged: number
  lastLogTime: string | null
}

interface MongoLogEntry {
  _id: string
  timestamp: string
  type?: string
  role?: string
  port?: number
  clientPort?: number
  action?: string
  method?: string
  url?: string
  statusCode?: number
  payload?: unknown
  requestPayload?: unknown
  responsePayload?: unknown
  status?: string
}

export const MongoAuditMonitor: FC = () => {
  const [status, setStatus] = useState<MongoStatus>({
    connected: false,
    status: 'Checking...',
    uriConfigured: false,
    maskedUri: '',
    dbName: 'smartslot_ai',
    bufferedCount: 0,
    totalCommandsLogged: 0,
    totalRequestsLogged: 0,
    lastLogTime: null,
  })

  const [logs, setLogs] = useState<MongoLogEntry[]>([])
  const [selectedLog, setSelectedLog] = useState<MongoLogEntry | null>(null)
  const [connectionUri, setConnectionUri] = useState('')
  const [dbName, setDbName] = useState('smartslot_ai')
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectMsg, setConnectMsg] = useState<{ ok: boolean; text: string } | null>(null)

  async function fetchStatus() {
    try {
      const res = await fetch('/api/mongodb/status')
      if (res.ok) {
        const data = await res.json()
        setStatus(data)
      }
    } catch {}
  }

  async function fetchLogs() {
    try {
      const res = await fetch('/api/mongodb/logs')
      if (res.ok) {
        const data = await res.json()
        setLogs(data.logs || [])
        if (data.status) setStatus(data.status)
      }
    } catch {}
  }

  useEffect(() => {
    let mounted = true

    const poll = async () => {
      try {
        const [statusRes, logsRes] = await Promise.allSettled([
          fetch('/api/mongodb/status'),
          fetch('/api/mongodb/logs'),
        ])

        if (!mounted) return

        if (statusRes.status === 'fulfilled' && statusRes.value.ok) {
          const data = await statusRes.value.json()
          if (mounted) setStatus(data)
        }

        if (logsRes.status === 'fulfilled' && logsRes.value.ok) {
          const data = await logsRes.value.json()
          if (mounted) {
            setLogs(data.logs || [])
            if (data.status) setStatus(data.status)
          }
        }
      } catch {}
    }

    void poll()
    const timer = setInterval(() => {
      void poll()
    }, 4000)

    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault()
    if (!connectionUri.trim()) {
      setConnectMsg({ ok: false, text: 'Please enter a valid MongoDB connection string.' })
      return
    }
    setIsConnecting(true)
    setConnectMsg(null)
    try {
      const res = await fetch('/api/mongodb/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ uri: connectionUri.trim(), dbName: dbName.trim() || 'smartslot_ai' }),
      })
      const result = await res.json()
      if (result.ok) {
        setConnectMsg({ ok: true, text: result.message || 'Connected to MongoDB Atlas!' })
        fetchStatus()
        fetchLogs()
      } else {
        setConnectMsg({ ok: false, text: result.error || 'Connection failed.' })
      }
    } catch (err: unknown) {
      setConnectMsg({ ok: false, text: err instanceof Error ? err.message : 'Network error' })
    } finally {
      setIsConnecting(false)
    }
  }

  return (
    <div className="mongo-audit-root">
      {/* Header Banner */}
      <div className="mongo-header-banner">
        <div className="mongo-banner-title">
          <div className="mongo-icon-wrap">
            <Database size={22} />
          </div>
          <div>
            <h2>MongoDB Atlas Cloud Audit &amp; Event Stream</h2>
            <p>
              Real-time transactional audit pipeline: logs all commands, state dispatches, and HTTP requests &amp; responses across all 4 localhosts into MongoDB Atlas collections.
            </p>
          </div>
        </div>

        <div className="mongo-status-pill">
          <span className={`status-indicator ${status.connected ? 'online' : 'offline'}`} />
          <div>
            <span className="pill-label">STATUS</span>
            <strong>{status.connected ? 'CONNECTED TO ATLAS' : 'BUFFERING LOCALLY'}</strong>
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="metric-grid four-metrics">
        <Metric
          label="MongoDB Connection"
          value={status.connected ? 'Online' : 'Local Buffer'}
          note={status.maskedUri ? status.maskedUri : 'Awaiting URI'}
          tone={status.connected ? 'green' : 'amber'}
        />
        <Metric
          label="Commands Logged"
          value={status.totalCommandsLogged.toLocaleString()}
          note="Dispatches, picks, & receipts"
          tone="blue"
        />
        <Metric
          label="HTTP Requests & Responses"
          value={status.totalRequestsLogged.toLocaleString()}
          note="Full payloads & status codes"
          tone="navy"
        />
        <Metric
          label="Buffered Queue"
          value={status.bufferedCount.toLocaleString()}
          note={status.connected ? 'Flushed to MongoDB' : 'Auto-syncs on connect'}
          tone={status.bufferedCount > 0 ? 'amber' : 'green'}
        />
      </div>

      <div className="mongo-layout-grid">
        {/* Left Column: Connection Setup & Atlas Guide */}
        <div className="mongo-left-col">
          <Card
            title="MongoDB Atlas Connection"
            subtitle="Connect your MongoDB Atlas cluster or provide your connection string"
          >
            <form onSubmit={handleConnect} className="mongo-connect-form">
              <label>
                <span className="input-label-row">
                  <span>MONGODB CONNECTION URI</span>
                  <a
                    href="https://cloud.mongodb.com/v2/6896498dd89b2231f57dac05#/clusters/starterTemplates?from=homeCenterPage"
                    target="_blank"
                    rel="noreferrer"
                    className="atlas-link"
                  >
                    Open Atlas Console <ExternalLink size={11} />
                  </a>
                </span>
                <input
                  type="text"
                  placeholder="mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority"
                  value={connectionUri}
                  onChange={(e) => setConnectionUri(e.target.value)}
                  className="mongo-uri-input"
                />
              </label>

              <label>
                <span>DATABASE NAME</span>
                <input
                  type="text"
                  placeholder="smartslot_ai"
                  value={dbName}
                  onChange={(e) => setDbName(e.target.value)}
                />
              </label>

              {connectMsg && (
                <div className={`connect-feedback ${connectMsg.ok ? 'success' : 'error'}`}>
                  {connectMsg.ok ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                  <span>{connectMsg.text}</span>
                </div>
              )}

              <div className="connect-form-actions">
                <button type="submit" disabled={isConnecting} className="button button-primary">
                  <Zap size={14} />
                  {isConnecting ? 'Connecting…' : 'Connect & Sync Database'}
                </button>
                <button type="button" onClick={fetchLogs} className="button button-secondary">
                  <RefreshCw size={14} />
                  Refresh
                </button>
              </div>
            </form>

            <div className="atlas-instructions-box">
              <div className="instr-header">
                <Key size={15} />
                <strong>How to get your MongoDB Connection String:</strong>
              </div>
              <ol className="instr-steps">
                <li>Go to your <strong>MongoDB Atlas Console</strong> (link above).</li>
                <li>Under <strong>Database</strong>, click <strong>"Connect"</strong> next to your cluster.</li>
                <li>Choose <strong>"Drivers"</strong> (Node.js).</li>
                <li>Copy the connection string (replace <code>&lt;password&gt;</code> with your database user password).</li>
                <li>Paste it above or add it to <code>.env</code> as <code>MONGODB_URI</code>.</li>
              </ol>
            </div>
          </Card>
        </div>

        {/* Right Column: Live Stream & JSON Inspector */}
        <div className="mongo-right-col">
          <Card
            title="Real-Time Recorded MongoDB Documents"
            subtitle="Live log of every command, pick confirmation, purchase order, and HTTP payload"
            action={<Badge>{logs.length} Recent Logs</Badge>}
          >
            <div className="mongo-logs-scroll">
              {logs.length === 0 ? (
                <div className="no-logs-empty">
                  <Server size={32} />
                  <p>No audit logs recorded yet. Perform an action (dispatch pick, replenish, or slotting) to see live documents stream here.</p>
                </div>
              ) : (
                <table className="mongo-logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Type / Role</th>
                      <th>Command / Action</th>
                      <th>Status</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log) => (
                      <tr key={log._id} className={selectedLog?._id === log._id ? 'selected-row' : ''}>
                        <td className="timestamp-cell">
                          <small>{new Date(log.timestamp).toLocaleTimeString()}</small>
                        </td>
                        <td>
                          <div className="type-cell">
                            <strong>{log.type || log.method || 'COMMAND'}</strong>
                            <small>{log.role || `Port ${log.port || log.clientPort}`}</small>
                          </div>
                        </td>
                        <td>
                          <div className="action-cell">
                            <code>{log.action || log.url || 'STATE_SYNC'}</code>
                          </div>
                        </td>
                        <td>
                          <span className={`status-badge ${log.status === 'SUCCESS' || log.statusCode === 200 ? 'ok' : 'pending'}`}>
                            {log.statusCode ? `HTTP ${log.statusCode}` : (log.status || 'LOGGED')}
                          </span>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="inspect-btn"
                            onClick={() => setSelectedLog(log)}
                          >
                            Inspect JSON
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {selectedLog && (
              <div className="json-inspector-drawer">
                <div className="inspector-header">
                  <div>
                    <Terminal size={14} />
                    <strong>Document Inspector: <code>{selectedLog._id}</code></strong>
                  </div>
                  <button type="button" className="close-inspect" onClick={() => setSelectedLog(null)}>
                    ✕
                  </button>
                </div>
                <pre className="inspector-json">
                  {JSON.stringify(selectedLog, null, 2)}
                </pre>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
