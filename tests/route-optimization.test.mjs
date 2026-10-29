import assert from 'node:assert/strict'
import { after, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server
let useAppStore
let initialInventory
let initialBins
let initialSkus
let initialPickOrder
let demoWarehouses
let networkBins
let graphEngine

before(async () => {
  server = await createServer({
    configFile: 'vite.config.ts',
    server: { middlewareMode: true, hmr: false },
    appType: 'custom',
  })
  ;({ useAppStore } = await server.ssrLoadModule('/src/store/useAppStore.ts'))
  const mockData = await server.ssrLoadModule('/src/data/mockData.ts')
  const multiWhData = await server.ssrLoadModule('/src/data/multiWarehouseData.ts')
  graphEngine = await server.ssrLoadModule('/src/data/warehouseGraphEngine.ts')

  initialInventory = mockData.inventory
  initialBins = mockData.warehouseBins
  initialSkus = mockData.skus
  initialPickOrder = mockData.activePickOrder
  demoWarehouses = multiWhData.demoWarehouses
  const gen = multiWhData.generateNetworkBinsAndInventory()
  networkBins = gen.bins
})

after(async () => {
  if (server) await server.close()
})

beforeEach(() => {
  useAppStore.setState({
    selectedWarehouseId: 'WH-HYD-01',
    warehouses: structuredClone(demoWarehouses),
    bins: structuredClone([...initialBins, ...networkBins]),
    inventory: structuredClone(initialInventory),
    skus: structuredClone(initialSkus),
    pickOrder: structuredClone(initialPickOrder),
    activeRoutePreview: null,
    blockedAislesByWarehouse: {},
    routingAlgorithm: 'astar',
  })
})

test('buildWarehouseGraph: constructs valid orthogonal graph with depot, cross-aisles, and mid-aisle nodes', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')
  const graph = graphEngine.buildWarehouseGraph('WH-HYD-01', hydBins)

  // Verify Depot and Front Center exist
  assert.ok(graph.nodes[graphEngine.DEPOT_NODE_ID], 'Depot node must exist')
  assert.ok(graph.nodes[graphEngine.FRONT_CENTER_NODE_ID], 'Front Center staging node must exist')

  // Verify Front Cross-Aisle nodes for aisles 1-6
  for (let a = 1; a <= 6; a++) {
    assert.ok(graph.nodes[`FRONT_AISLE_${a}`], `Front cross node for aisle ${a} must exist`)
    assert.ok(graph.nodes[`BACK_AISLE_${a}`], `Back cross node for aisle ${a} must exist`)
    for (let b = 1; b <= 6; b++) {
      assert.ok(graph.nodes[`AISLE_${a}_BAY_${b}`], `Mid-aisle node for Aisle ${a} Bay ${b} must exist`)
    }
  }

  // Verify Depot connects to Front Center
  const depotEdges = graph.adjacency[graphEngine.DEPOT_NODE_ID] || []
  assert.ok(depotEdges.some((e) => e.to === graphEngine.FRONT_CENTER_NODE_ID), 'Depot must connect to Front Center')

  // Verify symmetry (all edges are bidirectional)
  for (const [nodeId, edges] of Object.entries(graph.adjacency)) {
    for (const edge of edges) {
      assert.ok(edge.weight > 0, `Edge weight must be positive: ${nodeId} -> ${edge.to}`)
      const reverseEdges = graph.adjacency[edge.to] || []
      const rev = reverseEdges.find((e) => e.to === nodeId)
      assert.ok(rev, `Missing reverse edge for ${nodeId} -> ${edge.to}`)
      assert.strictEqual(rev.weight, edge.weight, `Asymmetric weight between ${nodeId} and ${edge.to}`)
    }
  }
})

test('buildWarehouseGraph: prevents physical rack penetration by having no horizontal edges through shelves', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')
  const graph = graphEngine.buildWarehouseGraph('WH-HYD-01', hydBins)

  // Verify mid-aisle bay nodes ONLY connect along the Z axis (same aisle), never directly across aisles
  for (let a = 1; a <= 5; a++) {
    for (let b = 1; b <= 6; b++) {
      const bayEdges = graph.adjacency[`AISLE_${a}_BAY_${b}`] || []
      // Should never have an edge directly to AISLE_${a+1}_BAY_${b}
      const directCross = bayEdges.find((e) => e.to === `AISLE_${a + 1}_BAY_${b}`)
      assert.strictEqual(
        directCross,
        undefined,
        `Physical rack violation: found direct horizontal edge between Aisle ${a} and ${a + 1} at Bay ${b}`
      )
    }
  }
})

