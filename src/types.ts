export type ScreenId = 'dashboard' | 'warehouse' | 'picker' | 'suppliers' | 'optimization' | 'analytics' | 'analyst' | 'network'
export type UserRole = 'picker' | 'supplier' | 'manager' | 'analyst'
export type Status = 'Healthy' | 'Low stock' | 'Critical' | 'Empty' | 'Unavailable' | 'In transit' | 'Pending' | 'Approved' | 'At risk' | 'Optimal'

export type WarehouseOperatingStatus = 'Active' | 'Maintenance' | 'Inactive'
export type WarehouseType = 'Central Distribution Hub' | 'Distribution Center' | 'Regional Fulfillment' | 'Urban Fulfillment Center'

export interface Warehouse {
  id: string
  name: string
  location: string
  city?: string
  type?: WarehouseType
  status?: WarehouseOperatingStatus
  zones: number
  capacity: number
  utilization: number
  totalBins?: number
  address?: string
  contactPhone?: string
  operatingHours?: string
  priority?: number
  estimatedDistanceKm?: Record<string, number>
}

export interface Bin {
  id: string
  warehouseId?: string
  zone: string
  skuId: string
  quantity: number
  capacity: number
  status: Status
  x: number
  y: number
  aisle?: number
  bay?: number
  level?: number
  face?: 'front' | 'back'
  maxWeightKg?: number
  handlingCapabilities?: HandlingType[]
  optimizationConstraints?: BinOptimizationConstraints
}
export type HandlingType = 'standard' | 'fragile' | 'oversize' | 'hazardous'
export interface SKUOptimizationProfile { weeklyPickFrequency: number; demandClass: 'A' | 'B' | 'C'; dimensionsCm: [number, number, number]; weightKg: number; handling: HandlingType; hazardClass?: string; affinitySkuIds: string[] }
export interface BinOptimizationConstraints { dimensionsCm: [number, number, number]; maxWeightKg: number; handlingCapabilities: HandlingType[]; certifiedHazards: string[]; goldenZone: boolean; source: 'demo estimate' }
export interface SKU { id: string; name: string; category: string; unit: string; reorderPoint: number; supplier: string; weightKg?: number; handlingRequired?: HandlingType | string; optimizationProfile?: SKUOptimizationProfile; archived?: boolean }
export interface OptimizerWeights { travelDistance: number; cubeUtilization: number; goldenZone: number; skuAffinity: number }
export interface OptimizationConfig { weights: OptimizerWeights; preferGoldenZone: boolean }
export type OptimizationConstraintCode = 'bin-capacity' | 'volume-capacity' | 'dimensions' | 'weight' | 'handling' | 'hazard' | 'golden-location'
export interface OptimizationViolation { code: OptimizationConstraintCode; title: string; expected: string; actual: string; explanation: string }
export interface OptimizationPlacement { skuId: string; skuName: string; quantity: number; fromBinId: string; toBinId: string; reason: string; feasible: boolean; score: number; violations: OptimizationViolation[] }
export interface OptimizationMetrics { travelMeters: number; pickTimeMinutes: number; cubeUtilizationPercent: number; goldenZoneCount: number; movementCount: number; hardConstraintViolations: number; objectiveScore: number }
export interface OptimizationRun { id: string; revision: number; createdAt: string; config: OptimizationConfig; placements: OptimizationPlacement[]; rejectedCandidates: OptimizationPlacement[]; assumptions: string[]; baseline: OptimizationMetrics; proposed: OptimizationMetrics; approvedAt: string | null; approvedBy: string | null }
export interface InventoryItem { skuId: string; binId: string; warehouseId?: string; quantity: number; reserved: number; updated: string; capacity: number; reorderPoint: number; available: boolean; archived?: boolean }

export type MovementType = 'pick' | 'receive' | 'adjust' | 'relocate' | 'transfer'
export type MovementSource = 'digital-twin-demo' | 'picker-workspace' | 'inventory-crud' | 'relocation-task'

