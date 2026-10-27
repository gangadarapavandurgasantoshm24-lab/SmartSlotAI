import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let useAppStore
let initialInventory
let activePickOrder
let getStockStatus
let getIncomingQuantity
let getWarehouseBinColor

before(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  ;({ getStockStatus } = await server.ssrLoadModule('/src/data/inventoryUtils.ts'))
  ;({ getWarehouseBinColor } = await server.ssrLoadModule('/src/components/digital-twin/binStatus.ts'))
  ;({ getIncomingQuantity } = await server.ssrLoadModule('/src/data/replenishmentUtils.ts'))
  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  initialInventory = mockData.inventory
  activePickOrder = mockData.activePickOrder
})

beforeEach(() => {
  useAppStore.setState({
    inventory: structuredClone(initialInventory),
    pickOrder: structuredClone(activePickOrder),
    movements: [],
    pickIssues: [],
    processedPickTransactionIds: [],
    lastPickResult: null,
    replenishmentRequests: [],
    processedReceiptTransactionIds: [],
    selectedBinId: activePickOrder.lines[0].binId,
  })
})

after(async () => {
  await server?.close()
})

test('confirms the 5-unit demo pick once, records movement, advances stop, and derives low stock at 7', () => {
  const result = useAppStore.getState().confirmPick('PK-3922-L1', 5, 'demo-txn-1')
  const state = useAppStore.getState()
  const stock = state.inventory.find((item) => item.binId === 'C-06-02')
  assert.deepEqual({ quantity: stock.quantity, reorderPoint: stock.reorderPoint }, { quantity: 7, reorderPoint: 10 })
  assert.equal(result.ok, true)
  assert.equal(result.lowStock, true)
  assert.equal(result.remaining, 7)
  assert.equal(state.pickOrder.lines[0].picked, 5)
  assert.equal(state.pickOrder.currentStopIndex, 1)
  assert.equal(state.selectedBinId, state.pickOrder.lines[1].binId)
  assert.equal(state.movements.length, 1)
  assert.deepEqual({ type: state.movements[0].type, binId: state.movements[0].binId, skuId: state.movements[0].skuId, quantity: state.movements[0].quantity, source: state.movements[0].source }, { type: 'pick', binId: 'C-06-02', skuId: 'SKU-2084', quantity: 5, source: 'picker-workspace' })
  assert.ok(Number.isFinite(Date.parse(state.movements[0].timestamp)))

  const duplicate = state.confirmPick('PK-3922-L1', 5, 'demo-txn-1')
  assert.equal(duplicate.kind, 'duplicate')
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 7)
  assert.equal(useAppStore.getState().movements.length, 1)
})

test('warehouse bin colors follow shared stock status rules and update with real inventory changes', () => {
  const item = structuredClone(initialInventory.find((entry) => entry.binId === 'C-06-02'))
  assert.equal(item.quantity, 12)
  assert.equal(getWarehouseBinColor(item), '#72b6ca')
  item.quantity = 7
  assert.equal(getStockStatus(item), 'Low stock')
  assert.equal(getWarehouseBinColor(item), '#e4bd64')
  item.quantity = 0
  assert.equal(getWarehouseBinColor(item), '#d8e0e3')
  item.quantity = 4
  item.available = false
  assert.equal(getWarehouseBinColor(item), '#857f9e')
})

test('every active order line maps to enough unreserved, available shared stock', () => {
  const state = useAppStore.getState()
  for (const line of state.pickOrder.lines) {
    const stock = state.inventory.find((item) => item.binId === line.binId && item.skuId === line.skuId)
    assert.ok(stock, `Missing inventory record for ${line.binId} / ${line.skuId}`)
    assert.equal(stock.available, true, `${line.binId} should be available for the demo order`)
    assert.ok(stock.quantity - stock.reserved >= line.requested, `${line.binId} should have enough unreserved units`)
  }
})

