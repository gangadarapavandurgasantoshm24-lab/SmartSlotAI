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
let calculateReplenishmentRecommendations
let getSupplierOptionsForSku
let DEFAULT_SAFETY_STOCK_CONFIG
let DEMO_REPLENISHMENT_DISCLAIMER
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
    calculateReplenishmentRecommendations,
    getSupplierOptionsForSku,
    DEFAULT_SAFETY_STOCK_CONFIG,
    DEMO_REPLENISHMENT_DISCLAIMER,
  } = await server.ssrLoadModule('/src/data/intelligentReplenishmentEngine.ts'))
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
    replenishmentRequests: [],
    interWarehouseTransfers: structuredClone(initialTransfers),
    movements: [],
    transferTasks: [],
    liveAlerts: [],
    salesHistory: generateDeterministicSalesHistory(FIXED_REF_DATE),
    replenishmentSafetyStockConfig: structuredClone(DEFAULT_SAFETY_STOCK_CONFIG),
    dismissedReplenishmentRecommendationIds: [],
    processedReceiptTransactionIds: [],
  })
})

// ============================================================================
// 1. REORDER CALCULATION & AVAILABILITY FORMULAS
// ============================================================================

test('reorder calculation: evaluates available stock = onHand - reserved, lead time demand, and safety stock', () => {
  const store = useAppStore.getState()
  const whId = 'WH-BLR-04'

  // Bengaluru warehouse has low stock for SKU-2084 and SKU-3401 in network dataset
  const recs = calculateReplenishmentRecommendations({
    warehouseId: whId,
    inventory: store.inventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    replenishmentRequests: store.replenishmentRequests,
    interWarehouseTransfers: store.interWarehouseTransfers,
    config: DEFAULT_SAFETY_STOCK_CONFIG,
    referenceDate: FIXED_REF_DATE,
  })

  assert.ok(recs.length > 0, 'Should generate replenishment recommendations for depleted facility')

  recs.forEach((rec) => {
    const c = rec.calculations
    assert.equal(rec.warehouseId, whId)
    assert.equal(
      c.availableStock,
      Math.max(0, c.onHandStock - c.reservedStock),
      'Available stock must equal onHand - reserved'
    )
    assert.ok(c.dailyVelocity >= 0, 'Daily velocity must be non-negative')
    assert.ok(c.safetyStockUnits >= 0, 'Safety stock units must be non-negative')
    assert.ok(c.leadTimeDemand >= 0, 'Lead time demand must be non-negative')
    assert.ok(c.targetStockLevel >= c.reorderPoint, 'Target stock level must satisfy reorder point')
    assert.ok(rec.recommendedQuantity >= 5, 'Recommended quantity must be at least minimum order quantity')
    assert.ok(Array.isArray(c.assumptions), 'Calculations must document clear assumptions')
    assert.ok(c.assumptions.length >= 3, 'Must provide detailed formula assumptions')
  })
})

// ============================================================================
// 2. SHORTAGE CLASSIFICATION: LOCAL VS NETWORK-WIDE
// ============================================================================

test('shortage classification: local shortage triggers inter-warehouse transfer when sister warehouse has surplus', () => {
  const store = useAppStore.getState()
  // Hyderabad has surplus stock of SKU-2084 (1430 units); Bengaluru has 0 units
  const recs = calculateReplenishmentRecommendations({
    warehouseId: 'WH-BLR-04',
    inventory: store.inventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    replenishmentRequests: store.replenishmentRequests,
    interWarehouseTransfers: [],
    referenceDate: FIXED_REF_DATE,
  })

  const sku2084Rec = recs.find((r) => r.skuId === 'SKU-2084')
  assert.ok(sku2084Rec, 'Should find recommendation for depleted SKU-2084')
  assert.equal(sku2084Rec.shortageScope, 'local', 'Must be classified as a local shortage')
  assert.equal(
    sku2084Rec.strategy,
    'inter_warehouse_transfer',
    'Strategy should be inter-warehouse transfer when surplus sister warehouse exists'
  )
  assert.equal(
    sku2084Rec.sourceWarehouseId,
    'WH-HYD-01',
    'Source warehouse should be Hyderabad Central with surplus'
  )
  assert.ok(
    (sku2084Rec.availableSurplusAtSource ?? 0) >= 50,
    'Source must have substantial available surplus above its own reorder point'
  )
  assert.ok((sku2084Rec.transitDistanceKm ?? 0) > 0, 'Distance must be positive')
  assert.ok((sku2084Rec.estimatedTransitHours ?? 0) > 0, 'Transit hours must be positive')
})

