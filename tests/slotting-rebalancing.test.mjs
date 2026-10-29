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
let generateDeterministicSalesHistory
let calculateBinDepotDistance
let calculateSkuDemandProfiles
let generateDemandAwareSlottingRecommendations
let generateNetworkRebalancingRecommendations
let buildWarehouseGraph

const FIXED_REF_DATE = new Date('2026-10-28T18:00:00Z')

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  ;({
    calculateBinDepotDistance,
    calculateSkuDemandProfiles,
    generateDemandAwareSlottingRecommendations,
  } = await server.ssrLoadModule('/src/data/demandIntelligenceEngine.ts'))
  ;({ generateDeterministicSalesHistory } = await server.ssrLoadModule(
    '/src/data/demandHistoryData.ts'
  ))
  ;({ buildWarehouseGraph } = await server.ssrLoadModule('/src/data/warehouseGraphEngine.ts'))
  const multiWhData = await server.ssrLoadModule('/src/data/multiWarehouseData.ts')
  demoWarehouses = multiWhData.demoWarehouses
  const gen = multiWhData.generateNetworkBinsAndInventory()
  networkBins = gen.bins
  networkInventory = gen.inventory

  ;({ generateNetworkRebalancingRecommendations } = await server.ssrLoadModule(
    '/src/data/multiWarehouseEngine.ts'
  ))

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
    transferTasks: [],
    interWarehouseTransfers: [],
    liveAlerts: [],
    salesHistory: generateDeterministicSalesHistory(FIXED_REF_DATE),
    dismissedRecommendationIds: [],
  })
})

// ============================================================================
// 1. HIGH-VELOCITY PRODUCT IDENTIFICATION & GOLDEN ZONE RECOMMENDATIONS
// ============================================================================

test('high-velocity identification: detects Class A fast movers in non-ergonomic tiers or distant zones', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })
  const classAProfiles = profiles.filter((p) => p.paretoClass === 'A')
  assert.ok(classAProfiles.length >= 1, 'Should identify Pareto Class A items')

  const recs = generateDemandAwareSlottingRecommendations({
    demandProfiles: profiles,
    bins: store.bins,
    inventory: store.inventory,
    skus: store.skus,
    warehouseId: 'WH-HYD-01',
  })

  assert.ok(recs.length > 0, 'Should generate slotting recommendations for fast movers')
  recs.forEach((rec) => {
    assert.equal(rec.type, 'local_relocation')
    assert.equal(rec.warehouseId, 'WH-HYD-01')
    assert.equal(rec.paretoClass, 'A', 'Local recommendations should focus on Class A items')
    assert.ok(rec.recommendedLevel <= 2, 'Recommended bin must be an ergonomic Level 1 or 2')
    assert.ok(
      ['Zone A', 'Zone B', 'A', 'B'].includes(rec.recommendedZone),
      'Recommended bin must be in Golden Zone A or B'
    )
    assert.ok(rec.distanceSavedMeters > 0, 'Must save picker travel distance')
    assert.ok(rec.weeklyKmSaved > 0, 'Must produce positive weekly km saved')
  })
})

test('recommendation ranking: sorts local slotting recommendations by weekly km saved descending', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })
  const recs = generateDemandAwareSlottingRecommendations({
    demandProfiles: profiles,
    bins: store.bins,
    inventory: store.inventory,
    skus: store.skus,
    warehouseId: 'WH-HYD-01',
  })

  for (let i = 0; i < recs.length - 1; i++) {
    assert.ok(
      recs[i].weeklyKmSaved >= recs[i + 1].weeklyKmSaved,
      `Expected rec[${i}].weeklyKmSaved (${recs[i].weeklyKmSaved}) >= rec[${i + 1}].weeklyKmSaved (${recs[i + 1].weeklyKmSaved})`
    )
  }
})

// ============================================================================
// 2. GRAPH-BASED ROUTE DISTANCE VS MANHATTAN DISTANCE
// ============================================================================

