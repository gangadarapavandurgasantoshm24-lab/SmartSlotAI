import { Bell, CheckCircle2, X, Zap } from 'lucide-react'
import type { FC } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { UserRole } from '../types'

interface RoleConfig {
  id: UserRole
  label: string
  title: string
  port: number
  icon: string
  character: string
}

const ROLES: RoleConfig[] = [
  { id: 'manager', label: 'Manager', title: 'Manager Center', port: 5175, icon: '🏢', character: 'Jordan Mitchell' },
  { id: 'picker', label: 'Picker', title: 'Picker Terminal', port: 5173, icon: '📦', character: 'Alex Morgan' },
  { id: 'supplier', label: 'Supplier', title: 'Supplier Hub', port: 5174, icon: '🚚', character: 'Medline & Vendors' },
  { id: 'analyst', label: 'Analyst', title: 'Analyst Studio', port: 5176, icon: '📊', character: 'Intelligence' },
]

export const RoleSwitcherBar: FC<{ currentRole: UserRole }> = ({ currentRole }) => {
  const alerts = useAppStore((state) => state.liveAlerts)
  const dismissAlert = useAppStore((state) => state.dismissAlert)
  const latestAlert = alerts[0]

  const activeRole = ROLES.find((r) => r.id === currentRole) ?? ROLES[0]
  const isMultiPort = typeof window !== 'undefined' && Boolean(window.__SMARTSLOT_PORT__)
  const currentPort = typeof window !== 'undefined' ? (window.__SMARTSLOT_PORT__ || window.location.port || '5173') : '5175'
  const hostname = typeof window !== 'undefined' ? (window.location.hostname || 'localhost') : 'localhost'

  return (
    <>
      <nav className="role-switcher-banner" aria-label="Role Switcher">
        <div className="role-banner-left">
          <span className={`role-banner-badge role-${currentRole}`}>
            <span>{activeRole.icon}</span>
            <span>{activeRole.title.toUpperCase()}</span>
            <span className="role-port-tag">PORT {currentPort}</span>
          </span>
          <span className="role-char-name">{activeRole.character}</span>
          <span className="role-sync-indicator" title="Live cross-workspace sync active">
            <span className="pulse-dot" />
            <span>LIVE SYNC ACTIVE</span>
          </span>
        </div>
        <div className="role-banner-links">
          <span className="role-switch-label">SWITCH ROLE:</span>
          {ROLES.map((r) => {
            const href = isMultiPort
              ? `http://${hostname}:${r.port}/`
              : `?role=${r.id}`

            return (
              <a
                key={r.id}
                href={href}
                className={`role-nav-pill ${currentRole === r.id ? 'active' : ''}`}
                title={`Switch to ${r.title}`}
                onClick={(e) => {
                  if (currentRole === r.id) {
                    e.preventDefault()
                    return
                  }
                  if (!isMultiPort) {
                    e.preventDefault()
                    const url = new URL(window.location.href)
                    url.searchParams.set('role', r.id)
                    window.location.href = url.toString()
                  }
                }}
              >
                <span>{r.icon}</span>
                <span>{r.label}</span>
                <small>:{r.port}</small>
              </a>
            )
          })}
        </div>
      </nav>

      {latestAlert && (
        <aside className={`live-sync-alert-bar tone-${latestAlert.tone ?? 'blue'}`} aria-label="System notification">
          <div className="alert-content">
            <span className="alert-icon-ring">
              {latestAlert.tone === 'green' ? <CheckCircle2 size={13} /> : latestAlert.tone === 'purple' ? <Zap size={13} /> : <Bell size={13} />}
            </span>
            <span className={`alert-source-pill source-${latestAlert.source}`}>
              {latestAlert.source.toUpperCase()}
            </span>
            <strong>{latestAlert.title}</strong>
            <span className="alert-detail">{latestAlert.detail}</span>
          </div>
          <button className="alert-dismiss-btn" onClick={() => dismissAlert(latestAlert.id)} title="Dismiss notification">
            <X size={13} />
          </button>
        </aside>
      )}
    </>
  )
}
