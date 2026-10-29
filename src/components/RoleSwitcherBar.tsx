import { Bell, CheckCircle2, X, Zap } from 'lucide-react'
import type { FC } from 'react'
import { useAppStore } from '../store/useAppStore'
import type { UserRole } from '../types'

export const RoleSwitcherBar: FC<{ currentRole: UserRole }> = () => {
  const alerts = useAppStore((state) => state.liveAlerts)
  const dismissAlert = useAppStore((state) => state.dismissAlert)
  const latestAlert = alerts[0]

  return (
    <>
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