export interface StockMovement {
  id: string
  binId: string
  skuId: string
  warehouseId?: string
  type: MovementType
  quantity: number
  timestamp: string
  source: MovementSource
  reason?: string
  destinationBinId?: string
}

export interface PickingTask { id: string; priority: 'High' | 'Normal' | 'Low'; status: 'Ready' | 'In progress' | 'Complete'; items: number; stops: number; picker: string; due: string }
export type PickOrderStatus = 'Ready' | 'In progress' | 'Paused' | 'Complete'
export interface PickOrderLine { id: string; skuId: string; binId: string; requested: number; picked: number; boxId?: string; notes?: string }
export interface PickOrder { id: string; priority: 'High' | 'Normal' | 'Low'; status: PickOrderStatus; picker: string; assignedTo: string; due: string; currentStopIndex: number; lines: PickOrderLine[] }
export type BinIssueType = 'Empty Bin' | 'Damaged Product' | 'Incorrect Location' | 'Quantity Mismatch' | 'Other'
export interface PickBinIssue { id: string; taskId: string; binId: string; skuId: string; type: BinIssueType; description: string; manualCount?: number; timestamp: string; status: 'Submitted' }
export interface PickTransactionResult { ok: boolean; kind: 'success' | 'validation' | 'paused' | 'duplicate' | 'missing'; message: string; binId?: string; skuId?: string; quantity?: number; remaining?: number; lowStock?: boolean }
export interface SupplierRequest { id: string; supplier: string; sku: string; quantity: number; eta: string; status: Status; value: string }
export type ReplenishmentStatus = 'Draft' | 'Submitted' | 'Confirmed full' | 'Partial offer' | 'Unavailable' | 'Delayed' | 'In transit' | 'Partially received' | 'Completed' | 'Cancelled'
export type SupplierResponseKind = 'full' | 'partial' | 'unavailable' | 'delayed'
export type ReplenishmentUrgency = 'Critical Stockout' | 'Critical Reorder Risk' | 'High Risk' | 'Medium Risk' | 'Healthy'
export type ShortageScope = 'local' | 'network_wide'
export type FulfillmentStrategy = 'inter_warehouse_transfer' | 'supplier_replenishment'

export interface SupplierOption {
  supplierName: string
  isPrimary: boolean
  leadTimeDays: number
  reliabilityRating: number
  minOrderQuantity: number
  costPerUnit?: number
}

export interface ReplenishmentCalculationDetails {
  dailyVelocity: number
  leadTimeDays: number
  leadTimeDemand: number
  safetyStockDays: number
  safetyStockUnits: number
  reorderPoint: number
  onHandStock: number
  reservedStock: number
  availableStock: number
  inFlightPurchaseOrders: number
  inTransitTransfers: number
  totalPipelineStock: number
  netProjectedStock: number
  targetStockLevel: number
  grossDeficit: number
  netDeficit: number
  recommendedQuantity: number
  assumptions: string[]
}

export interface IntelligentReorderRecommendation {
  id: string
  skuId: string
  skuName: string
  category: string
  warehouseId: string
  warehouseName: string
  targetBinId: string
  urgency: ReplenishmentUrgency
  shortageScope: ShortageScope
  strategy: FulfillmentStrategy
  recommendedQuantity: number
  sourceWarehouseId?: string
  sourceWarehouseName?: string
  sourceBinId?: string
  availableSurplusAtSource?: number
  transitDistanceKm?: number
  estimatedTransitHours?: number
  supplierName?: string
  availableSuppliers: SupplierOption[]
  calculations: ReplenishmentCalculationDetails
  hasPendingOrder: boolean
  pendingOrderIds: string[]
  reason: string
  status: 'PROPOSED' | 'APPROVED' | 'DISMISSED'
  createdAt: string
  disclaimer: string
}

export interface ReplenishmentSafetyStockConfig {
  defaultSafetyStockDays: number
  classASafetyStockDays: number
  classBSafetyStockDays: number
  classCSafetyStockDays: number
  targetReviewCycleDays: number
  minOrderQuantity: number
}

