import { useEffect, useState } from 'react'
import { detectCurrentRole } from './utils/roleHelper'
import { PickerWorkspaceView } from './roles/PickerWorkspaceView'
import { SupplierPortalView } from './roles/SupplierPortalView'
import { ManagerPortalView } from './roles/ManagerPortalView'
import { AnalystPortalView } from './roles/AnalystPortalView'
import { RoleQuickSwitcher } from './components/RoleQuickSwitcher'
import { useLiveSync } from './utils/useLiveSync'
import type { UserRole } from './types'

export default function App() {
  useLiveSync()
  const [role, setRole] = useState<UserRole>(() => detectCurrentRole())

  useEffect(() => {
    function handlePopState() {
      setRole(detectCurrentRole())
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  function handleRoleChange(newRole: UserRole) {
    setRole(newRole)
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href)
      url.searchParams.set('role', newRole)
      window.history.pushState({}, '', url.toString())
    }
  }

  function renderView() {
    switch (role) {
      case 'picker':
        return <PickerWorkspaceView />
      case 'supplier':
        return <SupplierPortalView />
      case 'analyst':
        return <AnalystPortalView />
      case 'manager':
      default:
        return <ManagerPortalView />
    }
  }

  return (
    <>
      {renderView()}
      <RoleQuickSwitcher currentRole={role} onRoleChange={handleRoleChange} />
    </>
  )
}
