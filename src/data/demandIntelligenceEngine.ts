import type {
  Bin,
  DailyDemandDistribution,
  DemandAwareSlottingRecommendation,
  DemandSpike,
  DemandWindowDays,
  HandlingType,
  HourlyDemandDistribution,
  InventoryItem,
  NavigationGraph,
  PeakDemandAnalysis,
  ReorderRiskLevel,
  SaleEvent,
  SKU,
  SkuDemandProfile,
  StockMovement,
} from '../types'
import { DEMO_SALES_DISCLAIMER } from './demandHistoryData'
import { buildWarehouseGraph, findShortestPath, mapBinToWaypointNodeId, DEPOT_NODE_ID } from './warehouseGraphEngine'

export interface ValidatedDemandEvent {
  id: string
  skuId: string
  quantity: number
  timestamp: string
  isPick: boolean
  channel?: string
}

/**
 * Filter valid customer sales and completed picks.
 *
 * CRITICAL RULE:
 * Strictly excludes supplier dock receipts ('receive'), internal transfers ('relocate', 'transfer'),
 * and count adjustments ('adjust').
 */
export function filterValidDemandEvents(
  sales: SaleEvent[] = [],
  movements: StockMovement[] = [],
  windowDays = 30,
  referenceDate: Date = new Date()
): ValidatedDemandEvent[] {
  const windowMs = windowDays * 86400000
  const refTime = referenceDate.getTime()
  const startTime = refTime - windowMs

  const validEvents: ValidatedDemandEvent[] = []

  // 1. Ingest customer sales events
  for (const s of sales) {
    if (!s.skuId || typeof s.quantity !== 'number') continue
    const t = new Date(s.timestamp).getTime()
    if (isNaN(t)) continue
    if (t >= startTime && t <= refTime) {
      validEvents.push({
        id: s.id,
        skuId: s.skuId,
        quantity: Math.max(0, s.quantity),
        timestamp: s.timestamp,
        isPick: false,
        channel: s.channel,
      })
    }
  }

  // 2. Ingest completed pick movements from warehouse floor
  for (const m of movements) {
    if (!m.skuId || typeof m.quantity !== 'number') continue
    // STRICT RULE: only 'pick' movements count as fulfillment demand
    if (m.type !== 'pick') continue

    const t = new Date(m.timestamp).getTime()
    if (isNaN(t)) continue
    if (t >= startTime && t <= refTime) {
      validEvents.push({
        id: m.id,
        skuId: m.skuId,
        quantity: Math.max(0, m.quantity),
        timestamp: m.timestamp,
        isPick: true,
        channel: 'warehouse-pick',
      })
    }
  }

  return validEvents
}

/**
 * Calculates distance from warehouse packing & dispatch depot.
 * If a warehouse navigation graph is available, computes the exact shortest walking corridor path;
 * otherwise applies the standard Manhattan + vertical elevation model.
 */
export function calculateBinDepotDistance(bin: Bin, graph?: NavigationGraph): number {
  if (graph) {
    const waypointId = mapBinToWaypointNodeId(bin)
    const path = findShortestPath(graph, DEPOT_NODE_ID, waypointId, 'astar')
    if (path.reachable) {
      const level = bin.level ?? 1
      const verticalPenalty = level <= 1 ? 0 : level === 2 ? 1.05 : 3.5
      return Math.round((path.totalDistanceMeters + verticalPenalty) * 10) / 10
    }
  }

  const aisle = bin.aisle ?? 1
  const bay = bin.bay ?? 1
  const level = bin.level ?? 1
  // Base aisle traversal (10m per aisle) + bay traversal (2m per bay) + vertical elevation (3m per tier above ground)
  const horizontalDistance = 12 + (aisle - 1) * 8 + (bay - 1) * 3
  const verticalDistance = (level - 1) * 3.5
  return Math.round((horizontalDistance + verticalDistance) * 10) / 10
}

/**
 * Calculates comprehensive demand velocity metrics, stockout dates, and Pareto ABC classification.
 */