export interface ReplenishmentEvent { id: string; at: string; actor: 'Manager' | 'Supplier' | 'System'; label: string; note?: string }
export interface ReplenishmentReceipt { id: string; requestId: string; skuId: string; binId: string; delivered: number; accepted: number; rejected: number; timestamp: string; transactionId: string }
export interface ReplenishmentRequest {
  id: string
  skuId: string
  binId: string
  warehouseId?: string
  quantity: number
  supplier: string
  createdAt: string
  expectedDate: string
  status: ReplenishmentStatus
  confirmedQuantity: number | null
  responseNote: string
  dispatchedAt?: string
  receipts: ReplenishmentReceipt[]
  timeline: ReplenishmentEvent[]
  urgency?: ReplenishmentUrgency
  recommendationId?: string
}
export interface ReplenishmentResult { ok: boolean; message: string; request?: ReplenishmentRequest; receipt?: ReplenishmentReceipt }
export interface OptimizationResult { id: string; title: string; moves: number; travelSaved: string; efficiency: number; status: Status }

export interface LiveSystemAlert {
  id: string
  timestamp: string
  title: string
  detail: string
  source: 'manager' | 'supplier' | 'picker' | 'analyst'
  tone?: 'blue' | 'green' | 'amber' | 'purple'
}

export interface AnalystLiveMetrics {
  ordersFulfilled: number
  unitsShipped: number
  pickAccuracy: number
  onTimeDispatch: number
  goldenZoneEfficiency: number
  totalPicksCount: number
}

export type CoPlacementStatus = 'Proposed by Analyst' | 'Approved by Manager' | 'Assigned to Picker' | 'Completed by Picker'

export interface CoPlacementOrder {
  id: string
  title: string
  category: string
  skuA: {
    id: string
    name: string
    currentBin: string
    currentBoxId: string
    targetBin: string
    targetBoxId: string
  }
  skuB: {
    id: string
    name: string
    currentBin: string
    currentBoxId: string
    targetBin: string
    targetBoxId: string
  }
  initialDistanceMeters: number
  targetDistanceMeters: number
  predictedSalesLiftPercent: number
  predictedMonthlyRevenue: number
  confidenceScore: number
  pickerTimeSavedSeconds: number
  rationale: string
  status: CoPlacementStatus
  quantity?: number
  approvedQuantity?: number
  createdAt: string
  managerApprovedAt?: string
  pickerCompletedAt?: string
  assignedPicker?: string
}

export interface RelocationTransferTask {
  id: string
  skuId: string
  sourceBinId: string
  targetBinId: string
  quantity: number
  status: 'Pending' | 'Completed' | 'Cancelled'
  createdAt: string
  completedAt?: string
  notes?: string
}

export interface CreateProductInput {
  skuId?: string
  id?: string
  name: string
  category: string
  unit?: string
  quantity: number
  reorderPoint: number
  weightKg: number
  binId: string
  supplier?: string
  dimensionsCm?: [number, number, number]
  handling?: HandlingType
}

export interface CrudResult {
  ok: boolean
  message: string
  item?: InventoryItem
  sku?: SKU
  task?: RelocationTransferTask
}

export type SkuMetadataUpdates = Partial<Pick<SKU, 'name' | 'category' | 'unit' | 'supplier' | 'reorderPoint'>> & { weightKg?: number; handling?: HandlingType }


// ============================================================================
// STAGE 3: SALES-DEMAND INTELLIGENCE & PARETO VELOCITY TYPES
// ============================================================================

export type DemandWindowDays = 7 | 30 | 90

export interface SaleEvent {
  id: string
  skuId: string
  quantity: number
  timestamp: string
  orderRef: string
  channel?: 'e-commerce' | 'retail' | 'express'
  unitPrice?: number
  isSimulated: boolean
}

export type ReorderRiskLevel = 'Critical Stockout' | 'Critical Reorder Risk' | 'High Risk' | 'Medium Risk' | 'Healthy'

