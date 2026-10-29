import type {
  Bin,
  GraphNode,
  MultiStopOptimizationResult,
  NavigationGraph,
  OptimizedPickStop,
  PathResult,
  PickOrder,
  SKU,
} from '../types'

/**
 * Packing / Staging Depot coordinate in warehouse 3D scene.
 * Located in front of the rack arrays at the staging area.
 */
export const DEPOT_NODE_ID = 'DEPOT'
export const DEPOT_COORDINATES: [number, number, number] = [0, 0.08, -6.5]
export const FRONT_CENTER_NODE_ID = 'FRONT_CENTER'
export const FRONT_CENTER_COORDINATES: [number, number, number] = [0, 0.08, -5.2]

// Physical layout constants matching WarehouseScene.tsx
export const AISLE_SPACING_X = 3.4
export const BAY_SPACING_Z = 1.35
export const FRONT_CROSS_AISLE_Z = -5.2
export const BACK_CROSS_AISLE_Z = 5.2
export const WALKING_SURFACE_Y = 0.08
export const WALKING_SPEED_MPS = 1.2 // 1.2 m/s (~72 m/min)
export const PICK_HANDLING_SECONDS_PER_STOP = 15 // 15 seconds per stop

/**
 * Calculates the exact aisle centerline X coordinate.
 */
export function getAisleCenterX(aisle: number): number {
  return (aisle - 3.5) * AISLE_SPACING_X
}

/**
 * Calculates the bay centerline Z coordinate.
 */
export function getBayCenterZ(bay: number): number {
  return (bay - 3.5) * BAY_SPACING_Z
}

/**
 * Resolves the 3D position where a picker stands to pick from a bin.
 */
export function getBinWaypointPosition(bin: Bin): [number, number, number] {
  const aisle = bin.aisle ?? bin.x + 1
  const bay = bin.bay ?? bin.y + 1
  return [getAisleCenterX(aisle), WALKING_SURFACE_Y, getBayCenterZ(bay)]
}

/**
 * Resolves the graph waypoint node ID for a given bin.
 */
export function mapBinToWaypointNodeId(bin: Bin): string {
  const aisle = bin.aisle ?? bin.x + 1
  const bay = bin.bay ?? bin.y + 1
  return `AISLE_${aisle}_BAY_${bay}`
}

/**
 * Euclidean distance heuristic in the horizontal walking plane (X-Z).
 * This is admissible because graph edges are straight orthogonal corridors,
 * so Euclidean straight-line distance is always <= actual graph distance.
 */
export function euclideanHeuristic(nodeA: GraphNode, nodeB: GraphNode): number {
  return Math.hypot(nodeA.x - nodeB.x, nodeA.z - nodeB.z)
}

/**
 * Builds a walkable navigation graph for a specific warehouse.
 * Prevents traversal through shelves by restricting movement to designated
 * aisles and cross-aisles.
 */
