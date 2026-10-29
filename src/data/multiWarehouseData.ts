import type { Bin, InterWarehouseTransfer, InventoryItem, SKU, Warehouse } from '../types'

export const DEMO_WAREHOUSE_DISCLAIMER =
  'Simulated multi-warehouse network data for demonstration purposes. Distances, transit durations, and inventory distribution are deterministic estimates.'

export const networkSkus: SKU[] = [
  {
    id: 'SKU-5820',
    name: 'Ergonomic Smart Desk · Dual Motor (e8c218fb)',
    category: 'Furniture Decor',
    unit: 'unit',
    reorderPoint: 10,
    supplier: 'Mobly Decor / Olist',
    optimizationProfile: {
      weeklyPickFrequency: 210,
      demandClass: 'B',
      dimensionsCm: [140, 70, 75],
      weightKg: 28.0,
      handling: 'oversize',
      affinitySkuIds: ['SKU-2084'],
    },
  },
  {
    id: 'SKU-9999',
    name: 'Solar Hybrid Inverter · 5kW 48V (s99120af)',
    category: 'Industrial Power',
    unit: 'unit',
    reorderPoint: 5,
    supplier: 'Schneider Electric',
    optimizationProfile: {
      weeklyPickFrequency: 15,
      demandClass: 'C',
      dimensionsCm: [65, 45, 25],
      weightKg: 18.5,
      handling: 'fragile',
      affinitySkuIds: [],
    },
  },
]

export const demoWarehouses: Warehouse[] = [
  {
    id: 'WH-HYD-01',
    name: 'Hyderabad Central Warehouse',
    city: 'Hyderabad',
    location: 'Telangana Logistics Park, Shamshabad, Hyderabad',
    type: 'Central Distribution Hub',
    status: 'Active',
    zones: 4,
    capacity: 18400,
    utilization: 78.4,
    totalBins: 144,
    address: 'Plot 42, Aero Logistics SEZ, Shamshabad 501218',
    contactPhone: '+91 40 4821 9900',
    operatingHours: '24/7 Continuous Operations',
    priority: 1,
    estimatedDistanceKm: {
      'WH-HYD-01': 0,
      'WH-VJA-02': 275,
      'WH-CHN-03': 630,
      'WH-BLR-04': 570,
    },
  },
  {
    id: 'WH-VJA-02',
    name: 'Vijayawada Distribution Center',
    city: 'Vijayawada',
    location: 'Gannavaram Logistics Hub, Vijayawada',
    type: 'Distribution Center',
    status: 'Active',
    zones: 3,
    capacity: 8200,
    utilization: 64.2,
    totalBins: 48,
    address: 'NH-16 Logistics Park, Gannavaram, Krishna Dist 521101',
    contactPhone: '+91 866 284 3100',
    operatingHours: '06:00 - 22:00 IST',
    priority: 2,
    estimatedDistanceKm: {
      'WH-HYD-01': 275,
      'WH-VJA-02': 0,
      'WH-CHN-03': 450,
      'WH-BLR-04': 660,
    },
  },
  {
    id: 'WH-CHN-03',
    name: 'Chennai Regional Warehouse',
    city: 'Chennai',
    location: 'Sriperumbudur Industrial Corridor, Chennai',
    type: 'Regional Fulfillment',
    status: 'Active',
    zones: 3,
    capacity: 12000,
    utilization: 71.5,
    totalBins: 72,
    address: 'SIPCOT Industrial Park, Sriperumbudur, Chennai 602105',
    contactPhone: '+91 44 2716 4400',
    operatingHours: '05:00 - 23:00 IST',
    priority: 3,
    estimatedDistanceKm: {
      'WH-HYD-01': 630,
      'WH-VJA-02': 450,
      'WH-CHN-03': 0,
      'WH-BLR-04': 350,
    },
  },
  {
    id: 'WH-BLR-04',
    name: 'Bengaluru Fulfillment Center',
    city: 'Bengaluru',
    location: 'Hosakote Logistics Park, Bengaluru',
    type: 'Urban Fulfillment Center',
    status: 'Active',
    zones: 2,
    capacity: 6500,
    utilization: 55.0,
    totalBins: 36,
    address: 'Auto Component Zone, Hosakote Industrial Area, Bengaluru 562114',
    contactPhone: '+91 80 6192 7800',
    operatingHours: '06:00 - 00:00 IST',
    priority: 4,
    estimatedDistanceKm: {
      'WH-HYD-01': 570,
      'WH-VJA-02': 660,
      'WH-CHN-03': 350,
      'WH-BLR-04': 0,
    },
  },
]

export function getWarehouseDistanceKm(fromId: string, toId: string): number {
  if (fromId === toId) return 0
  const source = demoWarehouses.find((w) => w.id === fromId)
  if (source?.estimatedDistanceKm?.[toId] !== undefined) {
    return source.estimatedDistanceKm[toId]
  }
  const dest = demoWarehouses.find((w) => w.id === toId)
  if (dest?.estimatedDistanceKm?.[fromId] !== undefined) {
    return dest.estimatedDistanceKm[fromId]
  }
  return 500 // fallback default demo distance
}

