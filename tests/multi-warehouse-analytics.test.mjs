import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let useAppStore
let initialInventory
let initialBins
let initialSkus
let demoWarehouses
let networkBins
let networkInventory
let initialTransfers
let filterInventoryRecords
let calculateNetworkOverviewKpis
let calculateWarehouseBreakdowns
let calculateCategoryDistributions
let calculateCrossWarehouseAvailability
let calculatePipelineAndDiscrepancies
let DEFAULT_ANALYTICS_FILTERS
let DEMO_ANALYTICS_DISCLAIMER
let generateDeterministicSalesHistory

const FIXED_REF_DATE = new Date('2026-10-28T18:00:00Z')

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  ;({
    filterInventoryRecords,
    calculateNetworkOverviewKpis,
    calculateWarehouseBreakdowns,
    calculateCategoryDistributions,
    calculateCrossWarehouseAvailability,
    calculatePipelineAndDiscrepancies,
    DEFAULT_ANALYTICS_FILTERS,
    DEMO_ANALYTICS_DISCLAIMER,
  } = await server.ssrLoadModule('/src/data/multiWarehouseAnalyticsEngine.ts'))

  ;({ generateDeterministicSalesHistory } = await server.ssrLoadModule(
    '/src/data/demandHistoryData.ts'
  ))

  const multiWhData = await server.ssrLoadModule('/src/data/multiWarehouseData.ts')
  demoWarehouses = multiWhData.demoWarehouses
  initialTransfers = multiWhData.initialInterWarehouseTransfers
  const gen = multiWhData.generateNetworkBinsAndInventory()
  networkBins = gen.bins
  networkInventory = gen.inventory

  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  initialInventory = mockData.inventory
  initialBins = mockData.warehouseBins
  initialSkus = mockData.skus
})

after(async () => {
  if (server) await server.close()
})

beforeEach(() => {
  useAppStore.setState({
    selectedWarehouseId: 'WH-HYD-01',
    warehouses: structuredClone(demoWarehouses),
    bins: [...structuredClone(initialBins), ...structuredClone(networkBins)],
    inventory: [...structuredClone(initialInventory), ...structuredClone(networkInventory)],
    skus: structuredClone(initialSkus),
    movements: [],
    interWarehouseTransfers: structuredClone(initialTransfers),
    replenishmentRequests: [
      {
        id: 'REQ-DEMO-01',
        skuId: 'SKU-2084',
        warehouseId: 'WH-HYD-01',
        supplier: 'Apex Ergonomics Global',
        targetQuantity: 40,
        confirmedQuantity: 40,
        status: 'In transit',
        reorderReason: 'Threshold Breach',
        estimatedCost: 12000,
        leadTimeDays: 5,
        targetDeliveryDate: '2026-11-02',
        urgency: 'high',
        receipts: [],
        timeline: [
          {
            id: 'EVT-01',
            at: '2026-10-26T10:00:00Z',
            actor: 'System',
            label: 'Triggered by auto-reorder',
            note: 'Triggered by auto-reorder',
          },
          {
            id: 'EVT-02',
            at: '2026-10-27T14:00:00Z',
            actor: 'Supplier',
            label: 'Dispatched via Express Freight',
            note: 'Dispatched via Express Freight',
          },
        ],
        createdAt: '2026-10-26T10:00:00Z',
        updatedAt: '2026-10-27T14:00:00Z',
      },
      {
        id: 'REQ-DEMO-02',
        skuId: 'SKU-1102',
        warehouseId: 'WH-HYD-01',
        supplier: 'Lumina Tech Industries',
        targetQuantity: 25,
        confirmedQuantity: 25,
        status: 'Partial receipt',
        reorderReason: 'Peak Demand Spike',
        estimatedCost: 5500,
        leadTimeDays: 4,
        targetDeliveryDate: '2026-10-28',
        urgency: 'critical',
        receipts: [
          {
            id: 'REC-001',
            timestamp: '2026-10-28T09:30:00Z',
            delivered: 25,
            accepted: 20,
            rejected: 5,
            receiverName: 'Dock Inspector A',
          },
        ],
        timeline: [
          {
            id: 'EVT-03',
            at: '2026-10-28T09:30:00Z',
            actor: 'Manager',
            label: 'REC-001 partial receipt',
            note: 'REC-001: 5 cartons damaged during pallet offloading',
          },
        ],
        createdAt: '2026-10-25T08:00:00Z',
        updatedAt: '2026-10-28T09:30:00Z',
      },
    ],
    salesHistory: generateDeterministicSalesHistory(FIXED_REF_DATE),
    activeRoutePreview: null,
  })
})