test('rejects invalid or excessive quantities without changing inventory, order, or movements', () => {
  const stockBefore = structuredClone(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02'))
  const orderBefore = structuredClone(useAppStore.getState().pickOrder)
  for (const [index, quantity] of [0, -1, 1.5, Number.NaN].entries()) {
    assert.equal(useAppStore.getState().confirmPick('PK-3922-L1', quantity, `invalid-${index}`).kind, 'validation')
  }
  const rejected = useAppStore.getState().confirmPick('PK-3922-L1', 13, 'too-much-for-bin')
  assert.match(rejected.message, /only 12 unreserved units are available/)
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, stockBefore.quantity)
  assert.equal(useAppStore.getState().pickOrder.lines[0].picked, orderBefore.lines[0].picked)
  assert.equal(useAppStore.getState().movements.length, 0)
})

test('subtracts reserved stock from pickable quantity', () => {
  useAppStore.setState((state) => ({ inventory: state.inventory.map((item) => item.binId === 'C-06-02' ? { ...item, reserved: 9 } : item), pickOrder: { ...state.pickOrder, lines: state.pickOrder.lines.map((line, index) => index === 0 ? { ...line, requested: 5 } : line) } }))
  const result = useAppStore.getState().confirmPick('PK-3922-L1', 4, 'reserved-stock')
  assert.match(result.message, /only 3 unreserved units are available/)
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 12)
  assert.equal(useAppStore.getState().movements.length, 0)
})

test('reporting an issue pauses the task and records details without changing stock', () => {
  const issue = useAppStore.getState().reportPickIssue('Quantity Mismatch', ' Counted 9 units; label shows 12. ', 9)
  const state = useAppStore.getState()
  assert.equal(issue.binId, 'C-06-02')
  assert.equal(issue.description, 'Counted 9 units; label shows 12.')
  assert.equal(issue.manualCount, 9)
  assert.equal(issue.status, 'Submitted')
  assert.ok(Number.isFinite(Date.parse(issue.timestamp)))
  assert.equal(state.pickOrder.status, 'Paused')
  assert.equal(state.inventory.find((item) => item.binId === 'C-06-02').quantity, 12)
  assert.equal(state.movements.length, 0)
  assert.equal(state.confirmPick('PK-3922-L1', 5, 'paused-task').kind, 'paused')
})

test('creates a replenishment request without changing on-hand inventory', () => {
  const before = useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity
  const result = useAppStore.getState().createReplenishmentRequest({ skuId: 'SKU-2084', binId: 'C-06-02', quantity: 20, supplier: 'Medline Industries', expectedDate: '2026-10-29', note: 'Dock 02' })
  const state = useAppStore.getState()
  assert.equal(result.ok, true)
  assert.equal(result.request.skuId, 'SKU-2084')
  assert.equal(result.request.binId, 'C-06-02')
  assert.equal(state.inventory.find((item) => item.binId === 'C-06-02').quantity, before)
  assert.equal(state.replenishmentRequests[0].timeline[0].actor, 'Manager')
})

test('supplier full confirmation and dispatch do not increase on-hand inventory', () => {
  const created = useAppStore.getState().createReplenishmentRequest({ skuId: 'SKU-2084', binId: 'C-06-02', quantity: 20, supplier: 'Medline Industries', expectedDate: '2026-10-29' })
  const before = useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity
  const response = useAppStore.getState().respondToReplenishment(created.request.id, 'full', 20, '2026-10-29', 'All units available')
  assert.equal(response.ok, true)
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, before)
  const dispatched = useAppStore.getState().dispatchReplenishment(created.request.id)
  assert.equal(dispatched.ok, true)
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, before)
})

test('rejects invalid supplier and receipt quantities without applying inventory', () => {
  const created = useAppStore.getState().createReplenishmentRequest({ skuId: 'SKU-2084', binId: 'C-06-02', quantity: 20, supplier: 'Medline Industries', expectedDate: '2026-10-29' })
  assert.equal(useAppStore.getState().respondToReplenishment(created.request.id, 'full', 19, '', '').ok, false)
  assert.equal(useAppStore.getState().respondToReplenishment(created.request.id, 'full', 20, '', '').ok, true)
  useAppStore.getState().dispatchReplenishment(created.request.id)
  for (const [delivered, accepted] of [[0, 0], [1.5, 1], [1, 2], [21, 21]]) {
    assert.equal(useAppStore.getState().receiveReplenishment(created.request.id, delivered, accepted, `invalid-${delivered}-${accepted}`).ok, false)
  }
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 12)
})