test('shortage classification: network-wide deficit triggers supplier replenishment when all warehouses are depleted', () => {
  const store = useAppStore.getState()

  // Deplete SKU-2084 across all warehouses
  const depletedInventory = store.inventory.map((item) => {
    if (item.skuId === 'SKU-2084') {
      return { ...item, quantity: 2, reserved: 2 } // 0 available everywhere
    }
    return item
  })

  const recs = calculateReplenishmentRecommendations({
    warehouseId: 'WH-BLR-04',
    inventory: depletedInventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    replenishmentRequests: [],
    interWarehouseTransfers: [],
    referenceDate: FIXED_REF_DATE,
  })

  const sku2084Rec = recs.find((r) => r.skuId === 'SKU-2084')
  assert.ok(sku2084Rec, 'Should identify reorder need for depleted SKU-2084')
  assert.equal(
    sku2084Rec.shortageScope,
    'network_wide',
    'Depletion across all warehouses must be classified as network-wide deficit'
  )
  assert.equal(
    sku2084Rec.strategy,
    'supplier_replenishment',
    'Strategy must be supplier replenishment when no sister warehouse has surplus'
  )
  assert.ok(sku2084Rec.supplierName, 'Must assign primary supplier name')
  assert.ok(sku2084Rec.availableSuppliers.length >= 1, 'Must provide available supplier options')
})

// ============================================================================
// 3. PIPELINE STOCK ACCOUNTING & DUPLICATE SUPPRESSION
// ============================================================================

test('pipeline stock accounting: in-flight POs and in-transit transfers count as pipeline, not on-hand stock', () => {
  const store = useAppStore.getState()

  // Create an active in-flight replenishment request of 50 units for WH-BLR-04
  const targetBinId = store.bins.find((b) => b.warehouseId === 'WH-BLR-04')?.id || 'B-01-01'
  const activeRequest = {
    id: 'SR-TEST-01',
    skuId: 'SKU-2084',
    binId: targetBinId,
    warehouseId: 'WH-BLR-04',
    quantity: 50,
    confirmedQuantity: 50,
    supplier: 'Medline Industries',
    createdAt: new Date().toISOString(),
    expectedDate: '2026-11-05',
    status: 'In transit',
    responseNote: '',
    receipts: [],
    timeline: [],
  }

  const recs = calculateReplenishmentRecommendations({
    warehouseId: 'WH-BLR-04',
    inventory: store.inventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    replenishmentRequests: [activeRequest],
    interWarehouseTransfers: [],
    referenceDate: FIXED_REF_DATE,
  })

  const rec = recs.find((r) => r.skuId === 'SKU-2084')
  if (rec) {
    const c = rec.calculations
    assert.equal(c.inFlightPurchaseOrders, 50, 'Must record 50 units in flight')
    assert.equal(c.totalPipelineStock, 50, 'Total pipeline stock must include in-flight PO')
    assert.equal(
      c.netProjectedStock,
      c.availableStock + c.totalPipelineStock,
      'Projected net stock must sum available stock plus pipeline'
    )
    // Physical on-hand stock in inventory must NOT be increased
    const physicalItem = store.inventory.find(
      (i) => i.warehouseId === 'WH-BLR-04' && i.skuId === 'SKU-2084'
    )
    assert.equal(
      c.onHandStock,
      physicalItem?.quantity ?? 0,
      'Calculated on-hand stock must strictly match physical inventory, excluding pipeline'
    )
  }
})

test('duplicate prevention: suppresses duplicate recommendations when pipeline stock already covers deficit', () => {
  const store = useAppStore.getState()
  const targetBin = store.bins.find((b) => b.warehouseId === 'WH-BLR-04')
  assert.ok(targetBin)

  // Stage a massive in-transit transfer of 200 units that fully covers deficit
  const inTransitTransfer = {
    id: 'TR-TEST-99',
    skuId: 'SKU-2084',
    sourceWarehouseId: 'WH-HYD-01',
    destinationWarehouseId: 'WH-BLR-04',
    sourceBinId: 'C-06-02',
    destinationBinId: targetBin.id,
    quantity: 200,
    status: 'IN_TRANSIT',
    requestedAt: new Date().toISOString(),
    approvedAt: new Date().toISOString(),
    dispatchedAt: new Date().toISOString(),
    receivedAt: null,
    estimatedTransitHours: 12,
    distanceKm: 570,
    notes: 'In-transit batch',
  }

  const recs = calculateReplenishmentRecommendations({
    warehouseId: 'WH-BLR-04',
    inventory: store.inventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    replenishmentRequests: [],
    interWarehouseTransfers: [inTransitTransfer],
    referenceDate: FIXED_REF_DATE,
  })

  const rec = recs.find((r) => r.skuId === 'SKU-2084')
  // Should either be omitted or have hasPendingOrder = true with recommendedQuantity = 0
  if (rec) {
    assert.equal(rec.hasPendingOrder, true, 'Must flag pending order in progress')
    assert.equal(rec.recommendedQuantity, 0, 'Must suppress new order quantity when pipeline satisfies demand')
  }
})

