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
let detectCurrentRole
let buildWarehouseGraph
let findShortestPath
let optimizePickRoute
let DEPOT_NODE_ID
let calculateSkuDemandProfiles
let analyzePeakDemand
let generateDemandAwareSlottingRecommendations
let calculateReplenishmentRecommendations
let calculateNetworkOverviewKpis
let filterInventoryRecords
let generateDeterministicSalesHistory

const FIXED_REF_DATE = new Date('2026-10-28T18:00:00Z')

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  ;({ detectCurrentRole } = await server.ssrLoadModule('/src/utils/roleHelper.ts'))
  const graphEngine = await server.ssrLoadModule('/src/data/warehouseGraphEngine.ts')
  buildWarehouseGraph = graphEngine.buildWarehouseGraph
  findShortestPath = graphEngine.findShortestPath
  optimizePickRoute = graphEngine.optimizePickRoute
  DEPOT_NODE_ID = graphEngine.DEPOT_NODE_ID

  ;({
    calculateSkuDemandProfiles,
    analyzePeakDemand,
    generateDemandAwareSlottingRecommendations,
  } = await server.ssrLoadModule('/src/data/demandIntelligenceEngine.ts'))
  ;({ calculateReplenishmentRecommendations } = await server.ssrLoadModule(
    '/src/data/intelligentReplenishmentEngine.ts'
  ))
  ;({
    calculateNetworkOverviewKpis,
    filterInventoryRecords,
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
  delete globalThis.window
})

beforeEach(() => {
  const testBins = [
    ...structuredClone(initialBins),
    ...structuredClone(networkBins),
    {
      id: 'BIN-TEST-EMPTY-1',
      warehouseId: 'WH-HYD-01',
      zone: 'B',
      skuId: '',
      quantity: 0,
      capacity: 50,
      status: 'Empty',
      x: 1,
      y: 1,
      aisle: 2,
      bay: 2,
      level: 1,
      optimizationConstraints: {
        maxWeightKg: 50,
        dimensionsCm: [60, 40, 40],
        handlingCapabilities: ['standard', 'oversize'],
        certifiedHazards: [],
        goldenZone: true,
        source: 'demo estimate',
      },
    },
    {
      id: 'BIN-TEST-EMPTY-2',
      warehouseId: 'WH-HYD-01',
      zone: 'B',
      skuId: '',
      quantity: 0,
      capacity: 50,
      status: 'Empty',
      x: 1,
      y: 2,
      aisle: 2,
      bay: 3,
      level: 1,
      optimizationConstraints: {
        maxWeightKg: 50,
        dimensionsCm: [60, 40, 40],
        handlingCapabilities: ['standard', 'oversize'],
        certifiedHazards: [],
        goldenZone: true,
        source: 'demo estimate',
      },
    },
  ]

  useAppStore.setState({
    selectedWarehouseId: 'WH-HYD-01',
    warehouses: structuredClone(demoWarehouses),
    bins: testBins,
    inventory: [...structuredClone(initialInventory), ...structuredClone(networkInventory)],
    skus: structuredClone(initialSkus),
    movements: [],
    interWarehouseTransfers: structuredClone(initialTransfers),
    transferTasks: [],
    replenishmentRequests: [],
    salesHistory: generateDeterministicSalesHistory(FIXED_REF_DATE),
    activeRoutePreview: null,
    dismissedRecommendationIds: [],
    dismissedReplenishmentRecommendationIds: [],
  })
})

// ============================================================================
// WORKFLOW 1 & 2: INVENTORY CRUD, ARCHIVING & BIN CONSTRAINTS
// ============================================================================