test('findShortestPath: Dijkstra and A* produce identical shortest-path distances', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')
  const graph = graphEngine.buildWarehouseGraph('WH-HYD-01', hydBins)

  const testPairs = [
    [graphEngine.DEPOT_NODE_ID, 'AISLE_1_BAY_1'],
    [graphEngine.DEPOT_NODE_ID, 'AISLE_6_BAY_6'],
    ['AISLE_1_BAY_3', 'AISLE_4_BAY_2'],
    ['AISLE_2_BAY_5', 'AISLE_5_BAY_5'],
    ['AISLE_6_BAY_1', 'AISLE_1_BAY_6'],
  ]

  for (const [fromId, toId] of testPairs) {
    const dijkstraResult = graphEngine.findShortestPath(graph, fromId, toId, 'dijkstra')
    const astarResult = graphEngine.findShortestPath(graph, fromId, toId, 'astar')

    assert.strictEqual(dijkstraResult.reachable, true, `Dijkstra must find path for ${fromId} -> ${toId}`)
    assert.strictEqual(astarResult.reachable, true, `A* must find path for ${fromId} -> ${toId}`)
    assert.strictEqual(
      astarResult.totalDistanceMeters,
      dijkstraResult.totalDistanceMeters,
      `A* and Dijkstra must match distance exactly for ${fromId} -> ${toId}`
    )
  }
})

test('euclideanHeuristic: strictly admissible (never overestimates true shortest path length)', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')
  const graph = graphEngine.buildWarehouseGraph('WH-HYD-01', hydBins)

  const sampleNodes = [
    graphEngine.DEPOT_NODE_ID,
    'FRONT_AISLE_1',
    'BACK_AISLE_6',
    'AISLE_1_BAY_1',
    'AISLE_2_BAY_4',
    'AISLE_4_BAY_2',
    'AISLE_6_BAY_6',
  ]

  for (let i = 0; i < sampleNodes.length; i++) {
    for (let j = 0; j < sampleNodes.length; j++) {
      const u = graph.nodes[sampleNodes[i]]
      const v = graph.nodes[sampleNodes[j]]
      const h = graphEngine.euclideanHeuristic(u, v)
      const path = graphEngine.findShortestPath(graph, u.id, v.id, 'dijkstra')

      assert.ok(
        h <= path.totalDistanceMeters + 1e-4,
        `Heuristic admissibility violation between ${u.id} and ${v.id}: h=${h} > d=${path.totalDistanceMeters}`
      )
    }
  }
})

test('obstacle avoidance: routes around blocked aisles without entering blocked corridor', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')

  // Aisle 3 is blocked
  const graphWithBlockedAisle3 = graphEngine.buildWarehouseGraph('WH-HYD-01', hydBins, [3])

  // Path from Aisle 2 Bay 3 to Aisle 4 Bay 3
  const path = graphEngine.findShortestPath(
    graphWithBlockedAisle3,
    'AISLE_2_BAY_3',
    'AISLE_4_BAY_3',
    'astar'
  )

  assert.strictEqual(path.reachable, true)
  // Verify path never visits any mid-aisle waypoint in Aisle 3
  for (const nodeId of path.pathNodeIds) {
    assert.ok(
      !nodeId.startsWith('AISLE_3_BAY_'),
      `Obstacle violation: route traversed through blocked corridor ${nodeId}`
    )
  }
})

test('obstacle avoidance: correctly reports unreachable bins when aisle containing bin is blocked', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')

  // If Aisle 1 is blocked, bin in Aisle 1 (e.g. A-01-01) is unreachable
  const testOrder = {
    ...initialPickOrder,
    lines: [
      { id: 'TEST-L1', skuId: 'SKU-2084', binId: 'A-01-01', requested: 2, picked: 0 },
    ],
  }

  const result = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: testOrder,
    bins: hydBins,
    blockedAisles: [1],
  })

  assert.strictEqual(result.reachable, false)
  assert.ok(result.unreachableBins.includes('A-01-01'))
})