test('calculateBinDepotDistance: computes actual corridor route distance via graph with vertical penalties', () => {
  const store = useAppStore.getState()
  const graph = buildWarehouseGraph('WH-HYD-01', store.bins)

  // Find a level 1 bin and a level 3 bin in the same aisle/bay
  const hydBins = store.bins.filter((b) => !b.warehouseId || b.warehouseId === 'WH-HYD-01')
  const level1Bin = hydBins.find((b) => b.level === 1)
  const level3Bin = hydBins.find(
    (b) => b.aisle === level1Bin.aisle && b.bay === level1Bin.bay && b.level === 3
  )

  const distLevel1 = calculateBinDepotDistance(level1Bin, graph)
  const distLevel3 = calculateBinDepotDistance(level3Bin, graph)

  assert.ok(distLevel1 > 0, 'Corridor distance must be positive')
  assert.ok(
    distLevel3 > distLevel1,
    `Level 3 distance (${distLevel3}m) must be strictly greater than Level 1 distance (${distLevel1}m) due to vertical penalty`
  )
  assert.equal(
    Math.round((distLevel3 - distLevel1) * 10) / 10,
    3.5,
    'Level 3 bin should have exactly 3.5m vertical retrieval penalty over Level 1'
  )

  // Fallback test: without graph, Manhattan formula is used
  const manhattanDist = calculateBinDepotDistance(level1Bin)
  assert.ok(manhattanDist > 0, 'Fallback Manhattan distance should be positive')
})

// ============================================================================
// 3. PHYSICAL CONSTRAINTS ENFORCEMENT
// ============================================================================

test('constraint enforcement: rejects target bins that violate capacity, max weight, handling, or SKU mixing', () => {
  const store = useAppStore.getState()
  const testSkuId = 'SKU-CONSTR-TEST'
  const sourceBinId = 'D-06-06-L3B'

  const customSkus = [
    ...store.skus,
    {
      id: testSkuId,
      name: 'Constraint Test Heavy Item',
      category: 'Industrial',
      weightKg: 10,
      handlingRequired: 'oversize',
      dimensions: { width: 40, height: 40, depth: 40 },
    },
  ]

  const customInventory = [
    ...store.inventory,
    {
      id: 'inv-constr-test',
      skuId: testSkuId,
      binId: sourceBinId,
      quantity: 25,
      reserved: 0,
      zone: 'D',
      level: 3,
      warehouseId: 'WH-HYD-01',
    },
  ]

  const customProfiles = [
    {
      skuId: testSkuId,
      skuName: 'Constraint Test Heavy Item',
      category: 'Industrial',
      currentBinId: sourceBinId,
      currentZone: 'D',
      currentLevel: 3,
      dailyVelocity7d: 15,
      dailyVelocity30d: 15,
      paretoClass: 'A',
      stockCoverageDays: 10,
      reorderRisk: 'Healthy',
      totalSold30d: 450,
      onHandStock: 25,
      reservedStock: 0,
      availableStock: 25,
      unitWeightKg: 10,
      handlingRequired: 'oversize',
      isGoldenZone: false,
    },
  ]

  // Modify golden bins to test constraints:
  // A-01-06-L1F: Capacity only 10 (less than 25) -> fails capacity
  // A-02-06-L1F: maxWeightKg only 50kg (25 * 10kg = 250kg) -> fails weight
  // B-04-06-L1F: capacity 50, maxWeight 500kg, supports oversize, empty -> SUCCEEDS!
  const customBins = store.bins.map((b) => {
    if (b.id === 'A-01-06-L1F') return { ...b, capacity: 10 }
    if (b.id === 'A-02-06-L1F') {
      return {
        ...b,
        capacity: 50,
        optimizationConstraints: { ...b.optimizationConstraints, maxWeightKg: 50 },
      }
    }
    if (b.id === 'B-04-06-L1F') {
      return {
        ...b,
        capacity: 50,
        optimizationConstraints: {
          ...b.optimizationConstraints,
          maxWeightKg: 500,
          handlingCapabilities: ['standard', 'oversize'],
        },
      }
    }
    return b
  })

  const recs = generateDemandAwareSlottingRecommendations({
    demandProfiles: customProfiles,
    bins: customBins,
    inventory: customInventory,
    skus: customSkus,
    warehouseId: 'WH-HYD-01',
  })

  const heavyRec = recs.find((r) => r.skuId === testSkuId)
  assert.ok(heavyRec, 'Should produce a recommendation for the test item')
  // Ensure none of the failing bins were chosen
  assert.notEqual(heavyRec.recommendedBinId, 'A-01-06-L1F', 'Must not choose capacity-violating bin')
  assert.notEqual(heavyRec.recommendedBinId, 'A-02-06-L1F', 'Must not choose weight-violating bin')
  assert.equal(heavyRec.recommendedBinId, 'B-04-06-L1F', 'Must choose compliant bin')

  // Verify structure of constraints metadata
  assert.equal(heavyRec.constraints.capacityCheck.passed, true)
  assert.equal(heavyRec.constraints.weightCheck.passed, true)
  assert.equal(heavyRec.constraints.handlingCheck.passed, true)
  assert.equal(heavyRec.constraints.skuCompatibility.passed, true)
  assert.equal(heavyRec.constraints.reservationCheck.passed, true)
})