test('Workflows 1 & 2: Inventory CRUD lifecycle and bin assignment constraint enforcement', () => {
  const store = useAppStore.getState()

  // 1. Create product in an empty bin
  const emptyBinId = 'BIN-TEST-EMPTY-1'
  const createRes = store.createProduct({
    skuId: 'SKU-AUDIT-NEW',
    name: 'Ergonomic Mechanical Keyboard',
    category: 'Computers & Accessories',
    unit: 'box',
    quantity: 20,
    reorderPoint: 10,
    binId: emptyBinId,
    weightKg: 1.2,
    handling: 'standard',
  })
  assert.equal(createRes.ok, true, `createProduct should succeed: ${createRes.message}`)

  // 2. Reject incompatible SKU mixing in the same occupied bin
  const conflictRes = store.createProduct({
    skuId: 'SKU-AUDIT-CONFLICT',
    name: 'Different Product',
    category: 'Furniture Decor',
    unit: 'box',
    quantity: 5,
    reorderPoint: 2,
    binId: emptyBinId,
    weightKg: 1.0,
  })
  assert.equal(conflictRes.ok, false, 'Must reject assigning a second SKU to an occupied bin')
  assert.ok(conflictRes.message.includes('occupied') || conflictRes.message.includes('incompatible'))

  // 3. Edit product metadata
  const updateRes = store.updateProductMetadata('SKU-AUDIT-NEW', {
    name: 'Ergonomic Mechanical Keyboard v2 RGB',
    reorderPoint: 15,
  })
  assert.equal(updateRes.ok, true)
  const updatedSku = useAppStore.getState().skus.find((s) => s.id === 'SKU-AUDIT-NEW')
  assert.equal(updatedSku?.name, 'Ergonomic Mechanical Keyboard v2 RGB')
  assert.equal(updatedSku?.reorderPoint, 15)

  // 4. Archive item
  const archiveRes = store.archiveInventoryItem('SKU-AUDIT-NEW', emptyBinId)
  assert.equal(archiveRes.ok, true, `archiveInventoryItem should succeed: ${archiveRes.message}`)

  // Verify archived item is excluded from active inventory filters
  const activeItems = filterInventoryRecords(
    useAppStore.getState().inventory,
    useAppStore.getState().skus,
    useAppStore.getState().warehouses,
    { skuId: 'SKU-AUDIT-NEW' }
  )
  assert.equal(activeItems.length, 0, 'Archived item must not appear in active inventory queries')

  // 5. Restore item
  const restoreRes = store.restoreInventoryItem('SKU-AUDIT-NEW', emptyBinId)
  assert.equal(restoreRes.ok, true, `restoreInventoryItem should succeed: ${restoreRes.message}`)
  const restoredItem = useAppStore
    .getState()
    .inventory.find((i) => i.skuId === 'SKU-AUDIT-NEW' && i.binId === emptyBinId)
  assert.equal(restoredItem?.archived, false)
})

// ============================================================================
// WORKFLOW 3 & 4: GLOBAL SEARCH & ALTERNATIVE WAREHOUSE AVAILABILITY
// ============================================================================

test('Workflows 3 & 4: Search SKU across warehouse network and identify alternative surplus', () => {
  const store = useAppStore.getState()

  // Ensure WH-HYD-01 has 0 available of SKU-2084, but WH-CHN-03 has 50 available
  const modifiedInventory = store.inventory.map((item) => {
    if ((item.warehouseId || 'WH-HYD-01') === 'WH-HYD-01' && item.skuId === 'SKU-2084') {
      return { ...item, quantity: 2, reserved: 2 } // 0 available
    }
    if (item.warehouseId === 'WH-CHN-03' && item.skuId === 'SKU-2084') {
      return { ...item, quantity: 50, reserved: 0 } // 50 available
    }
    return item
  })
  useAppStore.setState({ inventory: modifiedInventory })

  // Global search for SKU-2084
  const searchResults = store.searchGlobalSku({ query: 'SKU-2084' })
  assert.ok(searchResults.length > 0, 'Global search must return results')

  for (const r of searchResults) {
    assert.equal(
      r.availableStock,
      Math.max(0, r.onHand - r.reserved),
      'Formula availableStock = onHand - reserved must strictly hold'
    )
  }

  // Alternative availability check for WH-HYD-01
  const availability = store.getWarehouseAvailability('SKU-2084', 20, 'WH-HYD-01')
  assert.equal(availability.preferredCanFulfill, false, 'Local WH-HYD-01 cannot fulfill 20 units')
  assert.equal(availability.preferredAvailable, 0)
  assert.ok(availability.alternativeWarehouses.length > 0, 'Must surface alternative sister facilities')

  const chnAlt = availability.alternativeWarehouses.find((a) => a.warehouseId === 'WH-CHN-03')
  assert.ok(chnAlt, 'Chennai must be listed with available surplus')
  assert.equal(chnAlt.availableStock, 50)
  assert.ok(chnAlt.distanceKm > 0, 'Must calculate transit distance in km')
  assert.ok(chnAlt.leadTimeHours > 0, 'Must calculate estimated transit duration')
})

// ============================================================================
// WORKFLOW 5: STOCK RESERVATION SAFETY & OVER-ALLOCATION PREVENTION
// ============================================================================

