import type {
  AnalyticsFilterState,
  AnalyticsKpiSummary,
  Bin,
  CategoryAnalyticsDistribution,
  CrossWarehouseShortageItem,
  InterWarehouseTransfer,
  InventoryItem,
  MultiStopOptimizationResult,
  ReplenishmentRequest,
  SaleEvent,
  SKU,
  StockMovement,
  StorageZoneOccupancy,
  TransferDiscrepancyRecord,
  Warehouse,
  WarehouseAnalyticsBreakdown,
} from '../types'
import { getStockStatus } from './inventoryUtils'
import { getIncomingQuantity } from './replenishmentUtils'
import { getWarehouseDistanceKm, getEstimatedTransitHours } from './multiWarehouseData'
import { calculateSkuDemandProfiles } from './demandIntelligenceEngine'

export const DEMO_ANALYTICS_DISCLAIMER =
  'Simulated Multi-Warehouse Telemetry: Inventory levels, inter-warehouse movements, and freight metrics are derived from shared demo application state.'

export const DEFAULT_ANALYTICS_FILTERS: AnalyticsFilterState = {
  dateRange: '30d',
  warehouseId: 'all',
  city: 'all',
  skuId: '',
  category: 'all',
  stockStatus: 'all',
  transferStatus: 'all',
}

export interface NetworkAnalyticsCalculationParams {
  warehouses: Warehouse[]
  inventory: InventoryItem[]
  bins: Bin[]
  skus: SKU[]
  transfers: InterWarehouseTransfer[]
  replenishmentRequests: ReplenishmentRequest[]
  movements: StockMovement[]
  sales?: SaleEvent[]
  activeRoutePreview?: MultiStopOptimizationResult | null
  filters?: Partial<AnalyticsFilterState>
  referenceDate?: Date
}

/**
 * Filter inventory items based on multi-dimensional analytics filter state.
 */
export function filterInventoryRecords(
  inventory: InventoryItem[],
  skus: SKU[],
  warehouses: Warehouse[],
  filters: Partial<AnalyticsFilterState>
): InventoryItem[] {
  const f = { ...DEFAULT_ANALYTICS_FILTERS, ...filters }

  return inventory.filter((item) => {
    if (item.archived) return false

    const itemWhId = item.warehouseId || 'WH-HYD-01'

    // Warehouse filter
    if (f.warehouseId !== 'all' && itemWhId !== f.warehouseId) {
      return false
    }

    // City filter
    if (f.city !== 'all') {
      const wh = warehouses.find((w) => w.id === itemWhId)
      if (!wh || wh.city?.toLowerCase() !== f.city.toLowerCase()) {
        return false
      }
    }

    // SKU filter
    if (f.skuId.trim() && item.skuId.toLowerCase() !== f.skuId.trim().toLowerCase()) {
      return false
    }

    // Category filter
    if (f.category !== 'all') {
      const sku = skus.find((s) => s.id === item.skuId)
      if (!sku || sku.category.toLowerCase() !== f.category.toLowerCase()) {
        return false
      }
    }

    // Stock Status filter
    if (f.stockStatus !== 'all') {
      const status = getStockStatus(item)
      const mappedStatus =
        status === 'Healthy'
          ? 'healthy'
          : status === 'Low stock'
          ? 'low_stock'
          : status === 'Empty'
          ? 'empty'
          : 'critical'
      if (mappedStatus !== f.stockStatus) {
        return false
      }
    }

    return true
  })
}

/**
 * Calculates high-level network KPIs with strict separation between physical on-hand stock and pipeline.
 *
 * CRITICAL INVARIANT:
 * On-hand = Available + Reserved.
 * In-Transit and Pipeline stock are strictly tracked separately and NEVER added to physical inventory.
 */