export function getEstimatedTransitHours(distanceKm: number): number {
  if (distanceKm <= 0) return 0
  // Demo assumption: average commercial freight truck speed ~50 km/h + 1 hr dispatch buffer
  return Math.round((distanceKm / 50 + 1) * 10) / 10
}

/**
 * Generate secondary warehouse bins and inventory deterministically.
 */
export function generateNetworkBinsAndInventory(): {
  bins: Bin[]
  inventory: InventoryItem[]
} {
  const bins: Bin[] = []
  const inventory: InventoryItem[] = []

  // WH-VJA-02: 48 bins across Aisle 1-4, Bay 1-4, Level 1-3
  for (let aisle = 1; aisle <= 4; aisle++) {
    for (let bay = 1; bay <= 4; bay++) {
      for (let level = 1; level <= 3; level++) {
        const zone = aisle <= 2 ? 'A' : aisle === 3 ? 'B' : 'C'
        const binId = `VJA-${zone}-${String(aisle).padStart(2, '0')}-${String(bay).padStart(2, '0')}-L${level}F`
        const isGoldenZone = (zone === 'A' || zone === 'B') && level <= 2

        let skuId = ''
        let quantity = 0
        let reserved = 0
        const capacity = 50

        // Specific demo scenario mapping
        if (aisle === 1 && bay === 1 && level === 1) {
          // SKU-2084: exactly 25 available units in WH-VJA-02
          skuId = 'SKU-2084'
          quantity = 25
          reserved = 0
        } else if (aisle === 1 && bay === 2 && level === 1) {
          // SKU-5820 (Ergonomic Smart Desk): 25 available units in WH-VJA-02
          skuId = 'SKU-5820'
          quantity = 25
          reserved = 0
        } else if (aisle === 2 && bay === 1 && level === 1) {
          // SKU-3401: 14 units, 2 reserved -> 12 available
          skuId = 'SKU-3401'
          quantity = 14
          reserved = 2
        } else if (aisle === 3 && bay === 2 && level === 2) {
          // SKU-0917: 20 units
          skuId = 'SKU-0917'
          quantity = 20
          reserved = 0
        }

        bins.push({
          id: binId,
          warehouseId: 'WH-VJA-02',
          zone,
          skuId,
          quantity,
          capacity,
          status: quantity === 0 ? 'Empty' : quantity <= 10 ? 'Low stock' : 'Healthy',
          x: aisle - 1,
          y: bay - 1,
          aisle,
          bay,
          level,
          face: 'front',
          optimizationConstraints: {
            dimensionsCm: [60, 40, 40],
            maxWeightKg: 30,
            handlingCapabilities: ['standard'],
            certifiedHazards: [],
            goldenZone: isGoldenZone,
            source: 'demo estimate',
          },
        })

        if (skuId) {
          inventory.push({
            skuId,
            binId,
            warehouseId: 'WH-VJA-02',
            quantity,
            reserved,
            updated: 'Today, 10:15',
            capacity,
            reorderPoint: 15,
            available: true,
          })
        }
      }
    }
  }

  // WH-CHN-03: 48 bins
  for (let aisle = 1; aisle <= 4; aisle++) {
    for (let bay = 1; bay <= 4; bay++) {
      for (let level = 1; level <= 3; level++) {
        const zone = aisle <= 2 ? 'A' : aisle === 3 ? 'B' : 'C'
        const binId = `CHN-${zone}-${String(aisle).padStart(2, '0')}-${String(bay).padStart(2, '0')}-L${level}F`
        const isGoldenZone = (zone === 'A' || zone === 'B') && level <= 2

        let skuId = ''
        let quantity = 0
        let reserved = 0
        const capacity = 50

        // Specific demo scenario mapping
        if (aisle === 1 && bay === 1 && level === 1) {
          // SKU-2084: 10 on-hand, 2 reserved -> exactly 8 available in WH-CHN-03
          skuId = 'SKU-2084'
          quantity = 10
          reserved = 2
        } else if (aisle === 1 && bay === 2 && level === 1) {
          // SKU-5820: 10 on hand, 2 reserved -> exactly 8 available
          skuId = 'SKU-5820'
          quantity = 10
          reserved = 2
        } else if (aisle === 2 && bay === 2 && level === 1) {
          // SKU-3401: 15 units available
          skuId = 'SKU-3401'
          quantity = 15
          reserved = 0
        } else if (aisle === 3 && bay === 1 && level === 1) {
          // SKU-0917: 20 units, 5 reserved -> 15 available
          skuId = 'SKU-0917'
          quantity = 20
          reserved = 5
        }

        bins.push({
          id: binId,
          warehouseId: 'WH-CHN-03',
          zone,
          skuId,
          quantity,
          capacity,
          status: quantity === 0 ? 'Empty' : quantity <= 10 ? 'Low stock' : 'Healthy',
          x: aisle - 1,
          y: bay - 1,
          aisle,
          bay,
          level,
          face: 'front',
          optimizationConstraints: {
            dimensionsCm: [60, 40, 40],
            maxWeightKg: 30,
            handlingCapabilities: ['standard'],
            certifiedHazards: [],
            goldenZone: isGoldenZone,
            source: 'demo estimate',
          },
        })

        if (skuId) {
          inventory.push({
            skuId,
            binId,
            warehouseId: 'WH-CHN-03',
            quantity,
            reserved,
            updated: 'Today, 10:20',
            capacity,
            reorderPoint: 15,
            available: true,
          })
        }
      }
    }
  }

  // WH-BLR-04: 36 bins
  for (let aisle = 1; aisle <= 3; aisle++) {
    for (let bay = 1; bay <= 4; bay++) {
      for (let level = 1; level <= 3; level++) {
        const zone = aisle <= 2 ? 'A' : 'B'
        const binId = `BLR-${zone}-${String(aisle).padStart(2, '0')}-${String(bay).padStart(2, '0')}-L${level}F`
        const isGoldenZone = zone === 'A' && level <= 2

        let skuId = ''
        let quantity = 0
        let reserved = 0
        const capacity = 50

        // SKU-2084 and SKU-5820 are NOT in WH-BLR-04 (0 stock)
        if (aisle === 1 && bay === 1 && level === 1) {
          // SKU-1102: 40 on-hand, 5 reserved -> 35 available
          skuId = 'SKU-1102'
          quantity = 40
          reserved = 5
        } else if (aisle === 2 && bay === 1 && level === 1) {
          // SKU-0917: 12 on-hand, 0 reserved -> 12 available
          skuId = 'SKU-0917'
          quantity = 12
          reserved = 0
        }

        bins.push({
          id: binId,
          warehouseId: 'WH-BLR-04',
          zone,
          skuId,
          quantity,
          capacity,
          status: quantity === 0 ? 'Empty' : quantity <= 10 ? 'Low stock' : 'Healthy',
          x: aisle - 1,
          y: bay - 1,
          aisle,
          bay,
          level,
          face: 'front',
          optimizationConstraints: {
            dimensionsCm: [60, 40, 40],
            maxWeightKg: 30,
            handlingCapabilities: ['standard'],
            certifiedHazards: [],
            goldenZone: isGoldenZone,
            source: 'demo estimate',
          },
        })

        if (skuId) {
          inventory.push({
            skuId,
            binId,
            warehouseId: 'WH-BLR-04',
            quantity,
            reserved,
            updated: 'Today, 10:25',
            capacity,
            reorderPoint: 15,
            available: true,
          })
        }
      }
    }
  }

  return { bins, inventory }
}