test('duplicate prevention: createReplenishmentRequest with preventDuplicates blocks redundant active PO creation', () => {
  const store = useAppStore.getState()
  const first = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: 'C-06-02',
    quantity: 25,
    supplier: 'Medline Industries',
    expectedDate: '2026-11-04',
    preventDuplicates: true,
  })
  assert.equal(first.ok, true, 'First PO should be created successfully')

  // Attempt to create second identical PO while first is active
  const duplicate = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: 'C-06-02',
    quantity: 25,
    supplier: 'Medline Industries',
    expectedDate: '2026-11-04',
    preventDuplicates: true,
  })

  assert.equal(duplicate.ok, false, 'Duplicate PO must be rejected')
  assert.match(duplicate.message, /duplicate request blocked/i)
})

// ============================================================================
// 4. CONFIGURABLE SAFETY-STOCK RULES
// ============================================================================

test('safety stock configuration: adjusts order quantities when safety stock days or review cycle days are modified', () => {
  const store = useAppStore.getState()
  const whId = 'WH-BLR-04'

  // Standard config
  const standardRecs = calculateReplenishmentRecommendations({
    warehouseId: whId,
    inventory: store.inventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    config: { classASafetyStockDays: 4, minOrderQuantity: 5 },
    referenceDate: FIXED_REF_DATE,
  })

  // Aggressive buffer config (double safety days + high MOQ)
  const aggressiveRecs = calculateReplenishmentRecommendations({
    warehouseId: whId,
    inventory: store.inventory,
    skus: store.skus,
    bins: store.bins,
    warehouses: store.warehouses,
    sales: store.salesHistory,
    movements: store.movements,
    config: { classASafetyStockDays: 14, minOrderQuantity: 50 },
    referenceDate: FIXED_REF_DATE,
  })

  const stdRec = standardRecs.find((r) => r.skuId === 'SKU-2084')
  const aggRec = aggressiveRecs.find((r) => r.skuId === 'SKU-2084')

  if (stdRec && aggRec) {
    assert.ok(
      aggRec.calculations.safetyStockUnits > stdRec.calculations.safetyStockUnits,
      'Aggressive safety days must produce higher safety stock units'
    )
    assert.ok(
      aggRec.recommendedQuantity >= 50,
      'Aggressive config must respect higher minimum order quantity'
    )
  }
})

// ============================================================================
// 5. MANAGER REVIEW & APPROVAL LIFECYCLE
// ============================================================================

test('manager review & approval: approving supplier PO recommendation creates PO and stages in supplier hub', () => {
  const store = useAppStore.getState()
  // Generate recommendations for network-wide shortage
  const depletedInventory = store.inventory.map((item) =>
    item.skuId === 'SKU-2084' ? { ...item, quantity: 0, reserved: 0 } : item
  )
  useAppStore.setState({ inventory: depletedInventory, selectedWarehouseId: 'WH-HYD-01' })

  const recs = useAppStore.getState().getIntelligentReplenishmentRecommendations('WH-HYD-01')
  const targetRec = recs.find((r) => r.strategy === 'supplier_replenishment')
  assert.ok(targetRec, 'Must have a supplier replenishment recommendation')

  const initialPoCount = useAppStore.getState().replenishmentRequests.length
  const approvalRes = useAppStore.getState().approveReplenishmentRecommendation(targetRec.id, {
    quantity: 30,
    warehouseId: 'WH-HYD-01',
  })

  assert.equal(approvalRes.ok, true, 'Approval must succeed')
  assert.ok(approvalRes.requestId, 'Must return new request ID')

  const updatedRequests = useAppStore.getState().replenishmentRequests
  assert.equal(updatedRequests.length, initialPoCount + 1, 'Requests count should increment by 1')

  const createdPo = updatedRequests.find((r) => r.id === approvalRes.requestId)
  assert.ok(createdPo)
  assert.equal(createdPo.skuId, targetRec.skuId)
  assert.equal(createdPo.quantity, 30)
  assert.equal(createdPo.status, 'Submitted')
  assert.ok(createdPo.urgency, 'Must preserve urgency indicator')
})

