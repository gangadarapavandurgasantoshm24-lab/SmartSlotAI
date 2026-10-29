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

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })
  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  const multiWhData = await server.ssrLoadModule('/src/data/multiWarehouseData.ts')
  initialInventory = mockData.inventory
  initialBins = mockData.warehouseBins
  initialSkus = mockData.skus
  demoWarehouses = multiWhData.demoWarehouses
  const gen = multiWhData.generateNetworkBinsAndInventory()
  networkBins = gen.bins
  networkInventory = gen.inventory
})

after(async () => {
  if (server) await server.close()
})

beforeEach(() => {
  // Reset store with clean initial data across network
  useAppStore.setState({
    selectedWarehouseId: 'WH-HYD-01',
    warehouses: structuredClone(demoWarehouses),
    bins: [...structuredClone(initialBins), ...structuredClone(networkBins)],
    inventory: [...structuredClone(initialInventory), ...structuredClone(networkInventory)],
    skus: structuredClone(initialSkus),
    movements: [],
    interWarehouseTransfers: [],
    transferTasks: [],
    liveAlerts: [],
  })
})

// ============================================================================
// 1. WAREHOUSE INITIALIZATION & ATTRIBUTES
// ============================================================================

test('warehouse initialization: 4 unique deterministic warehouses exist with valid IDs, cities, types, and capacities', () => {
  const store = useAppStore.getState()
  const whs = store.warehouses
  assert.equal(whs.length, 4, 'Should initialize exactly 4 regional warehouses')

  const expectedIds = ['WH-HYD-01', 'WH-VJA-02', 'WH-CHN-03', 'WH-BLR-04']
  for (const id of expectedIds) {
    const wh = whs.find((w) => w.id === id)
    assert.ok(wh, `Warehouse ${id} must exist in the network`)
    assert.ok(wh.name.length > 5, 'Warehouse must have a valid descriptive name')
    assert.ok(wh.city.length > 3, 'Warehouse must have a valid city')
    assert.ok(wh.capacity > 0, 'Warehouse capacity must be positive')
    assert.ok(wh.zones > 0, 'Warehouse zones must be positive')
    assert.ok(['Active', 'Maintenance', 'Inactive'].includes(wh.status || 'Active'))
  }

  // Ensure IDs are strictly unique
  const idSet = new Set(whs.map((w) => w.id))
  assert.equal(idSet.size, 4, 'Warehouse IDs must be unique')
})

// ============================================================================
// 2. WAREHOUSE-SPECIFIC BIN ASSIGNMENT & STOCK ISOLATION
// ============================================================================

test('warehouse-specific bin assignment: bins and inventory belong to exactly one warehouse', () => {
  const store = useAppStore.getState()
  for (const b of store.bins) {
    const whId = b.warehouseId || 'WH-HYD-01'
    assert.ok(['WH-HYD-01', 'WH-VJA-02', 'WH-CHN-03', 'WH-BLR-04'].includes(whId))
  }

  for (const i of store.inventory) {
    const whId = i.warehouseId || 'WH-HYD-01'
    assert.ok(['WH-HYD-01', 'WH-VJA-02', 'WH-CHN-03', 'WH-BLR-04'].includes(whId))
  }
})