export function calculateNetworkOverviewKpis(
  params: NetworkAnalyticsCalculationParams
): AnalyticsKpiSummary {
  const { warehouses, inventory, bins, skus, transfers, replenishmentRequests, filters } = params
  const filteredInv = filterInventoryRecords(inventory, skus, warehouses, filters || {})

  const totalOnHandUnits = filteredInv.reduce((sum, item) => sum + item.quantity, 0)
  const totalReservedUnits = filteredInv.reduce(
    (sum, item) => sum + Math.min(item.quantity, Math.max(0, item.reserved || 0)),
    0
  )
  const totalAvailableUnits = filteredInv.reduce(
    (sum, item) =>
      sum + Math.max(0, item.quantity - Math.min(item.quantity, Math.max(0, item.reserved || 0))),
    0
  )

  // In-Transit Transfers destined to or originating from filtered scope
  const activeTransfers = transfers.filter((t) => {
    const isDestMatch =
      !filters?.warehouseId ||
      filters.warehouseId === 'all' ||
      t.destinationWarehouseId === filters.warehouseId
    const isInTransit = ['IN TRANSIT', 'DISPATCHED'].includes(t.status?.toUpperCase()?.trim())
    return isDestMatch && isInTransit
  })
  const transferInTransitUnits = activeTransfers.reduce((sum, t) => sum + t.quantity, 0)

  // In-Flight Supplier Replenishments
  const activePOs = replenishmentRequests.filter((r) => {
    const isWhMatch =
      !filters?.warehouseId ||
      filters.warehouseId === 'all' ||
      (r.warehouseId || 'WH-HYD-01') === filters.warehouseId
    const isInTransit = ['In transit', 'Confirmed full', 'Partial offer', 'Delayed'].includes(r.status)
    return isWhMatch && isInTransit
  })
  const poInTransitUnits = activePOs.reduce((sum, r) => sum + getIncomingQuantity(r), 0)

  const totalInTransitUnits = transferInTransitUnits + poInTransitUnits
  const totalPipelineUnits = totalInTransitUnits

  // Distinct SKUs
  const distinctSkuIds = new Set(filteredInv.map((i) => i.skuId))
  const distinctSkuCount = distinctSkuIds.size

  // Active Warehouses
  const activeWarehouses = warehouses.filter((w) => w.status === 'Active')
  const activeWarehouseCount =
    filters?.warehouseId && filters.warehouseId !== 'all' ? 1 : activeWarehouses.length

  // Low Stock SKUs
  const lowStockSkuIds = new Set<string>()
  for (const item of filteredInv) {
    const status = getStockStatus(item)
    if (status === 'Low stock' || status === 'Empty' || status === 'Unavailable') {
      lowStockSkuIds.add(item.skuId)
    }
  }
  const lowStockSkuCount = lowStockSkuIds.size

  // Network-wide Stockout Risks: SKUs with 0 available stock across the ENTIRE network
  const networkSkuMap = new Map<string, number>()
  for (const item of inventory) {
    if (item.archived) continue
    const curr = networkSkuMap.get(item.skuId) || 0
    networkSkuMap.set(item.skuId, curr + Math.max(0, item.quantity - (item.reserved || 0)))
  }

  let networkStockoutRiskSkuCount = 0
  for (const sku of skus) {
    if (sku.archived) continue
    const totalAvail = networkSkuMap.get(sku.id) ?? 0
    if (totalAvail === 0 || totalAvail <= (sku.reorderPoint || 10)) {
      networkStockoutRiskSkuCount++
    }
  }

  // Capacity calculations
  const filteredBins = bins.filter((b) => {
    if (!filters?.warehouseId || filters.warehouseId === 'all') return true
    return (b.warehouseId || 'WH-HYD-01') === filters.warehouseId
  })
  const totalCapacityUnits = filteredBins.reduce((sum, b) => sum + (b.capacity || 48), 0)
  const averageCapacityUtilization =
    totalCapacityUnits > 0
      ? Math.round((totalOnHandUnits / totalCapacityUnits) * 1000) / 10
      : 0

  // Total Discrepancies
  const transferDiscrepancies = transfers.filter(
    (t) => t.discrepancyDetails !== undefined || (t.receivedQuantity !== undefined && t.receivedQuantity < t.quantity)
  ).length

  const receiptDiscrepancies = replenishmentRequests.reduce((sum, r) => {
    return sum + r.receipts.filter((rc) => rc.rejected > 0).length
  }, 0)

  return {
    totalOnHandUnits,
    totalReservedUnits,
    totalAvailableUnits,
    totalInTransitUnits,
    totalPipelineUnits,
    distinctSkuCount,
    activeWarehouseCount,
    lowStockSkuCount,
    networkStockoutRiskSkuCount,
    averageCapacityUtilization,
    totalCapacityUnits,
    activeTransferCount: transfers.filter((t) => t.status !== 'RECEIVED' && t.status !== 'CANCELLED').length,
    activeReplenishmentCount: replenishmentRequests.filter((r) => r.status !== 'Completed' && r.status !== 'Cancelled').length,
    totalDiscrepancyCount: transferDiscrepancies + receiptDiscrepancies,
  }
}