test('manager review & approval: approving inter-warehouse transfer recommendation creates approved transfer and reserves stock', () => {
  useAppStore.setState({ selectedWarehouseId: 'WH-BLR-04' })

  const recs = useAppStore.getState().getIntelligentReplenishmentRecommendations('WH-BLR-04')
  const transferRec = recs.find((r) => r.strategy === 'inter_warehouse_transfer')
  assert.ok(transferRec, 'Must have an inter-warehouse transfer recommendation for Bengaluru')

  const initialTransferCount = useAppStore.getState().interWarehouseTransfers.length
  const approvalRes = useAppStore.getState().approveReplenishmentRecommendation(transferRec.id, {
    quantity: 20,
    warehouseId: 'WH-BLR-04',
  })

  assert.equal(approvalRes.ok, true, 'Approval must succeed')
  assert.ok(approvalRes.transferId, 'Must return transfer ID')

  const updatedTransfers = useAppStore.getState().interWarehouseTransfers
  assert.equal(updatedTransfers.length, initialTransferCount + 1, 'Transfers count must increment by 1')

  const stagedTransfer = updatedTransfers.find((t) => t.id === approvalRes.transferId)
  assert.ok(stagedTransfer)
  assert.equal(stagedTransfer.status, 'APPROVED')
  assert.equal(stagedTransfer.quantity, 20)
  assert.equal(stagedTransfer.sourceWarehouseId, transferRec.sourceWarehouseId)
  assert.equal(stagedTransfer.destinationWarehouseId, 'WH-BLR-04')

  // Source inventory must have 20 units reserved
  const sourceStock = useAppStore.getState().inventory.find(
    (i) => i.binId === transferRec.sourceBinId && i.skuId === transferRec.skuId
  )
  assert.ok((sourceStock?.reserved ?? 0) >= 20, 'Source stock must have units reserved for approved transfer')
})

test('recommendation dismissal: dismissed recommendations are hidden from active queries', () => {
  const store = useAppStore.getState()
  const recs = store.getIntelligentReplenishmentRecommendations('WH-BLR-04')
  assert.ok(recs.length > 0)
  const targetId = recs[0].id

  store.dismissReplenishmentRecommendation(targetId)

  const refreshedRecs = useAppStore.getState().getIntelligentReplenishmentRecommendations('WH-BLR-04')
  assert.ok(!refreshedRecs.some((r) => r.id === targetId), 'Dismissed recommendation must not appear in active queries')
})

// ============================================================================
// 6. INVARIANCE & VENDOR DISPATCH SAFETY
// ============================================================================

test('non-destructive invariance: calculating or querying recommendations never mutates inventory, movements, or requests', () => {
  const store = useAppStore.getState()
  const initialInvJson = JSON.stringify(store.inventory)
  const initialReqJson = JSON.stringify(store.replenishmentRequests)
  const initialMovJson = JSON.stringify(store.movements)

  // Query across all warehouses
  for (const wh of store.warehouses) {
    store.getIntelligentReplenishmentRecommendations(wh.id)
  }

  const afterState = useAppStore.getState()
  assert.equal(JSON.stringify(afterState.inventory), initialInvJson, 'Inventory must not be modified by preview')
  assert.equal(JSON.stringify(afterState.replenishmentRequests), initialReqJson, 'Requests must not be modified by preview')
  assert.equal(JSON.stringify(afterState.movements), initialMovJson, 'Movements must not be modified by preview')
})

test('supplier portal workflow: vendor confirming and dispatching PO transitions status to In transit without modifying physical inventory', () => {
  const store = useAppStore.getState()
  const createRes = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: 'C-06-02',
    quantity: 20,
    supplier: 'Medline Industries',
    expectedDate: '2026-11-04',
  })
  assert.ok(createRes.request)
  const poId = createRes.request.id

  const initialStock = store.inventory.find((i) => i.binId === 'C-06-02' && i.skuId === 'SKU-2084')?.quantity ?? 0

  // Supplier confirms full availability
  const confirmRes = store.respondToReplenishment(poId, 'full', 20, '2026-11-04', 'Confirmed ready')
  assert.equal(confirmRes.ok, true)
  assert.equal(confirmRes.request?.status, 'Confirmed full')

  // Stock must still be unchanged
  assert.equal(
    store.inventory.find((i) => i.binId === 'C-06-02' && i.skuId === 'SKU-2084')?.quantity,
    initialStock,
    'Physical stock must remain unchanged after supplier confirmation'
  )

  // Supplier marks dispatched
  const dispatchRes = store.dispatchReplenishment(poId)
  assert.equal(dispatchRes.ok, true)
  assert.equal(dispatchRes.request?.status, 'In transit')

  // CRITICAL INVARIANT: Dispatching must NOT increase physical inventory!
  const stockAfterDispatch = store.inventory.find((i) => i.binId === 'C-06-02' && i.skuId === 'SKU-2084')?.quantity ?? 0
  assert.equal(
    stockAfterDispatch,
    initialStock,
    'PHYSICAL INVENTORY INVARIANT: Dispatching must NEVER increase on-hand stock. Only dock receipt acceptance does.'
  )
})