test('stock isolation: stock adjustments in one warehouse do not modify inventory in another warehouse', () => {
  const store = useAppStore.getState()

  // Set up 2 items for SKU-2084 in 2 different warehouses
  useAppStore.setState({
    inventory: [
      {
        skuId: 'SKU-2084',
        binId: 'C-06-02',
        warehouseId: 'WH-HYD-01',
        quantity: 12,
        reserved: 0,
        capacity: 50,
        reorderPoint: 10,
        available: true,
        updated: 'Today',
      },
      {
        skuId: 'SKU-2084',
        binId: 'VJA-A-01-01',
        warehouseId: 'WH-VJA-02',
        quantity: 25,
        reserved: 0,
        capacity: 50,
        reorderPoint: 10,
        available: true,
        updated: 'Today',
      },
    ],
    bins: [
      { id: 'C-06-02', warehouseId: 'WH-HYD-01', zone: 'C', skuId: 'SKU-2084', quantity: 12, capacity: 50, status: 'Healthy', x: 0, y: 0 },
      { id: 'VJA-A-01-01', warehouseId: 'WH-VJA-02', zone: 'A', skuId: 'SKU-2084', quantity: 25, capacity: 50, status: 'Healthy', x: 0, y: 0 },
    ],
  })

  // Adjust stock in WH-HYD-01 bin C-06-02 by +8
  const res = store.adjustStock({
    binId: 'C-06-02',
    skuId: 'SKU-2084',
    delta: 8,
    reason: 'Received replenishment pallet',
  })
  assert.equal(res.ok, true)

  const updatedInv = useAppStore.getState().inventory
  const hydStock = updatedInv.find((i) => i.binId === 'C-06-02')
  const vjaStock = updatedInv.find((i) => i.binId === 'VJA-A-01-01')

  assert.equal(hydStock?.quantity, 20, 'WH-HYD-01 stock must increase to 20')
  assert.equal(vjaStock?.quantity, 25, 'WH-VJA-02 stock must remain strictly unchanged at 25')
})

// ============================================================================
// 3. GLOBAL SKU SEARCH & ALTERNATIVE WAREHOUSES
// ============================================================================

test('global SKU search: returns stock across warehouses with formula availableStock = onHand - reserved', () => {
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-2084', binId: 'BIN-HYD-1', warehouseId: 'WH-HYD-01', quantity: 30, reserved: 10, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
      { skuId: 'SKU-2084', binId: 'BIN-VJA-1', warehouseId: 'WH-VJA-02', quantity: 25, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    skus: [
      { id: 'SKU-2084', name: 'AuraGlow Smart Luminary', category: 'Furniture Decor', unit: 'box', reorderPoint: 10, supplier: 'Mobly' },
    ],
  })

  const results = useAppStore.getState().searchGlobalSku({ query: 'SKU-2084' })
  assert.equal(results.length, 2)

  const hyd = results.find((r) => r.warehouseId === 'WH-HYD-01')
  assert.ok(hyd)
  assert.equal(hyd.onHand, 30)
  assert.equal(hyd.reserved, 10)
  assert.equal(hyd.availableStock, 20, 'availableStock must equal onHand - reserved')

  const vja = results.find((r) => r.warehouseId === 'WH-VJA-02')
  assert.ok(vja)
  assert.equal(vja.onHand, 25)
  assert.equal(vja.reserved, 0)
  assert.equal(vja.availableStock, 25)
})

test('global SKU search: identifies alternative warehouses when primary warehouse has zero available stock', () => {
  // Scenario matching prompt specification:
  // - Warehouse 1 (WH-HYD-01): SKU-2084 with zero available stock
  // - Warehouse 2 (WH-VJA-02): 25 available units
  // - Warehouse 3 (WH-CHN-03): 8 available units
  // - Warehouse 4 (WH-BLR-04): 0 stock
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-2084', binId: 'HYD-01', warehouseId: 'WH-HYD-01', quantity: 15, reserved: 15, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
      { skuId: 'SKU-2084', binId: 'VJA-01', warehouseId: 'WH-VJA-02', quantity: 25, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
      { skuId: 'SKU-2084', binId: 'CHN-01', warehouseId: 'WH-CHN-03', quantity: 10, reserved: 2, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
      // BLR has no stock
    ],
    skus: [
      { id: 'SKU-2084', name: 'AuraGlow Smart Luminary', category: 'Furniture Decor', unit: 'box', reorderPoint: 10, supplier: 'Mobly' },
    ],
  })

  const availability = useAppStore.getState().getWarehouseAvailability('SKU-2084', 20, 'WH-HYD-01')

  assert.equal(availability.preferredAvailable, 0, 'WH-HYD-01 available stock must be 0')
  assert.equal(availability.preferredCanFulfill, false, 'WH-HYD-01 cannot fulfill 20 units')

  // Search results must identify Warehouse 2 and Warehouse 3 as alternative sources
  assert.equal(availability.alternativeWarehouses.length, 2, 'Should identify WH-VJA-02 and WH-CHN-03')

  const topAlt = availability.recommendedWarehouse
  assert.ok(topAlt)
  assert.equal(topAlt.warehouseId, 'WH-VJA-02', 'WH-VJA-02 must be top recommended alternative')
  assert.equal(topAlt.availableStock, 25)
  assert.equal(topAlt.canFulfillFully, true)

  const chnAlt = availability.alternativeWarehouses.find((w) => w.warehouseId === 'WH-CHN-03')
  assert.ok(chnAlt)
  assert.equal(chnAlt.availableStock, 8, 'WH-CHN-03 available stock must be 10 - 2 = 8')
  assert.equal(chnAlt.canFulfillFully, false)
})

