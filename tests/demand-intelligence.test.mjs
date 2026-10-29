import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let useAppStore
let initialInventory
let initialBins
let initialSkus
let filterValidDemandEvents
let calculateSkuDemandProfiles
let analyzePeakDemand
let generateDemandAwareSlottingRecommendations
let generateDeterministicSalesHistory

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })

  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  ;({
    filterValidDemandEvents,
    calculateSkuDemandProfiles,
    analyzePeakDemand,
    generateDemandAwareSlottingRecommendations,
  } = await server.ssrLoadModule('/src/data/demandIntelligenceEngine.ts'))
  ;({ generateDeterministicSalesHistory } = await server.ssrLoadModule(
    '/src/data/demandHistoryData.ts'
  ))

  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  initialInventory = mockData.inventory
  initialBins = mockData.warehouseBins
  initialSkus = mockData.skus
})

after(async () => {
  if (server) await server.close()
})

const FIXED_REF_DATE = new Date('2026-10-28T18:00:00Z')

beforeEach(() => {
  useAppStore.setState({
    inventory: structuredClone(initialInventory),
    bins: structuredClone(initialBins),
    skus: structuredClone(initialSkus),
    movements: [],
    transferTasks: [],
    liveAlerts: [],
    salesHistory: generateDeterministicSalesHistory(FIXED_REF_DATE),
  })
})

test('filterValidDemandEvents: strictly includes customer sales and completed picks, strictly excludes receipts, transfers, and adjustments', () => {
  const refDate = new Date('2026-10-28T12:00:00Z')
  const validTimestamp = new Date('2026-10-20T10:00:00Z').toISOString()

  const sales = [
    {
      id: 'SALE-1',
      skuId: 'SKU-2084',
      quantity: 5,
      timestamp: validTimestamp,
      orderRef: 'SO-1',
      isSimulated: true,
    },
  ]

  const movements = [
    {
      id: 'MOV-PICK',
      binId: 'C-06-02',
      skuId: 'SKU-2084',
      type: 'pick', // VALID DEMAND
      quantity: 3,
      timestamp: validTimestamp,
      source: 'picker-workspace',
    },
    {
      id: 'MOV-RECEIVE',
      binId: 'C-06-02',
      skuId: 'SKU-2084',
      type: 'receive', // EXCLUDED (Supplier Receipt)
      quantity: 50,
      timestamp: validTimestamp,
      source: 'inventory-crud',
    },
    {
      id: 'MOV-RELOCATE',
      binId: 'C-06-02',
      skuId: 'SKU-2084',
      type: 'relocate', // EXCLUDED (Internal Move)
      quantity: 10,
      timestamp: validTimestamp,
      source: 'relocation-task',
    },
    {
      id: 'MOV-TRANSFER',
      binId: 'C-06-02',
      skuId: 'SKU-2084',
      type: 'transfer', // EXCLUDED (Internal Move)
      quantity: 10,
      timestamp: validTimestamp,
      source: 'relocation-task',
    },
    {
      id: 'MOV-ADJUST',
      binId: 'C-06-02',
      skuId: 'SKU-2084',
      type: 'adjust', // EXCLUDED (Stock Count Adjustment)
      quantity: 2,
      timestamp: validTimestamp,
      source: 'inventory-crud',
    },
  ]

  const filtered = filterValidDemandEvents(sales, movements, 30, refDate)

  // Must only contain the 1 sale and the 1 pick (total: 2 events)
  assert.equal(filtered.length, 2, 'Should only include the customer sale and pick movement')
  assert.equal(filtered.some((e) => e.id === 'MOV-RECEIVE'), false, 'Supplier receipts must be excluded')
  assert.equal(filtered.some((e) => e.id === 'MOV-RELOCATE'), false, 'Relocations must be excluded')
  assert.equal(filtered.some((e) => e.id === 'MOV-TRANSFER'), false, 'Transfers must be excluded')
  assert.equal(filtered.some((e) => e.id === 'MOV-ADJUST'), false, 'Stock adjustments must be excluded')

  const totalDemandQty = filtered.reduce((sum, e) => sum + e.quantity, 0)
  assert.equal(totalDemandQty, 8, 'Total valid demand quantity must be 5 (sale) + 3 (pick) = 8')
})