// ============================================================================
// 7. GOODS RECEIPT, DISCREPANCIES & AUDIT MOVEMENTS
// ============================================================================

test('dock receipt & discrepancy: receiving goods increases on-hand stock by ACCEPTED units only, rejecting damaged units and logging discrepancy reason', () => {
  const store = useAppStore.getState()
  const createRes = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: 'C-06-02',
    quantity: 20,
    supplier: 'Medline Industries',
    expectedDate: '2026-11-04',
  })
  assert.ok(createRes.request)
  const po = createRes.request

  store.respondToReplenishment(po.id, 'full', 20, '2026-11-04', 'Dispatched')
  store.dispatchReplenishment(po.id)

  const initialStock = store.inventory.find((i) => i.binId === 'C-06-02' && i.skuId === 'SKU-2084')?.quantity ?? 0
  const initialMovements = store.movements.length

  // Carrier delivers 20 units, but 5 are water damaged; manager accepts 15 units
  const txId = `receipt-tx-${Date.now()}`
  const receiptRes = store.receiveReplenishment(
    po.id,
    20, // delivered
    15, // accepted
    txId,
    '5 cartons crushed and water damaged in carrier transit; rejected at dock bay 4'
  )

  assert.equal(receiptRes.ok, true, 'Receipt must succeed')
  assert.equal(receiptRes.receipt?.delivered, 20)
  assert.equal(receiptRes.receipt?.accepted, 15)
  assert.equal(receiptRes.receipt?.rejected, 5)

  // Physical stock must increase by exactly 15 (accepted units only)
  const updatedStock = useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02' && i.skuId === 'SKU-2084')?.quantity ?? 0
  assert.equal(
    updatedStock,
    initialStock + 15,
    'Physical inventory must increase strictly by accepted units (15), not delivered units (20)'
  )

  // Must log stock movement of type 'receive' with discrepancy reason
  const updatedMovements = useAppStore.getState().movements
  assert.equal(updatedMovements.length, initialMovements + 1, 'Movement history must record goods receipt event')
  const receiptMove = updatedMovements[0]
  assert.equal(receiptMove.type, 'receive')
  assert.equal(receiptMove.quantity, 15)
  assert.match(receiptMove.reason ?? '', /crushed and water damaged/i)
})

test('dock receipt idempotency: prevents processing duplicate receipt transaction IDs', () => {
  const store = useAppStore.getState()
  const createRes = store.createReplenishmentRequest({
    skuId: 'SKU-2084',
    binId: 'C-06-02',
    quantity: 10,
    supplier: 'Medline Industries',
    expectedDate: '2026-11-04',
  })
  assert.ok(createRes.request)
  const po = createRes.request

  store.respondToReplenishment(po.id, 'full', 10, '2026-11-04', 'Dispatched')
  store.dispatchReplenishment(po.id)

  const txId = 'deterministic-idempotent-tx-999'
  const first = store.receiveReplenishment(po.id, 10, 10, txId)
  assert.equal(first.ok, true)

  const duplicate = store.receiveReplenishment(po.id, 10, 10, txId)
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.message, /already processed/i)
})

// ============================================================================
// 8. SUPPLIER OPTIONS & TELEMETRY REGISTRY
// ============================================================================

test('supplier options & simulated telemetry: returns primary and secondary supplier options with simulated lead times and reliability metrics', () => {
  const store = useAppStore.getState()
  const testSku = store.skus.find((s) => s.id === 'SKU-2084')
  assert.ok(testSku)

  const options = getSupplierOptionsForSku(testSku)
  assert.ok(options.length >= 2, 'Should provide at least primary and secondary supplier options')

  const primary = options.find((o) => o.isPrimary)
  assert.ok(primary, 'Must designate a primary supplier')
  assert.ok(primary.leadTimeDays > 0, 'Lead time must be positive')
  assert.ok(primary.reliabilityRating >= 90, 'Primary supplier reliability rating should be >= 90%')
  assert.ok(primary.minOrderQuantity > 0, 'Minimum order quantity must be positive')

  assert.ok(DEMO_REPLENISHMENT_DISCLAIMER.length > 20, 'Must have clear demo telemetry disclaimer')
})