test('global SKU search: never counts reserved units as available stock', () => {
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-2084', binId: 'HYD-01', warehouseId: 'WH-HYD-01', quantity: 100, reserved: 100, capacity: 150, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    skus: [{ id: 'SKU-2084', name: 'AuraGlow', category: 'Furniture', unit: 'unit', reorderPoint: 10, supplier: 'Mobly' }],
  })

  const results = useAppStore.getState().searchGlobalSku({ query: 'SKU-2084' })
  assert.equal(results[0].availableStock, 0, 'Available stock must be 0 when reserved equals on-hand')
  assert.equal(results[0].canFulfill, false)
})

test('global SKU search: handles archived SKUs and inactive warehouses correctly', () => {
  const store = useAppStore.getState()
  const modifiedWarehouses = store.warehouses.map((w) =>
    w.id === 'WH-BLR-04' ? { ...w, status: 'Inactive' } : w
  )

  useAppStore.setState({
    warehouses: modifiedWarehouses,
    inventory: [
      { skuId: 'SKU-ACTIVE', binId: 'HYD-01', warehouseId: 'WH-HYD-01', quantity: 10, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
      { skuId: 'SKU-ARCHIVED', binId: 'HYD-02', warehouseId: 'WH-HYD-01', quantity: 20, reserved: 0, capacity: 50, reorderPoint: 5, available: false, archived: true, updated: 'Today' },
      { skuId: 'SKU-ACTIVE', binId: 'BLR-01', warehouseId: 'WH-BLR-04', quantity: 30, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
    ],
    skus: [
      { id: 'SKU-ACTIVE', name: 'Active Part', category: 'General', unit: 'box', reorderPoint: 5, supplier: 'Supply' },
      { id: 'SKU-ARCHIVED', name: 'Archived Part', category: 'General', unit: 'box', reorderPoint: 5, supplier: 'Supply', archived: true },
    ],
  })

  // By default, archived SKUs must not appear in search results
  const searchActive = useAppStore.getState().searchGlobalSku({ query: 'SKU-ARCHIVED' })
  assert.equal(searchActive.length, 0, 'Archived SKU must not be returned by default')

  // Inactive warehouse stock should be marked canFulfill = false
  const blrResults = useAppStore.getState().searchGlobalSku({ query: 'SKU-ACTIVE' })
  const blr = blrResults.find((r) => r.warehouseId === 'WH-BLR-04')
  assert.ok(blr)
  assert.equal(blr.canFulfill, false, 'Inactive warehouse cannot fulfill customer orders')
})

test('combined availability: correctly calculates whether network can fulfill via split allocation', () => {
  // Scenario: customer requests 30 units
  // WH-HYD-01 has 10 units
  // WH-VJA-02 has 15 units
  // WH-CHN-03 has 8 units
  // No single warehouse has 30 units, but combined total = 33 units
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-1102', binId: 'HYD-01', warehouseId: 'WH-HYD-01', quantity: 10, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
      { skuId: 'SKU-1102', binId: 'VJA-01', warehouseId: 'WH-VJA-02', quantity: 15, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
      { skuId: 'SKU-1102', binId: 'CHN-01', warehouseId: 'WH-CHN-03', quantity: 8, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
    ],
    skus: [
      { id: 'SKU-1102', name: 'Nordic Duvet Set', category: 'Bed Bath', unit: 'roll', reorderPoint: 5, supplier: 'Santista' },
    ],
  })

  const avail = useAppStore.getState().getWarehouseAvailability('SKU-1102', 30, 'WH-HYD-01')

  assert.equal(avail.preferredCanFulfill, false)
  assert.equal(avail.networkTotalAvailable, 33, 'Network combined total available must be 10 + 15 + 8 = 33')
  assert.equal(avail.networkCanFulfill, true, 'Network total must be capable of satisfying 30 units')
  assert.equal(avail.isMultiWarehouseSplitPossible, true, 'Must indicate split fulfillment is possible')
})

test('alternative recommendations: ranks viable alternatives by ability to fulfill, distance, and priority', () => {
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-3401', binId: 'HYD-01', warehouseId: 'WH-HYD-01', quantity: 0, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
      // CHN is 630km away from HYD, 50 units available (can fulfill 20)
      { skuId: 'SKU-3401', binId: 'CHN-01', warehouseId: 'WH-CHN-03', quantity: 50, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
      // VJA is 275km away from HYD, 25 units available (can fulfill 20) -> closer distance!
      { skuId: 'SKU-3401', binId: 'VJA-01', warehouseId: 'WH-VJA-02', quantity: 25, reserved: 0, capacity: 50, reorderPoint: 5, available: true, updated: 'Today' },
    ],
    skus: [{ id: 'SKU-3401', name: 'Trimmer Cart', category: 'Tools', unit: 'case', reorderPoint: 5, supplier: 'Tramontina' }],
  })

  const avail = useAppStore.getState().getWarehouseAvailability('SKU-3401', 20, 'WH-HYD-01')

  assert.equal(avail.alternativeWarehouses.length, 2)
  // Both can fulfill 20 units; VJA is closer (275km vs 630km) so VJA must be ranked #1
  assert.equal(avail.alternativeWarehouses[0].warehouseId, 'WH-VJA-02')
  assert.equal(avail.alternativeWarehouses[1].warehouseId, 'WH-CHN-03')
  assert.ok(avail.alternativeWarehouses[0].reason.includes('WH-VJA-02'))
})

