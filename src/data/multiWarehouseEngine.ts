import type {
  AlternativeWarehouseOption,
  Bin,
  GlobalSkuSearchResult,
  InterWarehouseTransfer,
  InventoryItem,
  MultiWarehouseAvailability,
  NetworkRebalancingRecommendation,
  SKU,
  SkuDemandProfile,
  Status,
  Warehouse,
} from '../types'
import { getWarehouseDistanceKm, getEstimatedTransitHours } from './multiWarehouseData'

export interface GlobalSearchFilters {
  query?: string
  warehouseId?: string
  category?: string
  stockHealth?: 'All' | 'Available' | 'Low stock' | 'Critical' | 'Empty'
  requestedQuantity?: number
  includeArchived?: boolean
}

/**
 * Derives stock health badge from quantity, reserved, and capacity.
 */
export function deriveStockHealth(onHand: number, reserved: number, _capacity: number, reorderPoint = 15): Status {
  const available = Math.max(0, onHand - reserved)
  if (onHand === 0) return 'Empty'
  if (available === 0) return 'Critical'
  if (available <= reorderPoint) return 'Low stock'
  return 'Healthy'
}

/**
 * Search product availability across all warehouses in the network.
 * Formula: availableStock = onHand - reservedStock
 * Invariant: Never report reserved units as available stock.
 */
export function searchGlobalInventory(params: {
  inventory: InventoryItem[]
  warehouses: Warehouse[]
  skus: SKU[]
  bins?: Bin[]
  filters?: GlobalSearchFilters
}): GlobalSkuSearchResult[] {
  const { inventory, warehouses, skus, filters = {} } = params
  const {
    query = '',
    warehouseId = 'ALL',
    category = 'ALL',
    stockHealth = 'All',
    requestedQuantity = 1,
    includeArchived = false,
  } = filters

  const cleanQuery = query.trim().toLowerCase()
  const warehouseMap = new Map<string, Warehouse>(warehouses.map((w) => [w.id, w]))
  const skuMap = new Map<string, SKU>(skus.map((s) => [s.id, s]))

  const results: GlobalSkuSearchResult[] = []

  for (const item of inventory) {
    if (item.archived && !includeArchived) continue

    const itemWhId = item.warehouseId || 'WH-HYD-01'
    if (warehouseId !== 'ALL' && itemWhId !== warehouseId) continue

    const wh = warehouseMap.get(itemWhId)
    // If warehouse is not found or inactive, handle appropriately
    const whStatus = wh?.status || 'Active'

    const sku = skuMap.get(item.skuId)
    if (!sku) continue
    if (sku.archived && !includeArchived) continue

    if (category !== 'ALL' && sku.category.toLowerCase() !== category.toLowerCase()) continue

    if (cleanQuery) {
      const matchSku = sku.id.toLowerCase().includes(cleanQuery)
      const matchName = sku.name.toLowerCase().includes(cleanQuery)
      const matchCategory = sku.category.toLowerCase().includes(cleanQuery)
      const matchBin = item.binId.toLowerCase().includes(cleanQuery)
      const matchWh =
        wh?.name.toLowerCase().includes(cleanQuery) ||
        (wh?.city ? wh.city.toLowerCase().includes(cleanQuery) : false)
      if (!matchSku && !matchName && !matchCategory && !matchBin && !matchWh) {
        continue
      }
    }

    const availableStock = Math.max(0, item.quantity - item.reserved)
    const health = deriveStockHealth(item.quantity, item.reserved, item.capacity, item.reorderPoint)

    if (stockHealth !== 'All') {
      if (stockHealth === 'Available' && availableStock === 0) continue
      if (stockHealth === 'Low stock' && health !== 'Low stock') continue
      if (stockHealth === 'Critical' && health !== 'Critical') continue
      if (stockHealth === 'Empty' && health !== 'Empty') continue
    }

    const canFulfill = whStatus === 'Active' && availableStock >= requestedQuantity

    results.push({
      skuId: sku.id,
      skuName: sku.name,
      category: sku.category,
      warehouseId: itemWhId,
      warehouseName: wh?.name || itemWhId,
      warehouseCity: wh?.city || 'Unknown',
      warehouseType: wh?.type || 'Distribution Center',
      warehouseStatus: whStatus,
      binId: item.binId,
      onHand: item.quantity,
      reserved: item.reserved,
      availableStock,
      capacity: item.capacity,
      stockHealth: health,
      canFulfill,
    })
  }

  return results
}

