import { ClipboardList, Shield, User } from 'lucide-react'
import type { FC } from 'react'
import { PickerWorkspaceScreen } from '../screens/PickerWorkspaceScreen'
import { RoleSwitcherBar } from '../components/RoleSwitcherBar'
import { useAppStore } from '../store/useAppStore'

export const PickerWorkspaceView: FC = () => {
  const order = useAppStore((state) => state.pickOrder)
  const remainingLines = order.lines.filter((line) => line.picked < line.requested).length

  return (
    <div className="character-app-root picker-theme">
      <RoleSwitcherBar currentRole="picker" />
      <header className="character-header">
        <div className="char-brand">
          <span className="char-badge picker">
            <ClipboardList size={18} />
          </span>
          <div>
            <h1>SmartSlot <span>PICKER</span></h1>
            <small>Handheld Warehouse Terminal · Cart P-07</small>
          </div>
        </div>
        <div className="char-user-info">
          <div className="operator-pill">
            <User size={14} />
            <span>Operator: <strong>Alex Morgan</strong></span>
            <span className="status-dot-active" title="Connected" />
          </div>
          <div className="shift-pill">
            <Shield size={14} />
            <span>Order {order.id} · {remainingLines} stops remaining</span>
          </div>
        </div>
      </header>

      <main className="character-main">
        <PickerWorkspaceScreen />
      </main>

      <footer className="character-footer">
        <span>SmartSlot AI Picker Terminal · Alex Morgan (P-07) · Port 5173</span>
        <span>Local demo mode · Real-time inventory sync active</span>
      </footer>
    </div>
  )
}