/**
 * Calculates per-warehouse analytics breakdown including capacity, occupancy, and zones.
 */
export function calculateWarehouseBreakdowns(
  params: NetworkAnalyticsCalculationParams
): WarehouseAnalyticsBreakdown[] {
  const { warehouses, inventory, bins, transfers, filters } = params

  return warehouses.map((wh) => {
    const whInventory = inventory.filter(
      (i) => (i.warehouseId || 'WH-HYD-01') === wh.id && !i.archived
    )
    const whBins = bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === wh.id)

    const onHandUnits = whInventory.reduce((s, i) => s + i.quantity, 0)
    const reservedUnits = whInventory.reduce(
      (s, i) => s + Math.min(i.quantity, Math.max(0, i.reserved || 0)),
      0
    )
    const availableUnits = Math.max(0, onHandUnits - reservedUnits)

    // In-transit incoming & outgoing
    const inTransitIncomingUnits = transfers
      .filter((t) => t.destinationWarehouseId === wh.id && ['IN TRANSIT', 'DISPATCHED'].includes(t.status?.toUpperCase()?.trim()))
      .reduce((s, t) => s + t.quantity, 0)

    const inTransitOutgoingUnits = transfers
      .filter((t) => t.sourceWarehouseId === wh.id && ['IN TRANSIT', 'DISPATCHED'].includes(t.status?.toUpperCase()?.trim()))
      .reduce((s, t) => s + t.quantity, 0)

    const distinctSkuCount = new Set(whInventory.map((i) => i.skuId)).size
    const totalBins = whBins.length
    const occupiedBins = whBins.filter((b) => {
      const stock = whInventory.find((i) => i.binId === b.id)
      return (stock && stock.quantity > 0) || b.quantity > 0
    }).length
    const vacantBins = Math.max(0, totalBins - occupiedBins)

    const totalCapacityUnits = whBins.reduce((s, b) => s + (b.capacity || 48), 0)
    const capacityUtilizationPct =
      totalCapacityUnits > 0
        ? Math.round((onHandUnits / totalCapacityUnits) * 1000) / 10
        : 0

    // Zone Occupancy Breakdown
    const zoneMap = new Map<string, { total: number; occupied: number; onHand: number; isGolden: boolean }>()
    for (const bin of whBins) {
      const z = bin.zone || 'A'
      const isGZ =
        bin.optimizationConstraints?.goldenZone ??
        ((z === 'A' || z === 'B') && (bin.level === 1 || bin.level === 2))
      const curr = zoneMap.get(z) || { total: 0, occupied: 0, onHand: 0, isGolden: isGZ }
      curr.total++
      const stock = whInventory.find((i) => i.binId === bin.id)
      if ((stock && stock.quantity > 0) || bin.quantity > 0) {
        curr.occupied++
        curr.onHand += stock?.quantity || bin.quantity || 0
      }
      zoneMap.set(z, curr)
    }

    const zoneBreakdown: StorageZoneOccupancy[] = Array.from(zoneMap.entries())
      .map(([zone, data]) => ({
        zone,
        totalBins: data.total,
        occupiedBins: data.occupied,
        occupancyPct: data.total > 0 ? Math.round((data.occupied / data.total) * 1000) / 10 : 0,
        onHandUnits: data.onHand,
        isGoldenZone: data.isGolden,
      }))
      .sort((a, b) => a.zone.localeCompare(b.zone))

    const lowStockCount = whInventory.filter((i) => getStockStatus(i) === 'Low stock').length
    const criticalCount = whInventory.filter(
      (i) => getStockStatus(i) === 'Empty' || getStockStatus(i) === 'Unavailable'
    ).length

    return {
      warehouseId: wh.id,
      warehouseName: wh.name,
      city: wh.city || wh.location,
      location: wh.location,
      status: wh.status || 'Active',
      onHandUnits,
      reservedUnits,
      availableUnits,
      inTransitIncomingUnits,
      inTransitOutgoingUnits,
      distinctSkuCount,
      totalBins,
      occupiedBins,
      vacantBins,
      totalCapacityUnits,
      capacityUtilizationPct,
      zoneBreakdown,
      lowStockCount,
      criticalCount,
    }
  }).filter((wh) => {
    if (!filters?.warehouseId || filters.warehouseId === 'all') return true
    return wh.warehouseId === filters.warehouseId
  })
}