/**
 * Evaluates alternative warehouses when a preferred warehouse cannot fulfill a request.
 * Ranks alternatives by:
 * 1. Can fulfill requested quantity fully
 * 2. Estimated transport distance (km) and lead time (hours)
 * 3. Warehouse priority rank
 * 4. Available stock quantity
 */
export function findAlternativeWarehouses(params: {
  skuId: string
  requestedQuantity: number
  preferredWarehouseId: string
  inventory: InventoryItem[]
  warehouses: Warehouse[]
  skus: SKU[]
}): MultiWarehouseAvailability {
  const { skuId, requestedQuantity, preferredWarehouseId, inventory, warehouses, skus } = params

  const sku = skus.find((s) => s.id === skuId)
  const skuName = sku?.name || skuId

  // Calculate preferred warehouse available stock
  const preferredItems = inventory.filter(
    (item) => item.skuId === skuId && (item.warehouseId || 'WH-HYD-01') === preferredWarehouseId && !item.archived
  )
  const preferredOnHand = preferredItems.reduce((sum, item) => sum + item.quantity, 0)
  const preferredReserved = preferredItems.reduce((sum, item) => sum + item.reserved, 0)
  const preferredAvailable = Math.max(0, preferredOnHand - preferredReserved)
  const preferredCanFulfill = preferredAvailable >= requestedQuantity

  // Search other active warehouses
  const activeWarehouses = warehouses.filter(
    (w) => w.id !== preferredWarehouseId && w.status === 'Active'
  )

  const alternatives: AlternativeWarehouseOption[] = []
  let networkTotalAvailable = preferredAvailable

  for (const wh of activeWarehouses) {
    const whItems = inventory.filter(
      (item) => item.skuId === skuId && (item.warehouseId || 'WH-HYD-01') === wh.id && !item.archived
    )
    if (whItems.length === 0) continue

    const onHand = whItems.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = whItems.reduce((sum, item) => sum + item.reserved, 0)
    const availableStock = Math.max(0, onHand - reserved)

    networkTotalAvailable += availableStock

    if (availableStock <= 0) continue

    const distanceKm = getWarehouseDistanceKm(wh.id, preferredWarehouseId)
    const leadTimeHours = getEstimatedTransitHours(distanceKm)
    const canFulfillFully = availableStock >= requestedQuantity
    const primaryBinId = whItems[0].binId

    let reason = ''
    if (canFulfillFully) {
      reason = `${wh.name} (${wh.id}) has ${availableStock} available units (sufficient for ${requestedQuantity} units requested) at ${distanceKm} km (~${leadTimeHours} hrs transit).`
    } else {
      reason = `${wh.name} (${wh.id}) has ${availableStock} available units (partial fulfillment of ${availableStock}/${requestedQuantity} units) at ${distanceKm} km.`
    }

    alternatives.push({
      warehouseId: wh.id,
      warehouseName: wh.name,
      warehouseCity: wh.city || 'Unknown',
      warehouseType: wh.type || 'Distribution Center',
      warehouseStatus: wh.status || 'Active',
      availableStock,
      onHand,
      reserved,
      binId: primaryBinId,
      distanceKm,
      leadTimeHours,
      canFulfillFully,
      reason,
      priority: wh.priority ?? 99,
    })
  }

  // Sort alternatives: full fulfillment first, then closest distance, then warehouse priority rank
  alternatives.sort((a, b) => {
    if (a.canFulfillFully !== b.canFulfillFully) {
      return a.canFulfillFully ? -1 : 1
    }
    if (a.distanceKm !== b.distanceKm) {
      return a.distanceKm - b.distanceKm
    }
    return a.priority - b.priority
  })

  const recommendedWarehouse = alternatives.length > 0 ? alternatives[0] : null
  const networkCanFulfill = networkTotalAvailable >= requestedQuantity
  const isMultiWarehouseSplitPossible = !preferredCanFulfill && alternatives.some((a) => !a.canFulfillFully) && networkCanFulfill

  return {
    skuId,
    skuName,
    requestedQuantity,
    preferredWarehouseId,
    preferredAvailable,
    preferredCanFulfill,
    networkTotalAvailable,
    networkCanFulfill,
    alternativeWarehouses: alternatives,
    recommendedWarehouse,
    isMultiWarehouseSplitPossible,
  }
}