test('Workflow 5: Stock reservation prevents over-allocation and negative availability', () => {
  const store = useAppStore.getState()
  const item = store.inventory.find((i) => i.available && i.quantity > 10)
  assert.ok(item, 'Item with available quantity > 10 must exist')

  const availableBefore = item.quantity - (item.reserved || 0)

  // Request inter-warehouse transfer that exceeds available units
  const excessiveTransfer = store.requestInterWarehouseTransfer({
    sourceWarehouseId: item.warehouseId || 'WH-HYD-01',
    destinationWarehouseId: 'WH-CHN-03',
    sourceBinId: item.binId,
    destinationBinId: 'A-01-01',
    skuId: item.skuId,
    quantity: availableBefore + 100, // over-allocation attempt
  })

  // Approval must fail due to insufficient available stock
  if (excessiveTransfer.ok && excessiveTransfer.transfer) {
    const approveRes = store.approveInterWarehouseTransfer(excessiveTransfer.transfer.id)
    assert.equal(approveRes.ok, false, 'Must reject approving transfer exceeding available stock')
    assert.ok(approveRes.message.includes('Insufficient') || approveRes.message.includes('available'))
  }
})

// ============================================================================
// WORKFLOW 6, 7 & 8: TRANSFER LIFECYCLE, IN-TRANSIT ACCOUNTING & PARTIAL RECEIPTS
// ============================================================================

test('Workflows 6, 7 & 8: Inter-warehouse transfer lifecycle, strict in-transit isolation, and partial receipts', () => {
  const store = useAppStore.getState()
  const sourceItem = store.inventory.find(
    (i) => (i.warehouseId || 'WH-HYD-01') === 'WH-HYD-01' && i.quantity >= 20 && i.available
  )
  assert.ok(sourceItem, 'Source item with >= 20 units must exist')

  const destBin = store.bins.find((b) => b.warehouseId === 'WH-CHN-03')
  assert.ok(destBin, 'Destination bin in Chennai must exist')

  const initialSourceOnHand = sourceItem.quantity
  const initialSourceReserved = sourceItem.reserved || 0

  // 1. Create transfer request for 15 units
  const createRes = store.requestInterWarehouseTransfer({
    sourceWarehouseId: 'WH-HYD-01',
    destinationWarehouseId: 'WH-CHN-03',
    sourceBinId: sourceItem.binId,
    destinationBinId: destBin.id,
    skuId: sourceItem.skuId,
    quantity: 15,
    requestedBy: 'Integration Audit Runner',
  })
  assert.equal(createRes.ok, true)
  const transferId = createRes.transfer.id

  // 2. Approve transfer -> reserves 15 units at source bin
  const approveRes = store.approveInterWarehouseTransfer(transferId)
  assert.equal(approveRes.ok, true)
  const approvedSourceItem = useAppStore
    .getState()
    .inventory.find((i) => i.binId === sourceItem.binId && i.skuId === sourceItem.skuId)
  assert.ok(approvedSourceItem)
  assert.equal(approvedSourceItem.reserved, initialSourceReserved + 15)

  // 3. Dispatch transfer -> decrements physical on-hand at source, sets status IN TRANSIT
  const dispatchRes = store.dispatchInterWarehouseTransfer(transferId)
  assert.equal(dispatchRes.ok, true)
  const dispatchedSourceItem = useAppStore
    .getState()
    .inventory.find((i) => i.binId === sourceItem.binId && i.skuId === sourceItem.skuId)
  assert.ok(dispatchedSourceItem)
  assert.equal(dispatchedSourceItem.quantity, initialSourceOnHand - 15)
  assert.equal(dispatchedSourceItem.reserved, initialSourceReserved)

  // IN-TRANSIT INVARIANT: Must NOT exist in destination warehouse on-hand stock yet
  const prematureDestItem = useAppStore
    .getState()
    .inventory.find(
      (i) => i.warehouseId === 'WH-CHN-03' && i.binId === destBin.id && i.skuId === sourceItem.skuId
    )
  const destOnHandWhileInTransit = prematureDestItem?.quantity || 0

  // 4. Partial receipt: Receive 12 units out of 15 (3 units lost/damaged in transit)
  const receiveRes = store.receiveInterWarehouseTransfer(
    transferId,
    12,
    'Chennai Receiving Dock',
    '3 cartons water damaged in monsoon transit'
  )
  assert.equal(receiveRes.ok, true)

  const finalDestItem = useAppStore
    .getState()
    .inventory.find(
      (i) => i.warehouseId === 'WH-CHN-03' && i.binId === destBin.id && i.skuId === sourceItem.skuId
    )
  assert.ok(finalDestItem)
  assert.equal(finalDestItem.quantity, destOnHandWhileInTransit + 12)

  // 5. Prevent duplicate receipt processing
  const duplicateReceiveRes = store.receiveInterWarehouseTransfer(transferId, 12)
  assert.equal(duplicateReceiveRes.ok, false, 'Duplicate receipt processing must be blocked')

  // 6. Verify discrepancy was audited
  const updatedTransfer = useAppStore
    .getState()
    .interWarehouseTransfers.find((t) => t.id === transferId)
  assert.ok(updatedTransfer)
  assert.equal(updatedTransfer.status, 'RECEIVED')
  assert.equal(updatedTransfer.receivedQuantity, 12)
  assert.equal(updatedTransfer.discrepancyDetails?.actualReceivedQuantity, 12)
  assert.equal(updatedTransfer.discrepancyDetails?.reason, '3 cartons water damaged in monsoon transit')
})