/**
 * Calculates category distribution comparing on-hand, available, and reserved quantities.
 */
export function calculateCategoryDistributions(
  params: NetworkAnalyticsCalculationParams
): CategoryAnalyticsDistribution[] {
  const { inventory, skus, transfers, filters, sales, movements, bins, warehouses, referenceDate } = params
  const filteredInv = filterInventoryRecords(inventory, skus, warehouses, filters || {})

  const totalNetworkOnHand = filteredInv.reduce((s, i) => s + i.quantity, 0)

  // Compute ABC classes from demand profiles
  const profiles = calculateSkuDemandProfiles({
    skus,
    inventory,
    bins,
    sales,
    movements,
    referenceDate,
  })
  const skuClassMap = new Map<string, 'A' | 'B' | 'C'>()
  for (const p of profiles) {
    skuClassMap.set(p.skuId, p.paretoClass)
  }

  // Active in-transit transfers map by SKU
  const skuInTransitMap = new Map<string, number>()
  for (const t of transfers) {
    if (['IN TRANSIT', 'DISPATCHED'].includes(t.status?.toUpperCase()?.trim())) {
      const curr = skuInTransitMap.get(t.skuId) || 0
      skuInTransitMap.set(t.skuId, curr + t.quantity)
    }
  }

  const categoryMap = new Map<
    string,
    {
      onHand: number
      reserved: number
      available: number
      inTransit: number
      skuIds: Set<string>
      lowStockCount: number
      classA: number
      classB: number
      classC: number
    }
  >()

  for (const item of filteredInv) {
    const sku = skus.find((s) => s.id === item.skuId)
    const cat = sku?.category || 'General'

    const curr = categoryMap.get(cat) || {
      onHand: 0,
      reserved: 0,
      available: 0,
      inTransit: 0,
      skuIds: new Set<string>(),
      lowStockCount: 0,
      classA: 0,
      classB: 0,
      classC: 0,
    }

    const effReserved = Math.min(item.quantity, Math.max(0, item.reserved || 0))
    const effAvailable = Math.max(0, item.quantity - effReserved)
    curr.onHand += item.quantity
    curr.reserved += effReserved
    curr.available += effAvailable
    curr.inTransit += skuInTransitMap.get(item.skuId) || 0
    curr.skuIds.add(item.skuId)

    const status = getStockStatus(item)
    if (status === 'Low stock' || status === 'Empty' || status === 'Unavailable') {
      curr.lowStockCount++
    }

    categoryMap.set(cat, curr)
  }

  // Count Pareto classes per category
  for (const [, data] of categoryMap.entries()) {
    for (const skuId of data.skuIds) {
      const pareto = skuClassMap.get(skuId) || 'B'
      if (pareto === 'A') data.classA++
      else if (pareto === 'C') data.classC++
      else data.classB++
    }
  }

  return Array.from(categoryMap.entries())
    .map(([categoryName, data]) => ({
      categoryName,
      onHandUnits: data.onHand,
      availableUnits: data.available,
      reservedUnits: data.reserved,
      inTransitUnits: data.inTransit,
      distinctSkuCount: data.skuIds.size,
      shareOfTotalUnitsPct:
        totalNetworkOnHand > 0
          ? Math.round((data.onHand / totalNetworkOnHand) * 1000) / 10
          : 0,
      lowStockCount: data.lowStockCount,
      classACount: data.classA,
      classBCount: data.classB,
      classCCount: data.classC,
    }))
    .sort((a, b) => b.onHandUnits - a.onHandUnits)
}