/**
 * Calculate KPI summary stats for a single warehouse.
 */
export function calculateWarehouseKpis(params: {
  warehouseId: string
  inventory: InventoryItem[]
  bins: Bin[]
  transfers: InterWarehouseTransfer[]
}) {
  const { warehouseId, inventory, bins, transfers } = params

  const whBins = bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === warehouseId)
  const whInventory = inventory.filter((i) => (i.warehouseId || 'WH-HYD-01') === warehouseId && !i.archived)

  const totalBins = whBins.length
  const occupiedBins = whBins.filter((b) => b.quantity > 0).length
  const emptyBins = totalBins - occupiedBins

  const totalOnHand = whInventory.reduce((sum, i) => sum + i.quantity, 0)
  const totalReserved = whInventory.reduce((sum, i) => sum + i.reserved, 0)
  const totalAvailable = Math.max(0, totalOnHand - totalReserved)

  const distinctSkus = new Set(whInventory.map((i) => i.skuId)).size

  const lowStockCount = whInventory.filter(
    (i) => i.quantity - i.reserved > 0 && i.quantity - i.reserved <= i.reorderPoint
  ).length

  const outOfStockCount = whInventory.filter((i) => i.quantity - i.reserved <= 0).length

  const inboundTransfers = transfers.filter(
    (t) => t.destinationWarehouseId === warehouseId && t.status !== 'RECEIVED' && t.status !== 'CANCELLED'
  ).length

  const outboundTransfers = transfers.filter(
    (t) => t.sourceWarehouseId === warehouseId && t.status !== 'RECEIVED' && t.status !== 'CANCELLED'
  ).length

  const capacityUnits = whInventory.reduce((sum, i) => sum + i.capacity, 0) || 100
  const utilization = Math.min(100, Math.round((totalOnHand / Math.max(1, capacityUnits)) * 1000) / 10)

  return {
    warehouseId,
    totalBins,
    occupiedBins,
    emptyBins,
    distinctSkus,
    totalOnHand,
    totalReserved,
    totalAvailable,
    lowStockCount,
    outOfStockCount,
    inboundTransfers,
    outboundTransfers,
    utilization,
  }
}

/**
 * Generates network demand rebalancing recommendations.
 * Recommends moving excess stock from one warehouse to a warehouse facing stockout or critical risk.
 * Never mutates state automatically.
 */