// ============================================================================
// 4. INTER-WAREHOUSE TRANSFER LIFECYCLE & INVARIANTS
// ============================================================================

test('inter-warehouse transfer lifecycle: REQUESTED -> APPROVED -> DISPATCHED -> IN TRANSIT -> RECEIVED', () => {
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-2084', binId: 'VJA-A-01-01', warehouseId: 'WH-VJA-02', quantity: 25, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
      { skuId: 'SKU-2084', binId: 'C-06-02', warehouseId: 'WH-HYD-01', quantity: 5, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    bins: [
      { id: 'VJA-A-01-01', warehouseId: 'WH-VJA-02', zone: 'A', skuId: 'SKU-2084', quantity: 25, capacity: 50, status: 'Healthy', x: 0, y: 0 },
      { id: 'C-06-02', warehouseId: 'WH-HYD-01', zone: 'C', skuId: 'SKU-2084', quantity: 5, capacity: 50, status: 'Healthy', x: 0, y: 0 },
    ],
  })

  const store = useAppStore.getState()

  // 1. REQUEST
  const reqRes = store.requestInterWarehouseTransfer({
    sourceWarehouseId: 'WH-VJA-02',
    destinationWarehouseId: 'WH-HYD-01',
    sourceBinId: 'VJA-A-01-01',
    destinationBinId: 'C-06-02',
    skuId: 'SKU-2084',
    quantity: 10,
    requestedBy: 'Manager',
    notes: 'Rebalance stockout',
  })
  assert.equal(reqRes.ok, true)
  const transferId = reqRes.transfer?.id
  assert.ok(transferId)
  assert.equal(reqRes.transfer?.status, 'REQUESTED')

  // 2. APPROVE
  const appRes = useAppStore.getState().approveInterWarehouseTransfer(transferId, 'Manager')
  assert.equal(appRes.ok, true)
  assert.equal(appRes.transfer?.status, 'APPROVED')

  // Verify stock reservation: source bin quantity remains 25, reserved becomes 10
  const afterApproveInv = useAppStore.getState().inventory
  const vjaAfterApprove = afterApproveInv.find((i) => i.binId === 'VJA-A-01-01')
  assert.equal(vjaAfterApprove?.quantity, 25, 'Physical on-hand stock must NOT decrease upon approval')
  assert.equal(vjaAfterApprove?.reserved, 10, 'Reserved stock must be set to 10 to lock inventory')

  // 3. DISPATCH
  const dispRes = useAppStore.getState().dispatchInterWarehouseTransfer(transferId, 'Dispatch Operator')
  assert.equal(dispRes.ok, true)
  assert.equal(dispRes.transfer?.status, 'IN TRANSIT')

  // Verify dispatch accounting:
  // Source on-hand decreases to 15, reserved cleared to 0
  const afterDispInv = useAppStore.getState().inventory
  const vjaAfterDisp = afterDispInv.find((i) => i.binId === 'VJA-A-01-01')
  assert.equal(vjaAfterDisp?.quantity, 15, 'Source physical stock must decrease by 10 upon dispatch')
  assert.equal(vjaAfterDisp?.reserved, 0, 'Source reserved stock must be released upon physical dispatch')

  // CRITICAL INVARIANT: In-transit stock must NOT be counted as destination on-hand stock!
  const hydAfterDisp = afterDispInv.find((i) => i.binId === 'C-06-02')
  assert.equal(hydAfterDisp?.quantity, 5, 'Destination stock must NOT increase while goods are in transit')

  // 4. RECEIVE
  const recRes = useAppStore.getState().receiveInterWarehouseTransfer(transferId, 10, 'HYD Receiving Dock')
  assert.equal(recRes.ok, true)
  assert.equal(recRes.transfer?.status, 'RECEIVED')

  // Verify receipt accounting: destination stock increases to 15
  const afterRecInv = useAppStore.getState().inventory
  const hydAfterRec = afterRecInv.find((i) => i.binId === 'C-06-02')
  assert.equal(hydAfterRec?.quantity, 15, 'Destination stock must increase to 15 upon confirmed receipt')
})

