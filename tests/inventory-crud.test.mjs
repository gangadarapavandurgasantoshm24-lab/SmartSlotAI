import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let useAppStore
let initialInventory
let initialBins
let initialSkus

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })
  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  initialInventory = mockData.inventory
  initialBins = mockData.warehouseBins
  initialSkus = mockData.skus
})

after(async () => {
  if (server) await server.close()
})

beforeEach(() => {
  const testBins = structuredClone(initialBins)
  testBins.push({
    id: 'BIN-TEST-EMPTY',
    zone: 'B',
    skuId: '',
    quantity: 0,
    capacity: 50,
    status: 'Empty',
    x: 1,
    y: 1,
    optimizationConstraints: {
      maxWeightKg: 25,
      dimensionsCm: [60, 40, 40],
      handlingCapabilities: ['standard', 'heavy', 'fragile'],
    },
  })

  useAppStore.setState({
    inventory: structuredClone(initialInventory),
    bins: testBins,
    skus: structuredClone(initialSkus),
    movements: [],
    transferTasks: [],
    liveAlerts: [],
    pickOrder: {
      id: 'ORD-TEST-01',
      picker: 'Alex Morgan',
      assignedTo: 'Cart P-07',
      status: 'In progress',
      lines: [
        {
          id: 'POL-01',
          skuId: 'SKU-2084',
          binId: 'C-06-02',
          requested: 5,
          picked: 0,
        },
      ],
      currentStopIndex: 0,
    },
    replenishmentRequests: [
      {
        id: 'REQ-TEST-01',
        skuId: 'SKU-0010',
        binId: 'D-03-01',
        quantity: 20,
        status: 'In transit',
        timeline: [],
      },
    ],
  })
})

test('createProduct: successfully creates new SKU, slotted inventory item, and placement movement in compatible empty bin', () => {
  const store = useAppStore.getState()
  const emptyBinId = 'BIN-TEST-EMPTY'
  const initialMovementsCount = store.movements.length

  const res = store.createProduct({
    skuId: 'SKU-NEW-99',
    name: 'Industrial Torque Wrench Set',
    category: 'Tools & Hardware',
    unit: 'set',
    quantity: 10,
    reorderPoint: 5,
    weightKg: 1.5,
    supplier: 'Apex Tool Group',
    binId: emptyBinId,
    handling: 'heavy',
  })

  assert.equal(res.ok, true, `Expected success but got: ${res.message}`)
  const updated = useAppStore.getState()

  // Verify SKU added
  const createdSku = updated.skus.find((s) => s.id === 'SKU-NEW-99')
  assert.ok(createdSku, 'New SKU should be present in store.skus')
  assert.equal(createdSku.name, 'Industrial Torque Wrench Set')
  assert.equal(createdSku.optimizationProfile?.weightKg, 1.5)
  assert.equal(createdSku.optimizationProfile?.handling, 'heavy')

  // Verify InventoryItem added
  const slottedItem = updated.inventory.find((i) => i.binId === emptyBinId && i.skuId === 'SKU-NEW-99')
  assert.ok(slottedItem, 'Slotted inventory item should exist in target bin')
  assert.equal(slottedItem.quantity, 10)
  assert.equal(slottedItem.reorderPoint, 5)

  // Verify initial movement logged
  assert.ok(updated.movements.length > initialMovementsCount, 'Stock movement should be logged')
  const lastMovement = updated.movements[0]
  assert.equal(lastMovement.skuId, 'SKU-NEW-99')
  assert.equal(lastMovement.binId, emptyBinId)
  assert.equal(lastMovement.quantity, 10)
})

test('createProduct: rejects duplicate SKU when conflicting name or details provided', () => {
  const store = useAppStore.getState()
  const res = store.createProduct({
    skuId: 'SKU-2084',
    name: 'Different Name Conflict',
    category: 'Tools',
    unit: 'box',
    quantity: 5,
    reorderPoint: 2,
    weightKg: 1,
    supplier: 'Some Vendor',
    binId: 'BIN-TEST-EMPTY',
  })

  assert.equal(res.ok, false)
  assert.match(res.message, /already exists/i)
})

test('createProduct: rejects assignment to bin occupied by a different SKU (incompatible SKU mixing)', () => {
  const store = useAppStore.getState()
  // C-06-02 is already occupied by SKU-2084
  const res = store.createProduct({
    skuId: 'SKU-NEW-88',
    name: 'Safety Glasses Pro',
    category: 'Safety',
    unit: 'pair',
    quantity: 10,
    reorderPoint: 5,
    weightKg: 0.2,
    supplier: '3M',
    binId: 'C-06-02',
  })

  assert.equal(res.ok, false)
  assert.match(res.message, /already occupied/i)
})