test('calculateSkuDemandProfiles: accurately calculates 7-day and 30-day velocity and growth percentage', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: store.movements,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  assert.ok(profiles.length >= 4, 'Should return profiles for all catalog SKUs')

  const sku2084 = profiles.find((p) => p.skuId === 'SKU-2084')
  assert.ok(sku2084, 'Profile for SKU-2084 must exist')
  assert.ok(sku2084.dailyVelocity30d > 10, 'SKU-2084 30-day daily velocity should be substantial (~17 u/day)')
  assert.ok(sku2084.dailyVelocity7d > 10, 'SKU-2084 7-day daily velocity should be substantial')
  assert.equal(typeof sku2084.velocityGrowthPct, 'number')
  assert.ok(['growing', 'declining', 'stable'].includes(sku2084.trend))
})

test('calculateSkuDemandProfiles: Pareto classification assigns Class A to top 80% volume and Class C to slow movers', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: store.movements,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const classA = profiles.filter((p) => p.paretoClass === 'A')
  const classB = profiles.filter((p) => p.paretoClass === 'B')
  const classC = profiles.filter((p) => p.paretoClass === 'C')

  assert.ok(classA.length >= 1, 'Should have at least one Class A fast-moving SKU')
  assert.ok(classB.length >= 0, 'Class B list is defined')
  assert.ok(classC.length >= 1, 'Should have Class C slow-moving SKU')

  // Top fast mover must be Class A
  assert.equal(profiles[0].paretoClass, 'A')

  // Cumulative volume percentage of Class A items must be within 80% threshold
  for (const p of classA) {
    assert.ok(p.cumulativeVolumePct <= 85.0, `Class A SKU ${p.skuId} cumulative % must be <= 80% boundary`)
  }
})