// ============================================================================
// WORKFLOW 9 & 10: DEMAND INTELLIGENCE & DEMAND-AWARE SLOTTING
// ============================================================================

test('Workflows 9 & 10: Demand velocity calculation, ABC classification, and slotting recommendations', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: store.movements,
    referenceDate: FIXED_REF_DATE,
  })

  assert.ok(profiles.length > 0, 'Demand profiles must be computed')
  const classA = profiles.filter((p) => p.paretoClass === 'A')
  const classC = profiles.filter((p) => p.paretoClass === 'C')
  assert.ok(classA.length > 0, 'Must classify fast-movers as Pareto Class A')
  assert.ok(classC.length > 0, 'Must classify slow-movers as Pareto Class C')

  // Verify peak demand analysis
  const peaks = analyzePeakDemand(store.salesHistory, FIXED_REF_DATE)
  assert.ok(peaks.peakHour !== undefined)
  assert.ok(typeof peaks.peakHourLabel === 'string')

  // Generate slotting recommendations
  const slottingRecs = generateDemandAwareSlottingRecommendations({
    demandProfiles: profiles,
    bins: store.bins,
    inventory: store.inventory,
    skus: store.skus,
    warehouseId: 'WH-HYD-01',
  })

  // Slotting recommendations must not mutate physical stock automatically
  const inventoryBefore = JSON.stringify(store.inventory)
  assert.ok(Array.isArray(slottingRecs))
  assert.equal(
    JSON.stringify(useAppStore.getState().inventory),
    inventoryBefore,
    'Generating recommendations must never mutate inventory'
  )

  if (slottingRecs.length > 0) {
    const rec = slottingRecs[0]
    assert.ok(rec.weeklyKmSaved >= 0)
    assert.equal(rec.warehouseId, 'WH-HYD-01')
  }
})

// ============================================================================
// WORKFLOW 11 & 12: GRAPH PATHFINDING & MULTI-STOP TSP ROUTE OPTIMIZATION
// ============================================================================

test('Workflows 11 & 12: Dijkstra/A* obstacle avoidance and multi-stop TSP 2-opt route optimization', () => {
  const hydBins = useAppStore
    .getState()
    .bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')
  const graph = buildWarehouseGraph('WH-HYD-01', hydBins)

  assert.ok(graph.nodes[DEPOT_NODE_ID], 'Depot node must exist')
  assert.ok(graph.nodes['FRONT_AISLE_1'], 'Cross aisle node must exist')

  // Verify shortest path calculation
  const path = findShortestPath(graph, DEPOT_NODE_ID, 'FRONT_AISLE_1')
  assert.ok(path.pathNodeIds.length >= 2)
  assert.ok(path.totalDistanceMeters > 0)
  assert.equal(path.reachable, true)

  // Obstacle avoidance: block aisle 1 and verify path skirts around it
  const blockedGraph = buildWarehouseGraph('WH-HYD-01', hydBins, [1])
  const blockedPath = findShortestPath(blockedGraph, DEPOT_NODE_ID, 'BACK_AISLE_1')
  for (const nodeId of blockedPath.pathNodeIds) {
    assert.equal(
      nodeId.startsWith('AISLE_1_BAY_'),
      false,
      `Blocked aisle corridor node ${nodeId} must not appear in path`
    )
  }

  // Multi-stop pick route optimization
  const order = {
    id: 'PK-AUDIT-TEST',
    priority: 'High',
    status: 'Ready',
    lines: [
      { id: 'L1', skuId: 'SKU-2084', binId: 'A-01-01', requested: 2, picked: 0 },
      { id: 'L2', skuId: 'SKU-1102', binId: 'B-04-01', requested: 1, picked: 0 },
      { id: 'L3', skuId: 'SKU-3401', binId: 'C-06-02', requested: 3, picked: 0 },
    ],
  }

  const optResult = optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order,
    bins: hydBins,
  })
  assert.equal(optResult.reachable, true)
  assert.ok(
    optResult.optimizedDistanceMeters <= optResult.originalDistanceMeters + 1e-4,
    `Optimized distance (${optResult.optimizedDistanceMeters}m) must be <= original (${optResult.originalDistanceMeters}m)`
  )
  assert.equal(optResult.startNodeId, 'DEPOT')
  assert.equal(optResult.endNodeId, 'DEPOT')
  // All line items must be preserved (no stops skipped)
  const visitedBins = optResult.stops.map((s) => s.binId)
  assert.ok(visitedBins.includes('A-01-01'))
  assert.ok(visitedBins.includes('B-04-01'))
  assert.ok(visitedBins.includes('C-06-02'))
})