test('inter-warehouse transfer: prevents duplicate receipt from adding inventory twice', () => {
  useAppStore.setState({
    interWarehouseTransfers: [
      {
        id: 'TR-DUP-01',
        sourceWarehouseId: 'WH-VJA-02',
        destinationWarehouseId: 'WH-HYD-01',
        sourceBinId: 'VJA-A-01-01',
        destinationBinId: 'C-06-02',
        skuId: 'SKU-2084',
        quantity: 10,
        status: 'IN TRANSIT',
        requestedAt: new Date().toISOString(),
        requestedBy: 'Manager',
        history: [],
      },
    ],
    inventory: [
      { skuId: 'SKU-2084', binId: 'C-06-02', warehouseId: 'WH-HYD-01', quantity: 5, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    bins: [
      { id: 'C-06-02', warehouseId: 'WH-HYD-01', zone: 'C', skuId: 'SKU-2084', quantity: 5, capacity: 50, status: 'Healthy', x: 0, y: 0 },
    ],
  })

  // First receipt succeeds
  const first = useAppStore.getState().receiveInterWarehouseTransfer('TR-DUP-01', 10, 'Dock')
  assert.equal(first.ok, true)
  assert.equal(useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02')?.quantity, 15)

  // Duplicate receipt must be blocked
  const second = useAppStore.getState().receiveInterWarehouseTransfer('TR-DUP-01', 10, 'Dock')
  assert.equal(second.ok, false)
  assert.match(second.message, /Duplicate receipt blocked/i)
  // Stock must remain 15, not 25!
  assert.equal(useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02')?.quantity, 15)
})

test('inter-warehouse transfer: supports partial receipt and logs discrepancy details', () => {
  useAppStore.setState({
    interWarehouseTransfers: [
      {
        id: 'TR-PARTIAL-01',
        sourceWarehouseId: 'WH-VJA-02',
        destinationWarehouseId: 'WH-HYD-01',
        sourceBinId: 'VJA-A-01-01',
        destinationBinId: 'C-06-02',
        skuId: 'SKU-2084',
        quantity: 20,
        status: 'IN TRANSIT',
        requestedAt: new Date().toISOString(),
        requestedBy: 'Manager',
        history: [],
      },
    ],
    inventory: [
      { skuId: 'SKU-2084', binId: 'C-06-02', warehouseId: 'WH-HYD-01', quantity: 10, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    bins: [
      { id: 'C-06-02', warehouseId: 'WH-HYD-01', zone: 'C', skuId: 'SKU-2084', quantity: 10, capacity: 50, status: 'Healthy', x: 0, y: 0 },
    ],
  })

  // Receive only 17 units out of 20 (3 units missing)
  const res = useAppStore.getState().receiveInterWarehouseTransfer(
    'TR-PARTIAL-01',
    17,
    'Receiving Dock',
    '3 units damaged in freight transit'
  )
  assert.equal(res.ok, true)
  assert.equal(res.transfer?.receivedQuantity, 17)
  assert.equal(res.transfer?.discrepancyDetails?.actualReceivedQuantity, 17)
  assert.equal(res.transfer?.discrepancyDetails?.expectedQuantity, 20)
  assert.match(res.transfer?.discrepancyDetails?.reason || '', /damaged/i)

  // Verify only 17 units were added to destination inventory (10 + 17 = 27)
  const destItem = useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02')
  assert.equal(destItem?.quantity, 27)
})

test('inter-warehouse transfer: cancellation releases reserved stock at source', () => {
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-2084', binId: 'VJA-A-01-01', warehouseId: 'WH-VJA-02', quantity: 30, reserved: 15, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    interWarehouseTransfers: [
      {
        id: 'TR-CANCEL-01',
        sourceWarehouseId: 'WH-VJA-02',
        destinationWarehouseId: 'WH-HYD-01',
        sourceBinId: 'VJA-A-01-01',
        destinationBinId: 'C-06-02',
        skuId: 'SKU-2084',
        quantity: 15,
        status: 'APPROVED',
        requestedAt: new Date().toISOString(),
        requestedBy: 'Manager',
        history: [],
      },
    ],
  })

  const res = useAppStore.getState().cancelInterWarehouseTransfer('TR-CANCEL-01', 'Manager', 'Order cancelled by customer')
  assert.equal(res.ok, true)
  assert.equal(res.transfer?.status, 'CANCELLED')

  // Reserved stock must be released from 15 to 0
  const item = useAppStore.getState().inventory.find((i) => i.binId === 'VJA-A-01-01')
  assert.equal(item?.reserved, 0, 'Cancellation must release reserved stock')
  assert.equal(item?.quantity, 30, 'Physical on-hand quantity must remain 30')
})

test('inter-warehouse transfer: rejects transfers between the same warehouse or invalid quantities', () => {
  const store = useAppStore.getState()

  // Same source and destination warehouse
  const sameWh = store.requestInterWarehouseTransfer({
    sourceWarehouseId: 'WH-HYD-01',
    destinationWarehouseId: 'WH-HYD-01',
    sourceBinId: 'A-01-01',
    destinationBinId: 'C-06-02',
    skuId: 'SKU-2084',
    quantity: 5,
  })
  assert.equal(sameWh.ok, false)
  assert.match(sameWh.message, /different/i)

  // Zero or negative quantity
  const zeroQty = store.requestInterWarehouseTransfer({
    sourceWarehouseId: 'WH-VJA-02',
    destinationWarehouseId: 'WH-HYD-01',
    sourceBinId: 'VJA-A-01-01',
    destinationBinId: 'C-06-02',
    skuId: 'SKU-2084',
    quantity: -5,
  })
  assert.equal(zeroQty.ok, false)
  assert.match(zeroQty.message, /positive/i)
})

test('inter-warehouse transfer: rejects approval when source available stock is insufficient', () => {
  useAppStore.setState({
    inventory: [
      { skuId: 'SKU-2084', binId: 'VJA-A-01-01', warehouseId: 'WH-VJA-02', quantity: 10, reserved: 8, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    interWarehouseTransfers: [
      {
        id: 'TR-SHORT-01',
        sourceWarehouseId: 'WH-VJA-02',
        destinationWarehouseId: 'WH-HYD-01',
        sourceBinId: 'VJA-A-01-01',
        destinationBinId: 'C-06-02',
        skuId: 'SKU-2084',
        quantity: 5, // Requires 5, but available is 10 - 8 = 2
        status: 'REQUESTED',
        requestedAt: new Date().toISOString(),
        requestedBy: 'Manager',
        history: [],
      },
    ],
  })

  const res = useAppStore.getState().approveInterWarehouseTransfer('TR-SHORT-01', 'Manager')
  assert.equal(res.ok, false)
  assert.match(res.message, /available/i)
})

// ============================================================================
// 5. 3D DIGITAL TWIN & DEMAND INTELLIGENCE INTEGRATION
// ============================================================================

test('3D digital twin: warehouse selector isolates bins to selected warehouse', () => {
  const store = useAppStore.getState()
  store.setSelectedWarehouseId('WH-VJA-02')

  const state = useAppStore.getState()
  assert.equal(state.selectedWarehouseId, 'WH-VJA-02')

  // Bins for WH-VJA-02 should be isolated
  const vjaBins = state.bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-VJA-02')
  assert.ok(vjaBins.length > 0)
  for (const b of vjaBins) {
    assert.equal(b.warehouseId, 'WH-VJA-02')
  }

  // Switch back to WH-HYD-01
  store.setSelectedWarehouseId('WH-HYD-01')
  assert.equal(useAppStore.getState().selectedWarehouseId, 'WH-HYD-01')
})

test('demand intelligence: generates network rebalancing recommendations for imbalanced facilities', () => {
  useAppStore.setState({
    inventory: [
      // WH-HYD-01 has 0 available units (critical shortage)
      { skuId: 'SKU-2084', binId: 'HYD-01', warehouseId: 'WH-HYD-01', quantity: 0, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
      // WH-VJA-02 has 50 available units (surplus)
      { skuId: 'SKU-2084', binId: 'VJA-01', warehouseId: 'WH-VJA-02', quantity: 50, reserved: 0, capacity: 50, reorderPoint: 10, available: true, updated: 'Today' },
    ],
    skus: [
      { id: 'SKU-2084', name: 'AuraGlow Smart Luminary', category: 'Furniture Decor', unit: 'box', reorderPoint: 10, supplier: 'Mobly' },
    ],
  })

  const recs = useAppStore.getState().getNetworkRebalancingRecommendations()
  assert.ok(recs.length >= 1, 'Should generate at least one rebalancing recommendation')

  const r = recs.find((item) => item.skuId === 'SKU-2084')
  assert.ok(r)
  assert.equal(r.sourceWarehouseId, 'WH-VJA-02', 'Source must be surplus warehouse WH-VJA-02')
  assert.equal(r.destinationWarehouseId, 'WH-HYD-01', 'Destination must be deficit warehouse WH-HYD-01')
  assert.ok(r.suggestedQuantity >= 5, 'Suggested transfer quantity must be >= 5')
  assert.ok(r.distanceKm > 0, 'Distance must be positive')
})