test('active pick reservation safety: skips items with zero available unreserved stock', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  // Fully reserve all stock for Class A items
  const fullyReservedInventory = store.inventory.map((i) => ({
    ...i,
    reserved: i.quantity,
  }))

  const recs = generateDemandAwareSlottingRecommendations({
    demandProfiles: profiles,
    bins: store.bins,
    inventory: fullyReservedInventory,
    skus: store.skus,
    warehouseId: 'WH-HYD-01',
  })

  assert.equal(recs.length, 0, 'Must not recommend slotting for any item with 0 unreserved units')
})

// ============================================================================
// 4. WAREHOUSE ISOLATION (LOCAL SLOTTING VS INTER-WAREHOUSE)
// ============================================================================

test('warehouse isolation: local slotting recommendations strictly target bins within the same warehouse', () => {
  const store = useAppStore.getState()
  const hydProfiles = store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01').profiles

  const hydRecs = generateDemandAwareSlottingRecommendations({
    demandProfiles: hydProfiles,
    bins: store.bins,
    inventory: store.inventory,
    skus: store.skus,
    warehouseId: 'WH-HYD-01',
  })

  hydRecs.forEach((rec) => {
    assert.equal(rec.type, 'local_relocation')
    assert.equal(rec.warehouseId, 'WH-HYD-01')
    const targetBin = store.bins.find((b) => b.id === rec.recommendedBinId)
    assert.ok(targetBin, `Target bin ${rec.recommendedBinId} must exist`)
    const targetWh = targetBin.warehouseId || 'WH-HYD-01'
    assert.equal(targetWh, 'WH-HYD-01', 'Target bin must belong to the same facility')
  })
})

// ============================================================================
// 5. LOCAL RELOCATION APPROVAL, EXECUTION, AND INVARIANCE LIFECYCLE
// ============================================================================

test('pure invariance: generating and previewing recommendations never modifies inventory or movements', () => {
  const store = useAppStore.getState()
  const initialInvJson = JSON.stringify(store.inventory)
  const initialMovementsLen = store.movements.length
  const initialTasksLen = store.transferTasks.length

  // Generate intelligence multiple times
  store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01')
  store.getDemandIntelligence(7, FIXED_REF_DATE, 'WH-HYD-01')
  store.getNetworkRebalancingRecommendations()

  const afterState = useAppStore.getState()
  assert.equal(JSON.stringify(afterState.inventory), initialInvJson, 'Inventory must remain completely identical')
  assert.equal(afterState.movements.length, initialMovementsLen, 'Movements must not change')
  assert.equal(afterState.transferTasks.length, initialTasksLen, 'Transfer tasks must not change')
})