test('createProduct: rejects assignment exceeding target bin unit capacity', () => {
  const store = useAppStore.getState()
  const bin = store.bins.find((b) => b.id === 'BIN-TEST-EMPTY')
  const binCapacity = bin?.capacity ?? 50

  const res = store.createProduct({
    skuId: 'SKU-NEW-77',
    name: 'Oversized Cargo Straps',
    category: 'Shipping',
    unit: 'box',
    quantity: binCapacity + 100, // Exceeds capacity
    reorderPoint: 5,
    weightKg: 0.1,
    supplier: 'StrapCo',
    binId: 'BIN-TEST-EMPTY',
  })

  assert.equal(res.ok, false)
  assert.match(res.message, /exceeds bin capacity/i)
})

test('createProduct: rejects assignment exceeding target bin maximum weight rating', () => {
  const store = useAppStore.getState()
  const bin = store.bins.find((b) => b.id === 'BIN-TEST-EMPTY')
  const maxWeight = bin?.optimizationConstraints?.maxWeightKg ?? 25

  const res = store.createProduct({
    skuId: 'SKU-NEW-HEAVY',
    name: 'Lead Ballast Weights',
    category: 'Heavy Equipment',
    unit: 'crate',
    quantity: 5,
    reorderPoint: 2,
    weightKg: maxWeight + 10, // 5 * (maxWeight + 10) exceeds bin max weight
    supplier: 'HeavyForge',
    binId: 'BIN-TEST-EMPTY',
  })

  assert.equal(res.ok, false)
  assert.match(res.message, /weight/i)
})

test('updateProductMetadata: updates SKU specifications and syncs reorder point across inventory', () => {
  const store = useAppStore.getState()
  const res = store.updateProductMetadata('SKU-2084', {
    name: 'AuraGlow Smart Luminary V2',
    category: 'Smart Lighting & IoT',
    supplier: 'Luminary Advanced Labs',
    weightKg: 2.1,
    handling: 'fragile',
    reorderPoint: 18,
  })

  assert.equal(res.ok, true, `Expected success: ${res.message}`)
  const updated = useAppStore.getState()
  const sku = updated.skus.find((s) => s.id === 'SKU-2084')
  assert.equal(sku?.name, 'AuraGlow Smart Luminary V2')
  assert.equal(sku?.category, 'Smart Lighting & IoT')
  assert.equal(sku?.supplier, 'Luminary Advanced Labs')
  assert.equal(sku?.optimizationProfile?.weightKg, 2.1)
  assert.equal(sku?.optimizationProfile?.handling, 'fragile')

  // Verify reorderPoint synced on inventory item
  const inv = updated.inventory.find((i) => i.skuId === 'SKU-2084')
  assert.equal(inv?.reorderPoint, 18)
})

test('adjustStock: increases stock count and logs explicit adjust movement with reason', () => {
  const store = useAppStore.getState()
  const targetItem = store.inventory.find((i) => i.skuId === 'SKU-2084' && i.binId === 'C-06-02')
  assert.ok(targetItem)
  const initialQty = targetItem.quantity

  const res = store.adjustStock({
    binId: 'C-06-02',
    skuId: 'SKU-2084',
    delta: 10,
    reason: 'Quarterly physical inventory count audit',
  })
  assert.equal(res.ok, true, `Expected adjustment success: ${res.message}`)

  const updated = useAppStore.getState()
  const updatedItem = updated.inventory.find((i) => i.skuId === 'SKU-2084' && i.binId === 'C-06-02')
  assert.equal(updatedItem?.quantity, initialQty + 10)

  // Verify explicit adjust movement
  const lastMove = updated.movements[0]
  assert.equal(lastMove.type, 'adjust')
  assert.equal(lastMove.quantity, 10)
  assert.equal(lastMove.binId, 'C-06-02')
  assert.equal(lastMove.skuId, 'SKU-2084')
  assert.equal(lastMove.reason, 'Quarterly physical inventory count audit')
})

test('adjustStock: decreases stock count and logs explicit negative adjust movement', () => {
  const store = useAppStore.getState()
  const targetItem = store.inventory.find((i) => i.skuId === 'SKU-2084' && i.binId === 'C-06-02')
  assert.ok(targetItem)
  const initialQty = targetItem.quantity
  assert.ok(initialQty >= 6)

  const res = store.adjustStock({
    binId: 'C-06-02',
    skuId: 'SKU-2084',
    delta: -4,
    reason: 'Damaged carton write-off',
  })
  assert.equal(res.ok, true)

  const updated = useAppStore.getState()
  const updatedItem = updated.inventory.find((i) => i.skuId === 'SKU-2084' && i.binId === 'C-06-02')
  assert.equal(updatedItem?.quantity, initialQty - 4)

  const lastMove = updated.movements[0]
  assert.equal(lastMove.type, 'adjust')
  assert.equal(lastMove.quantity, 4)
  assert.equal(lastMove.reason, 'Damaged carton write-off')
})