export const initialInterWarehouseTransfers: InterWarehouseTransfer[] = [
  {
    id: 'TR-2026-001',
    sourceWarehouseId: 'WH-HYD-01',
    destinationWarehouseId: 'WH-BLR-04',
    sourceBinId: 'A-02-03',
    destinationBinId: 'BLR-A-01-02',
    skuId: 'SKU-1102',
    quantity: 10,
    status: 'IN TRANSIT',
    requestedAt: new Date(Date.now() - 3600000 * 8).toISOString(),
    requestedBy: 'Manager',
    approvedAt: new Date(Date.now() - 3600000 * 7).toISOString(),
    approvedBy: 'Jordan Mitchell (Manager)',
    dispatchedAt: new Date(Date.now() - 3600000 * 5).toISOString(),
    dispatchedBy: 'Dispatch Dock HYD-02',
    estimatedHours: 10.0,
    transportDistanceKm: 570,
    history: [
      { status: 'REQUESTED', timestamp: new Date(Date.now() - 3600000 * 8).toISOString(), actor: 'Manager', note: 'Rebalance duvet covers for Bangalore express fulfillment' },
      { status: 'APPROVED', timestamp: new Date(Date.now() - 3600000 * 7).toISOString(), actor: 'Jordan Mitchell', note: 'Approved allocation from Bay A-02' },
      { status: 'DISPATCHED', timestamp: new Date(Date.now() - 3600000 * 5).toISOString(), actor: 'HYD Dispatch', note: 'Handed to Southern Logistics Express Truck #TS09-EB-4102' },
    ],
  },
  {
    id: 'TR-2026-002',
    sourceWarehouseId: 'WH-VJA-02',
    destinationWarehouseId: 'WH-HYD-01',
    sourceBinId: 'VJA-A-01-01',
    destinationBinId: 'C-06-02',
    skuId: 'SKU-2084',
    quantity: 15,
    status: 'REQUESTED',
    requestedAt: new Date(Date.now() - 3600000 * 2).toISOString(),
    requestedBy: 'Analyst Studio',
    estimatedHours: 5.5,
    transportDistanceKm: 275,
    notes: 'Proactive replenishment: high 7-day velocity surge at Central Hub',
    history: [
      { status: 'REQUESTED', timestamp: new Date(Date.now() - 3600000 * 2).toISOString(), actor: 'Analyst Studio', note: 'Automated Pareto rebalancing transfer' },
    ],
  },
]