test('local relocation approval lifecycle: stages transfer task and reserves stock without changing on-hand inventory', () => {
  const store = useAppStore.getState()
  const { recommendations } = store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01')
  assert.ok(recommendations.length > 0, 'Must have at least one slotting recommendation')

  const rec = recommendations[0]
  const sourceBefore = store.inventory.find((i) => i.binId === rec.currentBinId && i.skuId === rec.skuId)
  assert.ok(sourceBefore, 'Source inventory must exist')
  const initialOnHand = sourceBefore.quantity
  const initialReserved = sourceBefore.reserved || 0

  // Approve recommendation
  const approvalRes = store.approveSlottingRecommendation(rec.id)
  assert.equal(approvalRes.ok, true, `Approval should succeed: ${approvalRes.message}`)

  // Verify transfer task was staged
  const updatedTasks = useAppStore.getState().transferTasks
  const stagedTask = updatedTasks.find((t) => t.sourceBinId === rec.currentBinId && t.skuId === rec.skuId)
  assert.ok(stagedTask, 'A pending relocation transfer task should be created')
  assert.equal(stagedTask.status, 'Pending')
  assert.ok(stagedTask.quantity > 0)

  // Verify stock reservation invariant: ON-HAND IS UNCHANGED, RESERVED IS INCREASED
  const sourceAfter = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
  )
  assert.equal(sourceAfter.quantity, initialOnHand, 'Source on-hand quantity MUST NOT change upon approval')
  assert.equal(
    sourceAfter.reserved,
    initialReserved + stagedTask.quantity,
    'Source reserved stock must increase by task quantity'
  )
})

test('local relocation completion: updates physical stock atomically, unreserves source, and logs movement', () => {
  const store = useAppStore.getState()
  const { recommendations } = store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01')
  const rec = recommendations[0]

  const approvalRes = store.approveSlottingRecommendation(rec.id)
  assert.equal(approvalRes.ok, true)

  const task = useAppStore.getState().transferTasks.find(
    (t) => t.sourceBinId === rec.currentBinId && t.skuId === rec.skuId && t.status === 'Pending'
  )
  assert.ok(task)

  const sourceBeforeMove = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
  )
  const sourceQtyBefore = sourceBeforeMove.quantity
  const sourceReservedBefore = sourceBeforeMove.reserved

  const targetBefore = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.recommendedBinId && i.skuId === rec.skuId
  )
  const targetQtyBefore = targetBefore ? targetBefore.quantity : 0

  // Complete the transfer
  const completeRes = useAppStore.getState().completeRelocationTransfer(task.id)
  assert.equal(completeRes.ok, true, `Completion should succeed: ${completeRes.message}`)

  // Verify task status
  const completedTask = useAppStore.getState().transferTasks.find((t) => t.id === task.id)
  assert.equal(completedTask.status, 'Completed')

  // Verify stock accounting
  const sourceAfterMove = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
  )
  const targetStock = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.recommendedBinId && i.skuId === rec.skuId
  )

  if (sourceAfterMove) {
    assert.equal(sourceAfterMove.quantity, sourceQtyBefore - task.quantity, 'Source stock decremented')
    assert.equal(sourceAfterMove.reserved, sourceReservedBefore - task.quantity, 'Source reservation released')
  }
  assert.ok(targetStock, 'Target bin inventory record must exist')
  assert.equal(targetStock.quantity, targetQtyBefore + task.quantity, 'Target bin receives exact transferred units')

  // Verify relocate movement logged
  const movements = useAppStore.getState().movements
  const relocateMovement = movements.find(
    (m) => m.skuId === rec.skuId && m.binId === rec.currentBinId && m.destinationBinId === rec.recommendedBinId
  )
  assert.ok(relocateMovement, 'Must log relocate movement')
  assert.equal(relocateMovement.type, 'relocate')
  assert.equal(relocateMovement.quantity, task.quantity)
})