export function buildWarehouseGraph(
  warehouseId: string,
  bins: Bin[],
  blockedAisles: number[] = [],
  blockedEdges: string[] = []
): NavigationGraph {
  const warehouseBins = bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === warehouseId)
  const maxAisle = Math.max(6, ...warehouseBins.map((b) => b.aisle ?? (b.x !== undefined ? b.x + 1 : 1)))
  const maxBay = Math.max(6, ...warehouseBins.map((b) => b.bay ?? (b.y !== undefined ? b.y + 1 : 1)))

  const nodes: Record<string, GraphNode> = {}
  const adjacency: Record<string, { to: string; weight: number }[]> = {}

  function addNode(node: GraphNode) {
    nodes[node.id] = node
    if (!adjacency[node.id]) {
      adjacency[node.id] = []
    }
  }

  function addEdge(fromId: string, toId: string, weight: number) {
    const edgeKey1 = `${fromId}->${toId}`
    const edgeKey2 = `${toId}->${fromId}`
    if (blockedEdges.includes(edgeKey1) || blockedEdges.includes(edgeKey2)) {
      return
    }

    if (!adjacency[fromId]) adjacency[fromId] = []
    if (!adjacency[toId]) adjacency[toId] = []

    if (!adjacency[fromId].some((e) => e.to === toId)) {
      adjacency[fromId].push({ to: toId, weight: Math.round(weight * 1000) / 1000 })
    }
    if (!adjacency[toId].some((e) => e.to === fromId)) {
      adjacency[toId].push({ to: fromId, weight: Math.round(weight * 1000) / 1000 })
    }
  }

  // 1. Add Depot and Front Center Nodes
  addNode({
    id: DEPOT_NODE_ID,
    x: DEPOT_COORDINATES[0],
    y: DEPOT_COORDINATES[1],
    z: DEPOT_COORDINATES[2],
    type: 'depot',
    label: 'Packing & Dispatch Depot',
  })

  addNode({
    id: FRONT_CENTER_NODE_ID,
    x: FRONT_CENTER_COORDINATES[0],
    y: FRONT_CENTER_COORDINATES[1],
    z: FRONT_CENTER_COORDINATES[2],
    type: 'front_cross',
    label: 'Front Cross-Aisle Staging Center',
  })

  // Edge Depot <-> Front Center
  addEdge(
    DEPOT_NODE_ID,
    FRONT_CENTER_NODE_ID,
    Math.abs(FRONT_CENTER_COORDINATES[2] - DEPOT_COORDINATES[2])
  )

  // 2. Add Cross-Aisle and Mid-Aisle Nodes
  for (let a = 1; a <= maxAisle; a++) {
    const aisleX = getAisleCenterX(a)

    // Front cross-aisle waypoint for aisle a
    const frontNodeId = `FRONT_AISLE_${a}`
    addNode({
      id: frontNodeId,
      x: aisleX,
      y: WALKING_SURFACE_Y,
      z: FRONT_CROSS_AISLE_Z,
      aisle: a,
      type: 'front_cross',
      label: `Front Aisle ${a}`,
    })

    // Back cross-aisle waypoint for aisle a
    const backNodeId = `BACK_AISLE_${a}`
    addNode({
      id: backNodeId,
      x: aisleX,
      y: WALKING_SURFACE_Y,
      z: BACK_CROSS_AISLE_Z,
      aisle: a,
      type: 'back_cross',
      label: `Back Aisle ${a}`,
    })

    // Mid-aisle bay waypoints
    for (let b = 1; b <= maxBay; b++) {
      const bayZ = getBayCenterZ(b)
      const bayNodeId = `AISLE_${a}_BAY_${b}`
      addNode({
        id: bayNodeId,
        x: aisleX,
        y: WALKING_SURFACE_Y,
        z: bayZ,
        aisle: a,
        bay: b,
        type: 'aisle_waypoint',
        label: `Aisle ${a} Bay ${b}`,
      })
    }
  }

  // 3. Connect Front Cross-Aisle Waypoints
  // Connect FRONT_CENTER to closest front aisle nodes
  let closestLeftFrontAisle = -1
  let closestRightFrontAisle = -1
  let minLeftDist = Infinity
  let minRightDist = Infinity

  for (let a = 1; a <= maxAisle; a++) {
    const x = getAisleCenterX(a)
    if (x <= 0 && Math.abs(x) < minLeftDist) {
      minLeftDist = Math.abs(x)
      closestLeftFrontAisle = a
    }
    if (x >= 0 && Math.abs(x) < minRightDist) {
      minRightDist = Math.abs(x)
      closestRightFrontAisle = a
    }
  }

  if (closestLeftFrontAisle > 0) {
    addEdge(
      FRONT_CENTER_NODE_ID,
      `FRONT_AISLE_${closestLeftFrontAisle}`,
      Math.abs(getAisleCenterX(closestLeftFrontAisle) - FRONT_CENTER_COORDINATES[0])
    )
  }
  if (closestRightFrontAisle > 0 && closestRightFrontAisle !== closestLeftFrontAisle) {
    addEdge(
      FRONT_CENTER_NODE_ID,
      `FRONT_AISLE_${closestRightFrontAisle}`,
      Math.abs(getAisleCenterX(closestRightFrontAisle) - FRONT_CENTER_COORDINATES[0])
    )
  }

  // Connect adjacent front cross-aisle nodes
  for (let a = 1; a < maxAisle; a++) {
    const fromFront = `FRONT_AISLE_${a}`
    const toFront = `FRONT_AISLE_${a + 1}`
    const dist = Math.abs(getAisleCenterX(a + 1) - getAisleCenterX(a))
    addEdge(fromFront, toFront, dist)
  }

  // 4. Connect Adjacent Back Cross-Aisle Waypoints
  for (let a = 1; a < maxAisle; a++) {
    const fromBack = `BACK_AISLE_${a}`
    const toBack = `BACK_AISLE_${a + 1}`
    const dist = Math.abs(getAisleCenterX(a + 1) - getAisleCenterX(a))
    addEdge(fromBack, toBack, dist)
  }

  // 5. Connect Mid-Aisle Corridors (blocked aisles are excluded)
  for (let a = 1; a <= maxAisle; a++) {
    if (blockedAisles.includes(a)) {
      // Entire aisle is blocked; do not create edges into or along this aisle
      continue
    }

    const frontNodeId = `FRONT_AISLE_${a}`
    const bay1NodeId = `AISLE_${a}_BAY_1`
    const bay1Z = getBayCenterZ(1)
    addEdge(frontNodeId, bay1NodeId, Math.abs(bay1Z - FRONT_CROSS_AISLE_Z))

    for (let b = 1; b < maxBay; b++) {
      const fromBay = `AISLE_${a}_BAY_${b}`
      const toBay = `AISLE_${a}_BAY_${b + 1}`
      const dist = Math.abs(getBayCenterZ(b + 1) - getBayCenterZ(b))
      addEdge(fromBay, toBay, dist)
    }

    const lastBayNodeId = `AISLE_${a}_BAY_${maxBay}`
    const backNodeId = `BACK_AISLE_${a}`
    const lastBayZ = getBayCenterZ(maxBay)
    addEdge(lastBayNodeId, backNodeId, Math.abs(BACK_CROSS_AISLE_Z - lastBayZ))
  }

  return {
    warehouseId,
    nodes,
    adjacency,
    blockedAisles,
  }
}

