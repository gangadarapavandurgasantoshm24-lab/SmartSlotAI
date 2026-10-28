import { detectCurrentRole } from './utils/roleHelper'
import { PickerWorkspaceView } from './roles/PickerWorkspaceView'
import { SupplierPortalView } from './roles/SupplierPortalView'
import { ManagerPortalView } from './roles/ManagerPortalView'
import { AnalystPortalView } from './roles/AnalystPortalView'
import { useLiveSync } from './utils/useLiveSync'

export default function App() {
  useLiveSync()
  const role = detectCurrentRole()

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
