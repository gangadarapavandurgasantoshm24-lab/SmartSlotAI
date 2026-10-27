import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let buildOptimizationRun
let validatePlacement
let useAppStore
let bins
let inventory
let skus
let initialInventory
const config = { weights: { travelDistance: 35, cubeUtilization: 20, goldenZone: 25, skuAffinity: 20 }, preferGoldenZone: true }

before(async () => {
  server = await createServer({ configFile: 'vite.config.ts', server: { middlewareMode: true, hmr: false }, appType: 'custom' })
  ;({ buildOptimizationRun, validatePlacement } = await server.ssrLoadModule('/src/data/optimizationEngine.ts'))
  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  const data = await server.ssrLoadModule('/src/data/mockData.ts')
  bins = data.warehouseBins
  inventory = data.inventory
  skus = data.skus
  initialInventory = data.inventory
})

beforeEach(() => {
  useAppStore.setState({ inventory: structuredClone(initialInventory), movements: [], optimizationRun: null, optimizationHistory: [], optimizationConfig: structuredClone(config) })
})

after(async () => { await server?.close() })

test('hard validation reports bin unit capacity and estimated weight violations', () => {
  const sku = skus.find((item) => item.id === 'SKU-0917')
  const target = { ...bins[0], capacity: 10, optimizationConstraints: { dimensionsCm: [60, 40, 40], maxWeightKg: 1, handlingCapabilities: ['standard'], certifiedHazards: [], goldenZone: false, source: 'demo estimate' } }
  const violations = validatePlacement(sku, 20, target)
  assert.ok(violations.some((item) => item.code === 'bin-capacity' && item.actual.includes('20 units')))
  assert.ok(violations.some((item) => item.code === 'weight' && item.expected.includes('1 kg')))
})

test('rejects assignments with actual hard constraint violations', () => {
  const sku = skus.find((item) => item.id === 'SKU-3401')
  const bin = { ...bins.find((item) => inventory.some((stock) => stock.binId === item.id && stock.skuId === sku.id && stock.quantity > 0)), optimizationConstraints: { dimensionsCm: [30, 30, 30], maxWeightKg: 1000, handlingCapabilities: ['standard'], certifiedHazards: [], goldenZone: false, source: 'demo estimate' } }
  const stock = inventory.find((item) => item.binId === bin.id && item.skuId === sku.id)
  const result = buildOptimizationRun({ bins: [bin], inventory: [stock], skus: [sku], config })
  assert.equal(result.placements.length, 1)
  assert.equal(result.placements[0].feasible, false)
  assert.ok(result.placements[0].violations.some((item) => item.code === 'dimensions'))
  assert.ok(result.proposed.hardConstraintViolations > 0)
})

test('produces deterministic output for identical shared warehouse inputs', () => {
  const first = buildOptimizationRun({ bins, inventory, skus, config })
  const second = buildOptimizationRun({ bins, inventory, skus, config })
  assert.deepEqual(first, second)
})

test('generates a feasible movement plan with explicit source and target locations', () => {
  const result = buildOptimizationRun({ bins, inventory, skus, config })
  assert.equal(result.placements.length, skus.length)
  assert.ok(result.placements.every((item) => item.fromBinId && item.toBinId && item.feasible && item.violations.length === 0), JSON.stringify(result.placements.map((item) => ({ skuId: item.skuId, from: item.fromBinId, to: item.toBinId, violations: item.violations }))))
  assert.equal(result.proposed.hardConstraintViolations, 0)
  assert.equal(result.proposed.movementCount, result.placements.filter((item) => item.fromBinId !== item.toBinId).length)
})

test('reports no-feasible-placement when every target fails dimensions', () => {
  const sku = skus.find((item) => item.id === 'SKU-3401')
  const bin = { ...bins.find((item) => inventory.some((stock) => stock.binId === item.id && stock.skuId === sku.id && stock.quantity > 0)), optimizationConstraints: { dimensionsCm: [20, 20, 20], maxWeightKg: 1000, handlingCapabilities: ['standard'], certifiedHazards: [], goldenZone: false, source: 'demo estimate' } }
  const stock = inventory.find((item) => item.binId === bin.id && item.skuId === sku.id)
  const result = buildOptimizationRun({ bins: [bin], inventory: [stock], skus: [sku], config })
  assert.equal(result.placements[0].feasible, false)
  assert.ok(result.placements[0].violations.some((item) => item.code === 'dimensions'))
})

test('blocks approval for an infeasible selected plan', () => {
  const run = useAppStore.getState().runOptimization()
  const badRun = { ...run, placements: run.placements.map((item, index) => index === 0 ? { ...item, feasible: false, violations: [{ code: 'weight', title: 'Weight exceeded', expected: '≤ 1 kg', actual: '2 kg', explanation: 'Over limit' }] } : item), proposed: { ...run.proposed, hardConstraintViolations: 1 } }
  useAppStore.setState({ optimizationRun: badRun })
  const approval = useAppStore.getState().approveOptimization('Manager')
  assert.equal(approval.ok, false)
  assert.match(approval.message, /hard constraints/)
})

test('approval preserves the proposal and leaves shared physical inventory unchanged', () => {
  const before = structuredClone(useAppStore.getState().inventory)
  useAppStore.getState().runOptimization()
  const approval = useAppStore.getState().approveOptimization('Jamie Rivera')
  const state = useAppStore.getState()
  assert.equal(approval.ok, true)
  assert.ok(state.optimizationRun.approvedAt)
  assert.equal(state.optimizationRun.approvedBy, 'Jamie Rivera')
  assert.deepEqual(state.inventory, before)
  assert.equal(state.movements.length, 0)
  const approvedId = state.optimizationRun.id
  const nextRevision = state.runOptimization()
  assert.equal(nextRevision.revision, 2)
  assert.equal(useAppStore.getState().optimizationHistory.length, 1)
  assert.equal(useAppStore.getState().optimizationHistory[0].id, approvedId)
  assert.deepEqual(useAppStore.getState().inventory, before)
})
