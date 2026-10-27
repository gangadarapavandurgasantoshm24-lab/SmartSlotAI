import type { Bin, InventoryItem, SKU, Status } from '../types'

export type InventoryStockStatus = Extract<Status, 'Unavailable' | 'Empty' | 'Low stock' | 'Healthy'>

export function getStockStatus(item: InventoryItem): InventoryStockStatus {
  if (!item.available) return 'Unavailable'
  if (item.quantity <= 0) return 'Empty'
  if (item.quantity <= item.reorderPoint) return 'Low stock'
  return 'Healthy'
}

export function getAvailableQuantity(item: InventoryItem): number {
  return Math.max(0, item.quantity - item.reserved)
}

export function searchWarehouseBins(query: string, bins: Bin[], inventory: InventoryItem[], skus: SKU[], limit = 8): Bin[] {
  const term = query.trim().toLowerCase()
  if (!term) return []
  const stockByBin = new Map(inventory.map((item) => [item.binId, item]))
  return bins.filter((bin) => {
    const sku = skus.find((entry) => entry.id === stockByBin.get(bin.id)?.skuId)
    return bin.id.toLowerCase().includes(term) || sku?.id.toLowerCase().includes(term) || sku?.name.toLowerCase().includes(term)
  }).slice(0, limit)
}
