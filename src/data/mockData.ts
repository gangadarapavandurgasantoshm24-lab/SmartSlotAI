import type { Bin, InventoryItem, OptimizationResult, PickOrder, PickingTask, SKU, SupplierRequest, Warehouse } from '../types'

export const warehouses: Warehouse[] = [{ id: 'WH-01', name: 'Brazilian E-Commerce Fulfillment Hub', location: 'São Paulo Logistics DC', zones: 4, capacity: 18400, utilization: 78.4 }]
export const skus: SKU[] = [
  { id: 'SKU-2084', name: 'Furniture Decor · Luminary (aca2eb7d)', category: 'Furniture Decor', unit: 'box', reorderPoint: 60, supplier: 'Mobly Decor / Olist', optimizationProfile: { weeklyPickFrequency: 527, demandClass: 'A', dimensionsCm: [30, 25, 15], weightKg: 0.5, handling: 'standard', affinitySkuIds: ['SKU-1102', 'SKU-3401'] } },
  { id: 'SKU-1102', name: 'Bed Bath Table · Duvet Set (99a4788c)', category: 'Bed Bath Table', unit: 'roll', reorderPoint: 30, supplier: 'Santista / Olist', optimizationProfile: { weeklyPickFrequency: 488, demandClass: 'A', dimensionsCm: [34, 29, 16], weightKg: 0.8, handling: 'standard', affinitySkuIds: ['SKU-2084', 'SKU-3401'] } },
  { id: 'SKU-3401', name: 'Garden Tools · Trimmer Cart (422879e1)', category: 'Garden Tools', unit: 'case', reorderPoint: 18, supplier: 'Tramontina / Olist', optimizationProfile: { weeklyPickFrequency: 484, demandClass: 'B', dimensionsCm: [80, 30, 25], weightKg: 0.7, handling: 'oversize', affinitySkuIds: ['SKU-2084', 'SKU-1102'] } },
  { id: 'SKU-0917', name: 'Computers · Fast USB Hub (d1c42706)', category: 'Computers & Accessories', unit: 'roll', reorderPoint: 16, supplier: 'Multilaser / Olist', optimizationProfile: { weeklyPickFrequency: 343, demandClass: 'C', dimensionsCm: [50, 30, 35], weightKg: 2.1, handling: 'standard', affinitySkuIds: ['SKU-3401'] } },
]
export const bins: Bin[] = [
  { id: 'A-01-01', zone: 'A', skuId: 'SKU-2084', quantity: 46, capacity: 72, status: 'Healthy', x: 0, y: 0, aisle: 1, bay: 1, level: 1, face: 'front' },
  { id: 'A-02-03', zone: 'A', skuId: 'SKU-1102', quantity: 12, capacity: 54, status: 'Low stock', x: 1, y: 0, aisle: 2, bay: 3, level: 1, face: 'front' },
  { id: 'B-04-01', zone: 'B', skuId: 'SKU-2084', quantity: 8, capacity: 72, status: 'Critical', x: 2, y: 1, aisle: 4, bay: 1, level: 1, face: 'front' },
  { id: 'C-06-02', zone: 'C', skuId: 'SKU-2084', quantity: 12, capacity: 300, status: 'Healthy', x: 3, y: 1, aisle: 6, bay: 2, level: 2, face: 'front' },
  { id: 'D-02-04', zone: 'D', skuId: 'SKU-0917', quantity: 19, capacity: 36, status: 'Healthy', x: 4, y: 0, aisle: 2, bay: 4, level: 1, face: 'front' },
  { id: 'E-01-02', zone: 'E', skuId: 'SKU-1102', quantity: 0, capacity: 54, status: 'Critical', x: 5, y: 1, aisle: 1, bay: 2, level: 1, face: 'front' },
]
const stockLocations = bins.map((bin) => ({ ...bin }))
const reserved = [4, 2, 3, 6, 0, 0]
const stockSeed = stockLocations.map((bin, index) => ({ bin, quantity: bin.quantity, capacity: bin.capacity, reorderPoint: skus.find((sku) => sku.id === bin.skuId)?.reorderPoint ?? 20, reserved: reserved[index] ?? 0 }))
for (let aisle = 1; aisle <= 6; aisle += 1) {
  for (let bay = 1; bay <= 6; bay += 1) {
    for (let level = 1; level <= 3; level += 1) {
      for (const face of ['front', 'back'] as const) {
        if (stockLocations.some((bin) => bin.aisle === aisle && bin.bay === bay && bin.level === level && bin.face === face)) continue
        const zone = aisle <= 2 ? 'A' : aisle <= 4 ? 'B' : aisle === 5 ? 'C' : 'D'
        const sku = skus[(aisle * 3 + bay + level + (face === 'back' ? 1 : 0)) % skus.length]
        const quantity = ((aisle * 17 + bay * 13 + level * 7 + (face === 'back' ? 5 : 0)) % 58)
        const id = `${zone}-${String(aisle).padStart(2, '0')}-${String(bay).padStart(2, '0')}-L${level}${face === 'front' ? 'F' : 'B'}`
        stockLocations.push({ id, zone, skuId: sku.id, quantity, capacity: 48, status: 'Healthy', x: aisle - 1, y: bay - 1, aisle, bay, level, face })
        stockSeed.push({ bin: stockLocations[stockLocations.length - 1], quantity, capacity: 48, reorderPoint: sku.reorderPoint, reserved: Math.min(quantity, (aisle + bay + level) % 5) })
      }
    }
  }
}
export const warehouseBins = stockLocations
// Warehouse geometry and SKU handling measurements are demo estimates, not WMS measurements.
const demoOptimizationTargets: Record<string, string> = { 'A-01-06-L1F': 'SKU-2084', 'A-02-06-L1F': 'SKU-1102', 'B-04-06-L1F': 'SKU-0917', 'D-06-06-L1F': 'SKU-3401' }
for (const [binId, skuId] of Object.entries(demoOptimizationTargets)) {
  const demoSlot = stockLocations.find((bin) => bin.id === binId)
  const demoSeed = stockSeed.find((entry) => entry.bin.id === binId)
  if (!demoSlot || !demoSeed) continue
  demoSlot.skuId = skuId
  demoSlot.quantity = 0
  demoSeed.quantity = 0
  demoSeed.bin = demoSlot
}
for (const bin of warehouseBins) {
  const oversizeBay = bin.aisle === 6 && bin.bay === 6
  const heavyBay = bin.aisle === 4 || bin.aisle === 6
  if (oversizeBay) {
    bin.capacity = 120
    const seed = stockSeed.find((entry) => entry.bin.id === bin.id)
    if (seed) seed.capacity = 120
  }
  bin.optimizationConstraints = { dimensionsCm: oversizeBay ? [300, 200, 200] : [60, 40, 40], maxWeightKg: oversizeBay ? 250 : heavyBay ? 50 : 25, handlingCapabilities: oversizeBay ? ['oversize'] : ['standard'], certifiedHazards: [], goldenZone: (bin.zone === 'A' || bin.zone === 'B') && (bin.level ?? 1) <= 2, source: 'demo estimate' }
}
export const inventory: InventoryItem[] = stockSeed.map(({ bin, quantity, capacity, reorderPoint, reserved: held }) => ({ skuId: bin.skuId, binId: bin.id, quantity, reserved: bin.id === 'C-06-02' ? 0 : held, updated: 'Today, 09:42', capacity, reorderPoint: bin.id === 'C-06-02' ? 10 : reorderPoint, available: !(bin.aisle === 6 && bin.bay === 6 && bin.level === 3 && bin.face === 'back') }))
export const pickingTasks: PickingTask[] = [
  { id: 'PK-3892', priority: 'High', status: 'In progress', items: 8, stops: 4, picker: 'Alex Morgan', due: '10:30 AM' },
  { id: 'PK-3891', priority: 'Normal', status: 'Ready', items: 12, stops: 6, picker: 'Unassigned', due: '11:00 AM' },
  { id: 'PK-3889', priority: 'Normal', status: 'Ready', items: 5, stops: 3, picker: 'Unassigned', due: '11:15 AM' },
]
const cartonStock = inventory.find((item) => item.skuId === 'SKU-3401' && item.available && item.quantity - item.reserved >= 3)
export const activePickOrder: PickOrder = {
  id: 'PK-3922', priority: 'High', status: 'Ready', picker: 'Alex Morgan', assignedTo: 'P-07', due: '10:30 AM', currentStopIndex: 0,
  lines: [
    { id: 'PK-3922-L1', skuId: 'SKU-2084', binId: 'C-06-02', requested: 5, picked: 0 },
    { id: 'PK-3922-L2', skuId: 'SKU-1102', binId: 'A-02-03', requested: 4, picked: 0 },
    { id: 'PK-3922-L3', skuId: 'SKU-3401', binId: cartonStock?.binId ?? 'A-01-01', requested: 3, picked: 0 },
    { id: 'PK-3922-L4', skuId: 'SKU-0917', binId: 'D-02-04', requested: 2, picked: 0 },
  ],
}
export const supplierRequests: SupplierRequest[] = [
  { id: 'PO-2024-089', supplier: 'Medline Industries', sku: 'Nitrile gloves · Size M', quantity: 240, eta: 'Today, 2:30 PM', status: 'In transit', value: '$3,840' },
  { id: 'PO-2024-088', supplier: 'Avery Dennison', sku: 'Thermal labels · 4 × 6 in', quantity: 120, eta: 'Oct 29, 2026', status: 'Pending', value: '$1,260' },
  { id: 'PO-2024-086', supplier: 'Uline', sku: 'Shipping carton · 12 × 10', quantity: 96, eta: 'Oct 30, 2026', status: 'Approved', value: '$2,110' },
  { id: 'PO-2024-084', supplier: 'Berry Global', sku: 'Pallet wrap · Clear 18 in', quantity: 60, eta: 'Oct 31, 2026', status: 'At risk', value: '$975' },
]
export const optimizationResults: OptimizationResult[] = [
  { id: 'OPT-014', title: 'Fast movers to forward pick', moves: 18, travelSaved: '3h 12m / day', efficiency: 83.6, status: 'Approved' },
  { id: 'OPT-013', title: 'Consolidate packaging zone', moves: 12, travelSaved: '1h 48m / day', efficiency: 76.2, status: 'Pending' },
]