test('multi-stop TSP: Nearest-Neighbor produces a valid cycle starting and ending at Depot', () => {
  const distanceMatrix = [
    [0, 10, 20, 15],
    [10, 0, 25, 30],
    [20, 25, 0, 12],
    [15, 30, 12, 0],
  ]

  const tour = graphEngine.buildNearestNeighborTour(distanceMatrix)
  assert.strictEqual(tour[0], 0, 'Tour must start at Depot (0)')
  assert.strictEqual(tour[tour.length - 1], 0, 'Tour must end at Depot (0)')
  assert.strictEqual(tour.length, 5, 'Tour must visit all 3 stops plus depot start/end')

  const uniqueStops = new Set(tour.slice(1, -1))
  assert.strictEqual(uniqueStops.size, 3, 'Must visit every distinct stop exactly once')
})

test('multi-stop TSP: 2-Opt local search guarantees optimizedDistance <= nearestNeighborDistance', () => {
  // Test matrix with crossing edges
  const distanceMatrix = [
    [0, 5, 12, 8, 14],
    [5, 0, 15, 9, 11],
    [12, 15, 0, 6, 4],
    [8, 9, 6, 0, 7],
    [14, 11, 4, 7, 0],
  ]

  const nnTour = graphEngine.buildNearestNeighborTour(distanceMatrix)
  const nnDist = graphEngine.calculateTourDistance(nnTour, distanceMatrix)

  const twoOptTour = graphEngine.improveTourWithTwoOpt(nnTour, distanceMatrix)
  const twoOptDist = graphEngine.calculateTourDistance(twoOptTour, distanceMatrix)

  assert.ok(
    twoOptDist <= nnDist + 1e-6,
    `2-Opt must not be worse than Nearest Neighbor: opt=${twoOptDist}, nn=${nnDist}`
  )
})

test('optimizePickRoute: calculates distanceSaved and percentageSaved for active pick order', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')

  const result = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: initialPickOrder,
    bins: hydBins,
  })

  assert.strictEqual(result.reachable, true)
  assert.ok(result.originalDistanceMeters > 0, 'Original distance must be > 0')
  assert.ok(result.optimizedDistanceMeters > 0, 'Optimized distance must be > 0')
  assert.ok(
    result.optimizedDistanceMeters <= result.originalDistanceMeters + 1e-4,
    `Optimized tour (${result.optimizedDistanceMeters}m) should be <= original (${result.originalDistanceMeters}m)`
  )
  assert.ok(result.distanceSavedMeters >= 0)
  assert.ok(result.percentageDistanceSaved >= 0)
  assert.ok(result.fullRouteCoordinates.length >= 2, 'Route polyline must have points')
})

test('optimizePickRoute: merges duplicate bin stops into a single stop without losing line items', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')

  // Create order with duplicate bin 'C-06-02'
  const duplicateOrder = {
    ...initialPickOrder,
    id: 'PK-DUP-TEST',
    lines: [
      { id: 'L-1', skuId: 'SKU-2084', binId: 'C-06-02', requested: 5, picked: 0 },
      { id: 'L-2', skuId: 'SKU-1102', binId: 'A-02-03', requested: 2, picked: 0 },
      { id: 'L-3', skuId: 'SKU-2084', binId: 'C-06-02', requested: 3, picked: 0 }, // Duplicate bin
    ],
  }

  const result = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: duplicateOrder,
    bins: hydBins,
  })

  assert.strictEqual(result.reachable, true)
  // Stops should be deduplicated (2 distinct bins: C-06-02 and A-02-03)
  assert.strictEqual(result.stops.length, 2)

  const c0602Stop = result.stops.find((s) => s.binId === 'C-06-02')
  assert.ok(c0602Stop, 'C-06-02 stop must exist')
  assert.strictEqual(c0602Stop.requestedUnits, 8, 'Quantities must be summed for duplicate bin (5 + 3 = 8)')
  assert.deepStrictEqual(c0602Stop.lineIds, ['L-1', 'L-3'], 'Both line IDs must be captured')
})

test('optimizePickRoute: handles empty orders and single-stop orders gracefully', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')

  // 1. Empty order
  const emptyOrder = { ...initialPickOrder, lines: [] }
  const emptyRes = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: emptyOrder,
    bins: hydBins,
  })
  assert.strictEqual(emptyRes.reachable, true)
  assert.strictEqual(emptyRes.stops.length, 0)
  assert.strictEqual(emptyRes.optimizedDistanceMeters, 0)

  // 2. Single stop order
  const singleStopOrder = {
    ...initialPickOrder,
    lines: [{ id: 'L-1', skuId: 'SKU-2084', binId: 'A-01-01', requested: 1, picked: 0 }],
  }
  const singleRes = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: singleStopOrder,
    bins: hydBins,
  })
  assert.strictEqual(singleRes.reachable, true)
  assert.strictEqual(singleRes.stops.length, 1)
  assert.ok(singleRes.optimizedDistanceMeters > 0)
})