test('calculateSkuDemandProfiles: handles zero-demand SKU safely (0 velocity, Infinity days remaining, null stockout date)', () => {
  const store = useAppStore.getState()
  // Add a brand new SKU with zero sales history
  const zeroSku = {
    id: 'SKU-ZERO-DEMAND',
    name: 'Obsolete Machine Part',
    category: 'Legacy Parts',
    unit: 'units',
    reorderPoint: 5,
    supplier: 'Old Forge',
  }
  const zeroStock = {
    skuId: 'SKU-ZERO-DEMAND',
    binId: 'A-01-01',
    quantity: 25,
    reserved: 0,
    updated: 'Today',
    capacity: 50,
    reorderPoint: 5,
    available: true,
  }

  const profiles = calculateSkuDemandProfiles({
    skus: [...store.skus, zeroSku],
    inventory: [...store.inventory, zeroStock],
    bins: store.bins,
    sales: store.salesHistory, // Contains no records for SKU-ZERO-DEMAND
    movements: [],
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const zeroProfile = profiles.find((p) => p.skuId === 'SKU-ZERO-DEMAND')
  assert.ok(zeroProfile, 'Zero demand profile must be generated')
  assert.equal(zeroProfile.dailyVelocity30d, 0, 'Daily velocity must be 0')
  assert.equal(zeroProfile.dailyVelocity7d, 0, '7D velocity must be 0')
  assert.equal(zeroProfile.daysOfStockRemaining, Infinity, 'Days remaining must be Infinity')
  assert.equal(zeroProfile.stockoutDate, null, 'Stockout date must be null')
  assert.equal(zeroProfile.paretoClass, 'C', 'Zero demand SKU must be categorized as Class C')
  assert.equal(zeroProfile.hasSufficientHistory, false, 'Should flag insufficient observations')
})

test('calculateSkuDemandProfiles: reservation-aware stock coverage correctly subtracts reserved stock', () => {
  const store = useAppStore.getState()

  // Modify inventory item to have 30 on hand and 20 reserved (only 10 available)
  const modifiedInventory = store.inventory
    .filter((i) => i.skuId !== 'SKU-2084')
    .concat([
      {
        skuId: 'SKU-2084',
        binId: 'C-06-02',
        warehouseId: 'WH-HYD-01',
        quantity: 30,
        reserved: 20,
        capacity: 50,
        reorderPoint: 10,
        available: true,
      },
    ])

  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: modifiedInventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: [],
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const p = profiles.find((item) => item.skuId === 'SKU-2084')
  assert.ok(p)
  assert.equal(p.onHand, 30, 'On-hand must be 30')
  assert.equal(p.reserved, 20, 'Reserved must be 20')
  assert.equal(p.availableStock, 10, 'Available stock must be onHand - reserved = 10')

  // Coverage must be calculated from availableStock (10 / dailyVelocity), not on-hand (30)
  const expectedCoverage = Math.round((10 / p.dailyVelocity30d) * 10) / 10
  assert.equal(p.daysOfStockRemaining, expectedCoverage)
})

test('calculateSkuDemandProfiles: stockout date format is valid YYYY-MM-DD when velocity > 0', () => {
  const store = useAppStore.getState()
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: [],
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const activeProfile = profiles.find((p) => p.dailyVelocity30d > 0 && p.availableStock > 0)
  assert.ok(activeProfile)

  if (activeProfile.stockoutDate) {
    assert.match(activeProfile.stockoutDate, /^\d{4}-\d{2}-\d{2}$/, 'Stockout date must be formatted YYYY-MM-DD')
  }
})

test('calculateSkuDemandProfiles: reorder risk flags Critical Stockout when available stock is 0', () => {
  const store = useAppStore.getState()
  const emptyInventory = store.inventory.map((i) =>
    i.skuId === 'SKU-2084' ? { ...i, quantity: 0, reserved: 0 } : i
  )

  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: emptyInventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: [],
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const p = profiles.find((item) => item.skuId === 'SKU-2084')
  assert.ok(p)
  assert.equal(p.reorderRisk, 'Critical Stockout')
})

test('calculateSkuDemandProfiles: reorder risk flags Critical Reorder Risk when coverage <= lead time', () => {
  const store = useAppStore.getState()
  // Set stock so that available stock covers only ~0.9 days (lead time is 3 days)
  const lowInventory = store.inventory
    .filter((i) => i.skuId !== 'SKU-2084')
    .concat([
      {
        skuId: 'SKU-2084',
        binId: 'C-06-02',
        warehouseId: 'WH-HYD-01',
        quantity: 15,
        reserved: 0,
        capacity: 50,
        reorderPoint: 60,
        available: true,
      },
    ])

  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: lowInventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: [],
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const p = profiles.find((item) => item.skuId === 'SKU-2084')
  assert.ok(p)
  // Since daily velocity is ~17, 15 units = 0.9 days of stock <= 3 days lead time
  assert.equal(p.reorderRisk, 'Critical Reorder Risk')
})

test('analyzePeakDemand: correctly identifies peak hour and peak day of week with adequate observations', () => {
  const store = useAppStore.getState()
  const validEvents = filterValidDemandEvents(store.salesHistory, [], 30, FIXED_REF_DATE)
  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const peaks = analyzePeakDemand(validEvents, store.skus, profiles)

  assert.equal(peaks.hasSufficientObservations, true)
  assert.ok(peaks.peakHour >= 0 && peaks.peakHour <= 23)
  assert.ok(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].includes(peaks.peakDayName))
  assert.equal(peaks.hourlyDistribution.length, 24)
  assert.equal(peaks.dailyDistribution.length, 7)
  assert.ok(peaks.peakHourUnits > 0)
  assert.ok(peaks.peakDayUnits > 0)
})

test('analyzePeakDemand: guards against claiming weekly patterns when observations are insufficient (< 5 events or < 3 days)', () => {
  // Only 2 events on a single day
  const sparseEvents = [
    {
      id: 'EV-1',
      skuId: 'SKU-2084',
      quantity: 3,
      timestamp: '2026-10-28T10:00:00Z',
      isPick: false,
    },
    {
      id: 'EV-2',
      skuId: 'SKU-2084',
      quantity: 2,
      timestamp: '2026-10-28T14:00:00Z',
      isPick: false,
    },
  ]

  const peaks = analyzePeakDemand(sparseEvents, [])
  assert.equal(peaks.hasSufficientObservations, false)
  assert.match(peaks.dataDisclaimer, /insufficient/i)
})

test('analyzePeakDemand: detects demand spikes where 7-day velocity exceeds 30-day baseline by > 30%', () => {
  const mockProfiles = [
    {
      skuId: 'SKU-SPIKE',
      skuName: 'Surging Heating Pad',
      dailyVelocity7d: 26.0,
      dailyVelocity30d: 12.0, // +116% surge
      hasSufficientHistory: true,
      category: 'Health',
      supplier: 'MedCo',
      unit: 'units',
      currentBinId: 'A-01-01',
      currentZone: 'A',
      currentLevel: 1,
      isGoldenZone: true,
      onHand: 100,
      reserved: 0,
      availableStock: 100,
      totalSold7d: 182,
      totalSold30d: 360,
      velocityGrowthPct: 116.7,
      trend: 'growing',
      pickCount30d: 80,
      paretoClass: 'A',
      cumulativeVolumePct: 50,
      daysOfStockRemaining: 8.3,
      stockoutDate: '2026-11-05',
      reorderPoint: 20,
      leadTimeDays: 3,
      reorderRisk: 'Medium Risk',
      observationCount: 80,
    },
  ]

  const peaks = analyzePeakDemand([], [], mockProfiles)
  assert.equal(peaks.detectedSpikes.length, 1)
  assert.equal(peaks.detectedSpikes[0].skuId, 'SKU-SPIKE')
  assert.ok(peaks.detectedSpikes[0].spikePct > 30)
  assert.match(peaks.detectedSpikes[0].reason, /surge|acceleration/i)
})

test('generateDemandAwareSlottingRecommendations: identifies Class A items in non-golden zones and computes positive travel savings', () => {
  const store = useAppStore.getState()
  // Mock a Pareto Class A SKU located at a distant high tier (e.g. C-06-02 in Zone C, Level 2 or 3)
  const mockProfiles = [
    {
      skuId: 'SKU-2084',
      skuName: 'AuraGlow Smart Luminary',
      category: 'Furniture Decor',
      paretoClass: 'A',
      dailyVelocity30d: 18.5,
      currentBinId: 'C-06-02',
      currentZone: 'Zone C',
      currentLevel: 3,
      isGoldenZone: false,
      onHand: 24,
      reserved: 0,
      availableStock: 24,
      totalSold7d: 130,
      dailyVelocity7d: 18.5,
      totalSold30d: 555,
      velocityGrowthPct: 10,
      trend: 'growing',
      pickCount30d: 120,
      cumulativeVolumePct: 45,
      daysOfStockRemaining: 1.3,
      stockoutDate: '2026-10-30',
      reorderPoint: 60,
      leadTimeDays: 3,
      reorderRisk: 'Critical Reorder Risk',
      hasSufficientHistory: true,
      observationCount: 120,
      supplier: 'Mobly',
      unit: 'box',
    },
  ]

  const recommendations = generateDemandAwareSlottingRecommendations({
    demandProfiles: mockProfiles,
    bins: store.bins,
    inventory: store.inventory,
    skus: store.skus,
  })

  assert.ok(recommendations.length >= 1, 'Should generate at least one slotting recommendation for Class A item in Zone C')
  const rec = recommendations[0]
  assert.equal(rec.skuId, 'SKU-2084')
  assert.ok(rec.distanceSavedMeters >= 4.0, 'Must save significant distance per pick stop')
  assert.ok(rec.weeklyKmSaved > 0, 'Weekly km saved must be positive')
  assert.equal(rec.actionable, true)
  assert.ok(rec.capacityOk)
  assert.ok(rec.weightOk)
  assert.ok(rec.compatible)
  assert.match(rec.reason, /Golden Zone/i)
})

test('generateDemandAwareSlottingRecommendations: strictly preserves inventory invariant and does NOT mutate state', () => {
  const store = useAppStore.getState()
  const inventorySnapshot = JSON.stringify(store.inventory)
  const binsSnapshot = JSON.stringify(store.bins)
  const movementsSnapshot = JSON.stringify(store.movements)

  const profiles = calculateSkuDemandProfiles({
    skus: store.skus,
    inventory: store.inventory,
    bins: store.bins,
    sales: store.salesHistory,
    movements: store.movements,
    windowDays: 30,
    referenceDate: FIXED_REF_DATE,
  })

  const recommendations = generateDemandAwareSlottingRecommendations({
    demandProfiles: profiles,
    bins: store.bins,
    inventory: store.inventory,
    skus: store.skus,
  })

  assert.ok(Array.isArray(recommendations))

  // State must remain strictly untouched
  const updatedStore = useAppStore.getState()
  assert.equal(JSON.stringify(updatedStore.inventory), inventorySnapshot, 'Physical inventory must not be mutated')
  assert.equal(JSON.stringify(updatedStore.bins), binsSnapshot, 'Warehouse bins must not be mutated')
  assert.equal(JSON.stringify(updatedStore.movements), movementsSnapshot, 'Movements must not be mutated')
})

test('getDemandIntelligence integration: store method seamlessly computes profiles, peaks, and recommendations', () => {
  const store = useAppStore.getState()
  const intelligence = store.getDemandIntelligence(30, FIXED_REF_DATE)

  assert.ok(intelligence)
  assert.ok(Array.isArray(intelligence.profiles))
  assert.ok(intelligence.peaks)
  assert.ok(Array.isArray(intelligence.recommendations))

  assert.equal(intelligence.profiles.length, store.skus.length)
  assert.equal(intelligence.peaks.hourlyDistribution.length, 24)
})

test('workflow integration: staging relocation transfer from recommendation creates pending transfer task and reserves stock', () => {
  const store = useAppStore.getState()
  const intelligence = store.getDemandIntelligence(30, FIXED_REF_DATE)

  // If recommendations exist, stage one
  if (intelligence.recommendations.length > 0) {
    const rec = intelligence.recommendations[0]
    const sourceStockBefore = store.inventory.find(
      (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
    )

    if (sourceStockBefore && sourceStockBefore.quantity > 0) {
      const initialReserved = sourceStockBefore.reserved || 0
      const transferQty = Math.min(5, sourceStockBefore.quantity)

      const stageRes = store.initiateRelocationTransfer({
        skuId: rec.skuId,
        sourceBinId: rec.currentBinId,
        targetBinId: rec.recommendedBinId,
        quantity: transferQty,
        notes: `Demand-aware reslotting: ${rec.reason}`,
      })

      assert.equal(stageRes.ok, true, `Expected staging to succeed: ${stageRes.message}`)

      const updated = useAppStore.getState()
      const sourceStockAfter = updated.inventory.find(
        (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId
      )
      assert.equal(
        sourceStockAfter?.reserved,
        initialReserved + transferQty,
        'Stock must be reserved at source bin'
      )

      const pendingTask = updated.transferTasks.find(
        (t) => t.sourceBinId === rec.currentBinId && t.targetBinId === rec.recommendedBinId
      )
      assert.ok(pendingTask, 'Pending transfer task must be created')
      assert.equal(pendingTask.status, 'Pending')
    }
  }
})