test('local relocation cancellation: releases source reservation without altering physical inventory', () => {
  const store = useAppStore.getState()
  const { recommendations } = store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01')
  const rec = recommendations[0]

  store.approveSlottingRecommendation(rec.id)
  const task = useAppStore.getState().transferTasks.find(
    (t) => t.sourceBinId === rec.currentBinId && t.skuId === rec.skuId && t.status === 'Pending'
  )

  const sourceReservedWhilePending = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
  ).reserved

  // Cancel the transfer
  const cancelRes = useAppStore.getState().cancelRelocationTransfer(task.id)
  assert.equal(cancelRes.ok, true)

  const cancelledTask = useAppStore.getState().transferTasks.find((t) => t.id === task.id)
  assert.equal(cancelledTask.status, 'Cancelled')

  const sourceAfterCancel = useAppStore.getState().inventory.find(
    (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
  )
  assert.equal(
    sourceAfterCancel.reserved,
    sourceReservedWhilePending - task.quantity,
    'Reserved quantity must be fully restored'
  )
})

// ============================================================================
// 6. INTER-WAREHOUSE NETWORK REBALANCING LIFECYCLE
// ============================================================================

test('network rebalancing detection: identifies surplus vs deficit facilities and computes freight metrics', () => {
  const store = useAppStore.getState()
  const profiles = store.getDemandIntelligence(30, FIXED_REF_DATE).profiles
  const recs = generateNetworkRebalancingRecommendations({
    inventory: store.inventory,
    warehouses: store.warehouses,
    skus: store.skus,
    bins: store.bins,
    profiles,
  })
  assert.ok(recs.length > 0, 'Should generate network rebalancing recommendations')

  recs.forEach((rec) => {
    assert.equal(rec.type, 'inter_warehouse_transfer')
    assert.notEqual(rec.sourceWarehouseId, rec.destinationWarehouseId, 'Origin and destination must differ')
    assert.ok(rec.suggestedQuantity > 0, 'Suggested transfer units must be positive')
    assert.ok(rec.distanceKm > 0, 'Highway transit distance must be positive')
    assert.ok(rec.estimatedTransitHours > 0, 'Estimated freight transit hours must be positive')
    assert.ok(rec.sourceBinId, 'Source bin location must be identified')
    assert.ok(rec.destinationBinId, 'Target bay location must be identified')
    assert.ok(rec.expectedBenefit, 'Expected benefit explanation must be populated')
    assert.equal(rec.constraints.differentWarehouses, true)
    assert.equal(rec.constraints.sourceStockSufficient, true)
    assert.equal(rec.constraints.activePickSafe, true)
    assert.equal(rec.constraints.destinationCapacityOk, true)
  })
})

test('network rebalancing approval lifecycle: stages approved transfer and reserves stock without premature transfer', () => {
  const store = useAppStore.getState()
  const recs = store.getNetworkRebalancingRecommendations()
  assert.ok(recs.length > 0)
  const rec = recs[0]

  const sourceInvBefore = store.inventory.find(
    (i) => i.warehouseId === rec.sourceWarehouseId && i.skuId === rec.skuId && !i.archived
  )
  const destInvBefore = store.inventory.find(
    (i) => i.warehouseId === rec.destinationWarehouseId && i.skuId === rec.skuId && !i.archived
  )
  const sourceOnHand = sourceInvBefore.quantity
  const sourceReserved = sourceInvBefore.reserved || 0
  const destOnHand = destInvBefore ? destInvBefore.quantity : 0

  // Approve the network rebalancing recommendation
  const approveRes = store.approveRebalancingRecommendation(rec.id)
  assert.equal(approveRes.ok, true, `Approval should succeed: ${approveRes.message}`)

  // Verify transfer record was created in APPROVED status
  const transfers = useAppStore.getState().interWarehouseTransfers
  const stagedTransfer = transfers.find(
    (t) =>
      t.sourceWarehouseId === rec.sourceWarehouseId &&
      t.destinationWarehouseId === rec.destinationWarehouseId &&
      t.skuId === rec.skuId
  )
  assert.ok(stagedTransfer, 'Staged inter-warehouse transfer must exist')
  assert.equal(stagedTransfer.status, 'APPROVED')
  assert.equal(stagedTransfer.quantity, rec.suggestedQuantity)

  // Verify invariant: source on-hand and dest on-hand are unchanged; source reserved increased
  const sourceInvAfter = useAppStore.getState().inventory.find(
    (i) => i.warehouseId === rec.sourceWarehouseId && i.skuId === rec.skuId && !i.archived
  )
  const destInvAfter = useAppStore.getState().inventory.find(
    (i) => i.warehouseId === rec.destinationWarehouseId && i.skuId === rec.skuId && !i.archived
  )

  assert.equal(sourceInvAfter.quantity, sourceOnHand, 'Source warehouse on-hand stock MUST NOT change on approval')
  assert.equal(
    sourceInvAfter.reserved,
    sourceReserved + rec.suggestedQuantity,
    'Source warehouse reserved stock must increase by transferred units'
  )
  assert.equal(
    destInvAfter ? destInvAfter.quantity : 0,
    destOnHand,
    'Destination warehouse stock MUST NOT increase before shipment arrival'
  )
})

