import { useState } from 'react'
import { Boxes, ChevronDown, ChevronUp, ClipboardList, Truck, UserCheck, Warehouse } from 'lucide-react'
import type { FC } from 'react'
import type { UserRole } from '../types'

interface RoleItem {
  id: UserRole
  label: string
  character: string
  icon: typeof Warehouse
  color: string
}

const ROLES: RoleItem[] = [
  {
    id: 'manager',
    label: 'Warehouse Manager',
    character: 'Jordan Mitchell',
    icon: Warehouse,
    color: '#38bdf8',
  },
  {
    id: 'picker',
    label: 'Order Picker',
    character: 'Alex Morgan (Cart P-07)',
    icon: ClipboardList,
    color: '#34d399',
  },
  {
    id: 'supplier',
    label: 'Supplier Hub',
    character: 'Medline & Vendors',
    icon: Truck,
    color: '#fbbf24',
  },
  {
    id: 'analyst',
    label: 'Analyst Studio',
    character: 'Operations Intelligence',
    icon: Boxes,
    color: '#c084fc',
  },
]

interface RoleQuickSwitcherProps {
  currentRole: UserRole
  onRoleChange: (role: UserRole) => void
}

export const RoleQuickSwitcher: FC<RoleQuickSwitcherProps> = ({ currentRole, onRoleChange }) => {
  const [collapsed, setCollapsed] = useState(false)

  const active = ROLES.find((r) => r.id === currentRole) || ROLES[0]
  const ActiveIcon = active.icon

  return (
    <aside className="role-floating-dock" aria-label="Role Switcher Dock">
      <div className="dock-container">
        <button
          className="dock-toggle-btn"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand Role Switcher' : 'Minimize Role Switcher'}
        >
          <span className="dock-badge-indicator" style={{ background: active.color }} />
          <ActiveIcon size={16} />
          <span className="dock-active-title">{active.label}</span>
          {collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {!collapsed && (
          <div className="dock-roles-list">
            <span className="dock-section-label">SWITCH WORKSPACE:</span>
            {ROLES.map((role) => {
              const Icon = role.icon
              const isSelected = currentRole === role.id

              return (
                <button
                  key={role.id}
                  className={`dock-role-pill ${isSelected ? 'active' : ''}`}
                  onClick={() => onRoleChange(role.id)}
                  title={`Switch to ${role.label} (${role.character})`}
                >
                  <Icon size={15} style={{ color: role.color }} />
                  <div className="dock-pill-text">
                    <span className="dock-role-name">{role.label}</span>
                    <small className="dock-char-name">{role.character}</small>
                  </div>
                  {isSelected && <UserCheck size={14} className="dock-selected-check" />}
                </button>
              )
            })}
          </div>
        )}
      </div>
    </aside>
  )
}