/**
 * Identifies products that are unavailable or low at the target warehouse, but available in sister facilities.
 */
export function calculateCrossWarehouseAvailability(
  params: NetworkAnalyticsCalculationParams,
  targetWarehouseId?: string
): CrossWarehouseShortageItem[] {
  const { warehouses, inventory, skus } = params
  const targetWhId = targetWarehouseId || params.filters?.warehouseId || 'WH-HYD-01'
  const effectiveWhId = targetWhId === 'all' ? 'WH-BLR-04' : targetWhId

  const targetWh = warehouses.find((w) => w.id === effectiveWhId) || warehouses[0]
  const otherWarehouses = warehouses.filter((w) => w.id !== effectiveWhId && w.status === 'Active')

  const results: CrossWarehouseShortageItem[] = []

  for (const sku of skus) {
    if (sku.archived) continue

    const targetItems = inventory.filter(
      (i) => (i.warehouseId || 'WH-HYD-01') === effectiveWhId && i.skuId === sku.id && !i.archived
    )
    const targetOnHand = targetItems.reduce((s, i) => s + i.quantity, 0)
    const targetReserved = targetItems.reduce((s, i) => s + (i.reserved || 0), 0)
    const targetAvailable = Math.max(0, targetOnHand - targetReserved)
    const reorderPoint = sku.reorderPoint || 15

    // Shortage check at target warehouse
    const hasShortageAtTarget = targetAvailable <= reorderPoint

    // Check availability across other sister facilities
    const alternatives: CrossWarehouseShortageItem['alternativeWarehouses'] = []

    let totalNetworkAvailableStock = targetAvailable

    for (const altWh of otherWarehouses) {
      const altItems = inventory.filter(
        (i) => (i.warehouseId || 'WH-HYD-01') === altWh.id && i.skuId === sku.id && !i.archived
      )
      const altOnHand = altItems.reduce((s, i) => s + i.quantity, 0)
      const altReserved = altItems.reduce((s, i) => s + (i.reserved || 0), 0)
      const altAvailable = Math.max(0, altOnHand - altReserved)
      totalNetworkAvailableStock += altAvailable

      if (altAvailable > 0) {
        const distKm = getWarehouseDistanceKm(altWh.id, effectiveWhId)
        const transitHours = getEstimatedTransitHours(distKm)
        const surplusAboveThreshold = Math.max(0, altAvailable - Math.ceil(reorderPoint * 0.75))

        alternatives.push({
          warehouseId: altWh.id,
          warehouseName: altWh.name,
          city: altWh.city || altWh.location,
          availableStock: altAvailable,
          surplusAboveThreshold,
          distanceKm: distKm,
          estimatedTransitHours: transitHours,
        })
      }
    }

    if (hasShortageAtTarget && alternatives.length > 0) {
      // Sort alternatives by distance ascending (prefer closest facility)
      alternatives.sort((a, b) => a.distanceKm - b.distanceKm)

      results.push({
        skuId: sku.id,
        skuName: sku.name,
        category: sku.category,
        targetWarehouseId: effectiveWhId,
        targetWarehouseName: targetWh.name,
        targetAvailableStock: targetAvailable,
        targetReorderPoint: reorderPoint,
        totalNetworkAvailableStock,
        alternativeWarehouses: alternatives,
        bestAlternative: alternatives[0],
      })
    }
  }

  return results.sort((a, b) => a.targetAvailableStock - b.targetAvailableStock)
}