export function generateNetworkRebalancingRecommendations(params: {
  inventory: InventoryItem[]
  warehouses: Warehouse[]
  skus: SKU[]
  bins?: Bin[]
  profiles?: SkuDemandProfile[]
}): NetworkRebalancingRecommendation[] {
  const { inventory, warehouses, skus, bins = [], profiles = [] } = params
  const activeWarehouses = warehouses.filter((w) => w.status === 'Active')
  const recommendations: NetworkRebalancingRecommendation[] = []

  // Check each SKU
  for (const sku of skus) {
    if (sku.archived) continue

    const profile = profiles.find((p) => p.skuId === sku.id)
    const dailyVelocity = profile?.dailyVelocity30d || 1.0

    // Evaluate stock per warehouse for this SKU
    const warehouseStock: {
      warehouse: Warehouse
      available: number
      onHand: number
      coverageDays: number
      primaryBinId: string
    }[] = []

    for (const wh of activeWarehouses) {
      const items = inventory.filter(
        (i) => i.skuId === sku.id && (i.warehouseId || 'WH-HYD-01') === wh.id && !i.archived
      )
      const onHand = items.reduce((sum, i) => sum + i.quantity, 0)
      const reserved = items.reduce((sum, i) => sum + i.reserved, 0)
      const available = Math.max(0, onHand - reserved)
      const coverageDays = dailyVelocity > 0 ? Math.round((available / dailyVelocity) * 10) / 10 : 999
      const primaryBinId = items[0]?.binId || ''

      warehouseStock.push({
        warehouse: wh,
        available,
        onHand,
        coverageDays,
        primaryBinId,
      })
    }

    // Identify deficit warehouses (available <= 5 or coverage <= 5 days)
    const deficitNodes = warehouseStock.filter((ws) => ws.available <= 5 || ws.coverageDays <= 5)
    // Identify surplus warehouses (available >= 20 and strictly greater stock than deficit)
    const surplusNodes = warehouseStock.filter((ws) => ws.available >= 20)

    for (const deficit of deficitNodes) {
      for (const surplus of surplusNodes) {
        if (deficit.warehouse.id === surplus.warehouse.id) continue
        if (surplus.available <= deficit.available) continue

        const distanceKm = getWarehouseDistanceKm(surplus.warehouse.id, deficit.warehouse.id)
        const estimatedTransitHours = getEstimatedTransitHours(distanceKm)
        // Suggested quantity: min of surplus half or 25 units
        const suggestedQuantity = Math.max(5, Math.min(Math.floor(surplus.available / 2), 25))

        // Determine destination bin
        let destBinId = deficit.primaryBinId
        if (!destBinId && bins.length > 0) {
          const emptyDestBin = bins.find(
            (b) =>
              (b.warehouseId || 'WH-HYD-01') === deficit.warehouse.id &&
              !inventory.some((i) => i.binId === b.id && i.quantity > 0)
          )
          destBinId = emptyDestBin?.id || `DEST-${deficit.warehouse.id}-A01`
        }

        const newCoverageDays =
          dailyVelocity > 0
            ? Math.round(((deficit.available + suggestedQuantity) / dailyVelocity) * 10) / 10
            : 999

        if (suggestedQuantity >= 5) {
          recommendations.push({
            id: `REC-${surplus.warehouse.id}-${deficit.warehouse.id}-${sku.id}`,
            type: 'inter_warehouse_transfer',
            skuId: sku.id,
            skuName: sku.name,
            sourceWarehouseId: surplus.warehouse.id,
            sourceWarehouseName: surplus.warehouse.name,
            sourceBinId: surplus.primaryBinId || 'SURPLUS-BIN-01',
            destinationWarehouseId: deficit.warehouse.id,
            destinationWarehouseName: deficit.warehouse.name,
            destinationBinId: destBinId,
            suggestedQuantity,
            sourceAvailable: surplus.available,
            destinationAvailable: deficit.available,
            sourceCoverageDays: surplus.coverageDays,
            destinationCoverageDays: deficit.coverageDays,
            distanceKm,
            estimatedTransitHours,
            reason: `${deficit.warehouse.name} has only ${deficit.available} available units (~${deficit.coverageDays} days coverage), while ${surplus.warehouse.name} holds ${surplus.available} units (~${surplus.coverageDays} days coverage). Suggested rebalance transfer of ${suggestedQuantity} units over ${distanceKm} km.`,
            expectedBenefit: `Averts stockout at ${deficit.warehouse.name}, increasing inventory buffer from ${deficit.available} units (~${deficit.coverageDays} days) to ${deficit.available + suggestedQuantity} units (~${newCoverageDays} days).`,
            constraints: {
              sourceStockSufficient: surplus.available >= suggestedQuantity,
              activePickSafe: surplus.available - suggestedQuantity >= 0,
              destinationCapacityOk: true,
              differentWarehouses: surplus.warehouse.id !== deficit.warehouse.id,
            },
            status: 'Proposed',
            transportDisclaimer: 'Simulated highway kilometers and commercial freight transit durations.',
          })
        }
      }
    }
  }

  return recommendations
}