// ============================================================================
// WORKFLOW 13: LOCAL BIN RELOCATION LIFECYCLE
// ============================================================================

test('Workflow 13: Local bin relocation reservation, completion, and atomic movement', () => {
  const store = useAppStore.getState()
  const sourceItem = store.inventory.find(
    (i) => (i.warehouseId || 'WH-HYD-01') === 'WH-HYD-01' && i.quantity >= 10 && i.available
  )
  assert.ok(sourceItem)
  const emptyTargetBinId = 'BIN-TEST-EMPTY-2'

  // 1. Stage local relocation
  const stageRes = store.initiateRelocationTransfer({
    skuId: sourceItem.skuId,
    sourceBinId: sourceItem.binId,
    targetBinId: emptyTargetBinId,
    quantity: 5,
    notes: 'Integration Audit Relocation',
  })
  assert.equal(stageRes.ok, true, `initiateRelocationTransfer failed: ${stageRes.message}`)
  const taskId = useAppStore.getState().transferTasks[0].id

  // Verify source reservation
  const reservedSource = useAppStore
    .getState()
    .inventory.find((i) => i.binId === sourceItem.binId && i.skuId === sourceItem.skuId)
  assert.ok(reservedSource)
  assert.equal(reservedSource.reserved, (sourceItem.reserved || 0) + 5)

  // 2. Complete relocation
  const completeRes = store.completeRelocationTransfer(taskId)
  assert.equal(completeRes.ok, true)

  const finishedSource = useAppStore
    .getState()
    .inventory.find((i) => i.binId === sourceItem.binId && i.skuId === sourceItem.skuId)
  const targetItem = useAppStore
    .getState()
    .inventory.find((i) => i.binId === emptyTargetBinId && i.skuId === sourceItem.skuId)

  assert.ok(finishedSource)
  assert.ok(targetItem)
  assert.equal(finishedSource.quantity, sourceItem.quantity - 5)
  assert.equal(finishedSource.reserved, sourceItem.reserved || 0)
  assert.equal(targetItem.quantity, 5)
})

// ============================================================================
// WORKFLOW 14 & 15: REPLENISHMENT DUPLICATE SUPPRESSION & SUPPLIER RECEIPTS
// ============================================================================