/**
 * Extracts and categorizes all pending transfers, POs, and audit discrepancies.
 */
export function calculatePipelineAndDiscrepancies(params: NetworkAnalyticsCalculationParams): {
  pendingTransfers: InterWarehouseTransfer[]
  pendingReplenishments: ReplenishmentRequest[]
  discrepancies: TransferDiscrepancyRecord[]
} {
  const { transfers, replenishmentRequests, skus } = params

  const pendingTransfers = transfers.filter(
    (t) => t.status !== 'RECEIVED' && t.status !== 'CANCELLED'
  )

  const pendingReplenishments = replenishmentRequests.filter(
    (r) => r.status !== 'Completed' && r.status !== 'Cancelled'
  )

  const discrepancies: TransferDiscrepancyRecord[] = []

  // Transfer discrepancies
  for (const t of transfers) {
    if (t.discrepancyDetails) {
      const d = t.discrepancyDetails
      const sku = skus.find((s) => s.id === t.skuId)
      discrepancies.push({
        id: `DISC-TR-${t.id}`,
        type: 'transfer',
        referenceId: t.id,
        skuId: t.skuId,
        skuName: sku?.name,
        sourceWarehouseId: t.sourceWarehouseId,
        destinationWarehouseId: t.destinationWarehouseId,
        deliveredOrExpected: d.expectedQuantity,
        acceptedOrReceived: d.actualReceivedQuantity,
        discrepancyQuantity: Math.abs(d.expectedQuantity - d.actualReceivedQuantity),
        reason: d.reason,
        timestamp: t.receivedAt || new Date().toISOString(),
      })
    } else if (t.receivedQuantity !== undefined && t.receivedQuantity < t.quantity) {
      const sku = skus.find((s) => s.id === t.skuId)
      discrepancies.push({
        id: `DISC-TR-${t.id}`,
        type: 'transfer',
        referenceId: t.id,
        skuId: t.skuId,
        skuName: sku?.name,
        sourceWarehouseId: t.sourceWarehouseId,
        destinationWarehouseId: t.destinationWarehouseId,
        deliveredOrExpected: t.quantity,
        acceptedOrReceived: t.receivedQuantity,
        discrepancyQuantity: t.quantity - t.receivedQuantity,
        reason: 'Partial receipt shortage recorded at receiving dock',
        timestamp: t.receivedAt || new Date().toISOString(),
      })
    }
  }

  // Replenishment Goods Receipt discrepancies
  for (const req of replenishmentRequests) {
    for (const receipt of req.receipts) {
      if (receipt.rejected > 0) {
        const sku = skus.find((s) => s.id === req.skuId)
        discrepancies.push({
          id: `DISC-GR-${receipt.id}`,
          type: 'goods_receipt',
          referenceId: req.id,
          skuId: req.skuId,
          skuName: sku?.name,
          sourceWarehouseId: req.supplier,
          destinationWarehouseId: req.warehouseId || 'WH-HYD-01',
          deliveredOrExpected: receipt.delivered,
          acceptedOrReceived: receipt.accepted,
          discrepancyQuantity: receipt.rejected,
          reason:
            req.timeline?.find((e) => (e.label ?? '')?.includes(receipt.id))?.note ||
            `${receipt.rejected} units rejected at dock bay`,
          timestamp: receipt.timestamp,
        })
      }
    }
  }

  return {
    pendingTransfers,
    pendingReplenishments,
    discrepancies: discrepancies.sort((a, b) => b.timestamp.localeCompare(a.timestamp)),
  }
}