export interface SkuDemandProfile {
  skuId: string
  skuName: string
  category: string
  supplier: string
  unit: string
  currentBinId: string
  currentZone: string
  currentLevel: number
  isGoldenZone: boolean
  onHand: number
  reserved: number
  availableStock: number
  totalSold7d: number
  dailyVelocity7d: number
  totalSold30d: number
  dailyVelocity30d: number
  velocityGrowthPct: number
  trend: 'growing' | 'declining' | 'stable'
  pickCount30d: number
  paretoClass: 'A' | 'B' | 'C'
  cumulativeVolumePct: number
  daysOfStockRemaining: number
  stockoutDate: string | null
  reorderPoint: number
  leadTimeDays: number
  reorderRisk: ReorderRiskLevel
  hasSufficientHistory: boolean
  observationCount: number
}

export interface HourlyDemandDistribution {
  hour: number // 0 - 23
  label: string // '08:00', '09:00', etc.
  totalUnits: number
  orderCount: number
  isPeak: boolean
}

export interface DailyDemandDistribution {
  dayOfWeek: number // 0 (Sun) - 6 (Sat)
  dayName: string // 'Mon', 'Tue', etc.
  totalUnits: number
  orderCount: number
  isPeak: boolean
}

export interface DemandSpike {
  skuId: string
  skuName: string
  velocity7d: number
  velocity30d: number
  spikePct: number
  reason: string
}

export interface PeakDemandAnalysis {
  peakHour: number
  peakHourLabel: string
  peakHourUnits: number
  peakDayName: string
  peakDayUnits: number
  hourlyDistribution: HourlyDemandDistribution[]
  dailyDistribution: DailyDemandDistribution[]
  detectedSpikes: DemandSpike[]
  hasSufficientObservations: boolean
  observationCount: number
  observationDays: number
  dataDisclaimer: string
}

export interface DemandAwareSlottingRecommendation {
  id: string
  type?: 'local_relocation'
  warehouseId?: string
  warehouseName?: string
  skuId: string
  skuName: string
  category: string
  paretoClass: 'A' | 'B' | 'C'
  dailyVelocity: number
  currentBinId: string
  currentZone: string
  currentLevel: number
  currentDistanceMeters: number
  recommendedBinId: string
  recommendedZone: string
  recommendedLevel: number
  recommendedDistanceMeters: number
  distanceSavedMeters: number
  weeklyKmSaved: number
  estimatedSecondsSavedPerPick: number
  reason: string
  capacityOk: boolean
  weightOk: boolean
  compatible: boolean
  actionable: boolean
  currentStockQty?: number
  unitWeightKg?: number
  totalWeightKg?: number
  targetCapacity?: number
  targetMaxWeightKg?: number
  handlingRequired?: string
  activePickReserved?: number
  constraints?: {
    capacityCheck: { passed: boolean; required: number; available: number; max: number }
    weightCheck: { passed: boolean; actualKg: number; maxKg: number }
    skuCompatibility: { passed: boolean; targetOccupiedBySameSkuOrEmpty: boolean }
    handlingCheck: { passed: boolean; required: string; supported: string[] }
    reservationCheck: { passed: boolean; availableUnreserved: number }
  }
  status?: 'Proposed' | 'Approved' | 'Executed' | 'Dismissed'
  stagedTaskId?: string
  dataDisclaimer?: string
}

// ============================================================================
// STAGE 4: MULTI-WAREHOUSE INVENTORY NETWORK TYPES
// ============================================================================

export type InterWarehouseTransferStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'DISPATCHED'
  | 'IN TRANSIT'
  | 'RECEIVED'
  | 'CANCELLED'

export interface InterWarehouseTransferEvent {
  status: InterWarehouseTransferStatus
  timestamp: string
  actor: string
  note?: string
}

export interface InterWarehouseTransferDiscrepancy {
  expectedQuantity: number
  actualReceivedQuantity: number
  reason: string
}

