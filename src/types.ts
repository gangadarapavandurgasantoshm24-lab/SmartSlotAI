export type ScreenId = 'dashboard' | 'warehouse' | 'picker' | 'suppliers' | 'optimization' | 'analytics' | 'analyst'
export type UserRole = 'picker' | 'supplier' | 'manager' | 'analyst'
export type Status = 'Healthy' | 'Low stock' | 'Critical' | 'Empty' | 'Unavailable' | 'In transit' | 'Pending' | 'Approved' | 'At risk' | 'Optimal'
export interface Warehouse { id: string; name: string; location: string; zones: number; capacity: number; utilization: number }
export interface Bin { id: string; zone: string; skuId: string; quantity: number; capacity: number; status: Status; x: number; y: number; aisle?: number; bay?: number; level?: number; face?: 'front' | 'back'; optimizationConstraints?: BinOptimizationConstraints }
export type HandlingType = 'standard' | 'fragile' | 'oversize' | 'hazardous'
export interface SKUOptimizationProfile { weeklyPickFrequency: number; demandClass: 'A' | 'B' | 'C'; dimensionsCm: [number, number, number]; weightKg: number; handling: HandlingType; hazardClass?: string; affinitySkuIds: string[] }
export interface BinOptimizationConstraints { dimensionsCm: [number, number, number]; maxWeightKg: number; handlingCapabilities: HandlingType[]; certifiedHazards: string[]; goldenZone: boolean; source: 'demo estimate' }
export interface SKU { id: string; name: string; category: string; unit: string; reorderPoint: number; supplier: string; optimizationProfile?: SKUOptimizationProfile }
export interface OptimizerWeights { travelDistance: number; cubeUtilization: number; goldenZone: number; skuAffinity: number }
export interface OptimizationConfig { weights: OptimizerWeights; preferGoldenZone: boolean }
export type OptimizationConstraintCode = 'bin-capacity' | 'volume-capacity' | 'dimensions' | 'weight' | 'handling' | 'hazard' | 'golden-location'
export interface OptimizationViolation { code: OptimizationConstraintCode; title: string; expected: string; actual: string; explanation: string }
export interface OptimizationPlacement { skuId: string; skuName: string; quantity: number; fromBinId: string; toBinId: string; reason: string; feasible: boolean; score: number; violations: OptimizationViolation[] }
export interface OptimizationMetrics { travelMeters: number; pickTimeMinutes: number; cubeUtilizationPercent: number; goldenZoneCount: number; movementCount: number; hardConstraintViolations: number; objectiveScore: number }
export interface OptimizationRun { id: string; revision: number; createdAt: string; config: OptimizationConfig; placements: OptimizationPlacement[]; rejectedCandidates: OptimizationPlacement[]; assumptions: string[]; baseline: OptimizationMetrics; proposed: OptimizationMetrics; approvedAt: string | null; approvedBy: string | null }
export interface InventoryItem { skuId: string; binId: string; quantity: number; reserved: number; updated: string; capacity: number; reorderPoint: number; available: boolean }
export interface StockMovement { id: string; binId: string; skuId: string; type: 'pick' | 'receive'; quantity: number; timestamp: string; source: 'digital-twin-demo' | 'picker-workspace' }
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
export interface ReplenishmentEvent { id: string; at: string; actor: 'Manager' | 'Supplier' | 'System'; label: string; note?: string }
export interface ReplenishmentReceipt { id: string; requestId: string; skuId: string; binId: string; delivered: number; accepted: number; rejected: number; timestamp: string; transactionId: string }
export interface ReplenishmentRequest { id: string; skuId: string; binId: string; quantity: number; supplier: string; createdAt: string; expectedDate: string; status: ReplenishmentStatus; confirmedQuantity: number | null; responseNote: string; dispatchedAt?: string; receipts: ReplenishmentReceipt[]; timeline: ReplenishmentEvent[] }
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
  createdAt: string
  managerApprovedAt?: string
  pickerCompletedAt?: string
  assignedPicker?: string
}