/**
 * Generic Shortest Path finding using Dijkstra's Algorithm or A* Search.
 */
export function findShortestPath(
  graph: NavigationGraph,
  startNodeId: string,
  targetNodeId: string,
  algorithm: 'astar' | 'dijkstra' = 'astar'
): PathResult {
  const startNode = graph.nodes[startNodeId]
  const targetNode = graph.nodes[targetNodeId]

  if (!startNode || !targetNode) {
    return {
      reachable: false,
      pathNodeIds: [],
      pathPoints: [],
      totalDistanceMeters: Infinity,
      algorithmUsed: algorithm,
    }
  }

  if (startNodeId === targetNodeId) {
    return {
      reachable: true,
      pathNodeIds: [startNodeId],
      pathPoints: [[startNode.x, startNode.y, startNode.z]],
      totalDistanceMeters: 0,
      algorithmUsed: algorithm,
    }
  }

  // Distance from start to node
  const gScores: Record<string, number> = { [startNodeId]: 0 }
  // Estimated total distance f(n) = g(n) + h(n)
  const fScores: Record<string, number> = {
    [startNodeId]: algorithm === 'astar' ? euclideanHeuristic(startNode, targetNode) : 0,
  }

  const cameFrom: Record<string, string> = {}
  const openSet = new Set<string>([startNodeId])
  const closedSet = new Set<string>()

  while (openSet.size > 0) {
    // Select node with minimum fScore in openSet
    let currentId: string | null = null
    let lowestF = Infinity

    for (const nodeId of openSet) {
      const f = fScores[nodeId] ?? Infinity
      if (f < lowestF) {
        lowestF = f
        currentId = nodeId
      }
    }

    if (!currentId) break
    if (currentId === targetNodeId) {
      // Reconstruct path
      const pathNodeIds: string[] = [currentId]
      let curr = currentId
      while (cameFrom[curr]) {
        curr = cameFrom[curr]
        pathNodeIds.unshift(curr)
      }

      const pathPoints: [number, number, number][] = pathNodeIds.map((id) => {
        const n = graph.nodes[id]
        return [n.x, n.y, n.z]
      })

      return {
        reachable: true,
        pathNodeIds,
        pathPoints,
        totalDistanceMeters: Math.round((gScores[targetNodeId] ?? 0) * 100) / 100,
        algorithmUsed: algorithm,
      }
    }

    openSet.delete(currentId)
    closedSet.add(currentId)

    const neighbors = graph.adjacency[currentId] || []
    for (const edge of neighbors) {
      if (closedSet.has(edge.to)) continue

      const tentativeG = (gScores[currentId] ?? Infinity) + edge.weight
      const neighborG = gScores[edge.to] ?? Infinity

      if (tentativeG < neighborG) {
        cameFrom[edge.to] = currentId
        gScores[edge.to] = tentativeG
        const h = algorithm === 'astar' && graph.nodes[edge.to]
          ? euclideanHeuristic(graph.nodes[edge.to], targetNode)
          : 0
        fScores[edge.to] = tentativeG + h

        openSet.add(edge.to)
      }
    }
  }

  return {
    reachable: false,
    pathNodeIds: [],
    pathPoints: [],
    totalDistanceMeters: Infinity,
    algorithmUsed: algorithm,
  }
}

