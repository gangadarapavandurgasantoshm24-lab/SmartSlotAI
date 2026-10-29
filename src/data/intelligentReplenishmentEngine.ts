import type {
  Bin,
  FulfillmentStrategy,
  IntelligentReorderRecommendation,
  InventoryItem,
  ReplenishmentCalculationDetails,
  ReplenishmentRequest,
  ReplenishmentSafetyStockConfig,
  ReplenishmentUrgency,
  SaleEvent,
  ShortageScope,
  SKU,
  StockMovement,
  SupplierOption,
  Warehouse,
  InterWarehouseTransfer,
} from '../types'
import { getIncomingQuantity } from './replenishmentUtils'
import { getWarehouseDistanceKm, getEstimatedTransitHours } from './multiWarehouseData'

export const DEMO_REPLENISHMENT_DISCLAIMER =
  'Simulated Supplier Telemetry: Reorder thresholds, lead times, and supplier reliability ratings are deterministic demo models for warehouse operational intelligence.'

/**
 * Standard registry of primary and secondary suppliers with simulated lead times and ratings.
 */
export const DEMO_SUPPLIER_REGISTRY: Record<string, SupplierOption[]> = {
  'SKU-2084': [
    {
      supplierName: 'Mobly Decor / Olist',
      isPrimary: true,
      leadTimeDays: 3,
      reliabilityRating: 98.4,
      minOrderQuantity: 10,
      costPerUnit: 42.5,
    },
    {
      supplierName: 'Medline Industries',
      isPrimary: false,
      leadTimeDays: 5,
      reliabilityRating: 95.0,
      minOrderQuantity: 20,
      costPerUnit: 45.0,
    },
  ],
  'SKU-1102': [
    {
      supplierName: 'Santista / Olist',
      isPrimary: true,
      leadTimeDays: 3,
      reliabilityRating: 97.8,
      minOrderQuantity: 10,
      costPerUnit: 28.0,
    },
    {
      supplierName: 'Berry Global',
      isPrimary: false,
      leadTimeDays: 6,
      reliabilityRating: 94.2,
      minOrderQuantity: 15,
      costPerUnit: 30.5,
    },
  ],
  'SKU-3401': [
    {
      supplierName: 'Tramontina / Olist',
      isPrimary: true,
      leadTimeDays: 4,
      reliabilityRating: 96.5,
      minOrderQuantity: 5,
      costPerUnit: 85.0,
    },
    {
      supplierName: 'Uline',
      isPrimary: false,
      leadTimeDays: 7,
      reliabilityRating: 93.0,
      minOrderQuantity: 10,
      costPerUnit: 89.0,
    },
  ],
  'SKU-0917': [
    {
      supplierName: 'Multilaser / Olist',
      isPrimary: true,
      leadTimeDays: 2,
      reliabilityRating: 99.1,
      minOrderQuantity: 10,
      costPerUnit: 14.5,
    },
    {
      supplierName: 'Avery Dennison',
      isPrimary: false,
      leadTimeDays: 4,
      reliabilityRating: 96.0,
      minOrderQuantity: 20,
      costPerUnit: 16.0,
    },
  ],
}

/**
 * Returns supplier options for a given SKU.
 */
export function getSupplierOptionsForSku(sku: SKU): SupplierOption[] {
  if (DEMO_SUPPLIER_REGISTRY[sku.id]) {
    return DEMO_SUPPLIER_REGISTRY[sku.id]
  }
  const primaryName = sku.supplier || 'Primary Network Supplier'
  return [
    {
      supplierName: primaryName,
      isPrimary: true,
      leadTimeDays: 3,
      reliabilityRating: 97.0,
      minOrderQuantity: 10,
    },
    {
      supplierName: 'Global Sourcing Hub',
      isPrimary: false,
      leadTimeDays: 6,
      reliabilityRating: 93.5,
      minOrderQuantity: 20,
    },
  ]
}