export function calculateSkuDemandProfiles(params: {
  skus: SKU[]
  inventory: InventoryItem[]
  bins: Bin[]
  sales?: SaleEvent[]
  movements?: StockMovement[]
  windowDays?: DemandWindowDays
  referenceDate?: Date
}): SkuDemandProfile[] {
  const {
    skus,
    inventory,
    bins,
    sales = [],
    movements = [],
    windowDays = 30,
    referenceDate = new Date(),
  } = params

  const refTime = referenceDate.getTime()
  const currentWindowStart = refTime - windowDays * 86400000
  const previousWindowStart = refTime - 2 * windowDays * 86400000

  // 7-day cutoff for short-term velocity & spike detection
  const sevenDayStart = refTime - 7 * 86400000

  // Collect all demand events across current + previous period
  const allEvents = filterValidDemandEvents(sales, movements, windowDays * 2, referenceDate)

  // Aggregate by SKU
  interface SkuAgg {
    units7d: number
    units30d: number
    unitsPrevWindow: number
    pickCount30d: number
    observationCount: number
    timestamps: number[]
  }

  const skuAggMap = new Map<string, SkuAgg>()
  for (const s of skus) {
    skuAggMap.set(s.id, {
      units7d: 0,
      units30d: 0,
      unitsPrevWindow: 0,
      pickCount30d: 0,
      observationCount: 0,
      timestamps: [],
    })
  }

  for (const ev of allEvents) {
    let agg = skuAggMap.get(ev.skuId)
    if (!agg) {
      agg = {
        units7d: 0,
        units30d: 0,
        unitsPrevWindow: 0,
        pickCount30d: 0,
        observationCount: 0,
        timestamps: [],
      }
      skuAggMap.set(ev.skuId, agg)
    }

    const t = new Date(ev.timestamp).getTime()
    if (t >= currentWindowStart && t <= refTime) {
      agg.units30d += ev.quantity
      agg.pickCount30d++
      agg.observationCount++
      agg.timestamps.push(t)

      if (t >= sevenDayStart) {
        agg.units7d += ev.quantity
      }
    } else if (t >= previousWindowStart && t < currentWindowStart) {
      agg.unitsPrevWindow += ev.quantity
    }
  }

  // Pre-calculate total demand across warehouse for Pareto curve
  let totalWarehouseDemand = 0
  for (const agg of skuAggMap.values()) {
    totalWarehouseDemand += agg.units30d
  }

  // Rank SKUs by 30-day demand volume descending
  const rankedSkuIds = Array.from(skuAggMap.entries())
    .sort((a, b) => b[1].units30d - a[1].units30d)
    .map(([id]) => id)

  // Pareto Cumulative Allocation
  let cumulativeDemand = 0
  const paretoClassMap = new Map<string, { paretoClass: 'A' | 'B' | 'C'; cumulativePct: number }>()

  for (const id of rankedSkuIds) {
    const agg = skuAggMap.get(id)!
    cumulativeDemand += agg.units30d
    const cumulativePct =
      totalWarehouseDemand > 0 ? (cumulativeDemand / totalWarehouseDemand) * 100 : 100

    let pClass: 'A' | 'B' | 'C'
    if (agg.units30d === 0) {
      pClass = 'C'
    } else if (cumulativePct <= 80.01) {
      pClass = 'A' // Fast Mover (top 80% volume)
    } else if (cumulativePct <= 95.01) {
      pClass = 'B' // Medium Mover (next 15% volume)
    } else {
      pClass = 'C' // Slow Mover (bottom 5% volume)
    }

    paretoClassMap.set(id, {
      paretoClass: pClass,
      cumulativePct: Math.round(cumulativePct * 10) / 10,
    })
  }

  // Build SkuDemandProfile for each SKU
  const profiles: SkuDemandProfile[] = []

  for (const sku of skus) {
    const agg = skuAggMap.get(sku.id) || {
      units7d: 0,
      units30d: 0,
      unitsPrevWindow: 0,
      pickCount30d: 0,
      observationCount: 0,
      timestamps: [],
    }

    // Velocity calculations
    const dailyVelocity7d = Math.round((agg.units7d / 7) * 10) / 10
    const dailyVelocity30d = Math.round((agg.units30d / windowDays) * 10) / 10

    // Growth percentage compared to previous equivalent window
    let velocityGrowthPct = 0
    if (agg.unitsPrevWindow > 0) {
      velocityGrowthPct =
        Math.round(((agg.units30d - agg.unitsPrevWindow) / agg.unitsPrevWindow) * 1000) / 10
    } else if (agg.units30d > 0) {
      velocityGrowthPct = 100.0
    }

    let trend: 'growing' | 'declining' | 'stable' = 'stable'
    if (velocityGrowthPct >= 5) trend = 'growing'
    else if (velocityGrowthPct <= -5) trend = 'declining'

    // Inventory status (accounting for reservations)
    const matchingStock = inventory.filter((i) => i.skuId === sku.id && !i.archived)
    const onHand = matchingStock.reduce((sum, item) => sum + item.quantity, 0)
    const reserved = matchingStock.reduce((sum, item) => sum + (item.reserved || 0), 0)
    const availableStock = Math.max(0, onHand - reserved)

    // Current primary location: prioritize non-golden zone or high level bin needing relocation, else primary
    const nonGoldenStock = matchingStock.find((i) => {
      const b = bins.find((bin) => bin.id === i.binId)
      if (!b) return false
      const isGZ = (b.zone === 'A' || b.zone === 'B') && (b.level === 1 || b.level === 2)
      return (!isGZ || (b.level ?? 1) >= 3) && i.quantity > 0
    })
    const primaryStock = nonGoldenStock || matchingStock.find((i) => i.quantity > 0) || matchingStock[0]
    const currentBinId = primaryStock?.binId || 'Unassigned'
    const binConfig = bins.find((b) => b.id === currentBinId)
    const currentZone = binConfig?.zone || 'Zone A'
    const currentLevel = binConfig?.level ?? 1
    const isGoldenZone =
      (currentZone === 'A' || currentZone === 'B') && (currentLevel === 1 || currentLevel === 2)

    // Stockout and days of stock remaining calculations
    let daysOfStockRemaining: number
    let stockoutDate: string | null = null

    if (dailyVelocity30d > 0) {
      daysOfStockRemaining = Math.round((availableStock / dailyVelocity30d) * 10) / 10
      if (daysOfStockRemaining <= 180 && isFinite(daysOfStockRemaining)) {
        const estDate = new Date(refTime + daysOfStockRemaining * 86400000)
        stockoutDate = estDate.toISOString().slice(0, 10)
      }
    } else {
      // 0 demand: stock is stable
      daysOfStockRemaining = Infinity
      stockoutDate = null
    }

    // Lead time (default: 3 days, or derived from supplier)
    const leadTimeDays = 3

    // Reorder Risk Level
    let reorderRisk: ReorderRiskLevel = 'Healthy'
    if (availableStock === 0) {
      reorderRisk = 'Critical Stockout'
    } else if (dailyVelocity30d > 0 && daysOfStockRemaining <= leadTimeDays) {
      reorderRisk = 'Critical Reorder Risk'
    } else if (daysOfStockRemaining <= 7 || availableStock <= sku.reorderPoint) {
      reorderRisk = 'High Risk'
    } else if (daysOfStockRemaining <= 14) {
      reorderRisk = 'Medium Risk'
    } else {
      reorderRisk = 'Healthy'
    }

    const pareto = paretoClassMap.get(sku.id) || { paretoClass: 'C', cumulativePct: 100 }
    const hasSufficientHistory = agg.observationCount >= 3

    profiles.push({
      skuId: sku.id,
      skuName: sku.name,
      category: sku.category,
      supplier: sku.supplier,
      unit: sku.unit || 'units',
      currentBinId,
      currentZone,
      currentLevel,
      isGoldenZone,
      onHand,
      reserved,
      availableStock,
      totalSold7d: agg.units7d,
      dailyVelocity7d,
      totalSold30d: agg.units30d,
      dailyVelocity30d,
      velocityGrowthPct,
      trend,
      pickCount30d: agg.pickCount30d,
      paretoClass: pareto.paretoClass,
      cumulativeVolumePct: pareto.cumulativePct,
      daysOfStockRemaining,
      stockoutDate,
      reorderPoint: sku.reorderPoint,
      leadTimeDays,
      reorderRisk,
      hasSufficientHistory,
      observationCount: agg.observationCount,
    })
  }

  // Sort profiles by 30-day velocity descending
  profiles.sort((a, b) => b.dailyVelocity30d - a.dailyVelocity30d)
  return profiles
}