/**
 * Builds an initial tour using the Nearest Neighbor construction heuristic.
 * Starts at index 0 (Depot), visits each stop, and returns to index 0.
 */
export function buildNearestNeighborTour(distanceMatrix: number[][]): number[] {
  const numNodes = distanceMatrix.length
  if (numNodes <= 1) return [0, 0]

  const visited = new Set<number>([0])
  const tour = [0]
  let current = 0

  while (visited.size < numNodes) {
    let nearest = -1
    let minDist = Infinity

    for (let candidate = 0; candidate < numNodes; candidate++) {
      if (!visited.has(candidate)) {
        const dist = distanceMatrix[current][candidate]
        if (dist < minDist) {
          minDist = dist
          nearest = candidate
        }
      }
    }

    if (nearest === -1) break
    visited.add(nearest)
    tour.push(nearest)
    current = nearest
  }

  tour.push(0) // Return to Depot
  return tour
}

/**
 * Computes the total distance of a tour using a distance matrix.
 */
export function calculateTourDistance(tour: number[], distanceMatrix: number[][]): number {
  let sum = 0
  for (let i = 0; i < tour.length - 1; i++) {
    sum += distanceMatrix[tour[i]][tour[i + 1]]
  }
  return sum
}

/**
 * 2-Opt TSP Local Search Improvement Heuristic.
 * Successively reverses subsegments of the tour to remove crossing paths
 * and shorten total traversal distance.
 *
 * NOTE: 2-Opt is a polynomial-time approximation heuristic for the NP-hard TSP,
 * strictly guaranteeing that the final tour distance <= the initial tour distance.
 */
export function improveTourWithTwoOpt(
  initialTour: number[],
  distanceMatrix: number[][],
  maxIterations: number = 200
): number[] {
  const tour = [...initialTour]
  const n = tour.length
  if (n <= 3) return tour // [0, stop, 0] cannot be 2-opt improved

  let improved = true
  let iterations = 0

  // tour starts at index 0 (Depot) and ends at index n-1 (Depot).
  // Stops are at indices 1 through n-2.
  while (improved && iterations < maxIterations) {
    improved = false
    iterations++

    for (let i = 1; i < n - 2; i++) {
      for (let j = i + 1; j < n - 1; j++) {
        const u1 = tour[i - 1]
        const v1 = tour[i]
        const u2 = tour[j]
        const v2 = tour[j + 1]

        const currentDist = distanceMatrix[u1][v1] + distanceMatrix[u2][v2]
        const newDist = distanceMatrix[u1][u2] + distanceMatrix[v1][v2]

        if (newDist < currentDist - 1e-6) {
          // Reverse sub-array between i and j
          let left = i
          let right = j
          while (left < right) {
            const temp = tour[left]
            tour[left] = tour[right]
            tour[right] = temp
            left++
            right--
          }
          improved = true
          break
        }
      }
      if (improved) break
    }
  }

  return tour
}

/**
 * Optimizes a pick route across the warehouse graph using Dijkstra/A* and 2-Opt.
 * Preserves pick order quantities and line details while generating a high-efficiency
 * shortest walking path.
 */