test('adjustStock: rejects negative stock count or dropping below reserved units', () => {
  const store = useAppStore.getState()
  // Set reserved quantity to 5
  useAppStore.setState((s) => ({
    inventory: s.inventory.map((i) => (i.binId === 'C-06-02' ? { ...i, reserved: 5 } : i)),
  }))

  const target = useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02')
  assert.ok(target)

  // Try setting below 0 with large negative delta
  const resNegative = store.adjustStock({
    binId: 'C-06-02',
    skuId: 'SKU-2084',
    delta: -(target.quantity + 5),
    reason: 'Invalid negative',
  })
  assert.equal(resNegative.ok, false)

  // Try reducing below reserved (e.g. reducing so that remaining < reserved)
  const resBelowReserved = store.adjustStock({
    binId: 'C-06-02',
    skuId: 'SKU-2084',
    delta: -(target.quantity - target.reserved + 2),
    reason: 'Below reserved',
  })
  assert.equal(resBelowReserved.ok, false)
  assert.match(resBelowReserved.message, /reserved/i)
})

test('archiveInventoryItem: blocks archiving when product is referenced in active pick order', () => {
  const store = useAppStore.getState()
  // SKU-2084 is in active pickOrder.lines
  const res = store.archiveInventoryItem('SKU-2084', 'C-06-02')
  assert.equal(res.ok, false)
  assert.match(res.message, /active pick order/i)

  const item = useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02' && i.skuId === 'SKU-2084')
  assert.equal(item?.archived, undefined)
})

test('archiveInventoryItem: blocks archiving when product has open replenishment requests', () => {
  const store = useAppStore.getState()
  // SKU-0010 has an 'In transit' replenishment request
  const res = store.archiveInventoryItem('SKU-0010', 'D-03-01')
  assert.equal(res.ok, false)
  assert.match(res.message, /replenishment/i)
})

test('archiveInventoryItem: blocks archiving when product has reserved stock', () => {
  const store = useAppStore.getState()
  useAppStore.setState((s) => ({
    inventory: s.inventory.map((i) => (i.binId === 'A-02-03' ? { ...i, reserved: 3 } : i)),
  }))

  const res = store.archiveInventoryItem('SKU-1102', 'A-02-03')
  assert.equal(res.ok, false)
  assert.match(res.message, /reserved/i)
})

test('archiveInventoryItem & restoreInventoryItem: safely archives clean product and restores it', () => {
  const store = useAppStore.getState()
  // Clear any conflicting pick lines or requests for SKU-1102
  useAppStore.setState((s) => ({
    pickOrder: { ...s.pickOrder, lines: [] },
    replenishmentRequests: [],
    transferTasks: [],
    inventory: s.inventory.map((i) => (i.skuId === 'SKU-1102' ? { ...i, reserved: 0 } : i)),
  }))

  const resArchive = store.archiveInventoryItem('SKU-1102', 'A-02-03')
  assert.equal(resArchive.ok, true, `Expected clean archive: ${resArchive.message}`)

  let updated = useAppStore.getState()
  const archivedItem = updated.inventory.find((i) => i.binId === 'A-02-03' && i.skuId === 'SKU-1102')
  assert.equal(archivedItem?.archived, true)

  // Restore product
  const resRestore = store.restoreInventoryItem('SKU-1102', 'A-02-03')
  assert.equal(resRestore.ok, true, `Expected restore: ${resRestore.message}`)

  updated = useAppStore.getState()
  const restoredItem = updated.inventory.find((i) => i.binId === 'A-02-03' && i.skuId === 'SKU-1102')
  assert.equal(restoredItem?.archived, false)
})