export interface InterWarehouseTransfer {
  id: string
  sourceWarehouseId: string
  destinationWarehouseId: string
  sourceBinId: string
  destinationBinId: string
  skuId: string
  quantity: number
  status: InterWarehouseTransferStatus
  requestedAt: string
  requestedBy: string
  approvedAt?: string
  approvedBy?: string
  dispatchedAt?: string
  dispatchedBy?: string
  receivedAt?: string
  receivedBy?: string
  cancelledAt?: string
  cancelledBy?: string
  receivedQuantity?: number
  discrepancyDetails?: InterWarehouseTransferDiscrepancy
  history: InterWarehouseTransferEvent[]
  estimatedHours?: number
  transportDistanceKm?: number
  notes?: string
}

export interface TransferWorkflowResult {
  ok: boolean
  message: string
  transfer?: InterWarehouseTransfer
}

export interface GlobalSkuSearchResult {
  skuId: string
  skuName: string
  category: string
  warehouseId: string
  warehouseName: string
  warehouseCity: string
  warehouseType: string
  warehouseStatus: WarehouseOperatingStatus
  binId: string
  onHand: number
  reserved: number
  availableStock: number
  capacity: number
  stockHealth: Status
  canFulfill: boolean
}

export interface AlternativeWarehouseOption {
  warehouseId: string
  warehouseName: string
  warehouseCity: string
  warehouseType: string
  warehouseStatus: WarehouseOperatingStatus
  availableStock: number
  onHand: number
  reserved: number
  binId: string
  distanceKm: number
  leadTimeHours: number
  canFulfillFully: boolean
  reason: string
  priority: number
}

export interface MultiWarehouseAvailability {
  skuId: string
  skuName: string
  requestedQuantity: number
  preferredWarehouseId: string
  preferredAvailable: number
  preferredCanFulfill: boolean
  networkTotalAvailable: number
  networkCanFulfill: boolean
  alternativeWarehouses: AlternativeWarehouseOption[]
  recommendedWarehouse: AlternativeWarehouseOption | null
  isMultiWarehouseSplitPossible: boolean
}

export interface NetworkRebalancingRecommendation {
  id: string
  type?: 'inter_warehouse_transfer'
  skuId: string
  skuName: string
  sourceWarehouseId: string
  sourceWarehouseName: string
  sourceBinId?: string
  destinationWarehouseId: string
  destinationWarehouseName: string
  destinationBinId?: string
  suggestedQuantity: number
  sourceAvailable: number
  destinationAvailable: number
  sourceCoverageDays: number
  destinationCoverageDays: number
  distanceKm: number
  estimatedTransitHours?: number
  reason: string
  expectedBenefit?: string
  constraints?: {
    sourceStockSufficient: boolean
    activePickSafe: boolean
    destinationCapacityOk: boolean
    differentWarehouses: boolean
  }
  status?: 'Proposed' | 'Approved' | 'Executed' | 'Dismissed'
  stagedTransferId?: string
  transportDisclaimer?: string
}

// ==========================================
// GRAPH-BASED ROUTE OPTIMIZATION TYPES
// ==========================================

export type GraphNodeType = 'depot' | 'front_cross' | 'back_cross' | 'aisle_waypoint' | 'custom'

export interface GraphNode {
  id: string
  x: number
  y: number
  z: number
  aisle?: number
  bay?: number
  type: GraphNodeType
  label?: string
}

export interface GraphEdge {
  from: string
  to: string
  weight: number
  blocked?: boolean
  reason?: string
}

export interface NavigationGraph {
  warehouseId: string
  nodes: Record<string, GraphNode>
  adjacency: Record<string, { to: string; weight: number }[]>
  blockedAisles: number[]
}

export interface PathResult {
  reachable: boolean
  pathNodeIds: string[]
  pathPoints: [number, number, number][]
  totalDistanceMeters: number
  algorithmUsed: 'astar' | 'dijkstra'
}

export interface OptimizedPickStop {
  stopIndex: number
  binId: string
  boxId?: string
  lineIds: string[]
  skuIds: string[]
  requestedUnits: number
  waypointNodeId: string
  coordinates: [number, number, number]
  aisle: number
  bay: number
  subPathFromPrevious: [number, number, number][]
  distanceFromPreviousMeters: number
}