export const DEFAULT_SAFETY_STOCK_CONFIG: ReplenishmentSafetyStockConfig = {
  defaultSafetyStockDays: 4,
  classASafetyStockDays: 5,
  classBSafetyStockDays: 4,
  classCSafetyStockDays: 3,
  targetReviewCycleDays: 7,
  minOrderQuantity: 5,
}

export interface ReplenishmentCalculationParams {
  warehouseId?: string
  inventory: InventoryItem[]
  skus: SKU[]
  bins: Bin[]
  warehouses: Warehouse[]
  sales?: SaleEvent[]
  movements?: StockMovement[]
  replenishmentRequests?: ReplenishmentRequest[]
  interWarehouseTransfers?: InterWarehouseTransfer[]
  config?: Partial<ReplenishmentSafetyStockConfig>
  referenceDate?: Date
}

/**
 * Generates intelligent reorder recommendations by analyzing available stock,
 * reserved quantities, demand velocity, lead times, safety-stock rules, and in-flight pipeline.
 *
 * CRITICAL INVARIANT:
 * Strictly read-only; never mutates inventory, movements, or existing requests.
 * Distinguishes local shortages (addressable via inter-warehouse transfer) from
 * network-wide shortages (requiring supplier purchase order).
 */
export function calculateReplenishmentRecommendations(
  params: ReplenishmentCalculationParams
): IntelligentReorderRecommendation[] {
  const {
    warehouseId = 'WH-HYD-01',
    inventory,
    skus,
    bins,
    warehouses,
    sales = [],
    movements = [],
    replenishmentRequests = [],
    interWarehouseTransfers = [],
    config: userConfig,
  } = params

  const cfg: ReplenishmentSafetyStockConfig = {
    ...DEFAULT_SAFETY_STOCK_CONFIG,
    ...userConfig,
  }

  const targetWhId = warehouseId || 'WH-HYD-01'
  const targetWh = warehouses.find((w) => w.id === targetWhId)
  const targetWhName = targetWh?.name || targetWhId

  const targetWhBins = bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === targetWhId)
  const targetWhInventory = inventory.filter(
    (i) => (i.warehouseId || 'WH-HYD-01') === targetWhId && !i.archived
  )

  const recommendations: IntelligentReorderRecommendation[] = []

  for (const sku of skus) {
    if (sku.archived) continue

    const matchingStockItems = targetWhInventory.filter((i) => i.skuId === sku.id)
    const onHandStock = matchingStockItems.reduce((sum, i) => sum + i.quantity, 0)
    const reservedStock = matchingStockItems.reduce((sum, i) => sum + (i.reserved || 0), 0)
    const availableStock = Math.max(0, onHandStock - reservedStock)

    // Identify primary bin for this SKU in target facility
    let targetBinId = matchingStockItems.find((i) => i.quantity > 0)?.binId
    if (!targetBinId) {
      targetBinId = matchingStockItems[0]?.binId
    }
    if (!targetBinId) {
      const designatedBin = targetWhBins.find((b) => b.skuId === sku.id)
      const emptyBin = targetWhBins.find((b) => {
        const occ = targetWhInventory.find((i) => i.binId === b.id && i.quantity > 0 && !i.archived)
        return !occ && (!b.skuId || b.skuId === sku.id || b.quantity === 0)
      })
      targetBinId = designatedBin?.id || emptyBin?.id || targetWhBins[0]?.id || 'Bay-01'
    }

    const targetBin = targetWhBins.find((b) => b.id === targetBinId)
    const binCapacity = targetBin?.capacity ?? 48

    // 1. Calculate Demand Velocity (units/day)
    // Primary: customer sales & completed picks in the past 30 days
    const skuSales = sales.filter((s) => s.skuId === sku.id)
    const skuPicks = movements.filter((m) => m.skuId === sku.id && m.type === 'pick')
    const totalSold30d =
      skuSales.reduce((sum, s) => sum + s.quantity, 0) +
      skuPicks.reduce((sum, m) => sum + m.quantity, 0)

    let dailyVelocity = Math.round((totalSold30d / 30) * 10) / 10
    if (dailyVelocity <= 0 && sku.optimizationProfile?.weeklyPickFrequency) {
      dailyVelocity = Math.round((sku.optimizationProfile.weeklyPickFrequency / 7) * 10) / 10
    }
    if (dailyVelocity <= 0) {
      dailyVelocity = 0.5 // Minimum conservative baseline
    }

    // 2. Supplier Options and Lead Time
    const availableSuppliers = getSupplierOptionsForSku(sku)
    const primarySupplier = availableSuppliers.find((s) => s.isPrimary) || availableSuppliers[0]
    const leadTimeDays = primarySupplier.leadTimeDays || 3
    const leadTimeDemand = Math.round(dailyVelocity * leadTimeDays * 10) / 10

    // 3. Safety-Stock and Target Stock Level
    const demandClass = sku.optimizationProfile?.demandClass || 'B'
    const safetyStockDays =
      demandClass === 'A'
        ? cfg.classASafetyStockDays
        : demandClass === 'C'
        ? cfg.classCSafetyStockDays
        : cfg.classBSafetyStockDays

    const safetyStockUnits = Math.ceil(dailyVelocity * safetyStockDays)
    const reorderPoint = sku.reorderPoint || Math.ceil(leadTimeDemand + safetyStockUnits)

    const targetReviewCycleDemand = Math.ceil(dailyVelocity * cfg.targetReviewCycleDays)
    const idealTargetLevel = Math.max(
      reorderPoint,
      Math.ceil(reorderPoint * 1.5),
      leadTimeDemand + safetyStockUnits + targetReviewCycleDemand
    )
    const targetStockLevel = Math.max(reorderPoint, Math.min(binCapacity, idealTargetLevel))

    // 4. In-Flight Pipeline Accounting
    // Pending Supplier Purchase Orders for this SKU & Warehouse
    const pendingPOs = replenishmentRequests.filter(
      (r) =>
        r.skuId === sku.id &&
        (!r.warehouseId || r.warehouseId === targetWhId) &&
        ['Submitted', 'Confirmed full', 'Partial offer', 'Delayed', 'In transit', 'Partially received'].includes(
          r.status
        )
    )
    const inFlightPurchaseOrders = pendingPOs.reduce(
      (sum, r) => sum + getIncomingQuantity(r),
      0
    )

    // In-Transit Inter-Warehouse Transfers destined to this warehouse
    const activeTransfers = interWarehouseTransfers.filter(
      (t) =>
        t.skuId === sku.id &&
        t.destinationWarehouseId === targetWhId &&
        ['REQUESTED', 'APPROVED', 'DISPATCHED', 'IN TRANSIT', 'IN_TRANSIT'].includes(
          t.status?.toUpperCase()?.trim()
        )
    )
    const inTransitTransfers = activeTransfers.reduce((sum, t) => sum + t.quantity, 0)

    const totalPipelineStock = inFlightPurchaseOrders + inTransitTransfers
    const netProjectedStock = availableStock + totalPipelineStock

    const pendingOrderIds = [
      ...pendingPOs.map((p) => p.id),
      ...activeTransfers.map((t) => t.id),
    ]
    const hasPendingOrder = pendingOrderIds.length > 0

    // 5. Urgency Evaluation
    const daysOfStockRemaining =
      dailyVelocity > 0 ? Math.round((availableStock / dailyVelocity) * 10) / 10 : Infinity

    let urgency: ReplenishmentUrgency = 'Healthy'
    if (availableStock === 0) {
      urgency = 'Critical Stockout'
    } else if (dailyVelocity > 0 && daysOfStockRemaining <= leadTimeDays) {
      urgency = 'Critical Reorder Risk'
    } else if (availableStock <= reorderPoint || daysOfStockRemaining <= 7) {
      urgency = 'High Risk'
    } else if (daysOfStockRemaining <= 14) {
      urgency = 'Medium Risk'
    } else {
      urgency = 'Healthy'
    }

    // Check if reorder recommendation should be triggered
    // Triggered if available stock is below reorder point or facing critical risk
    const isBelowThreshold = availableStock <= reorderPoint || urgency.includes('Critical')
    if (!isBelowThreshold) continue

    // 6. Net Deficit & Duplicate Prevention
    const grossDeficit = Math.max(0, targetStockLevel - availableStock)
    const netDeficit = Math.max(0, grossDeficit - totalPipelineStock)

    // If pipeline already fully covers target stock level, do not emit duplicate request
    if (netDeficit <= 0 && hasPendingOrder) {
      continue
    }

    // 7. Decide Fulfillment Strategy: Inter-Warehouse Transfer vs Supplier Replenishment
    // Check whether other warehouses in the network have surplus stock to spare
    const otherActiveWarehouses = warehouses.filter(
      (w) => w.id !== targetWhId && w.status === 'Active'
    )

    interface SurplusCandidate {
      warehouseId: string
      warehouseName: string
      binId: string
      availableStock: number
      surplusStock: number
      distanceKm: number
      transitHours: number
    }

    const surplusCandidates: SurplusCandidate[] = []

    for (const otherWh of otherActiveWarehouses) {
      const otherStockItems = inventory.filter(
        (i) => (i.warehouseId || 'WH-HYD-01') === otherWh.id && i.skuId === sku.id && !i.archived
      )
      if (otherStockItems.length === 0) continue

      const otherOnHand = otherStockItems.reduce((s, i) => s + i.quantity, 0)
      const otherReserved = otherStockItems.reduce((s, i) => s + (i.reserved || 0), 0)
      const otherAvailable = Math.max(0, otherOnHand - otherReserved)

      // Other warehouse's own minimum safety threshold (preserve its own operations)
      const otherThreshold = Math.max(10, Math.ceil(reorderPoint * 0.75))
      const surplusStock = Math.max(0, otherAvailable - otherThreshold)

      if (surplusStock >= 5) {
        const distKm = getWarehouseDistanceKm(otherWh.id, targetWhId)
        const transitHours = getEstimatedTransitHours(distKm)
        surplusCandidates.push({
          warehouseId: otherWh.id,
          warehouseName: otherWh.name,
          binId: otherStockItems[0].binId,
          availableStock: otherAvailable,
          surplusStock,
          distanceKm: distKm,
          transitHours,
        })
      }
    }

    // Sort surplus candidates by distance ascending (closest distribution center first)
    surplusCandidates.sort((a, b) => a.distanceKm - b.distanceKm)

    let shortageScope: ShortageScope
    let strategy: FulfillmentStrategy
    let recommendedQuantity: number
    let sourceWarehouseId: string | undefined
    let sourceWarehouseName: string | undefined
    let sourceBinId: string | undefined
    let availableSurplusAtSource: number | undefined
    let transitDistanceKm: number | undefined
    let estimatedTransitHours: number | undefined
    let reason: string

    if (surplusCandidates.length > 0) {
      // Local Shortage addressable via Inter-Warehouse Transfer
      const bestSource = surplusCandidates[0]
      shortageScope = 'local'
      strategy = 'inter_warehouse_transfer'
      sourceWarehouseId = bestSource.warehouseId
      sourceWarehouseName = bestSource.warehouseName
      sourceBinId = bestSource.binId
      availableSurplusAtSource = bestSource.surplusStock
      transitDistanceKm = bestSource.distanceKm
      estimatedTransitHours = bestSource.transitHours

      recommendedQuantity = Math.min(netDeficit, bestSource.surplusStock)
      if (recommendedQuantity <= 0) {
        recommendedQuantity = Math.min(10, bestSource.surplusStock)
      }

      reason = `Local shortage at ${targetWhName}: Available stock (${availableStock} units) is below reorder threshold (${reorderPoint}). Addressable via internal freight transfer of ${recommendedQuantity} units from ${bestSource.warehouseName} (${bestSource.warehouseId}), which has ${bestSource.surplusStock} surplus units available (${bestSource.distanceKm} km, ~${bestSource.transitHours}h transit).`
    } else {
      // Network-Wide Shortage requiring Supplier PO
      shortageScope = 'network_wide'
      strategy = 'supplier_replenishment'

      const moq = primarySupplier.minOrderQuantity || cfg.minOrderQuantity || 5
      const rawUnits = Math.max(moq, netDeficit)
      recommendedQuantity = Math.ceil(rawUnits / moq) * moq

      reason = `Network-wide shortage: All network warehouses are operating at or below local safety thresholds. External purchase order for ${recommendedQuantity} units required to ${primarySupplier.supplierName} (${leadTimeDays}-day delivery lead time) to restore target stock level (${targetStockLevel} units).`
    }

    const assumptions: string[] = [
      `Fulfillment velocity: ${dailyVelocity} units/day (based on 30-day order trends).`,
      `Supplier lead time: ${leadTimeDays} days (simulated logistics delivery window).`,
      `Lead time demand: ~${leadTimeDemand} units expected to be consumed before arrival.`,
      `Safety stock buffer: ${safetyStockDays} days (~${safetyStockUnits} units) to protect against demand variability.`,
      `Current stock: ${onHandStock} on-hand, ${reservedStock} reserved, ${availableStock} unreserved pickable units.`,
      `Pipeline stock: ${totalPipelineStock} units in-flight (${inFlightPurchaseOrders} open POs, ${inTransitTransfers} in-transit transfers).`,
      `Target inventory level: ${targetStockLevel} units (bin capacity: ${binCapacity}).`,
    ]

    const calculations: ReplenishmentCalculationDetails = {
      dailyVelocity,
      leadTimeDays,
      leadTimeDemand,
      safetyStockDays,
      safetyStockUnits,
      reorderPoint,
      onHandStock,
      reservedStock,
      availableStock,
      inFlightPurchaseOrders,
      inTransitTransfers,
      totalPipelineStock,
      netProjectedStock,
      targetStockLevel,
      grossDeficit,
      netDeficit,
      recommendedQuantity,
      assumptions,
    }

    recommendations.push({
      id: `REC-REPLEN-${sku.id}-${targetWhId}`,
      skuId: sku.id,
      skuName: sku.name,
      category: sku.category,
      warehouseId: targetWhId,
      warehouseName: targetWhName,
      targetBinId,
      urgency,
      shortageScope,
      strategy,
      recommendedQuantity,
      sourceWarehouseId,
      sourceWarehouseName,
      sourceBinId,
      availableSurplusAtSource,
      transitDistanceKm,
      estimatedTransitHours,
      supplierName: primarySupplier.supplierName,
      availableSuppliers,
      calculations,
      hasPendingOrder,
      pendingOrderIds,
      reason,
      status: 'PROPOSED',
      createdAt: new Date().toISOString(),
      disclaimer: DEMO_REPLENISHMENT_DISCLAIMER,
    })
  }

  // Sort by urgency descending (Critical Stockout first)
  const urgencyWeight: Record<ReplenishmentUrgency, number> = {
    'Critical Stockout': 4,
    'Critical Reorder Risk': 3,
    'High Risk': 2,
    'Medium Risk': 1,
    'Healthy': 0,
  }

  recommendations.sort((a, b) => {
    const diff = urgencyWeight[b.urgency] - urgencyWeight[a.urgency]
    if (diff !== 0) return diff
    return b.recommendedQuantity - a.recommendedQuantity
  })

  return recommendations
}