test('partial receipt adds only accepted units and records the correct request, SKU, and bin', () => {
  const created = useAppStore.getState().createReplenishmentRequest({ skuId: 'SKU-2084', binId: 'C-06-02', quantity: 20, supplier: 'Medline Industries', expectedDate: '2026-10-29' })
  useAppStore.getState().respondToReplenishment(created.request.id, 'full', 20, '', '')
  useAppStore.getState().dispatchReplenishment(created.request.id)
  const result = useAppStore.getState().receiveReplenishment(created.request.id, 10, 7, 'partial-rx')
  const state = useAppStore.getState()
  assert.equal(result.ok, true)
  assert.equal(state.inventory.find((item) => item.binId === 'C-06-02').quantity, 19)
  assert.deepEqual({ requestId: result.receipt.requestId, skuId: result.receipt.skuId, binId: result.receipt.binId, delivered: result.receipt.delivered, accepted: result.receipt.accepted, rejected: result.receipt.rejected }, { requestId: created.request.id, skuId: 'SKU-2084', binId: 'C-06-02', delivered: 10, accepted: 7, rejected: 3 })
  assert.equal(result.request.status, 'Partially received')
})

test('prevents duplicate receipt transaction from adding inventory twice', () => {
  const created = useAppStore.getState().createReplenishmentRequest({ skuId: 'SKU-2084', binId: 'C-06-02', quantity: 20, supplier: 'Medline Industries', expectedDate: '2026-10-29' })
  useAppStore.getState().respondToReplenishment(created.request.id, 'full', 20, '', '')
  useAppStore.getState().dispatchReplenishment(created.request.id)
  assert.equal(useAppStore.getState().receiveReplenishment(created.request.id, 20, 20, 'full-rx').ok, true)
  const duplicate = useAppStore.getState().receiveReplenishment(created.request.id, 20, 20, 'full-rx')
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.message, /already processed/)
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 32)
  assert.equal(useAppStore.getState().movements.length, 1)
})

test('completes the shared 12 → 7 → 27 picker, supplier, receipt, dashboard/twin, and optimization lifecycle', () => {
  const state = useAppStore.getState()
  const initial = state.inventory.find((item) => item.binId === 'C-06-02')
  assert.deepEqual({ quantity: initial.quantity, reorderPoint: initial.reorderPoint }, { quantity: 12, reorderPoint: 10 })
  assert.equal(state.confirmPick('PK-3922-L1', 5, 'stage4-demo-pick').ok, true)
  const afterPick = useAppStore.getState()
  const lowStock = afterPick.inventory.find((item) => item.binId === 'C-06-02')
  assert.equal(lowStock.quantity, 7)
  assert.equal(getStockStatus(lowStock), 'Low stock')
  const created = useAppStore.getState().createReplenishmentRequest({ skuId: 'SKU-2084', binId: 'C-06-02', quantity: 20, supplier: 'Medline Industries', expectedDate: '2026-10-29' })
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 7)
  useAppStore.getState().respondToReplenishment(created.request.id, 'full', 20, '2026-10-29', '')
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 7)
  useAppStore.getState().dispatchReplenishment(created.request.id)
  assert.equal(useAppStore.getState().inventory.find((item) => item.binId === 'C-06-02').quantity, 7)
  assert.equal(getIncomingQuantity(useAppStore.getState().replenishmentRequests[0]), 20)
  const result = useAppStore.getState().receiveReplenishment(created.request.id, 20, 20, 'end-to-end-rx')
  const final = useAppStore.getState()
  assert.equal(result.ok, true)
  assert.equal(final.inventory.find((item) => item.binId === 'C-06-02').quantity, 27)
  assert.equal(getStockStatus(final.inventory.find((item) => item.binId === 'C-06-02')), 'Healthy')
  assert.equal(final.replenishmentRequests[0].status, 'Completed')
  assert.deepEqual(final.movements.map((movement) => [movement.type, movement.quantity]), [['receive', 20], ['pick', 5]])
  const unchangedInventory = structuredClone(final.inventory)
  const approved = final.runOptimization()
  assert.equal(approved.proposed.hardConstraintViolations, 0)
  assert.equal(useAppStore.getState().approveOptimization('Manager').ok, true)
  assert.deepEqual(useAppStore.getState().inventory, unchangedInventory, 'Optimization approval must not alter on-hand stock or create a receipt')
  assert.equal(useAppStore.getState().movements.length, 2)
})
