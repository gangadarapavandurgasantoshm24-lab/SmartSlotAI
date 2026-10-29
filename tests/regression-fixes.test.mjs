import assert from 'node:assert/strict'
import fs from 'node:fs'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let useAppStore
let detectCurrentRole
let initialInventory
let initialBins

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })
  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  ;({ detectCurrentRole } = await server.ssrLoadModule('/src/utils/roleHelper.ts'))
  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  initialInventory = mockData.inventory
  initialBins = mockData.warehouseBins
})

beforeEach(() => {
  useAppStore.setState({
    inventory: structuredClone(initialInventory),
    bins: structuredClone(initialBins),
    movements: [],
    liveAlerts: [],
    coPlacementOrders: [
      {
        id: 'COP-TEST-01',
        title: 'Test Co-Placement Valid',
        category: 'Test Category',
        skuA: {
          id: 'SKU-2084',
          name: 'AuraGlow Smart Luminary',
          currentBin: 'C-06-02',
          currentBoxId: 'BOX-C0602-L2F',
          targetBin: 'A-01-06-L1F',
          targetBoxId: 'BOX-A0106-L1F',
        },
        skuB: {
          id: 'SKU-1102',
          name: 'Bed Bath Table · Duvet Set',
          currentBin: 'A-02-03',
          currentBoxId: 'BOX-A0203-L1F',
          targetBin: 'A-02-03',
          targetBoxId: 'BOX-A0203-L1F',
        },
        initialDistanceMeters: 20,
        targetDistanceMeters: 2,
        predictedSalesLiftPercent: 25,
        predictedMonthlyRevenue: 10000,
        confidenceScore: 90,
        pickerTimeSavedSeconds: 30,
        rationale: 'Testing valid co-placement movement',
        status: 'Assigned to Picker',
        createdAt: new Date().toISOString(),
      },
    ],
  })
})

after(async () => {
  await server?.close()
})

test('regression: .env.example contains safe placeholders and no plaintext credentials', () => {
  const content = fs.readFileSync('.env.example', 'utf8')
  assert.ok(content.includes('<username>:<password>'), 'Must contain placeholder <username>:<password>')
  assert.ok(!content.includes('kavyakunnu'), 'Must not contain any real username')
  assert.ok(!content.includes('U1MnvThq1t1iEDGl'), 'Must not contain any real password')
})

test('regression: detectCurrentRole defaults to manager in dev:single unless explicitly selected', () => {
  // Simulate dev:single environment on port 5173 with no injected role
  globalThis.window = {
    location: {
      port: '5173',
      search: '',
    },
    __SMARTSLOT_ROLE__: undefined,
  }

  assert.equal(detectCurrentRole(), 'manager', 'Port 5173 without injected role must default to manager')

  // URL query parameter takes priority
  globalThis.window.location.search = '?role=picker'
  assert.equal(detectCurrentRole(), 'picker')

  globalThis.window.location.search = '?role=analyst'
  assert.equal(detectCurrentRole(), 'analyst')

  globalThis.window.location.search = '?role=supplier'
  assert.equal(detectCurrentRole(), 'supplier')

  // Injected role from dev-all takes effect when URL param is absent
  globalThis.window.location.search = ''
  globalThis.window.__SMARTSLOT_ROLE__ = 'picker'
  assert.equal(detectCurrentRole(), 'picker')
})

test('regression: completeCoPlacementOrder relocates actual available stock and updates movements atomically', () => {
  const state = useAppStore.getState()
  const sourceStockBefore = state.inventory.find((i) => i.binId === 'C-06-02')
  assert.equal(sourceStockBefore.quantity, 12)

  const result = state.completeCoPlacementOrder('COP-TEST-01')
  assert.equal(result.ok, true)
  assert.match(result.message, /relocated 12 units of SKU-2084/)

  const stateAfter = useAppStore.getState()
  const sourceStockAfter = stateAfter.inventory.find((i) => i.binId === 'C-06-02')
  assert.equal(sourceStockAfter.quantity, 0, 'Source bin quantity should be depleted by relocated amount')

  const targetStockAfter = stateAfter.inventory.find((i) => i.binId === 'A-01-06-L1F')
  assert.ok(targetStockAfter, 'Target bin record must exist')
  assert.equal(targetStockAfter.quantity, 12, 'Target bin quantity must receive actual stock (12), not hardcoded 15')
  assert.equal(targetStockAfter.skuId, 'SKU-2084')

  // Check movement records: both pick and receive are logged atomically with exact quantity 12
  assert.equal(stateAfter.movements.length, 2)
  assert.equal(stateAfter.movements[0].type, 'receive')
  assert.equal(stateAfter.movements[0].quantity, 12)
  assert.equal(stateAfter.movements[0].binId, 'A-01-06-L1F')

  assert.equal(stateAfter.movements[1].type, 'pick')
  assert.equal(stateAfter.movements[1].quantity, 12)
  assert.equal(stateAfter.movements[1].binId, 'C-06-02')

  // Order status is updated
  assert.equal(stateAfter.coPlacementOrders[0].status, 'Completed by Picker')

  // Duplicate completion is blocked
  const duplicate = stateAfter.completeCoPlacementOrder('COP-TEST-01')
  assert.equal(duplicate.ok, false)
  assert.match(duplicate.message, /already been completed/)
})

test('regression: completeCoPlacementOrder rejects placement when target bin is occupied by different SKU', () => {
  // Target bin A-02-03 is already occupied by SKU-1102 (12 units)
  const store = useAppStore.getState()
  useAppStore.setState({
    coPlacementOrders: [
      {
        ...store.coPlacementOrders[0],
        id: 'COP-CONFLICT-01',
        skuA: {
          ...store.coPlacementOrders[0].skuA,
          targetBin: 'A-02-03',
        },
      },
    ],
  })

  const result = useAppStore.getState().completeCoPlacementOrder('COP-CONFLICT-01')
  assert.equal(result.ok, false)
  assert.match(result.message, /occupied by another SKU/i)

  // Verify inventory is untouched
  const stockC0602 = useAppStore.getState().inventory.find((i) => i.binId === 'C-06-02')
  assert.equal(stockC0602.quantity, 12)
  assert.equal(useAppStore.getState().movements.length, 0)
})

test('regression: completeCoPlacementOrder rejects placement when target bin capacity is exceeded', () => {
  // Create an order with approved quantity of 100 into a bin with capacity 48
  const store = useAppStore.getState()
  useAppStore.setState({
    coPlacementOrders: [
      {
        ...store.coPlacementOrders[0],
        id: 'COP-OVERCAP-01',
        approvedQuantity: 100,
        skuA: {
          ...store.coPlacementOrders[0].skuA,
          targetBin: 'A-01-06-L1F',
        },
      },
    ],
  })

  const result = useAppStore.getState().completeCoPlacementOrder('COP-OVERCAP-01')
  assert.equal(result.ok, false)
  assert.match(result.message, /exceeds capacity|Cannot relocate/i)
  assert.equal(useAppStore.getState().movements.length, 0)
})