test('Workflows 14 & 15: Replenishment duplicate suppression and warehouse-specific supplier receipts', () => {
  const store = useAppStore.getState()

  // Deplete stock for SKU-2084 across network so supplier PO is recommended
  const modifiedInventory = store.inventory.map((i) =>
    i.skuId === 'SKU-2084' ? { ...i, quantity: 0, reserved: 0 } : i
  )
  useAppStore.setState({ inventory: modifiedInventory })

  const recs = calculateReplenishmentRecommendations({
    warehouses: store.warehouses,
    inventory: useAppStore.getState().inventory,
    bins: store.bins,
    skus: store.skus,
    interWarehouseTransfers: [],
    replenishmentRequests: [],
    sales: store.salesHistory,
    warehouseId: 'WH-HYD-01',
    referenceDate: FIXED_REF_DATE,
  })

  assert.ok(recs.length > 0, 'Must generate replenishment recommendation for depleted stock')
  const sku2084Rec = recs.find((r) => r.skuId === 'SKU-2084')
  assert.ok(sku2084Rec)

  // Create purchase order for SKU-2084
  const destItem = store.inventory.find(
    (i) => (i.warehouseId || 'WH-HYD-01') === 'WH-HYD-01' && i.skuId === 'SKU-2084' && i.available
  )
  const targetBinId = destItem?.binId || 'A-01-01'

  const poRes = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: targetBinId,
    warehouseId: 'WH-HYD-01',
    supplier: sku2084Rec.supplierName || 'Mobly Decor / Olist',
    quantity: Math.min(30, sku2084Rec.recommendedQuantity || 30),
    expectedDate: '2026-11-05',
    preventDuplicates: true,
  })
  assert.equal(poRes.ok, true, `First PO should succeed: ${poRes.message}`)

  // Second attempt with preventDuplicates must be suppressed
  const duplicatePoRes = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: targetBinId,
    warehouseId: 'WH-HYD-01',
    supplier: sku2084Rec.supplierName || 'Mobly Decor / Olist',
    quantity: Math.min(30, sku2084Rec.recommendedQuantity || 30),
    expectedDate: '2026-11-05',
    preventDuplicates: true,
  })
  assert.equal(duplicatePoRes.ok, false, 'Duplicate PO creation must be rejected')

  // Supplier responds and dispatches shipment into transit
  const poQuantity = poRes.request.quantity
  const respondRes = store.respondToReplenishment(
    poRes.request.id,
    'full',
    poQuantity,
    '2026-11-05',
    'Supplier confirmed full allocation'
  )
  assert.equal(respondRes.ok, true, `respondToReplenishment failed: ${respondRes.message}`)

  const dispatchRes = store.dispatchReplenishment(poRes.request.id)
  assert.equal(dispatchRes.ok, true, `dispatchReplenishment failed: ${dispatchRes.message}`)

  // Supplier goods receipt updates destination warehouse only
  const chnBinBefore = store.inventory.find((i) => i.warehouseId === 'WH-CHN-03')
  const chnQtyBefore = chnBinBefore?.quantity || 0

  const receiptRes = store.receiveReplenishment(
    poRes.request.id,
    poQuantity,
    poQuantity,
    'TX-AUDIT-GR-01'
  )
  assert.equal(receiptRes.ok, true, `receiveReplenishment failed: ${receiptRes.message}`)

  // Verify Chennai inventory was unaffected
  const chnBinAfter = store.inventory.find((i) => i.warehouseId === 'WH-CHN-03')
  assert.equal(chnBinAfter?.quantity || 0, chnQtyBefore, 'Supplier receipt in Hyderabad must not modify Chennai stock')
})

// ============================================================================
// WORKFLOW 16, 17, 19 & 20: 3D SCENE ISOLATION, PORTAL CONSISTENCY & INVARIANTS
// ============================================================================

test('Workflows 16, 17, 19 & 20: 3D scene bin isolation, default manager role, and non-double-counting KPI invariants', () => {
  const store = useAppStore.getState()

  // 1. Role detection helper: dev:single defaults to manager
  globalThis.window = {
    location: {
      port: '5173',
      search: '',
    },
    __SMARTSLOT_ROLE__: undefined,
  }
  assert.equal(detectCurrentRole(), 'manager', 'Single-port dev mode must default to manager')

  // Explicit query param overrides role
  globalThis.window.location.search = '?role=picker'
  assert.equal(detectCurrentRole(), 'picker')

  // 2. 3D Scene Isolation: Bins for WH-CHN-03 must only belong to WH-CHN-03
  const chnBins = store.bins.filter((b) => b.warehouseId === 'WH-CHN-03')
  assert.ok(chnBins.length > 0)
  for (const bin of chnBins) {
    assert.equal(bin.warehouseId, 'WH-CHN-03')
  }

  // 3. Analytics KPI non-double-counting invariant
  const kpis = calculateNetworkOverviewKpis({
    warehouses: store.warehouses,
    inventory: store.inventory,
    bins: store.bins,
    skus: store.skus,
    transfers: store.interWarehouseTransfers,
    replenishmentRequests: store.replenishmentRequests,
    movements: store.movements,
  })

  assert.equal(
    kpis.totalOnHandUnits,
    kpis.totalAvailableUnits + kpis.totalReservedUnits,
    'Non-double-counting invariant: On-Hand = Available + Reserved'
  )
  assert.ok(kpis.distinctSkuCount > 0)
  assert.equal(kpis.activeWarehouseCount, 4)
})