/**
 * Analyzes peak demand distribution by hour of day and day of week.
 * Detects demand spikes while guarding against claims on insufficient data.
 */
export function analyzePeakDemand(
  events: ValidatedDemandEvent[] = [],
  _skus: SKU[] = [],
  profiles?: SkuDemandProfile[]
): PeakDemandAnalysis {
  const hourlyCount = new Array(24).fill(0)
  const hourlyUnits = new Array(24).fill(0)

  const dayCount = new Array(7).fill(0)
  const dayUnits = new Array(7).fill(0)

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const uniqueDates = new Set<string>()

  for (const ev of events) {
    const d = new Date(ev.timestamp)
    if (isNaN(d.getTime())) continue

    const hour = d.getUTCHours()
    const dow = d.getUTCDay()
    const dateStr = d.toISOString().slice(0, 10)

    uniqueDates.add(dateStr)
    hourlyCount[hour]++
    hourlyUnits[hour] += ev.quantity
    dayCount[dow]++
    dayUnits[dow] += ev.quantity
  }

  const observationDays = uniqueDates.size
  const observationCount = events.length

  // Safety check: Require at least 5 events across at least 3 distinct days
  const hasSufficientObservations = observationCount >= 5 && observationDays >= 3

  // Identify peak hour
  let peakHour = 11
  let maxHourUnits = 0
  for (let h = 0; h < 24; h++) {
    if (hourlyUnits[h] > maxHourUnits) {
      maxHourUnits = hourlyUnits[h]
      peakHour = h
    }
  }

  // Identify peak day
  let peakDow = 2
  let maxDayUnits = 0
  for (let dow = 0; dow < 7; dow++) {
    if (dayUnits[dow] > maxDayUnits) {
      maxDayUnits = dayUnits[dow]
      peakDow = dow
    }
  }

  const hourlyDistribution: HourlyDemandDistribution[] = []
  for (let h = 0; h < 24; h++) {
    hourlyDistribution.push({
      hour: h,
      label: `${String(h).padStart(2, '0')}:00`,
      totalUnits: hourlyUnits[h],
      orderCount: hourlyCount[h],
      isPeak: h === peakHour && maxHourUnits > 0,
    })
  }

  const dailyDistribution: DailyDemandDistribution[] = []
  for (let d = 0; d < 7; d++) {
    dailyDistribution.push({
      dayOfWeek: d,
      dayName: dayNames[d],
      totalUnits: dayUnits[d],
      orderCount: dayCount[d],
      isPeak: d === peakDow && maxDayUnits > 0,
    })
  }

  // Detect demand spikes: SKUs where 7-day velocity > 30-day velocity by > 30% with adequate observations
  const detectedSpikes: DemandSpike[] = []
  if (profiles) {
    for (const p of profiles) {
      if (p.hasSufficientHistory && p.dailyVelocity30d > 0 && p.dailyVelocity7d > p.dailyVelocity30d * 1.3) {
        const spikePct =
          Math.round(((p.dailyVelocity7d - p.dailyVelocity30d) / p.dailyVelocity30d) * 1000) / 10
        detectedSpikes.push({
          skuId: p.skuId,
          skuName: p.skuName,
          velocity7d: p.dailyVelocity7d,
          velocity30d: p.dailyVelocity30d,
          spikePct,
          reason: `Recent 7-day velocity (${p.dailyVelocity7d} units/day) is a +${spikePct}% surge above the 30-day baseline (${p.dailyVelocity30d} units/day). Consider proactive replenishment.`,
        })
      }
    }
  }

  return {
    peakHour,
    peakHourLabel: `${String(peakHour).padStart(2, '0')}:00 UTC`,
    peakHourUnits: maxHourUnits,
    peakDayName: dayNames[peakDow],
    peakDayUnits: maxDayUnits,
    hourlyDistribution,
    dailyDistribution,
    detectedSpikes,
    hasSufficientObservations,
    observationCount,
    observationDays,
    dataDisclaimer: hasSufficientObservations
      ? `${DEMO_SALES_DISCLAIMER} Observed from customer sale orders and completed pick transactions.`
      : `${DEMO_SALES_DISCLAIMER} Insufficient historical observations (< 3 days or < 5 events) for statistically valid peak identification.`,
  }
}