// ============================================================================
// 1. NETWORK OVERVIEW KPIS & CRITICAL STOCK ACCOUNTING INVARIANTS
// ============================================================================

test('network KPIs: strictly enforces On-Hand = Available + Reserved across all items', () => {
  const store = useAppStore.getState()
  const kpis = calculateNetworkOverviewKpis({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.ok(kpis.totalOnHandUnits > 0, 'Total on-hand stock should be positive')
  assert.equal(
    kpis.totalOnHandUnits,
    kpis.totalAvailableUnits + kpis.totalReservedUnits,
    'Critical Stock Accounting Invariant: On-Hand MUST equal Available + Reserved'
  )
})

test('network KPIs: separates in-transit and pipeline stock without adding to on-hand inventory', () => {
  const store = useAppStore.getState()
  const kpis = calculateNetworkOverviewKpis({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.ok(kpis.totalInTransitUnits > 0, 'In-transit pipeline should include active transfers and POs')
  assert.equal(kpis.totalPipelineUnits, kpis.totalInTransitUnits)

  // Direct manual calculation of on-hand from physical inventory
  const directOnHand = store.inventory
    .filter((i) => !i.archived)
    .reduce((sum, item) => sum + item.quantity, 0)

  assert.equal(
    kpis.totalOnHandUnits,
    directOnHand,
    'Pipeline stock must NEVER be added to physical on-hand inventory'
  )
})

test('network KPIs: correctly aggregates distinct SKUs, active warehouses, and capacity utilization', () => {
  const store = useAppStore.getState()
  const kpis = calculateNetworkOverviewKpis({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.equal(kpis.activeWarehouseCount, 4, 'Should count 4 active network warehouses')
  assert.equal(kpis.distinctSkuCount, 5, 'Should track 5 active catalog SKUs in mock state')
  assert.ok(kpis.totalCapacityUnits > 0, 'Total network bin capacity should be positive')
  assert.ok(
    kpis.averageCapacityUtilization > 0 && kpis.averageCapacityUtilization <= 100,
    `Capacity utilization % (${kpis.averageCapacityUtilization}%) must be between 0 and 100`
  )
})

test('network KPIs: accurately identifies low-stock items and network-wide stockout risks', () => {
  const store = useAppStore.getState()

  // Deplete all inventory for SKU-2084 across the entire network
  const modifiedInventory = store.inventory.map((item) =>
    item.skuId === 'SKU-2084' ? { ...item, quantity: 0, reserved: 0 } : item
  )

  const kpis = calculateNetworkOverviewKpis({
    warehouses: store.warehouses,
    inventory: modifiedInventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.ok(kpis.lowStockSkuCount > 0, 'Should flag low-stock items')
  assert.ok(
    kpis.networkStockoutRiskSkuCount >= 1,
    'Should identify SKU-2084 as a network-wide stockout risk since network available = 0'
  )
})

test('disclaimer constant & filter defaults: clearly labels demo telemetry without obscuring production readiness', () => {
  assert.ok(DEMO_ANALYTICS_DISCLAIMER.includes('Simulated Multi-Warehouse Telemetry'))
  assert.equal(DEFAULT_ANALYTICS_FILTERS.warehouseId, 'all')
  assert.equal(DEFAULT_ANALYTICS_FILTERS.city, 'all')
  assert.equal(DEFAULT_ANALYTICS_FILTERS.category, 'all')
  assert.equal(DEFAULT_ANALYTICS_FILTERS.dateRange, '30d')
})

// ============================================================================
// 2. MULTI-DIMENSIONAL FILTERING ENGINE
// ============================================================================

test('filterInventoryRecords: warehouse filter restricts inventory strictly to specified warehouse', () => {
  const store = useAppStore.getState()
  const hydFiltered = filterInventoryRecords(store.inventory, store.skus, store.warehouses, {
    warehouseId: 'WH-HYD-01',
  })

  assert.ok(hydFiltered.length > 0, 'Should find inventory in Hyderabad')
  for (const item of hydFiltered) {
    assert.equal(item.warehouseId || 'WH-HYD-01', 'WH-HYD-01')
  }

  const blrFiltered = filterInventoryRecords(store.inventory, store.skus, store.warehouses, {
    warehouseId: 'WH-BLR-04',
  })
  assert.ok(blrFiltered.length > 0, 'Should find inventory in Bengaluru')
  for (const item of blrFiltered) {
    assert.equal(item.warehouseId, 'WH-BLR-04')
  }
})

test('filterInventoryRecords: city filter restricts inventory to facilities in matching city', () => {
  const store = useAppStore.getState()
  const chennaiFiltered = filterInventoryRecords(store.inventory, store.skus, store.warehouses, {
    city: 'Chennai',
  })

  assert.ok(chennaiFiltered.length > 0)
  for (const item of chennaiFiltered) {
    const wh = store.warehouses.find((w) => w.id === item.warehouseId)
    assert.equal(wh?.city, 'Chennai')
  }
})

test('filterInventoryRecords: category filter returns items only in selected SKU category', () => {
  const store = useAppStore.getState()
  const targetCategory = 'Furniture Decor'
  const filtered = filterInventoryRecords(store.inventory, store.skus, store.warehouses, {
    category: targetCategory,
  })

  assert.ok(filtered.length > 0)
  for (const item of filtered) {
    const sku = store.skus.find((s) => s.id === item.skuId)
    assert.equal(sku?.category, targetCategory)
  }
})

test('filterInventoryRecords: SKU search filter performs exact or trimmed case-insensitive match', () => {
  const store = useAppStore.getState()
  const filtered = filterInventoryRecords(store.inventory, store.skus, store.warehouses, {
    skuId: 'sku-2084 ',
  })

  assert.ok(filtered.length > 0)
  for (const item of filtered) {
    assert.equal(item.skuId.toLowerCase(), 'sku-2084')
  }
})

test('filterInventoryRecords: stock status filter isolates healthy vs low-stock inventory', () => {
  const store = useAppStore.getState()
  const healthyItems = filterInventoryRecords(store.inventory, store.skus, store.warehouses, {
    stockStatus: 'healthy',
  })

  assert.ok(healthyItems.length > 0)
  for (const item of healthyItems) {
    assert.ok(item.available !== false)
    assert.ok(item.quantity > (item.reorderPoint || 10))
  }
})

test('filterInventoryRecords: strictly excludes archived inventory items regardless of other filters', () => {
  const store = useAppStore.getState()

  // Add an archived item
  const withArchived = [
    ...store.inventory,
    {
      id: 'INV-ARCHIVED-TEST',
      skuId: 'SKU-2084',
      binId: 'A-01-01',
      warehouseId: 'WH-HYD-01',
      quantity: 99,
      reserved: 0,
      archived: true,
      lastUpdated: new Date().toISOString(),
    },
  ]

  const filtered = filterInventoryRecords(withArchived, store.skus, store.warehouses, {
    warehouseId: 'WH-HYD-01',
  })

  assert.equal(
    filtered.filter((i) => i.id === 'INV-ARCHIVED-TEST').length,
    0,
    'Archived items must never be included in analytics filters'
  )
})

// ============================================================================
// 3. FACILITY-LEVEL BREAKDOWN & STORAGE ZONE OCCUPANCY
// ============================================================================

test('calculateWarehouseBreakdowns: computes facility breakdowns for all 4 regional warehouses', () => {
  const store = useAppStore.getState()
  const breakdowns = calculateWarehouseBreakdowns({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.equal(breakdowns.length, 4, 'Must provide breakdown for all 4 warehouses')
  const whIds = breakdowns.map((b) => b.warehouseId)
  assert.ok(whIds.includes('WH-HYD-01'))
  assert.ok(whIds.includes('WH-VJA-02'))
  assert.ok(whIds.includes('WH-CHN-03'))
  assert.ok(whIds.includes('WH-BLR-04'))

  for (const b of breakdowns) {
    assert.equal(
      b.onHandUnits,
      b.availableUnits + b.reservedUnits,
      `Warehouse ${b.warehouseId} must preserve onHand = available + reserved`
    )
    assert.equal(
      b.totalBins,
      b.occupiedBins + b.vacantBins,
      `Warehouse ${b.warehouseId} bins must balance occupied + vacant = total`
    )
    assert.ok(b.totalCapacityUnits > 0)
    assert.ok(b.capacityUtilizationPct >= 0 && b.capacityUtilizationPct <= 100)
  }
})

test('calculateWarehouseBreakdowns: evaluates zone occupancy and correctly flags golden zones', () => {
  const store = useAppStore.getState()
  const breakdowns = calculateWarehouseBreakdowns({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  const hyd = breakdowns.find((b) => b.warehouseId === 'WH-HYD-01')
  assert.ok(hyd, 'Hyderabad breakdown must exist')
  assert.ok(hyd.zoneBreakdown.length > 0, 'Hyderabad should have zone breakdowns')

  // Zone A or B should be flagged as golden zone
  const goldenZones = hyd.zoneBreakdown.filter((z) => z.isGoldenZone)
  assert.ok(goldenZones.length > 0, 'Must identify ergonomic golden zones in warehouse')

  for (const z of hyd.zoneBreakdown) {
    assert.ok(z.totalBins >= z.occupiedBins, `Zone ${z.zone} occupied bins cannot exceed total bins`)
    assert.ok(z.occupancyPct >= 0 && z.occupancyPct <= 100)
  }
})

test('calculateWarehouseBreakdowns: respects warehouse filter when set', () => {
  const store = useAppStore.getState()
  const filteredBreakdowns = calculateWarehouseBreakdowns({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
    filters: { warehouseId: 'WH-CHN-03' },
  })

  assert.equal(filteredBreakdowns.length, 1)
  assert.equal(filteredBreakdowns[0].warehouseId, 'WH-CHN-03')
  assert.equal(filteredBreakdowns[0].city, 'Chennai')
})

// ============================================================================
// 4. CATEGORY DISTRIBUTION & PARETO VELOCITY ANALYSIS
// ============================================================================

test('calculateCategoryDistributions: partitions inventory by category and computes Pareto counts', () => {
  const store = useAppStore.getState()
  const distributions = calculateCategoryDistributions({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
    sales: store.salesHistory,
    referenceDate: FIXED_REF_DATE,
  })

  assert.ok(distributions.length > 0, 'Should find multiple product categories')

  // Validate share of total units sums up to ~100%
  const totalSharePct = distributions.reduce((sum, d) => sum + d.shareOfTotalUnitsPct, 0)
  assert.ok(
    totalSharePct >= 99 && totalSharePct <= 101,
    `Total category shares (${totalSharePct}%) should sum close to 100%`
  )

  for (const d of distributions) {
    assert.ok(d.distinctSkuCount > 0)
    assert.equal(
      d.onHandUnits,
      d.availableUnits + d.reservedUnits,
      `Category ${d.categoryName} must balance onHand = available + reserved`
    )
    const totalParetoSkus = d.classACount + d.classBCount + d.classCCount
    assert.equal(
      totalParetoSkus,
      d.distinctSkuCount,
      `Category ${d.categoryName} Pareto sum (A+B+C) must equal distinct SKU count`
    )
  }
})

// ============================================================================
// 5. CROSS-WAREHOUSE AVAILABILITY & SHORTAGE DETECTION
// ============================================================================

test('calculateCrossWarehouseAvailability: detects local shortages and surfaces sister warehouse surplus', () => {
  const store = useAppStore.getState()

  // Scenario: WH-BLR-04 has 0 available of SKU-2084, but WH-HYD-01 has plenty
  const modifiedInventory = store.inventory.map((item) => {
    if (item.warehouseId === 'WH-BLR-04' && item.skuId === 'SKU-2084') {
      return { ...item, quantity: 2, reserved: 2 } // 0 available stock, well below reorderPoint
    }
    if ((item.warehouseId || 'WH-HYD-01') === 'WH-HYD-01' && item.skuId === 'SKU-2084') {
      return { ...item, quantity: 45, reserved: 5 } // 40 available stock
    }
    return item
  })

  const shortages = calculateCrossWarehouseAvailability(
    {
      warehouses: store.warehouses,
      inventory: modifiedInventory,
      bins: store.bins,
      skus: store.skus,
      transfers: store.interWarehouseTransfers,
      replenishmentRequests: store.replenishmentRequests,
      movements: store.movements,
    },
    'WH-BLR-04'
  )

  assert.ok(shortages.length > 0, 'Should detect shortage at target warehouse')
  const sku2084Shortage = shortages.find((s) => s.skuId === 'SKU-2084')
  assert.ok(sku2084Shortage, 'SKU-2084 should be flagged as short at WH-BLR-04')

  assert.equal(sku2084Shortage.targetWarehouseId, 'WH-BLR-04')
  assert.equal(sku2084Shortage.targetAvailableStock, 0)
  assert.ok(sku2084Shortage.alternativeWarehouses.length > 0)

  // Verify sister warehouse details
  const hydAlt = sku2084Shortage.alternativeWarehouses.find((a) => a.warehouseId === 'WH-HYD-01')
  assert.ok(hydAlt, 'Hyderabad must be listed as an alternative with stock')
  assert.ok(hydAlt.availableStock > 0)
  assert.ok(hydAlt.distanceKm > 0, 'Must calculate transit road distance')
  assert.ok(hydAlt.estimatedTransitHours > 0, 'Must calculate estimated transit hours')

  // Verify closest sister facility is ranked first
  assert.equal(sku2084Shortage.bestAlternative.warehouseId, sku2084Shortage.alternativeWarehouses[0].warehouseId)
})

// ============================================================================
// 6. PIPELINE STOCK & DISCREPANCY AUDIT LEDGER
// ============================================================================

test('calculatePipelineAndDiscrepancies: extracts active transfers, active POs, and audit discrepancies', () => {
  const store = useAppStore.getState()
  const pipeline = calculatePipelineAndDiscrepancies({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.ok(pipeline.pendingTransfers.length > 0, 'Should return active transfers')
  assert.ok(pipeline.pendingReplenishments.length > 0, 'Should return active POs')

  // Verify discrepancy records
  assert.ok(pipeline.discrepancies.length > 0, 'Should extract discrepancy records')

  const grDiscrepancy = pipeline.discrepancies.find((d) => d.type === 'goods_receipt')
  assert.ok(grDiscrepancy, 'Should find goods receipt dock rejection discrepancy from REQ-DEMO-02')
  assert.equal(grDiscrepancy.discrepancyQuantity, 5)
  assert.equal(grDiscrepancy.deliveredOrExpected, 25)
  assert.equal(grDiscrepancy.acceptedOrReceived, 20)
  assert.ok(grDiscrepancy.reason.includes('damaged') || grDiscrepancy.reason.includes('rejected'))
})

test('calculatePipelineAndDiscrepancies: detects transfer discrepancies when damaged units or partial receipts occur', () => {
  const store = useAppStore.getState()

  // Add transfer with discrepancy
  const transfersWithDiscrepancy = [
    ...store.interWarehouseTransfers,
    {
      id: 'TR-TEST-DISC',
      transferNumber: 'TR-2026-TEST',
      skuId: 'SKU-1102',
      sourceWarehouseId: 'WH-HYD-01',
      destinationWarehouseId: 'WH-CHN-03',
      quantity: 30,
      receivedQuantity: 26,
      discrepancyDetails: {
        expectedQuantity: 30,
        actualReceivedQuantity: 26,
        reason: 'Water damage during highway monsoon transit',
      },
      status: 'RECEIVED',
      requestedBy: 'System',
      requestedAt: '2026-10-27T10:00:00Z',
      receivedAt: '2026-10-28T16:00:00Z',
    },
  ]

  const pipeline = calculatePipelineAndDiscrepancies({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: transfersWithDiscrepancy,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  const transferDisc = pipeline.discrepancies.find((d) => d.referenceId === 'TR-TEST-DISC')
  assert.ok(transferDisc, 'Should capture transfer discrepancy in ledger')
  assert.equal(transferDisc.discrepancyQuantity, 4)
  assert.equal(transferDisc.reason, 'Water damage during highway monsoon transit')
})

// ============================================================================
// 7. PURE INVARIANCE & NON-DESTRUCTIVE EXECUTION
// ============================================================================

test('analytics engine: strictly pure and never mutates inventory, bins, transfers, or movements', () => {
  const store = useAppStore.getState()
  const inventorySnapshot = JSON.stringify(store.inventory)
  const binsSnapshot = JSON.stringify(store.bins)
  const transfersSnapshot = JSON.stringify(store.interWarehouseTransfers)
  const movementsSnapshot = JSON.stringify(store.movements)

  // Execute all engine functions multiple times
  const params = {
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
    sales: store.salesHistory,
    referenceDate: FIXED_REF_DATE,
  }

  filterInventoryRecords(store.inventory, store.skus, store.warehouses, { warehouseId: 'WH-HYD-01' })
  calculateNetworkOverviewKpis(params)
  calculateWarehouseBreakdowns(params)
  calculateCategoryDistributions(params)
  calculateCrossWarehouseAvailability(params)
  calculatePipelineAndDiscrepancies(params)

  assert.equal(
    JSON.stringify(store.inventory),
    inventorySnapshot,
    'Inventory state must remain completely unaltered'
  )
  assert.equal(JSON.stringify(store.bins), binsSnapshot, 'Bins state must remain unaltered')
  assert.equal(
    JSON.stringify(store.interWarehouseTransfers),
    transfersSnapshot,
    'Transfers state must remain unaltered'
  )
  assert.equal(
    JSON.stringify(store.movements),
    movementsSnapshot,
    'Movements state must remain unaltered'
  )
})

// ============================================================================
// 8. LIVE STORE INTEGRATION & DYNAMIC UPDATES
// ============================================================================

test('store workflow: dynamic stock adjustments immediately reflect in analytics calculations', () => {
  const store = useAppStore.getState()

  const initialKpis = calculateNetworkOverviewKpis({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  // Find an available item with capacity and weight headroom for a +2 adjustment
  const targetItem = store.inventory.find((i) => {
    if (!i.available) return false
    const binConfig = store.bins.find((b) => b.id === i.binId)
    const skuDef = store.skus.find((s) => s.id === i.skuId)
    const unitWeight = skuDef?.optimizationProfile?.weightKg ?? 1
    const maxWeight = binConfig?.optimizationConstraints?.maxWeightKg ?? 25
    return (
      i.quantity + 2 <= (binConfig?.capacity || 48) &&
      (i.quantity + 2) * unitWeight <= maxWeight
    )
  })
  assert.ok(targetItem, 'Target item with headroom must exist')
  const delta = 2

  const result = store.adjustStock({
    binId: targetItem.binId,
    skuId: targetItem.skuId,
    delta,
    reason: 'Analytics reconciliation stock count increment',
  })
  assert.equal(result.ok, true, `adjustStock should succeed: ${result.message}`)

  const updatedState = useAppStore.getState()
  const updatedKpis = calculateNetworkOverviewKpis({
    warehouses: updatedState.warehouses,
    inventory: updatedState.inventory,
    bins: updatedState.bins,
    skus: updatedState.skus,
    transfers: updatedState.interWarehouseTransfers,
    replenishmentRequests: updatedState.replenishmentRequests,
    movements: updatedState.movements,
  })

  assert.equal(
    updatedKpis.totalOnHandUnits,
    initialKpis.totalOnHandUnits + delta,
    'Total on-hand units must increase by exactly the adjusted quantity'
  )
  assert.equal(
    updatedKpis.totalOnHandUnits,
    updatedKpis.totalAvailableUnits + updatedKpis.totalReservedUnits,
    'Invariant must remain strictly intact after stock adjustments'
  )
})
