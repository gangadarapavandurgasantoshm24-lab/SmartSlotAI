import { getStockStatus, type InventoryStockStatus } from '../../data/inventoryUtils'
import type { InventoryItem } from '../../types'

export const warehouseStockColors: Record<InventoryStockStatus, string> = {
  Healthy: '#72b6ca',
  'Low stock': '#e4bd64',
  Empty: '#d8e0e3',
  Unavailable: '#857f9e',
}

export function getWarehouseBinColor(item: InventoryItem): string {
  return warehouseStockColors[getStockStatus(item)]
}