test('warehouse isolation: blocks walking route when order contains bins from another warehouse', () => {
  const allBins = useAppStore.getState().bins

  // Try to create a walking route in WH-HYD-01 for a bin located in WH-VJA-02
  const crossWhOrder = {
    ...initialPickOrder,
    lines: [
      { id: 'L-HYD', skuId: 'SKU-2084', binId: 'A-01-01', requested: 2, picked: 0 },
      { id: 'L-VJA', skuId: 'SKU-2084', binId: 'VJA-A-01-01-L1F', requested: 2, picked: 0 }, // Belongs to WH-VJA-02
    ],
  }

  const result = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: crossWhOrder,
    bins: allBins,
  })

  assert.strictEqual(result.reachable, false)
  assert.ok(result.unreachableBins.includes('VJA-A-01-01-L1F'))
  assert.ok(result.algorithm.includes('Inter-warehouse walking disallowed'))
})

test('invariance: route calculation preview does not mutate inventory, movements, or pick quantities', () => {
  const beforeInventory = structuredClone(useAppStore.getState().inventory)
  const beforeMovements = structuredClone(useAppStore.getState().movements)
  const beforeLines = structuredClone(useAppStore.getState().pickOrder.lines)

  // Calculate route preview
  useAppStore.getState().calculatePickRoute()

  const afterInventory = useAppStore.getState().inventory
  const afterMovements = useAppStore.getState().movements
  const afterLines = useAppStore.getState().pickOrder.lines

  assert.deepStrictEqual(afterInventory, beforeInventory, 'Inventory must not be mutated by route preview')
  assert.deepStrictEqual(afterMovements, beforeMovements, 'Movements must not be created by route preview')
  assert.deepStrictEqual(afterLines, beforeLines, 'Order lines must not be mutated by preview calculation')
})

test('store workflow: calculatePickRoute, applyOptimizedRoute, and cancelRoutePreview update store state accurately', () => {
  // 1. Calculate route
  const preview = useAppStore.getState().calculatePickRoute()
  assert.ok(preview)
  assert.strictEqual(useAppStore.getState().activeRoutePreview?.orderId, initialPickOrder.id)

  // 2. Apply route
  const applyRes = useAppStore.getState().applyOptimizedRoute()
  assert.strictEqual(applyRes.ok, true)

  const reorderedLines = useAppStore.getState().pickOrder.lines
  assert.strictEqual(reorderedLines.length, initialPickOrder.lines.length)
  // Verify all line IDs preserved
  const originalIds = new Set(initialPickOrder.lines.map((l) => l.id))
  for (const line of reorderedLines) {
    assert.ok(originalIds.has(line.id), `Missing line ID ${line.id}`)
  }

  // 3. Cancel / Clear preview
  useAppStore.getState().cancelRoutePreview()
  assert.strictEqual(useAppStore.getState().activeRoutePreview, null)
})

test('walking time estimation: correctly calculates seconds saved using 1.2 m/s speed and handling time', () => {
  const hydBins = initialBins.filter((b) => (b.warehouseId || 'WH-HYD-01') === 'WH-HYD-01')

  const result = graphEngine.optimizePickRoute({
    warehouseId: 'WH-HYD-01',
    order: initialPickOrder,
    bins: hydBins,
  })

  const { estimatedWalkingTime } = result
  assert.strictEqual(estimatedWalkingTime.walkingSpeedMetersPerSec, 1.2)
  assert.strictEqual(estimatedWalkingTime.pickHandlingSecondsPerStop, 15)

  const expectedOrig = Math.round(result.originalDistanceMeters / 1.2) + result.stops.length * 15
  const expectedOpt = Math.round(result.optimizedDistanceMeters / 1.2) + result.stops.length * 15

  assert.strictEqual(estimatedWalkingTime.originalSeconds, expectedOrig)
  assert.strictEqual(estimatedWalkingTime.optimizedSeconds, expectedOpt)
  assert.strictEqual(estimatedWalkingTime.savedSeconds, Math.max(0, expectedOrig - expectedOpt))
})