export interface RouteWalkingEstimate {
  originalSeconds: number
  optimizedSeconds: number
  savedSeconds: number
  walkingSpeedMetersPerSec: number
  pickHandlingSecondsPerStop: number
}

export interface MultiStopOptimizationResult {
  warehouseId: string
  orderId: string
  reachable: boolean
  unreachableBins: string[]
  startNodeId: string
  endNodeId: string
  originalStopSequence: string[]
  optimizedStopSequence: string[]
  stops: OptimizedPickStop[]
  originalDistanceMeters: number
  optimizedDistanceMeters: number
  distanceSavedMeters: number
  percentageDistanceSaved: number
  estimatedWalkingTime: RouteWalkingEstimate
  fullRouteCoordinates: [number, number, number][]
  algorithm: string
  generatedAt: string
}

// ==========================================
// MULTI-WAREHOUSE NETWORK ANALYTICS TYPES
// ==========================================

export interface AnalyticsFilterState {
  dateRange: '7d' | '30d' | '90d' | 'all'
  warehouseId: string
  city: string
  skuId: string
  category: string
  stockStatus: 'all' | 'healthy' | 'low_stock' | 'empty' | 'critical'
  transferStatus: 'all' | 'pending' | 'in_transit' | 'received' | 'discrepancy'
}

export interface AnalyticsKpiSummary {
  totalOnHandUnits: number
  totalReservedUnits: number
  totalAvailableUnits: number
  totalInTransitUnits: number
  totalPipelineUnits: number
  distinctSkuCount: number
  activeWarehouseCount: number
  lowStockSkuCount: number
  networkStockoutRiskSkuCount: number
  averageCapacityUtilization: number
  totalCapacityUnits: number
  activeTransferCount: number
  activeReplenishmentCount: number
  totalDiscrepancyCount: number
}

export interface StorageZoneOccupancy {
  zone: string
  totalBins: number
  occupiedBins: number
  occupancyPct: number
  onHandUnits: number
  isGoldenZone: boolean
}

export interface WarehouseAnalyticsBreakdown {
  warehouseId: string
  warehouseName: string
  city: string
  location: string
  status: string
  onHandUnits: number
  reservedUnits: number
  availableUnits: number
  inTransitIncomingUnits: number
  inTransitOutgoingUnits: number
  distinctSkuCount: number
  totalBins: number
  occupiedBins: number
  vacantBins: number
  totalCapacityUnits: number
  capacityUtilizationPct: number
  zoneBreakdown: StorageZoneOccupancy[]
  lowStockCount: number
  criticalCount: number
}

export interface CategoryAnalyticsDistribution {
  categoryName: string
  onHandUnits: number
  availableUnits: number
  reservedUnits: number
  inTransitUnits: number
  distinctSkuCount: number
  shareOfTotalUnitsPct: number
  lowStockCount: number
  classACount: number
  classBCount: number
  classCCount: number
}

export interface AlternativeWarehouseAvailability {
  warehouseId: string
  warehouseName: string
  city: string
  availableStock: number
  surplusAboveThreshold: number
  distanceKm: number
  estimatedTransitHours: number
}

export interface CrossWarehouseShortageItem {
  skuId: string
  skuName?: string
  category?: string
  targetWarehouseId: string
  targetWarehouseName: string
  targetAvailableStock: number
  targetReorderPoint: number
  totalNetworkAvailableStock: number
  alternativeWarehouses: AlternativeWarehouseAvailability[]
  bestAlternative?: AlternativeWarehouseAvailability
}

export interface TransferDiscrepancyRecord {
  id: string
  type: 'transfer' | 'goods_receipt'
  referenceId: string
  skuId: string
  skuName?: string
  sourceWarehouseId: string
  destinationWarehouseId: string
  deliveredOrExpected: number
  acceptedOrReceived: number
  discrepancyQuantity: number
  reason: string
  timestamp: string
}