/**
 * Generates demand-aware storage re-slotting recommendations.
 *
 * CRITICAL INVARIANT:
 * Does NOT mutate physical inventory or change bin assignments.
 * Produces structured advisory recommendations with explicit travel savings,
 * and sets actionable: true so the existing transfer workflow can execute relocation when approved.
 */
export function generateDemandAwareSlottingRecommendations(params: {
  demandProfiles: SkuDemandProfile[]
  bins: Bin[]
  inventory: InventoryItem[]
  skus: SKU[]
  warehouseId?: string
  useGraphDistances?: boolean
}): DemandAwareSlottingRecommendation[] {
  const { demandProfiles, bins, inventory, skus, warehouseId, useGraphDistances = true } = params
  const recommendations: DemandAwareSlottingRecommendation[] = []

  // Target warehouse (defaults to WH-HYD-01 or specific facility)
  const targetWhId = warehouseId || 'WH-HYD-01'
  const whBins = bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === targetWhId)
  const whInventory = inventory.filter((i) => (i.warehouseId || 'WH-HYD-01') === targetWhId)

  // Build navigation graph for actual travel distance calculations
  let graph: NavigationGraph | undefined
  if (useGraphDistances && whBins.length > 0) {
    try {
      graph = buildWarehouseGraph(targetWhId, whBins)
    } catch {
      graph = undefined
    }
  }

  // Filter fast movers (Class A) currently located in non-golden zones or high upper levels within this warehouse
  const fastMoversNeedingReslot = demandProfiles.filter((p) => {
    // Confirm SKU is slotted in target warehouse
    const currentBin = whBins.find((b) => b.id === p.currentBinId)
    if (!currentBin) return false
    return p.paretoClass === 'A' && (!p.isGoldenZone || p.currentLevel >= 3)
  })

  // Find candidate golden zone bins in the same warehouse
  // Golden Zone: Zone A or B, Levels 1 or 2, front face (or goldenZone constrained)
  const candidateGoldenBins = whBins.filter((b) => {
    const isGZ =
      b.optimizationConstraints?.goldenZone ??
      ((b.zone === 'A' || b.zone === 'B') && (b.level === 1 || b.level === 2))
    return isGZ && b.face !== 'back'
  })

  for (const profile of fastMoversNeedingReslot) {
    const skuDef = skus.find((s) => s.id === profile.skuId)
    const unitWeight =
      skuDef?.weightKg ??
      skuDef?.optimizationProfile?.weightKg ??
      (profile as unknown as { unitWeightKg?: number }).unitWeightKg ??
      1.0
    const handling = ((skuDef?.handlingRequired ??
      skuDef?.optimizationProfile?.handling ??
      (profile as unknown as { handlingRequired?: HandlingType }).handlingRequired ??
      'standard') as HandlingType)

    const currentBin = whBins.find((b) => b.id === profile.currentBinId)
    if (!currentBin) continue

    const currentStock = whInventory.find(
      (i) => i.binId === currentBin.id && i.skuId === profile.skuId && !i.archived
    )
    if (!currentStock || currentStock.quantity <= 0) continue

    // Check active pick reservations
    const availableUnreserved = Math.max(0, currentStock.quantity - currentStock.reserved)
    if (availableUnreserved <= 0) continue // Entire stock is reserved; cannot relocate

    const currentDistance = calculateBinDepotDistance(currentBin, graph)

    // Search for compatible empty or low-load golden zone bins in the SAME warehouse
    for (const targetBin of candidateGoldenBins) {
      if (targetBin.id === currentBin.id) continue
      if ((targetBin.warehouseId || 'WH-HYD-01') !== (currentBin.warehouseId || 'WH-HYD-01')) continue

      // Incompatible SKU check (no mixing incompatible SKUs)
      const targetStock = whInventory.find((i) => i.binId === targetBin.id && !i.archived)
      const isTargetOccupied = targetStock && targetStock.quantity > 0
      const isSameSku = targetStock && targetStock.skuId === profile.skuId
      if (isTargetOccupied && !isSameSku) {
        continue // Incompatible SKU mixing blocked
      }

      // Capacity check
      const targetCapacity = targetStock?.capacity ?? targetBin.capacity ?? 48
      const targetCurrentQty = targetStock?.quantity ?? 0
      const targetRemainingCapacity = Math.max(0, targetCapacity - targetCurrentQty)
      const currentStockQty =
        currentStock.quantity ??
        profile.onHand ??
        (profile as unknown as { onHandStock?: number }).onHandStock ??
        0
      const qtyToMove = Math.min(currentStockQty, targetCapacity)

      if (currentStockQty > targetCapacity) continue
      if (targetCurrentQty + qtyToMove > targetCapacity) continue

      // Weight check
      const maxWeightKg =
        targetBin.maxWeightKg ??
        targetBin.optimizationConstraints?.maxWeightKg ??
        25
      const totalWeightKg = Math.round(qtyToMove * unitWeight * 10) / 10
      if (totalWeightKg > maxWeightKg) continue

      // Handling check
      const supportedHandling =
        targetBin.handlingCapabilities ??
        targetBin.optimizationConstraints?.handlingCapabilities ??
        ['standard']
      if (!supportedHandling.includes(handling)) continue

      // Distance calculation
      const targetDistance = calculateBinDepotDistance(targetBin, graph)
      const distanceSaved = Math.round((currentDistance - targetDistance) * 10) / 10

      // Only recommend if significant travel distance is saved (at least 4 meters)
      if (distanceSaved >= 4.0) {
        const timeSavedSeconds = Math.round(distanceSaved * 1.2)
        const weeklyPicks = Math.max(1, Math.round(profile.dailyVelocity30d * 7))
        // Roundtrip distance savings in km
        const weeklyKmSaved = Math.round(((distanceSaved * 2 * weeklyPicks) / 1000) * 10) / 10

        recommendations.push({
          id: `REC-SLOT-${profile.skuId}-${targetBin.id}`,
          type: 'local_relocation',
          warehouseId: targetWhId,
          warehouseName: targetWhId === 'WH-HYD-01' ? 'Hyderabad Central Warehouse' : targetWhId,
          skuId: profile.skuId,
          skuName: profile.skuName,
          category: profile.category,
          paretoClass: profile.paretoClass,
          dailyVelocity: profile.dailyVelocity30d,
          currentBinId: currentBin.id,
          currentZone: currentBin.zone,
          currentLevel: currentBin.level ?? 1,
          currentDistanceMeters: currentDistance,
          recommendedBinId: targetBin.id,
          recommendedZone: targetBin.zone,
          recommendedLevel: targetBin.level ?? 1,
          recommendedDistanceMeters: targetDistance,
          distanceSavedMeters: distanceSaved,
          weeklyKmSaved,
          estimatedSecondsSavedPerPick: timeSavedSeconds,
          reason: `Pareto Class A fast-mover (${profile.dailyVelocity30d} units/day) is currently slotted at high tier ${currentBin.id} (${currentDistance}m from depot). Relocating to Golden Zone ${targetBin.id} (${targetDistance}m) saves ${distanceSaved}m per pick roundtrip (~${weeklyKmSaved} km/week travel reduction for cart picker).`,
          capacityOk: true,
          weightOk: true,
          compatible: true,
          actionable: true,
          currentStockQty,
          unitWeightKg: unitWeight,
          totalWeightKg,
          targetCapacity,
          targetMaxWeightKg: maxWeightKg,
          handlingRequired: handling,
          activePickReserved: currentStock.reserved,
          constraints: {
            capacityCheck: {
              passed: true,
              required: qtyToMove,
              available: targetRemainingCapacity,
              max: targetCapacity,
            },
            weightCheck: {
              passed: true,
              actualKg: totalWeightKg,
              maxKg: maxWeightKg,
            },
            skuCompatibility: {
              passed: true,
              targetOccupiedBySameSkuOrEmpty: true,
            },
            handlingCheck: {
              passed: true,
              required: handling,
              supported: supportedHandling,
            },
            reservationCheck: {
              passed: availableUnreserved > 0,
              availableUnreserved,
            },
          },
          status: 'Proposed',
          dataDisclaimer: `${DEMO_SALES_DISCLAIMER} Travel distances calculated via warehouse navigation corridors.`,
        })
        break // One best recommendation per SKU
      }
    }
  }

  // Sort by weekly km saved descending
  recommendations.sort((a, b) => b.weeklyKmSaved - a.weeklyKmSaved)
  return recommendations
}