export function optimizePickRoute({
  warehouseId,
  order,
  bins,
  skus: _skus = [],
  blockedAisles = [],
  algorithm = 'astar',
}: {
  warehouseId: string
  order: PickOrder
  bins: Bin[]
  skus?: SKU[]
  blockedAisles?: number[]
  algorithm?: 'astar' | 'dijkstra'
}): MultiStopOptimizationResult {
  const graph = buildWarehouseGraph(warehouseId, bins, blockedAisles)

  // Filter required lines (either not fully picked, or all lines if all are picked)
  const remainingLines = order.lines.filter((l) => l.picked < l.requested)
  const activeLines = remainingLines.length > 0 ? remainingLines : order.lines

  // Validate warehouse isolation: confirm all bins belong to the requested warehouse
  const binMap = new Map<string, Bin>(bins.map((b) => [b.id, b]))
  const crossWarehouseBins: string[] = []

  for (const line of activeLines) {
    const bin = binMap.get(line.binId)
    const lineWh = bin?.warehouseId || 'WH-HYD-01'
    if (lineWh !== warehouseId) {
      crossWarehouseBins.push(line.binId)
    }
  }

  if (crossWarehouseBins.length > 0) {
    return {
      warehouseId,
      orderId: order.id,
      reachable: false,
      unreachableBins: crossWarehouseBins,
      startNodeId: DEPOT_NODE_ID,
      endNodeId: DEPOT_NODE_ID,
      originalStopSequence: activeLines.map((l) => l.binId),
      optimizedStopSequence: [],
      stops: [],
      originalDistanceMeters: 0,
      optimizedDistanceMeters: 0,
      distanceSavedMeters: 0,
      percentageDistanceSaved: 0,
      estimatedWalkingTime: {
        originalSeconds: 0,
        optimizedSeconds: 0,
        savedSeconds: 0,
        walkingSpeedMetersPerSec: WALKING_SPEED_MPS,
        pickHandlingSecondsPerStop: PICK_HANDLING_SECONDS_PER_STOP,
      },
      fullRouteCoordinates: [],
      algorithm: `Inter-warehouse walking disallowed (${crossWarehouseBins.join(', ')} belong to another facility)`,
      generatedAt: new Date().toISOString(),
    }
  }

  // Handle empty order lines gracefully
  if (activeLines.length === 0) {
    return {
      warehouseId,
      orderId: order.id,
      reachable: true,
      unreachableBins: [],
      startNodeId: DEPOT_NODE_ID,
      endNodeId: DEPOT_NODE_ID,
      originalStopSequence: [],
      optimizedStopSequence: [],
      stops: [],
      originalDistanceMeters: 0,
      optimizedDistanceMeters: 0,
      distanceSavedMeters: 0,
      percentageDistanceSaved: 0,
      estimatedWalkingTime: {
        originalSeconds: 0,
        optimizedSeconds: 0,
        savedSeconds: 0,
        walkingSpeedMetersPerSec: WALKING_SPEED_MPS,
        pickHandlingSecondsPerStop: PICK_HANDLING_SECONDS_PER_STOP,
      },
      fullRouteCoordinates: [DEPOT_COORDINATES],
      algorithm: 'Empty Order (0 stops)',
      generatedAt: new Date().toISOString(),
    }
  }

  // Consolidate duplicate stops (lines pointing to the same bin)
  const consolidatedStopMap = new Map<
    string,
    {
      binId: string
      boxId?: string
      lineIds: string[]
      skuIds: string[]
      requestedUnits: number
      bin: Bin
      waypointNodeId: string
      aisle: number
      bay: number
    }
  >()

  const originalStopSequence: string[] = []

  for (const line of activeLines) {
    const bin = binMap.get(line.binId)
    const aisle = bin ? (bin.aisle ?? bin.x + 1) : 1
    const bay = bin ? (bin.bay ?? bin.y + 1) : 1
    const waypointNodeId = bin ? mapBinToWaypointNodeId(bin) : `AISLE_${aisle}_BAY_${bay}`

    if (!originalStopSequence.includes(line.binId)) {
      originalStopSequence.push(line.binId)
    }

    if (!consolidatedStopMap.has(line.binId)) {
      consolidatedStopMap.set(line.binId, {
        binId: line.binId,
        boxId: line.boxId,
        lineIds: [line.id],
        skuIds: [line.skuId],
        requestedUnits: line.requested - line.picked,
        bin: bin || {
          id: line.binId,
          warehouseId,
          zone: 'A',
          skuId: line.skuId,
          quantity: 0,
          capacity: 48,
          status: 'Healthy',
          x: aisle - 1,
          y: bay - 1,
          aisle,
          bay,
          level: 1,
          face: 'front',
        },
        waypointNodeId,
        aisle,
        bay,
      })
    } else {
      const existing = consolidatedStopMap.get(line.binId)!
      existing.lineIds.push(line.id)
      if (!existing.skuIds.includes(line.skuId)) {
        existing.skuIds.push(line.skuId)
      }
      existing.requestedUnits += line.requested - line.picked
    }
  }

  const distinctStops = Array.from(consolidatedStopMap.values())
  const stopWaypoints = distinctStops.map((s) => s.waypointNodeId)
  const allRoutingNodes = [DEPOT_NODE_ID, ...stopWaypoints]

  // Check reachability from DEPOT to each stop
  const unreachableBins: string[] = []
  for (let i = 0; i < distinctStops.length; i++) {
    const stop = distinctStops[i]
    const pathFromDepot = findShortestPath(graph, DEPOT_NODE_ID, stop.waypointNodeId, algorithm)
    if (!pathFromDepot.reachable) {
      unreachableBins.push(stop.binId)
    }
  }

  if (unreachableBins.length > 0) {
    return {
      warehouseId,
      orderId: order.id,
      reachable: false,
      unreachableBins,
      startNodeId: DEPOT_NODE_ID,
      endNodeId: DEPOT_NODE_ID,
      originalStopSequence,
      optimizedStopSequence: [],
      stops: [],
      originalDistanceMeters: 0,
      optimizedDistanceMeters: 0,
      distanceSavedMeters: 0,
      percentageDistanceSaved: 0,
      estimatedWalkingTime: {
        originalSeconds: 0,
        optimizedSeconds: 0,
        savedSeconds: 0,
        walkingSpeedMetersPerSec: WALKING_SPEED_MPS,
        pickHandlingSecondsPerStop: PICK_HANDLING_SECONDS_PER_STOP,
      },
      fullRouteCoordinates: [],
      algorithm: `Unreachable bins detected (${unreachableBins.join(', ')})`,
      generatedAt: new Date().toISOString(),
    }
  }

  // Compute pairwise shortest paths and distance matrix
  const numNodes = allRoutingNodes.length
  const distanceMatrix: number[][] = Array.from({ length: numNodes }, () => Array(numNodes).fill(0))
  const pathCache = new Map<string, PathResult>()

  for (let i = 0; i < numNodes; i++) {
    for (let j = 0; j < numNodes; j++) {
      if (i === j) {
        distanceMatrix[i][j] = 0
        continue
      }
      const fromId = allRoutingNodes[i]
      const toId = allRoutingNodes[j]
      const cacheKey = `${fromId}__${toId}`

      let pathRes = pathCache.get(cacheKey)
      if (!pathRes) {
        pathRes = findShortestPath(graph, fromId, toId, algorithm)
        pathCache.set(cacheKey, pathRes)
      }
      distanceMatrix[i][j] = pathRes.totalDistanceMeters
    }
  }

  // Calculate original sequential distance
  // Sequential tour is Depot (0) -> 1 -> 2 -> ... -> K -> Depot (0)
  const originalTourIndices = [0]
  for (let i = 1; i < numNodes; i++) {
    originalTourIndices.push(i)
  }
  originalTourIndices.push(0)
  const originalDistanceMeters = calculateTourDistance(originalTourIndices, distanceMatrix)

  // Run Nearest Neighbor construction
  const nnTour = buildNearestNeighborTour(distanceMatrix)

  // Run 2-Opt local search improvement
  const optimizedTour = improveTourWithTwoOpt(nnTour, distanceMatrix)
  const optimizedDistanceMeters = calculateTourDistance(optimizedTour, distanceMatrix)

  // Extract ordered stops from optimized tour
  // optimizedTour has format [0, s1, s2, ..., sk, 0]
  const orderedStops: OptimizedPickStop[] = []
  const optimizedStopSequence: string[] = []
  const fullRouteCoordinates: [number, number, number][] = []

  let prevNodeId = DEPOT_NODE_ID

  for (let step = 1; step < optimizedTour.length - 1; step++) {
    const stopNodeIndex = optimizedTour[step]
    const stopData = distinctStops[stopNodeIndex - 1]
    const targetNodeId = stopData.waypointNodeId

    const cacheKey = `${prevNodeId}__${targetNodeId}`
    const legPath = pathCache.get(cacheKey) || findShortestPath(graph, prevNodeId, targetNodeId, algorithm)

    // Append leg coordinates to full route
    for (let pIdx = 0; pIdx < legPath.pathPoints.length; pIdx++) {
      const pt = legPath.pathPoints[pIdx]
      if (
        fullRouteCoordinates.length === 0 ||
        Math.hypot(
          fullRouteCoordinates[fullRouteCoordinates.length - 1][0] - pt[0],
          fullRouteCoordinates[fullRouteCoordinates.length - 1][2] - pt[2]
        ) > 0.01
      ) {
        fullRouteCoordinates.push(pt)
      }
    }

    const [stopX, , stopZ] = getBinWaypointPosition(stopData.bin)
    orderedStops.push({
      stopIndex: step,
      binId: stopData.binId,
      boxId: stopData.boxId,
      lineIds: stopData.lineIds,
      skuIds: stopData.skuIds,
      requestedUnits: stopData.requestedUnits,
      waypointNodeId: stopData.waypointNodeId,
      coordinates: [stopX, WALKING_SURFACE_Y, stopZ],
      aisle: stopData.aisle,
      bay: stopData.bay,
      subPathFromPrevious: legPath.pathPoints,
      distanceFromPreviousMeters: legPath.totalDistanceMeters,
    })

    optimizedStopSequence.push(stopData.binId)
    prevNodeId = targetNodeId
  }

  // Final leg back to Depot
  const returnKey = `${prevNodeId}__${DEPOT_NODE_ID}`
  const returnLeg = pathCache.get(returnKey) || findShortestPath(graph, prevNodeId, DEPOT_NODE_ID, algorithm)
  for (let pIdx = 0; pIdx < returnLeg.pathPoints.length; pIdx++) {
    const pt = returnLeg.pathPoints[pIdx]
    if (
      fullRouteCoordinates.length === 0 ||
      Math.hypot(
        fullRouteCoordinates[fullRouteCoordinates.length - 1][0] - pt[0],
        fullRouteCoordinates[fullRouteCoordinates.length - 1][2] - pt[2]
      ) > 0.01
    ) {
      fullRouteCoordinates.push(pt)
    }
  }

  const distanceSavedMeters = Math.max(0, Math.round((originalDistanceMeters - optimizedDistanceMeters) * 100) / 100)
  const percentageDistanceSaved = originalDistanceMeters > 0
    ? Math.round((distanceSavedMeters / originalDistanceMeters) * 1000) / 10
    : 0

  const numStops = orderedStops.length
  const origHandlingTime = numStops * PICK_HANDLING_SECONDS_PER_STOP
  const originalSeconds = Math.round(originalDistanceMeters / WALKING_SPEED_MPS) + origHandlingTime
  const optimizedSeconds = Math.round(optimizedDistanceMeters / WALKING_SPEED_MPS) + origHandlingTime
  const savedSeconds = Math.max(0, originalSeconds - optimizedSeconds)

  return {
    warehouseId,
    orderId: order.id,
    reachable: true,
    unreachableBins: [],
    startNodeId: DEPOT_NODE_ID,
    endNodeId: DEPOT_NODE_ID,
    originalStopSequence,
    optimizedStopSequence,
    stops: orderedStops,
    originalDistanceMeters: Math.round(originalDistanceMeters * 100) / 100,
    optimizedDistanceMeters: Math.round(optimizedDistanceMeters * 100) / 100,
    distanceSavedMeters,
    percentageDistanceSaved,
    estimatedWalkingTime: {
      originalSeconds,
      optimizedSeconds,
      savedSeconds,
      walkingSpeedMetersPerSec: WALKING_SPEED_MPS,
      pickHandlingSecondsPerStop: PICK_HANDLING_SECONDS_PER_STOP,
    },
    fullRouteCoordinates,
    algorithm: `Nearest-Neighbor + 2-Opt TSP Heuristic (${algorithm.toUpperCase()})`,
    generatedAt: new Date().toISOString(),
  }
}