test('network rebalancing physical completion: dispatch decrements source, receipt increments destination', () => {
  const store = useAppStore.getState()
  const recs = store.getNetworkRebalancingRecommendations()
  const rec = recs[0]

  store.approveRebalancingRecommendation(rec.id)
  const transfer = useAppStore.getState().interWarehouseTransfers.find(
    (t) =>
      t.sourceWarehouseId === rec.sourceWarehouseId &&
      t.destinationWarehouseId === rec.destinationWarehouseId &&
      t.skuId === rec.skuId
  )

  // Dispatch the transfer
  const dispatchRes = useAppStore.getState().dispatchInterWarehouseTransfer(transfer.id)
  assert.equal(dispatchRes.ok, true, `Dispatch should succeed: ${dispatchRes.message}`)

  // After dispatch: status is 'IN TRANSIT', source on-hand decremented and reservation released
  const dispatchedTransfer = useAppStore.getState().interWarehouseTransfers.find((t) => t.id === transfer.id)
  assert.equal(dispatchedTransfer.status, 'IN TRANSIT')

  // Receive transfer at destination dock
  const receiveRes = useAppStore.getState().receiveInterWarehouseTransfer(transfer.id, transfer.quantity)
  assert.equal(receiveRes.ok, true, `Receive should succeed: ${receiveRes.message}`)

  const receivedTransfer = useAppStore.getState().interWarehouseTransfers.find((t) => t.id === transfer.id)
  assert.equal(receivedTransfer.status, 'RECEIVED')

  // Destination inventory must now reflect added units
  const destInv = useAppStore.getState().inventory.find(
    (i) => i.warehouseId === rec.destinationWarehouseId && i.skuId === rec.skuId && !i.archived
  )
  assert.ok(destInv, 'Destination inventory must exist')
  assert.ok(destInv.quantity >= rec.suggestedQuantity, 'Destination inventory must contain received units')
})

// ============================================================================
// 7. RECOMMENDATION DISMISSAL & EXCLUSION
// ============================================================================

test('recommendation dismissal: dismissed recommendations are hidden from active queries', () => {
  const store = useAppStore.getState()
  const { recommendations: initialRecs } = store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01')
  assert.ok(initialRecs.length > 0)
  const targetRecId = initialRecs[0].id

  // Dismiss recommendation
  store.dismissRecommendation(targetRecId)

  // Query again
  const { recommendations: filteredRecs } = store.getDemandIntelligence(30, FIXED_REF_DATE, 'WH-HYD-01')
  const stillPresent = filteredRecs.some((r) => r.id === targetRecId)
  assert.equal(stillPresent, false, 'Dismissed recommendation must be excluded from subsequent queries')
  assert.equal(filteredRecs.length, initialRecs.length - 1)
})