test('initiateRelocationTransfer: stages pending transfer and reserves stock without moving immediately', () => {
  const store = useAppStore.getState()
  const sourceBinId = 'C-06-02'
  const targetBinId = 'BIN-TEST-EMPTY'
  const sourceItemBefore = store.inventory.find((i) => i.binId === sourceBinId && i.skuId === 'SKU-2084')
  assert.ok(sourceItemBefore)
  const initialQty = sourceItemBefore.quantity
  const initialReserved = sourceItemBefore.reserved || 0

  const res = store.initiateRelocationTransfer({
    skuId: 'SKU-2084',
    sourceBinId,
    targetBinId,
    quantity: 5,
    notes: 'Stage for zone rebalance',
  })
  assert.equal(res.ok, true, `Expected transfer initiation success: ${res.message}`)

  const updated = useAppStore.getState()

  // Invariant check: Stock quantity must NOT change at source yet!
  const sourceItemAfter = updated.inventory.find((i) => i.binId === sourceBinId && i.skuId === 'SKU-2084')
  assert.equal(sourceItemAfter?.quantity, initialQty, 'Source stock quantity must not decrement on initiation')
  // Invariant check: Stock must be reserved at source
  assert.equal(sourceItemAfter?.reserved, initialReserved + 5, 'Source stock must have quantity reserved')

  // Invariant check: Stock must NOT appear at target yet!
  const targetItemAfter = updated.inventory.find((i) => i.binId === targetBinId && i.skuId === 'SKU-2084')
  assert.equal(targetItemAfter, undefined, 'Target bin must not receive stock until task is completed')

  // Transfer task must be recorded with status 'Pending'
  assert.equal(updated.transferTasks.length, 1)
  const task = updated.transferTasks[0]
  assert.equal(task.status, 'Pending')
  assert.equal(task.sourceBinId, sourceBinId)
  assert.equal(task.targetBinId, targetBinId)
  assert.equal(task.quantity, 5)
})

test('completeRelocationTransfer: moves physical stock atomically, unreserves source, and logs relocate movement', () => {
  const store = useAppStore.getState()
  const sourceBinId = 'C-06-02'
  const targetBinId = 'BIN-TEST-EMPTY'

  // Stage transfer first
  const initRes = store.initiateRelocationTransfer({
    skuId: 'SKU-2084',
    sourceBinId,
    targetBinId,
    quantity: 4,
    notes: 'Moving to Zone B',
  })
  assert.equal(initRes.ok, true)
  const taskId = useAppStore.getState().transferTasks[0].id

  const sourceBefore = useAppStore.getState().inventory.find((i) => i.binId === sourceBinId)
  const sourceQtyBefore = sourceBefore.quantity
  const sourceReservedBefore = sourceBefore.reserved

  // Execute completion
  const compRes = useAppStore.getState().completeRelocationTransfer(taskId)
  assert.equal(compRes.ok, true, `Expected completion success: ${compRes.message}`)

  const updated = useAppStore.getState()

  // Source bin should have decreased quantity and released reservation
  const sourceAfter = updated.inventory.find((i) => i.binId === sourceBinId)
  assert.equal(sourceAfter?.quantity, sourceQtyBefore - 4)
  assert.equal(sourceAfter?.reserved, sourceReservedBefore - 4)

  // Target bin must now have the 4 units
  const targetAfter = updated.inventory.find((i) => i.binId === targetBinId && i.skuId === 'SKU-2084')
  assert.ok(targetAfter, 'Target bin item must now exist')
  assert.equal(targetAfter.quantity, 4)

  // Task marked Completed
  const completedTask = updated.transferTasks.find((t) => t.id === taskId)
  assert.equal(completedTask?.status, 'Completed')

  // Explicit 'relocate' movement record logged
  const lastMove = updated.movements[0]
  assert.equal(lastMove.type, 'relocate')
  assert.equal(lastMove.binId, sourceBinId)
  assert.equal(lastMove.destinationBinId, targetBinId)
  assert.equal(lastMove.quantity, 4)
})

test('cancelRelocationTransfer: cancels pending task and releases reserved quantity at source', () => {
  const store = useAppStore.getState()
  const sourceBinId = 'C-06-02'
  const targetBinId = 'BIN-TEST-EMPTY'

  const initRes = store.initiateRelocationTransfer({
    skuId: 'SKU-2084',
    sourceBinId,
    targetBinId,
    quantity: 3,
    notes: 'Testing cancellation',
  })
  assert.equal(initRes.ok, true)
  const taskId = useAppStore.getState().transferTasks[0].id

  const sourceReservedStaged = useAppStore.getState().inventory.find((i) => i.binId === sourceBinId)?.reserved

  const cancelRes = useAppStore.getState().cancelRelocationTransfer(taskId)
  assert.equal(cancelRes.ok, true)

  const updated = useAppStore.getState()
  const sourceAfter = updated.inventory.find((i) => i.binId === sourceBinId)
  assert.equal(sourceAfter?.reserved, (sourceReservedStaged ?? 3) - 3)

  const task = updated.transferTasks.find((t) => t.id === taskId)
  assert.equal(task?.status, 'Cancelled')
})
