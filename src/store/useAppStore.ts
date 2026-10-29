import { create } from 'zustand'
import { activePickOrder, inventory, skus, warehouseBins } from '../data/mockData'
import { getAvailableQuantity, getBoxId, getStockStatus } from '../data/inventoryUtils'
import type { Bin, BinIssueType, InventoryItem, PickBinIssue, PickOrder, PickOrderLine, PickTransactionResult, ScreenId, StockMovement, ReplenishmentRequest, ReplenishmentResult, SupplierResponseKind, ReplenishmentEvent, ReplenishmentReceipt, OptimizationConfig, OptimizationRun, LiveSystemAlert, AnalystLiveMetrics, CoPlacementOrder, SKU, CreateProductInput, CrudResult, RelocationTransferTask, SkuMetadataUpdates, SaleEvent, SkuDemandProfile, PeakDemandAnalysis, DemandAwareSlottingRecommendation, DemandWindowDays, Warehouse, InterWarehouseTransfer, TransferWorkflowResult, GlobalSkuSearchResult, MultiWarehouseAvailability, NetworkRebalancingRecommendation, MultiStopOptimizationResult, IntelligentReorderRecommendation, ReplenishmentSafetyStockConfig, ReplenishmentUrgency } from '../types'
import { deterministicSalesHistory } from '../data/demandHistoryData'
import { calculateSkuDemandProfiles, analyzePeakDemand, generateDemandAwareSlottingRecommendations, filterValidDemandEvents } from '../data/demandIntelligenceEngine'
import { getReceivedQuantity, validatePositiveQuantity, validateSupplierResponse } from '../data/replenishmentUtils'
import { calculateReplenishmentRecommendations, DEFAULT_SAFETY_STOCK_CONFIG } from '../data/intelligentReplenishmentEngine'
import { buildOptimizationRun, validateOptimizationApproval } from '../data/optimizationEngine'
import { demoWarehouses, generateNetworkBinsAndInventory, initialInterWarehouseTransfers, getWarehouseDistanceKm, getEstimatedTransitHours, networkSkus } from '../data/multiWarehouseData'
import { searchGlobalInventory, findAlternativeWarehouses, generateNetworkRebalancingRecommendations, type GlobalSearchFilters } from '../data/multiWarehouseEngine'
import { optimizePickRoute } from '../data/warehouseGraphEngine'

const { bins: networkBins, inventory: networkInventory } = generateNetworkBinsAndInventory()
const initialAllBins = [...warehouseBins, ...networkBins]
const initialAllInventory = [...inventory, ...networkInventory]

const initialOptimizationConfig: OptimizationConfig = { weights: { travelDistance: 35, cubeUtilization: 20, goldenZone: 25, skuAffinity: 20 }, preferGoldenZone: true }

const initialAnalystMetrics: AnalystLiveMetrics = {
  ordersFulfilled: 2486,
  unitsShipped: 148320,
  pickAccuracy: 99.2,
  onTimeDispatch: 96.0,
  goldenZoneEfficiency: 83.6,
  totalPicksCount: 4280,
}

const initialCoPlacementOrders: CoPlacementOrder[] = [
  {
    id: 'COP-8801',
    title: 'AuraGlow Smart Luminary & Nordic Duvet Cover Affinity',
    category: 'Home & Bedding Cross-Selling',
    skuA: {
      id: 'SKU-2084',
      name: 'AuraGlow Smart Luminary',
      currentBin: 'C-06-02',
      currentBoxId: 'BOX-C0602-L2F',
      targetBin: 'A-01-01',
      targetBoxId: 'BOX-A0101-L1F',
    },
    skuB: {
      id: 'SKU-1102',
      name: 'Nordic Duvet Cover Queen',
      currentBin: 'A-01-02',
      currentBoxId: 'BOX-A0102-L1F',
      targetBin: 'A-01-02',
      targetBoxId: 'BOX-A0102-L1F',
    },
    initialDistanceMeters: 28.5,
    targetDistanceMeters: 1.2,
    predictedSalesLiftPercent: 24.8,
    predictedMonthlyRevenue: 18450,
    confidenceScore: 94.6,
    pickerTimeSavedSeconds: 32,
    rationale: 'Market basket mining identifies strong co-order frequency between modern smart lamps and premium bedding. Moving SKU-2084 to rack A-01-01 adjacent to A-01-02 cuts route traversal by 27.3m and yields a predicted +24.8% sales lift on bundle cross-sell.',
    status: 'Proposed by Analyst',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'COP-8802',
    title: 'HyperDrive USB-C Hub & LogiType Mechanical Keyboard',
    category: 'Computers & Peripherals',
    skuA: {
      id: 'SKU-0914',
      name: 'HyperDrive USB-C Hub 8-in-1',
      currentBin: 'B-04-03',
      currentBoxId: 'BOX-B0403-L3F',
      targetBin: 'B-02-01',
      targetBoxId: 'BOX-B0201-L1F',
    },
    skuB: {
      id: 'SKU-3120',
      name: 'LogiType Wireless Mechanical Keyboard',
      currentBin: 'B-02-02',
      currentBoxId: 'BOX-B0202-L1F',
      targetBin: 'B-02-02',
      targetBoxId: 'BOX-B0202-L1F',
    },
    initialDistanceMeters: 18.2,
    targetDistanceMeters: 0.9,
    predictedSalesLiftPercent: 31.2,
    predictedMonthlyRevenue: 24600,
    confidenceScore: 97.1,
    pickerTimeSavedSeconds: 26,
    rationale: 'High association rule confidence (82.4%). Placing USB hubs in Bay B-02 adjacent to keyboards speeds multi-unit picking and boosts recommended checkout add-on sales.',
    status: 'Assigned to Picker',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
    managerApprovedAt: new Date(Date.now() - 1800000).toISOString(),
    assignedPicker: 'Alex Morgan (P-07)',
  },
]

interface AppState {
  screen: ScreenId
  selectedBinId: string
  bins: Bin[]
  inventory: InventoryItem[]
  movements: StockMovement[]
  pickOrder: PickOrder
  pickIssues: PickBinIssue[]
  replenishmentRequests: ReplenishmentRequest[]
  processedReceiptTransactionIds: string[]
  processedPickTransactionIds: string[]
  lastPickResult: PickTransactionResult | null
  optimizationConfig: OptimizationConfig
  optimizationRun: OptimizationRun | null
  optimizationHistory: OptimizationRun[]
  liveAlerts: LiveSystemAlert[]
  analystMetrics: AnalystLiveMetrics
  coPlacementOrders: CoPlacementOrder[]
  setScreen: (screen: ScreenId) => void
  selectBin: (id: string) => void
  simulatePick: (binId: string, quantity: number) => string
  receiveStock: (binId: string, quantity: number) => string
  confirmPick: (lineId: string, quantity: number, transactionId: string) => PickTransactionResult
  selectPickStop: (lineId: string) => void
  nextPendingStop: () => void
  reportPickIssue: (type: BinIssueType, description: string, manualCount?: number) => PickBinIssue | null
  createReplenishmentRequest: (input: {
    skuId: string
    binId: string
    warehouseId?: string
    quantity: number
    supplier: string
    expectedDate: string
    note?: string
    urgency?: ReplenishmentUrgency
    recommendationId?: string
    preventDuplicates?: boolean
  }) => ReplenishmentResult
  respondToReplenishment: (requestId: string, kind: SupplierResponseKind, confirmedQuantity: number, expectedDate: string, note: string) => ReplenishmentResult
  dispatchReplenishment: (requestId: string) => ReplenishmentResult
  receiveReplenishment: (
    requestId: string,
    delivered: number,
    accepted: number,
    transactionId: string,
    discrepancyReason?: string
  ) => ReplenishmentResult
  setOptimizationConfig: (config: OptimizationConfig) => void
  runOptimization: () => OptimizationRun
  approveOptimization: (manager: string) => { ok: boolean; message: string; run?: OptimizationRun }
  dispatchPickTask: (input: { skuId: string; binId: string; quantity: number; priority?: 'High' | 'Normal' | 'Low'; notes?: string }) => { ok: boolean; message: string; lineId?: string }
  proposeCoPlacementOrder: (order: Omit<CoPlacementOrder, 'id' | 'createdAt' | 'status'>) => CoPlacementOrder
  approveCoPlacementOrder: (orderId: string, pickerName?: string) => { ok: boolean; message: string }
  completeCoPlacementOrder: (orderId: string) => { ok: boolean; message: string }
  dismissAlert: (id: string) => void
  addAlert: (alert: Omit<LiveSystemAlert, 'id' | 'timestamp'>) => void
  skus: SKU[]
  transferTasks: RelocationTransferTask[]
  createProduct: (input: CreateProductInput) => CrudResult
  updateProductMetadata: (skuId: string, updates: SkuMetadataUpdates) => CrudResult
  adjustStock: (input: { binId: string; skuId: string; delta: number; reason: string }) => CrudResult
  archiveInventoryItem: (skuId: string, binId?: string) => CrudResult
  restoreInventoryItem: (skuId: string, binId: string) => CrudResult
  initiateRelocationTransfer: (input: { skuId: string; sourceBinId: string; targetBinId: string; quantity: number; notes?: string }) => CrudResult
  completeRelocationTransfer: (taskId: string) => CrudResult
  cancelRelocationTransfer: (taskId: string) => CrudResult
  salesHistory: SaleEvent[]
  recordSale: (sale: Omit<SaleEvent, 'id'>) => SaleEvent
  getDemandIntelligence: (windowDays?: DemandWindowDays, referenceDate?: Date, warehouseId?: string) => {
    profiles: SkuDemandProfile[]
    peaks: PeakDemandAnalysis
    recommendations: DemandAwareSlottingRecommendation[]
  }
  warehouses: Warehouse[]
  selectedWarehouseId: string
  interWarehouseTransfers: InterWarehouseTransfer[]
  setSelectedWarehouseId: (id: string) => void
  requestInterWarehouseTransfer: (input: {
    sourceWarehouseId: string
    destinationWarehouseId: string
    sourceBinId: string
    destinationBinId: string
    skuId: string
    quantity: number
    requestedBy?: string
    notes?: string
  }) => TransferWorkflowResult
  approveInterWarehouseTransfer: (transferId: string, approvedBy?: string) => TransferWorkflowResult
  dispatchInterWarehouseTransfer: (transferId: string, dispatchedBy?: string) => TransferWorkflowResult
  receiveInterWarehouseTransfer: (
    transferId: string,
    receivedQuantity: number,
    receivedBy?: string,
    discrepancyReason?: string
  ) => TransferWorkflowResult
  cancelInterWarehouseTransfer: (transferId: string, cancelledBy?: string, reason?: string) => TransferWorkflowResult
  searchGlobalSku: (filters?: GlobalSearchFilters) => GlobalSkuSearchResult[]
  getWarehouseAvailability: (
    skuId: string,
    requestedQuantity?: number,
    preferredWarehouseId?: string
  ) => MultiWarehouseAvailability
  getNetworkRebalancingRecommendations: () => NetworkRebalancingRecommendation[]
  dismissedRecommendationIds: string[]
  dismissRecommendation: (id: string) => void
  approveSlottingRecommendation: (recommendationId: string) => { ok: boolean; message: string; taskId?: string }
  approveRebalancingRecommendation: (recommendationId: string) => { ok: boolean; message: string; transferId?: string }
  replenishmentSafetyStockConfig: ReplenishmentSafetyStockConfig
  dismissedReplenishmentRecommendationIds: string[]
  setReplenishmentSafetyStockConfig: (config: Partial<ReplenishmentSafetyStockConfig>) => void
  getIntelligentReplenishmentRecommendations: (warehouseId?: string) => IntelligentReorderRecommendation[]
  approveReplenishmentRecommendation: (
    recommendationId: string,
    overrides?: { quantity?: number; supplier?: string; note?: string; warehouseId?: string }
  ) => { ok: boolean; message: string; requestId?: string; transferId?: string }
  dismissReplenishmentRecommendation: (id: string) => void
  activeRoutePreview: MultiStopOptimizationResult | null
  blockedAislesByWarehouse: Record<string, number[]>
  routingAlgorithm: 'astar' | 'dijkstra'
  setRoutingAlgorithm: (algo: 'astar' | 'dijkstra') => void
  toggleAisleBlock: (warehouseId: string, aisle: number) => void
  calculatePickRoute: (options?: { orderId?: string; warehouseId?: string; algorithm?: 'astar' | 'dijkstra' }) => MultiStopOptimizationResult
  applyOptimizedRoute: (orderId?: string) => { ok: boolean; message: string }
  cancelRoutePreview: () => void
}

function validateQuantity(quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return 'Enter a positive whole-number quantity.'
  return null
}

function newMovement(
  binId: string,
  skuId: string,
  type: StockMovement['type'],
  quantity: number,
  source: StockMovement['source'] = 'digital-twin-demo',
  reason?: string,
  destinationBinId?: string,
  warehouseId?: string
): StockMovement {
  return {
    id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    binId,
    skuId,
    warehouseId: warehouseId || 'WH-HYD-01',
    type,
    quantity,
    timestamp: new Date().toISOString(),
    source,
    ...(reason ? { reason } : {}),
    ...(destinationBinId ? { destinationBinId } : {}),
  }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'dashboard',
  selectedBinId: 'C-06-02',
  selectedWarehouseId: 'WH-HYD-01',
  warehouses: structuredClone(demoWarehouses),
  interWarehouseTransfers: structuredClone(initialInterWarehouseTransfers),
  bins: initialAllBins,
  inventory: initialAllInventory,
  movements: [],
  pickOrder: activePickOrder,
  pickIssues: [],
  replenishmentRequests: [],
  processedReceiptTransactionIds: [],
  processedPickTransactionIds: [],
  lastPickResult: null,
  optimizationConfig: initialOptimizationConfig,
  optimizationRun: null,
  optimizationHistory: [],
  liveAlerts: [],
  analystMetrics: initialAnalystMetrics,
  coPlacementOrders: initialCoPlacementOrders,
  skus: [...structuredClone(skus), ...structuredClone(networkSkus)],
  transferTasks: [],
  salesHistory: deterministicSalesHistory,
  activeRoutePreview: null,
  blockedAislesByWarehouse: {},
  routingAlgorithm: 'astar',
  dismissedRecommendationIds: [],
  replenishmentSafetyStockConfig: DEFAULT_SAFETY_STOCK_CONFIG,
  dismissedReplenishmentRecommendationIds: [],
  setScreen: (screen) => set({ screen }),
  selectBin: (selectedBinId) => set({ selectedBinId }),
  setSelectedWarehouseId: (selectedWarehouseId: string) => {
    const state = get()
    const wh = state.warehouses.find((w) => w.id === selectedWarehouseId)
    if (!wh) return
    const whBins = state.bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === selectedWarehouseId)
    const currentBinInWh = whBins.some((b) => b.id === state.selectedBinId)
    set({
      selectedWarehouseId,
      selectedBinId: currentBinInWh ? state.selectedBinId : whBins[0]?.id || '',
    })
  },
  simulatePick: (binId, quantity) => {
    const invalid = validateQuantity(quantity)
    if (invalid) return invalid
    const item = get().inventory.find((entry) => entry.binId === binId)
    if (!item) return 'No inventory record exists for this bin.'
    if (!item.available) return 'This bin is unavailable and cannot be picked.'
    const available = getAvailableQuantity(item)
    if (quantity > available) return `Only ${available} unreserved units are available to pick.`
    set((state) => ({ inventory: state.inventory.map((entry) => entry.binId === binId ? { ...entry, quantity: entry.quantity - quantity, updated: new Date().toISOString() } : entry), movements: [newMovement(binId, item.skuId, 'pick', quantity), ...state.movements] }))
    return `Picked ${quantity} unit${quantity === 1 ? '' : 's'} from ${binId}.`
  },
  receiveStock: (binId, quantity) => {
    const invalid = validateQuantity(quantity)
    if (invalid) return invalid
    const item = get().inventory.find((entry) => entry.binId === binId)
    if (!item) return 'No inventory record exists for this bin.'
    if (!item.available) return 'This bin is unavailable and cannot receive stock.'
    const remainingCapacity = item.capacity - item.quantity
    if (quantity > remainingCapacity) return `This bin has capacity for ${remainingCapacity} more units.`
    set((state) => ({ inventory: state.inventory.map((entry) => entry.binId === binId ? { ...entry, quantity: entry.quantity + quantity, updated: new Date().toISOString() } : entry), movements: [newMovement(binId, item.skuId, 'receive', quantity), ...state.movements] }))
    return `Received ${quantity} unit${quantity === 1 ? '' : 's'} into ${binId}.`
  },
  confirmPick: (lineId, quantity, transactionId): PickTransactionResult => {
    const state = get()
    if (state.processedPickTransactionIds.includes(transactionId)) return { ok: false, kind: 'duplicate', message: 'This pick was already confirmed. No additional stock was removed.' }
    if (state.pickOrder.status === 'Paused') return { ok: false, kind: 'paused', message: 'Picking is paused while the reported bin issue awaits supervisor review.' }
    if (state.pickOrder.status === 'Complete') return { ok: false, kind: 'missing', message: 'This pick order is already complete.' }
    if (!Number.isInteger(quantity) || quantity <= 0) return { ok: false, kind: 'validation', message: 'Enter a positive whole-number quantity.' }
    const lineIndex = state.pickOrder.lines.findIndex((line) => line.id === lineId)
    const line = state.pickOrder.lines[lineIndex]
    if (!line) return { ok: false, kind: 'missing', message: 'This pick line is no longer available.' }
    if (lineIndex !== state.pickOrder.currentStopIndex) return { ok: false, kind: 'validation', message: 'Select the active stop before confirming this pick.' }
    const item = state.inventory.find((entry) => entry.binId === line.binId && entry.skuId === line.skuId)
    if (!item) return { ok: false, kind: 'missing', message: 'The target bin has no matching shared inventory record.' }
    if (!item.available) return { ok: false, kind: 'validation', message: `Bin ${item.binId} is unavailable and cannot be picked.` }
    const available = getAvailableQuantity(item)
    if (quantity > available) return { ok: false, kind: 'validation', message: `Insufficient stock: only ${available} unreserved units are available.` }
    const remainingRequired = line.requested - line.picked
    if (quantity > remainingRequired) return { ok: false, kind: 'validation', message: `This order line only needs ${remainingRequired} more unit${remainingRequired === 1 ? '' : 's'}.` }
    const updatedItem = { ...item, quantity: item.quantity - quantity, updated: new Date().toISOString() }
    const updatedLines = state.pickOrder.lines.map((entry) => entry.id === line.id ? { ...entry, picked: entry.picked + quantity } : entry)
    const nextPendingIndex = updatedLines.findIndex((entry) => entry.picked < entry.requested)
    const completed = nextPendingIndex < 0
    const currentStopIndex = completed ? state.pickOrder.currentStopIndex : nextPendingIndex
    const lowStock = updatedItem.available && updatedItem.quantity <= updatedItem.reorderPoint
    const boxId = line.boxId || getBoxId(line.binId)
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Pick Confirmed by Alex Morgan (Port 5173)',
      detail: `Alex Morgan confirmed pick of ${quantity} units from Rack ${line.binId} (${boxId}). Live inventory updated & sent to Analyst Studio!`,
      source: 'picker',
      tone: 'green',
    }
    const result: PickTransactionResult = { ok: true, kind: 'success', message: `Pick confirmed · ${quantity} unit${quantity === 1 ? '' : 's'} picked from ${line.binId} (${boxId}).`, binId: line.binId, skuId: line.skuId, quantity, remaining: updatedItem.quantity, lowStock }
    const movement: StockMovement = { id: newId('MOV'), binId: line.binId, skuId: line.skuId, type: 'pick', quantity, timestamp: new Date().toISOString(), source: 'picker-workspace' }
    set((current) => ({
      selectedBinId: updatedLines[currentStopIndex]?.binId ?? line.binId,
      inventory: current.inventory.map((entry) => entry.binId === updatedItem.binId ? updatedItem : entry),
      movements: [movement, ...current.movements],
      pickOrder: { ...current.pickOrder, lines: updatedLines, status: completed ? 'Complete' : 'In progress', currentStopIndex: currentStopIndex < 0 ? 0 : currentStopIndex },
      processedPickTransactionIds: [...current.processedPickTransactionIds, transactionId],
      lastPickResult: result,
      liveAlerts: [alert, ...current.liveAlerts].slice(0, 10),
      analystMetrics: {
        ...current.analystMetrics,
        ordersFulfilled: current.analystMetrics.ordersFulfilled + (completed ? 1 : 0),
        unitsShipped: current.analystMetrics.unitsShipped + quantity,
        totalPicksCount: current.analystMetrics.totalPicksCount + 1,
        pickAccuracy: 99.4,
        goldenZoneEfficiency: 84.2,
      },
    }))
    return result
  },
  selectPickStop: (lineId) => set((state) => {
    if (state.pickOrder.status === 'Paused' || state.pickOrder.status === 'Complete') return state
    const index = state.pickOrder.lines.findIndex((line) => line.id === lineId && line.picked < line.requested)
    return index < 0 ? state : { selectedBinId: state.pickOrder.lines[index].binId, pickOrder: { ...state.pickOrder, currentStopIndex: index, status: 'In progress' } }
  }),
  nextPendingStop: () => set((state) => {
    if (state.pickOrder.status === 'Paused' || state.pickOrder.status === 'Complete') return state
    const current = state.pickOrder.currentStopIndex
    const next = state.pickOrder.lines.findIndex((line, index) => index > current && line.picked < line.requested)
    const fallback = state.pickOrder.lines.findIndex((line) => line.picked < line.requested)
    const index = next >= 0 ? next : fallback
    return index < 0 ? state : { selectedBinId: state.pickOrder.lines[index].binId, pickOrder: { ...state.pickOrder, currentStopIndex: index, status: 'In progress' } }
  }),
  reportPickIssue: (type, description, manualCount) => {
    const state = get()
    if (state.pickOrder.status === 'Paused' || state.pickOrder.status === 'Complete') return null
    const line = state.pickOrder.lines[state.pickOrder.currentStopIndex]
    if (!line) return null
    const issue: PickBinIssue = { id: newId('ISSUE'), taskId: state.pickOrder.id, binId: line.binId, skuId: line.skuId, type, description: description.trim(), ...(manualCount !== undefined ? { manualCount } : {}), timestamp: new Date().toISOString(), status: 'Submitted' }
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Pick Issue Reported by Alex Morgan',
      detail: `${type} reported at Rack ${line.binId}. Pick route is paused awaiting supervisor review.`,
      source: 'picker',
      tone: 'amber',
    }
    set({ pickIssues: [issue, ...state.pickIssues], pickOrder: { ...state.pickOrder, status: 'Paused' }, liveAlerts: [alert, ...state.liveAlerts].slice(0, 10) })
    return issue
  },
  createReplenishmentRequest: (input) => {
    const invalid = validatePositiveQuantity(input.quantity)
    if (invalid) return { ok: false, message: invalid }
    const state = get()
    const targetWhId = input.warehouseId || state.selectedWarehouseId || 'WH-HYD-01'
    const item =
      state.inventory.find(
        (entry) =>
          entry.binId === input.binId &&
          entry.skuId === input.skuId &&
          (entry.warehouseId || 'WH-HYD-01') === targetWhId
      ) ||
      state.inventory.find((entry) => entry.binId === input.binId && entry.skuId === input.skuId)
    if (!item) return { ok: false, message: 'The selected SKU and bin do not have a matching inventory record.' }
    if (!item.available) return { ok: false, message: 'Cannot replenish an unavailable bin.' }
    if (!input.supplier.trim()) return { ok: false, message: 'Select a supplier for this request.' }

    if (input.preventDuplicates) {
      const activeDuplicate = state.replenishmentRequests.find(
        (r) =>
          r.skuId === input.skuId &&
          r.binId === input.binId &&
          ['Submitted', 'Confirmed full', 'Partial offer', 'Delayed', 'In transit'].includes(r.status)
      )
      if (activeDuplicate) {
        return {
          ok: false,
          message: `Duplicate request blocked: active request ${activeDuplicate.id} is already in progress for SKU ${input.skuId} at rack ${input.binId}.`,
        }
      }
    }

    const now = new Date().toISOString()
    const id = newId('SR')
    const event: ReplenishmentEvent = { id: newId('EVT'), at: now, actor: 'Manager', label: `Request created for ${input.quantity} units`, ...(input.note?.trim() ? { note: input.note.trim() } : {}) }
    const request: ReplenishmentRequest = {
      id,
      skuId: input.skuId,
      binId: input.binId,
      warehouseId: targetWhId,
      quantity: input.quantity,
      supplier: input.supplier.trim(),
      createdAt: now,
      expectedDate: input.expectedDate,
      status: 'Submitted',
      confirmedQuantity: null,
      responseNote: '',
      receipts: [],
      timeline: [event],
      urgency: input.urgency,
      recommendationId: input.recommendationId,
    }
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'New PO Sent to Supplier Hub',
      detail: `Manager Jordan Mitchell dispatched PO ${id} for ${input.quantity} units to ${input.supplier} (Target Rack ${input.binId})`,
      source: 'manager',
      tone: 'blue',
    }
    set((current) => ({
      replenishmentRequests: [request, ...current.replenishmentRequests],
      liveAlerts: [alert, ...current.liveAlerts].slice(0, 10),
    }))
    return { ok: true, message: `${id} submitted to ${request.supplier}. Visible on Supplier Hub (Port 5174).`, request }
  },
  respondToReplenishment: (requestId, kind, confirmedQuantity, expectedDate, note) => {
    const request = get().replenishmentRequests.find((entry) => entry.id === requestId)
    if (!request) return { ok: false, message: 'Replenishment request not found.' }
    if (request.confirmedQuantity !== null || request.status === 'Completed' || request.status === 'Cancelled') return { ok: false, message: 'This request has already received a supplier response.' }
    const invalid = validateSupplierResponse(kind, confirmedQuantity, request.quantity)
    if (invalid) return { ok: false, message: invalid }
    const status = ({ full: 'Confirmed full', partial: 'Partial offer', unavailable: 'Unavailable', delayed: 'Delayed' } as const)[kind]
    const event: ReplenishmentEvent = { id: newId('EVT'), at: new Date().toISOString(), actor: 'Supplier', label: `${status} · ${confirmedQuantity} units`, ...(note.trim() ? { note: note.trim() } : {}) }
    const updated = { ...request, status, confirmedQuantity, expectedDate: expectedDate || request.expectedDate, responseNote: note.trim(), timeline: [...request.timeline, event] }
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Supplier Confirmed Order Availability',
      detail: `${request.supplier} confirmed ${confirmedQuantity} units (ETA: ${expectedDate}) for Rack ${request.binId}`,
      source: 'supplier',
      tone: 'amber',
    }
    set((state) => ({
      replenishmentRequests: state.replenishmentRequests.map((entry) => entry.id === requestId ? updated : entry),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    }))
    return { ok: true, message: `Supplier confirmed ${confirmedQuantity} units for ${requestId}. Ready for dispatch.`, request: updated }
  },
  dispatchReplenishment: (requestId) => {
    const request = get().replenishmentRequests.find((entry) => entry.id === requestId)
    if (!request) return { ok: false, message: 'Replenishment request not found.' }
    if (!['Confirmed full', 'Partial offer', 'Delayed'].includes(request.status) || !request.confirmedQuantity) return { ok: false, message: 'A positive supplier-confirmed quantity is required before dispatch.' }
    const at = new Date().toISOString()
    const event: ReplenishmentEvent = { id: newId('EVT'), at, actor: 'Supplier', label: 'Dispatched · in transit' }
    const updated = { ...request, status: 'In transit' as const, dispatchedAt: at, timeline: [...request.timeline, event] }
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: at,
      title: 'Supplier Dispatched Shipment (In Transit)',
      detail: `${request.supplier} marked shipment in transit to Oakland DC. Ready for receiving by Warehouse Manager!`,
      source: 'supplier',
      tone: 'amber',
    }
    set((state) => ({
      replenishmentRequests: state.replenishmentRequests.map((entry) => entry.id === requestId ? updated : entry),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    }))
    return { ok: true, message: `${requestId} marked in transit. Manager can receive goods at the dock.`, request: updated }
  },
  receiveReplenishment: (requestId, delivered, accepted, transactionId, discrepancyReason) => {
    const state = get()
    if (state.processedReceiptTransactionIds.includes(transactionId)) return { ok: false, message: 'This receipt was already processed.' }
    const request = state.replenishmentRequests.find((entry) => entry.id === requestId)
    if (!request) return { ok: false, message: 'Replenishment request not found.' }
    if (!['In transit', 'Partially received'].includes(request.status)) return { ok: false, message: 'Only dispatched requests can be received.' }
    const badDelivered = validatePositiveQuantity(delivered)
    if (badDelivered) return { ok: false, message: `Delivered quantity: ${badDelivered}` }
    if (!Number.isInteger(accepted) || accepted < 0) return { ok: false, message: 'Accepted quantity must be a non-negative whole number.' }
    if (accepted > delivered) return { ok: false, message: 'Accepted quantity cannot exceed the delivered quantity.' }
    const stock = state.inventory.find((entry) => entry.binId === request.binId && entry.skuId === request.skuId)
    if (!stock) return { ok: false, message: 'The request is no longer associated with a valid inventory record.' }
    if (!stock.available) return { ok: false, message: 'Cannot receive stock into an unavailable bin.' }
    const priorDelivered = getReceivedQuantity(request)
    const remainingConfirmed = (request.confirmedQuantity ?? 0) - priorDelivered
    if (delivered > remainingConfirmed) return { ok: false, message: `Only ${Math.max(0, remainingConfirmed)} confirmed units remain to receive.` }
    const remainingCapacity = stock.capacity - stock.quantity
    if (accepted > remainingCapacity) return { ok: false, message: `Bin capacity allows acceptance of ${Math.max(0, remainingCapacity)} more units.` }
    const receiptId = newId('GR')
    const receipt: ReplenishmentReceipt = { id: receiptId, requestId, skuId: request.skuId, binId: request.binId, delivered, accepted, rejected: delivered - accepted, timestamp: new Date().toISOString(), transactionId }
    const receipts = [...request.receipts, receipt]
    const complete = receipts.reduce((sum, item) => sum + item.delivered, 0) >= (request.confirmedQuantity ?? 0)
    const status = complete ? 'Completed' as const : 'Partially received' as const
    const event: ReplenishmentEvent = {
      id: newId('EVT'),
      at: receipt.timestamp,
      actor: 'Manager',
      label: `${receiptId}: ${delivered} delivered · ${accepted} accepted${receipt.rejected ? ` · ${receipt.rejected} rejected` : ''}`,
      note: discrepancyReason?.trim(),
    }
    const updated: ReplenishmentRequest = { ...request, receipts, status, timeline: [...request.timeline, event] }
    const movementReason =
      discrepancyReason?.trim() ||
      `Supplier goods receipt ${receiptId} from ${request.supplier}${receipt.rejected ? ` (${receipt.rejected} rejected)` : ''}`
    const movement: StockMovement | null =
      accepted > 0
        ? {
            id: receiptId,
            binId: request.binId,
            skuId: request.skuId,
            warehouseId: request.warehouseId || stock.warehouseId || 'WH-HYD-01',
            type: 'receive',
            quantity: accepted,
            timestamp: receipt.timestamp,
            source: 'digital-twin-demo',
            reason: movementReason,
          }
        : null
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: receipt.timestamp,
      title: 'Goods Received & Stock Updated (+Units)',
      detail: `Manager accepted ${accepted} units into Rack ${request.binId}. On-hand inventory increased!`,
      source: 'manager',
      tone: 'green',
    }
    set({
      replenishmentRequests: state.replenishmentRequests.map((entry) => entry.id === requestId ? updated : entry),
      inventory: state.inventory.map((entry) => entry.binId === request.binId && entry.skuId === request.skuId ? { ...entry, quantity: entry.quantity + accepted, updated: receipt.timestamp } : entry),
      movements: movement ? [movement, ...state.movements] : state.movements,
      processedReceiptTransactionIds: [...state.processedReceiptTransactionIds, transactionId],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
      analystMetrics: {
        ...state.analystMetrics,
        onTimeDispatch: 96.5,
      },
    })
    return { ok: true, message: `${receiptId} recorded: ${accepted} accepted units added to Rack ${request.binId}.`, request: updated, receipt }
  },
  setOptimizationConfig: (optimizationConfig) => set({ optimizationConfig }),
  runOptimization: () => {
    const state = get()
    const draft = buildOptimizationRun({ bins: state.bins, inventory: state.inventory, skus, config: state.optimizationConfig })
    const run: OptimizationRun = { ...draft, id: `OPT-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, revision: (state.optimizationRun?.revision ?? 0) + 1, createdAt: new Date().toISOString(), approvedAt: null, approvedBy: null }
    set({ optimizationRun: run, optimizationHistory: state.optimizationRun ? [...state.optimizationHistory.filter((entry) => entry.id !== state.optimizationRun?.id), state.optimizationRun] : state.optimizationHistory })
    return run
  },
  approveOptimization: (manager) => {
    const state = get()
    const invalid = validateOptimizationApproval(state.optimizationRun)
    if (invalid) return { ok: false, message: invalid }
    const approved: OptimizationRun = { ...state.optimizationRun!, approvedAt: new Date().toISOString(), approvedBy: manager.trim() || 'Warehouse manager' }
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'AI Warehouse Layout Approved',
      detail: `Manager ${manager} approved optimization layout R${String(approved.revision).padStart(2, '0')}. Forwarded to Analyst Studio.`,
      source: 'manager',
      tone: 'purple',
    }
    set({
      optimizationRun: approved,
      optimizationHistory: [...state.optimizationHistory.filter((entry) => entry.id !== approved.id), approved],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
      analystMetrics: {
        ...state.analystMetrics,
        goldenZoneEfficiency: 88.4,
      },
    })
    return { ok: true, message: `Revision R${String(approved.revision).padStart(2, '0')} approved. Physical inventory remains unchanged.`, run: approved }
  },
  dispatchPickTask: (input) => {
    const state = get()
    const item = state.inventory.find((entry) => entry.binId === input.binId && entry.skuId === input.skuId)
    if (!item) return { ok: false, message: 'No inventory record for selected SKU and Rack location.' }
    if (!item.available) return { ok: false, message: 'Selected rack bin is currently marked unavailable.' }
    const available = getAvailableQuantity(item)
    if (input.quantity > available) return { ok: false, message: `Only ${available} unreserved units available in Rack ${input.binId}.` }
    const badQty = validatePositiveQuantity(input.quantity)
    if (badQty) return { ok: false, message: badQty }

    const boxId = getBoxId(input.binId)
    const lineId = newId('PK-LINE')
    const newLine: PickOrderLine = {
      id: lineId,
      skuId: input.skuId,
      binId: input.binId,
      boxId,
      requested: input.quantity,
      picked: 0,
      notes: input.notes,
    }

    const updatedLines = [newLine, ...state.pickOrder.lines]
    const newOrder: PickOrder = {
      ...state.pickOrder,
      lines: updatedLines,
      status: 'Ready',
      currentStopIndex: 0,
      priority: input.priority ?? 'High',
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'New Pick Task Dispatched to Alex Morgan (Port 5173)',
      detail: `Manager Jordan Mitchell ordered pick of ${input.quantity} units from Rack ${input.binId} (${boxId}). Active on Picker Terminal!`,
      source: 'manager',
      tone: 'blue',
    }

    set({
      pickOrder: newOrder,
      selectedBinId: input.binId,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Pick task dispatched to Alex Morgan (Cart P-07) for Rack ${input.binId} (${boxId})`, lineId }
  },
  proposeCoPlacementOrder: (orderInput) => {
    const newOrder: CoPlacementOrder = {
      ...orderInput,
      id: newId('COP'),
      createdAt: new Date().toISOString(),
      status: 'Proposed by Analyst',
    }
    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'New Co-Placement Recommendation from Analyst Studio',
      detail: `Analyst proposed moving ${newOrder.skuA.name} adjacent to ${newOrder.skuB.name} (Predicted Sales Lift: +${newOrder.predictedSalesLiftPercent}%). Awaiting Manager approval.`,
      source: 'analyst',
      tone: 'purple',
    }
    set((state) => ({
      coPlacementOrders: [newOrder, ...state.coPlacementOrders],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    }))
    return newOrder
  },
  approveCoPlacementOrder: (orderId, pickerName = 'Alex Morgan (P-07)') => {
    const current = get().coPlacementOrders.find((o) => o.id === orderId)
    if (!current) return { ok: false, message: 'Co-placement order not found.' }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Co-Placement Re-Slotting Mission Dispatched to Picker',
      detail: `Manager Jordan Mitchell approved relocation for ${current.skuA.name} -> Target Rack ${current.skuA.targetBin}. Worker assigned: ${pickerName}`,
      source: 'manager',
      tone: 'blue',
    }

    set((state) => ({
      coPlacementOrders: state.coPlacementOrders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'Assigned to Picker',
              managerApprovedAt: new Date().toISOString(),
              assignedPicker: pickerName,
            }
          : o
      ),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    }))
    return { ok: true, message: `Re-slotting order ${orderId} dispatched to ${pickerName}` }
  },
  completeCoPlacementOrder: (orderId: string): { ok: boolean; message: string } => {
    const state = get()
    const current = state.coPlacementOrders.find((o) => o.id === orderId)
    if (!current) return { ok: false, message: 'Co-placement order not found.' }
    if (current.status === 'Completed by Picker') {
      return { ok: false, message: 'Co-placement order has already been completed.' }
    }

    const targetBin = current.skuA.targetBin
    const oldBin = current.skuA.currentBin
    const skuId = current.skuA.id

    // 1. Validate source inventory
    const sourceStock = state.inventory.find((inv) => inv.skuId === skuId && inv.binId === oldBin)
    if (!sourceStock || !sourceStock.available) {
      return { ok: false, message: `Source inventory for ${skuId} at ${oldBin} is unavailable or not found.` }
    }

    const availableQty = getAvailableQuantity(sourceStock)
    const quantityToMove = current.approvedQuantity ?? current.quantity ?? availableQty
    if (quantityToMove <= 0) {
      return { ok: false, message: 'No available unreserved inventory to relocate.' }
    }
    if (quantityToMove > availableQty) {
      return { ok: false, message: `Cannot relocate ${quantityToMove} units: only ${availableQty} unreserved units are available in ${oldBin}.` }
    }

    // 2. Validate target bin exists and check SKU compatibility
    const targetStock = state.inventory.find((inv) => inv.binId === targetBin)
    const targetBinConfig = state.bins.find((b) => b.id === targetBin)
    if (targetStock && targetStock.quantity > 0 && targetStock.skuId !== skuId) {
      return { ok: false, message: `Target bin ${targetBin} is occupied by another SKU (${targetStock.skuId}). Cannot co-place.` }
    }

    // 3. Validate target bin unit capacity
    const existingTargetQty = targetStock?.skuId === skuId ? targetStock.quantity : 0
    const maxCapacity = targetStock?.capacity ?? targetBinConfig?.capacity ?? 48
    if (existingTargetQty + quantityToMove > maxCapacity) {
      return { ok: false, message: `Target bin ${targetBin} capacity exceeded: proposed total ${existingTargetQty + quantityToMove} exceeds capacity ${maxCapacity}.` }
    }

    // 4. Validate target bin weight limits and handling
    const skuDef = skus.find((s) => s.id === skuId)
    const unitWeightKg = skuDef?.optimizationProfile?.weightKg ?? 1
    const maxWeightKg = targetBinConfig?.optimizationConstraints?.maxWeightKg ?? 25
    const totalWeightKg = (existingTargetQty + quantityToMove) * unitWeightKg
    if (totalWeightKg > maxWeightKg) {
      return { ok: false, message: `Target bin ${targetBin} weight limit exceeded: proposed load ${totalWeightKg.toFixed(1)} kg exceeds maximum of ${maxWeightKg} kg.` }
    }

    const handling = skuDef?.optimizationProfile?.handling ?? 'standard'
    if (targetBinConfig?.optimizationConstraints?.handlingCapabilities &&
        !targetBinConfig.optimizationConstraints.handlingCapabilities.includes(handling)) {
      return { ok: false, message: `Target bin ${targetBin} does not support ${handling} handling.` }
    }

    // 5. Perform atomic update
    const now = new Date().toISOString()
    const updatedInventory = state.inventory.map((inv) => {
      if (inv.skuId === skuId && inv.binId === oldBin) {
        return {
          ...inv,
          quantity: inv.quantity - quantityToMove,
          updated: now,
        }
      }
      if (inv.binId === targetBin && inv.skuId === skuId) {
        return {
          ...inv,
          quantity: inv.quantity + quantityToMove,
          updated: now,
        }
      }
      return inv
    })

    if (!targetStock) {
      updatedInventory.push({
        skuId,
        binId: targetBin,
        quantity: quantityToMove,
        reserved: 0,
        updated: now,
        capacity: maxCapacity,
        reorderPoint: sourceStock.reorderPoint,
        available: true,
      })
    } else if (targetStock.quantity === 0 && targetStock.skuId !== skuId) {
      const idx = updatedInventory.findIndex((i) => i.binId === targetBin)
      if (idx >= 0) {
        updatedInventory[idx] = {
          ...updatedInventory[idx],
          skuId,
          quantity: quantityToMove,
          updated: now,
        }
      }
    }

    const moveTimestamp = now
    const movements = [
      {
        id: newId('MOV'),
        binId: targetBin,
        skuId,
        type: 'receive' as const,
        quantity: quantityToMove,
        timestamp: moveTimestamp,
        source: 'picker-workspace' as const,
      },
      {
        id: newId('MOV'),
        binId: oldBin,
        skuId,
        type: 'pick' as const,
        quantity: quantityToMove,
        timestamp: moveTimestamp,
        source: 'picker-workspace' as const,
      },
      ...state.movements,
    ]

    const alert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Co-Placement Relocation Completed by Picker!',
      detail: `Worker Alex Morgan confirmed re-slotting of ${quantityToMove} units of ${current.skuA.name} into Box ${current.skuA.targetBoxId} (${targetBin}) adjacent to ${current.skuB.name}. Sales lift tracking active!`,
      source: 'picker' as const,
      tone: 'green' as const,
    }

    set({
      inventory: updatedInventory,
      coPlacementOrders: state.coPlacementOrders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'Completed by Picker',
              quantity: quantityToMove,
              approvedQuantity: quantityToMove,
              pickerCompletedAt: now,
            }
          : o
      ),
      movements,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Co-placement ${orderId} confirmed: relocated ${quantityToMove} units of ${skuId} from ${oldBin} to ${targetBin}.` }
  },
  dismissAlert: (id) => set((state) => ({ liveAlerts: state.liveAlerts.filter((a) => a.id !== id) })),
  addAlert: (alert) => {
    const newAlert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      ...alert,
    }
    set((state) => ({ liveAlerts: [newAlert, ...state.liveAlerts].slice(0, 10) }))
  },
  createProduct: (input: CreateProductInput): CrudResult => {
    const skuId = (input.skuId || input.id)?.trim().toUpperCase()
    const name = input.name?.trim()
    const category = input.category?.trim()
    const binId = input.binId?.trim()
    const quantity = Number(input.quantity)
    const reorderPoint = Number(input.reorderPoint)
    const weightKg = Number(input.weightKg)

    if (!skuId) return { ok: false, message: 'SKU Identifier is required (e.g. SKU-5001).' }
    if (!name) return { ok: false, message: 'Product Name is required.' }
    if (!category) return { ok: false, message: 'Product Category is required.' }
    if (!binId) return { ok: false, message: 'Storage Bin selection is required.' }
    if (!Number.isInteger(quantity) || quantity < 0) return { ok: false, message: 'Initial quantity must be a non-negative whole number.' }
    if (!Number.isInteger(reorderPoint) || reorderPoint <= 0) return { ok: false, message: 'Reorder point must be a positive whole number.' }
    if (isNaN(weightKg) || weightKg <= 0) return { ok: false, message: 'Unit weight must be a positive number in kg.' }

    const state = get()

    const existingSku = state.skus.find((s) => s.id === skuId)
    if (existingSku && !existingSku.archived && existingSku.name.toLowerCase() !== name.toLowerCase()) {
      return { ok: false, message: `SKU ${skuId} already exists as "${existingSku.name}". Use the existing product name or assign a unique SKU.` }
    }

    const targetBin = state.bins.find((b) => b.id === binId)
    if (!targetBin) return { ok: false, message: `Storage location ${binId} does not exist in warehouse layout.` }

    const existingStock = state.inventory.find((i) => i.binId === binId && !i.archived)
    if (existingStock && existingStock.quantity > 0 && existingStock.skuId !== skuId) {
      return { ok: false, message: `Storage bin ${binId} is already occupied by SKU ${existingStock.skuId} (${existingStock.quantity} units). Incompatible SKU mixing is blocked.` }
    }

    const existingQty = existingStock && existingStock.skuId === skuId ? existingStock.quantity : 0
    const totalQty = existingQty + quantity
    const binCap = existingStock?.capacity ?? targetBin.capacity ?? 48
    if (totalQty > binCap) {
      return { ok: false, message: `Bin capacity exceeded: ${totalQty} total units exceeds bin capacity of ${binCap} units.` }
    }

    const maxWeight = targetBin.optimizationConstraints?.maxWeightKg ?? 25
    const totalWeight = totalQty * weightKg
    if (totalWeight > maxWeight) {
      return { ok: false, message: `Bin weight limit exceeded: proposed load ${totalWeight.toFixed(1)} kg exceeds max rating of ${maxWeight} kg.` }
    }

    const handling = input.handling ?? 'standard'
    if (targetBin.optimizationConstraints?.handlingCapabilities &&
        !targetBin.optimizationConstraints.handlingCapabilities.includes(handling)) {
      return { ok: false, message: `Location ${binId} does not support ${handling} handling.` }
    }

    const now = new Date().toISOString()
    const skuRecord: SKU = existingSku
      ? { ...existingSku, name, category, unit: input.unit || existingSku.unit, reorderPoint, supplier: input.supplier || existingSku.supplier, archived: false }
      : {
          id: skuId,
          name,
          category,
          unit: input.unit || 'units',
          reorderPoint,
          supplier: input.supplier || 'Direct Supply',
          optimizationProfile: {
            weeklyPickFrequency: 100,
            demandClass: 'B',
            dimensionsCm: input.dimensionsCm || [30, 20, 15],
            weightKg,
            handling,
            affinitySkuIds: [],
          },
          archived: false,
        }

    const updatedSkus = existingSku
      ? state.skus.map((s) => s.id === skuId ? skuRecord : s)
      : [skuRecord, ...state.skus]

    let updatedInventory: InventoryItem[]
    let itemRecord: InventoryItem

    if (existingStock) {
      itemRecord = {
        ...existingStock,
        skuId,
        quantity: totalQty,
        capacity: binCap,
        reorderPoint,
        updated: now,
        available: true,
        archived: false,
      }
      updatedInventory = state.inventory.map((i) => i.binId === binId ? itemRecord : i)
    } else {
      itemRecord = {
        skuId,
        binId,
        quantity,
        reserved: 0,
        updated: now,
        capacity: binCap,
        reorderPoint,
        available: true,
        archived: false,
      }
      updatedInventory = [itemRecord, ...state.inventory]
    }

    const movements = quantity > 0 ? [
      {
        id: newId('MOV'),
        binId,
        skuId,
        type: 'receive' as const,
        quantity,
        timestamp: now,
        source: 'inventory-crud' as const,
        reason: 'Initial Product Stock In',
      },
      ...state.movements,
    ] : state.movements

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'New Product Created & Slotted',
      detail: `Created ${skuId} ("${name}") with ${quantity} units slotted into ${binId}.`,
      source: 'manager',
      tone: 'green',
    }

    set({
      skus: updatedSkus,
      inventory: updatedInventory,
      movements,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Product ${skuId} ("${name}") created and assigned to ${binId} (${quantity} units).`, item: itemRecord, sku: skuRecord }
  },

  updateProductMetadata: (skuId: string, updates: SkuMetadataUpdates): CrudResult => {
    const state = get()
    const sku = state.skus.find((s) => s.id === skuId)
    if (!sku) return { ok: false, message: `SKU ${skuId} not found in catalog.` }
    if (sku.archived) return { ok: false, message: `Cannot edit archived SKU ${skuId}. Restore it first.` }

    const updatedProfile = {
      ...(sku.optimizationProfile || { weeklyPickFrequency: 100, demandClass: 'B' as const, dimensionsCm: [30, 20, 15] as [number, number, number], weightKg: 1, handling: 'standard' as const, affinitySkuIds: [] }),
      ...(updates.weightKg !== undefined ? { weightKg: updates.weightKg } : {}),
      ...(updates.handling !== undefined ? { handling: updates.handling } : {}),
    }

    const updatedSku: SKU = {
      ...sku,
      ...updates,
      name: updates.name?.trim() || sku.name,
      category: updates.category?.trim() || sku.category,
      unit: updates.unit?.trim() || sku.unit,
      supplier: updates.supplier?.trim() || sku.supplier,
      reorderPoint: updates.reorderPoint !== undefined && updates.reorderPoint > 0 ? updates.reorderPoint : sku.reorderPoint,
      optimizationProfile: updatedProfile,
    }

    const updatedSkus = state.skus.map((s) => s.id === skuId ? updatedSku : s)

    const updatedInventory = updates.reorderPoint !== undefined && updates.reorderPoint > 0
      ? state.inventory.map((i) => i.skuId === skuId ? { ...i, reorderPoint: updates.reorderPoint!, updated: new Date().toISOString() } : i)
      : state.inventory

    set({
      skus: updatedSkus,
      inventory: updatedInventory,
    })

    return { ok: true, message: `Metadata for SKU ${skuId} updated successfully.`, sku: updatedSku }
  },

  adjustStock: (input: { binId: string; skuId: string; delta: number; reason: string }): CrudResult => {
    const { binId, skuId, delta, reason } = input
    if (!Number.isInteger(delta) || delta === 0) {
      return { ok: false, message: 'Adjustment quantity must be a non-zero whole number.' }
    }
    if (!reason?.trim()) {
      return { ok: false, message: 'Reason for stock adjustment is required (e.g. Cycle count, Damage).' }
    }

    const state = get()
    const item = state.inventory.find((i) => i.binId === binId && i.skuId === skuId && !i.archived)
    if (!item) return { ok: false, message: `Active inventory record not found for ${skuId} in ${binId}.` }
    if (!item.available) return { ok: false, message: `Location ${binId} is marked unavailable.` }

    const newQty = item.quantity + delta
    if (newQty < 0) {
      return { ok: false, message: `Adjustment rejected: stock cannot become negative (current: ${item.quantity}, delta: ${delta}).` }
    }
    if (newQty < item.reserved) {
      return { ok: false, message: `Adjustment rejected: cannot reduce quantity below reserved units (${item.reserved} units reserved for active orders).` }
    }
    if (newQty > item.capacity) {
      return { ok: false, message: `Adjustment rejected: new quantity ${newQty} exceeds bin capacity of ${item.capacity} units.` }
    }

    const binConfig = state.bins.find((b) => b.id === binId)
    const skuDef = state.skus.find((s) => s.id === skuId)
    const unitWeight = skuDef?.optimizationProfile?.weightKg ?? 1
    const maxWeight = binConfig?.optimizationConstraints?.maxWeightKg ?? 25
    if (newQty * unitWeight > maxWeight) {
      return { ok: false, message: `Adjustment rejected: new weight ${(newQty * unitWeight).toFixed(1)} kg exceeds maximum bin rating of ${maxWeight} kg.` }
    }

    const now = new Date().toISOString()
    const updatedItem: InventoryItem = {
      ...item,
      quantity: newQty,
      updated: now,
    }

    const movement: StockMovement = {
      id: newId('MOV'),
      binId,
      skuId,
      type: 'adjust',
      quantity: Math.abs(delta),
      timestamp: now,
      source: 'inventory-crud',
      reason: reason.trim(),
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Manual Stock Adjustment',
      detail: `Adjusted ${skuId} at ${binId} by ${delta > 0 ? '+' : ''}${delta} units (${reason.trim()}). On hand: ${newQty}.`,
      source: 'manager',
      tone: delta > 0 ? 'green' : 'amber',
    }

    set({
      inventory: state.inventory.map((i) => i.binId === binId && i.skuId === skuId ? updatedItem : i),
      movements: [movement, ...state.movements],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Stock adjusted by ${delta > 0 ? '+' : ''}${delta} units at ${binId}. Current on-hand: ${newQty}.`, item: updatedItem }
  },

  archiveInventoryItem: (skuId: string, binId?: string): CrudResult => {
    const state = get()

    const hasActivePick = state.pickOrder.lines.some((l) => l.skuId === skuId && l.picked < l.requested) && state.pickOrder.status !== 'Complete'
    if (hasActivePick) {
      return { ok: false, message: `Cannot archive SKU ${skuId}: product is part of active pick order ${state.pickOrder.id}.` }
    }

    const hasActiveReplenishment = state.replenishmentRequests.some((r) => r.skuId === skuId && !['Completed', 'Cancelled'].includes(r.status))
    if (hasActiveReplenishment) {
      return { ok: false, message: `Cannot archive SKU ${skuId}: product has active replenishment requests in progress.` }
    }

    const hasActiveTransfer = state.transferTasks.some((t) => t.skuId === skuId && t.status === 'Pending')
    if (hasActiveTransfer) {
      return { ok: false, message: `Cannot archive SKU ${skuId}: product has pending storage relocation transfer tasks.` }
    }

    const records = state.inventory.filter((i) => i.skuId === skuId && (!binId || i.binId === binId) && !i.archived)
    if (records.length === 0) {
      return { ok: false, message: `No active inventory records found for SKU ${skuId}.` }
    }
    const totalReserved = records.reduce((s, i) => s + i.reserved, 0)
    if (totalReserved > 0) {
      return { ok: false, message: `Cannot archive SKU ${skuId}: ${totalReserved} units are reserved for active operations.` }
    }

    const now = new Date().toISOString()
    const updatedInventory = state.inventory.map((i) => {
      if (i.skuId === skuId && (!binId || i.binId === binId)) {
        return { ...i, archived: true, available: false, updated: now }
      }
      return i
    })

    const remainingActive = updatedInventory.filter((i) => i.skuId === skuId && !i.archived)
    const updatedSkus = remainingActive.length === 0
      ? state.skus.map((s) => s.id === skuId ? { ...s, archived: true } : s)
      : state.skus

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Inventory Item Archived',
      detail: `Archived SKU ${skuId}${binId ? ` at location ${binId}` : ''}. Historical movement logs preserved.`,
      source: 'manager',
      tone: 'amber',
    }

    set({
      inventory: updatedInventory,
      skus: updatedSkus,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `SKU ${skuId} successfully archived. Viewable in Archived Inventory.` }
  },

  restoreInventoryItem: (skuId: string, binId: string): CrudResult => {
    const state = get()
    const item = state.inventory.find((i) => i.skuId === skuId && i.binId === binId && i.archived)
    if (!item) return { ok: false, message: `Archived record for ${skuId} at ${binId} not found.` }

    const otherItem = state.inventory.find((i) => i.binId === binId && i.skuId !== skuId && !i.archived && i.quantity > 0)
    if (otherItem) {
      return { ok: false, message: `Cannot restore: location ${binId} is currently occupied by active SKU ${otherItem.skuId}.` }
    }

    const now = new Date().toISOString()
    const updatedInventory = state.inventory.map((i) => {
      if (i.skuId === skuId && i.binId === binId) {
        return { ...i, archived: false, available: true, updated: now }
      }
      return i
    })

    const updatedSkus = state.skus.map((s) => s.id === skuId ? { ...s, archived: false } : s)

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Inventory Item Restored',
      detail: `Restored SKU ${skuId} at location ${binId}. Stock is once again pickable and active.`,
      source: 'manager',
      tone: 'green',
    }

    set({
      inventory: updatedInventory,
      skus: updatedSkus,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `SKU ${skuId} restored at ${binId}.` }
  },

  initiateRelocationTransfer: (input: { skuId: string; sourceBinId: string; targetBinId: string; quantity: number; notes?: string }): CrudResult => {
    const { skuId, sourceBinId, targetBinId, quantity, notes } = input
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, message: 'Transfer quantity must be a positive whole number.' }
    }
    if (sourceBinId === targetBinId) {
      return { ok: false, message: 'Source and target storage locations must be different.' }
    }

    const state = get()
    const sourceStock = state.inventory.find((i) => i.binId === sourceBinId && i.skuId === skuId && !i.archived)
    if (!sourceStock || !sourceStock.available) {
      return { ok: false, message: `Source inventory for ${skuId} at ${sourceBinId} is unavailable or not found.` }
    }
    const availableQty = getAvailableQuantity(sourceStock)
    if (quantity > availableQty) {
      return { ok: false, message: `Insufficient unreserved stock: requested ${quantity} units, but only ${availableQty} are available in ${sourceBinId}.` }
    }

    const targetBin = state.bins.find((b) => b.id === targetBinId)
    if (!targetBin) {
      return { ok: false, message: `Target storage location ${targetBinId} does not exist.` }
    }

    const sourceBin = state.bins.find((b) => b.id === sourceBinId)
    if (sourceBin && targetBin) {
      const sourceWh = sourceBin.warehouseId || 'WH-HYD-01'
      const targetWh = targetBin.warehouseId || 'WH-HYD-01'
      if (sourceWh !== targetWh) {
        return {
          ok: false,
          message: `Source bin ${sourceBinId} (${sourceWh}) and target bin ${targetBinId} (${targetWh}) belong to different warehouses. Use Inter-Warehouse Transfer for cross-facility movements.`,
        }
      }
    }

    const targetStock = state.inventory.find((i) => i.binId === targetBinId && !i.archived)
    if (targetStock && targetStock.quantity > 0 && targetStock.skuId !== skuId) {
      return { ok: false, message: `Target bin ${targetBinId} is occupied by another SKU (${targetStock.skuId}). Incompatible mixing blocked.` }
    }

    const existingTargetQty = targetStock?.skuId === skuId ? targetStock.quantity : 0
    const targetCap = targetStock?.capacity ?? targetBin.capacity ?? 48
    if (existingTargetQty + quantity > targetCap) {
      return { ok: false, message: `Target bin capacity exceeded: ${existingTargetQty + quantity} units proposed, but ${targetBinId} capacity is ${targetCap}.` }
    }

    const skuDef = state.skus.find((s) => s.id === skuId)
    const unitWeight = skuDef?.optimizationProfile?.weightKg ?? 1
    const maxWeight = targetBin.optimizationConstraints?.maxWeightKg ?? 25
    if ((existingTargetQty + quantity) * unitWeight > maxWeight) {
      return { ok: false, message: `Target bin weight limit exceeded: proposed load ${((existingTargetQty + quantity) * unitWeight).toFixed(1)} kg exceeds max rating of ${maxWeight} kg.` }
    }

    const taskId = newId('TRF')
    const now = new Date().toISOString()
    const task: RelocationTransferTask = {
      id: taskId,
      skuId,
      sourceBinId,
      targetBinId,
      quantity,
      status: 'Pending',
      createdAt: now,
      notes: notes?.trim() || 'Warehouse Relocation Transfer',
    }

    const updatedInventory = state.inventory.map((i) =>
      i.binId === sourceBinId && i.skuId === skuId
        ? { ...i, reserved: i.reserved + quantity, updated: now }
        : i
    )

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Relocation Transfer Task Created',
      detail: `Transfer ${taskId}: ${quantity} units of ${skuId} staged for move from ${sourceBinId} to ${targetBinId}. Units reserved.`,
      source: 'manager',
      tone: 'blue',
    }

    set({
      transferTasks: [task, ...state.transferTasks],
      inventory: updatedInventory,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer task ${taskId} created: ${quantity} units reserved in ${sourceBinId} awaiting move completion.`, task }
  },

  completeRelocationTransfer: (taskId: string): CrudResult => {
    const state = get()
    const task = state.transferTasks.find((t) => t.id === taskId)
    if (!task) return { ok: false, message: `Transfer task ${taskId} not found.` }
    if (task.status !== 'Pending') {
      return { ok: false, message: `Transfer task ${taskId} is already ${task.status}.` }
    }

    const { skuId, sourceBinId, targetBinId, quantity } = task
    const sourceStock = state.inventory.find((i) => i.binId === sourceBinId && i.skuId === skuId)
    if (!sourceStock) {
      return { ok: false, message: `Source inventory record missing for ${sourceBinId}.` }
    }

    const now = new Date().toISOString()
    const targetBin = state.bins.find((b) => b.id === targetBinId)
    const targetCap = targetBin?.capacity ?? 48
    const targetStock = state.inventory.find((i) => i.binId === targetBinId)

    let updatedInventory = state.inventory.map((i) => {
      if (i.binId === sourceBinId && i.skuId === skuId) {
        return {
          ...i,
          quantity: Math.max(0, i.quantity - quantity),
          reserved: Math.max(0, i.reserved - quantity),
          updated: now,
        }
      }
      if (i.binId === targetBinId && i.skuId === skuId) {
        return {
          ...i,
          quantity: i.quantity + quantity,
          updated: now,
          archived: false,
          available: true,
        }
      }
      return i
    })

    if (!targetStock) {
      updatedInventory.push({
        skuId,
        binId: targetBinId,
        quantity,
        reserved: 0,
        updated: now,
        capacity: targetCap,
        reorderPoint: sourceStock.reorderPoint,
        available: true,
        archived: false,
      })
    } else if (targetStock.quantity === 0 && targetStock.skuId !== skuId) {
      const idx = updatedInventory.findIndex((i) => i.binId === targetBinId)
      if (idx >= 0) {
        updatedInventory[idx] = {
          ...updatedInventory[idx],
          skuId,
          quantity,
          updated: now,
          archived: false,
          available: true,
        }
      }
    }

    const updatedTasks = state.transferTasks.map((t) =>
      t.id === taskId
        ? { ...t, status: 'Completed' as const, completedAt: now }
        : t
    )

    const movement: StockMovement = {
      id: newId('MOV'),
      binId: sourceBinId,
      skuId,
      type: 'relocate',
      quantity,
      timestamp: now,
      source: 'relocation-task',
      destinationBinId: targetBinId,
      reason: task.notes || `Transferred from ${sourceBinId} to ${targetBinId}`,
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Relocation Transfer Completed',
      detail: `Transferred ${quantity} units of ${skuId} from ${sourceBinId} into ${targetBinId}. Inventory updated.`,
      source: 'picker',
      tone: 'green',
    }

    set({
      inventory: updatedInventory,
      transferTasks: updatedTasks,
      movements: [movement, ...state.movements],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer ${taskId} successfully executed: ${quantity} units relocated to ${targetBinId}.`, task: { ...task, status: 'Completed', completedAt: now } }
  },
  recordSale: (sale: Omit<SaleEvent, 'id'>): SaleEvent => {
    const newSale: SaleEvent = {
      ...sale,
      id: newId('SALE'),
      isSimulated: sale.isSimulated ?? false,
    }
    set((s) => ({
      salesHistory: [newSale, ...s.salesHistory],
    }))
    return newSale
  },

  getDemandIntelligence: (windowDays: DemandWindowDays = 30, referenceDate?: Date, warehouseId?: string) => {
    const state = get()
    const refDate = referenceDate || new Date()
    const targetWhId = warehouseId || state.selectedWarehouseId || 'WH-HYD-01'
    const profiles = calculateSkuDemandProfiles({
      skus: state.skus,
      inventory: state.inventory,
      bins: state.bins,
      sales: state.salesHistory,
      movements: state.movements,
      windowDays,
      referenceDate: refDate,
    })
    const validEvents = filterValidDemandEvents(
      state.salesHistory,
      state.movements,
      windowDays,
      refDate
    )
    const peaks = analyzePeakDemand(validEvents, state.skus, profiles)
    const recommendations = generateDemandAwareSlottingRecommendations({
      demandProfiles: profiles,
      bins: state.bins,
      inventory: state.inventory,
      skus: state.skus,
      warehouseId: targetWhId,
    }).filter((r) => !state.dismissedRecommendationIds.includes(r.id))
    return { profiles, peaks, recommendations }
  },


  cancelRelocationTransfer: (taskId: string): CrudResult => {
    const state = get()
    const task = state.transferTasks.find((t) => t.id === taskId)
    if (!task) return { ok: false, message: `Transfer task ${taskId} not found.` }
    if (task.status !== 'Pending') {
      return { ok: false, message: `Transfer task ${taskId} is already ${task.status}.` }
    }

    const { skuId, sourceBinId, quantity } = task
    const now = new Date().toISOString()

    const updatedInventory = state.inventory.map((i) =>
      i.binId === sourceBinId && i.skuId === skuId
        ? { ...i, reserved: Math.max(0, i.reserved - quantity), updated: now }
        : i
    )

    const updatedTasks = state.transferTasks.map((t) =>
      t.id === taskId
        ? { ...t, status: 'Cancelled' as const }
        : t
    )

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Transfer Task Cancelled',
      detail: `Cancelled transfer ${taskId}. ${quantity} reserved units released back to available in ${sourceBinId}.`,
      source: 'manager',
      tone: 'amber',
    }

    set({
      inventory: updatedInventory,
      transferTasks: updatedTasks,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer ${taskId} cancelled and reserved stock released.` }
  },

  requestInterWarehouseTransfer: (input) => {
    const { sourceWarehouseId, destinationWarehouseId, sourceBinId, destinationBinId, skuId, quantity, requestedBy = 'Manager', notes } = input
    if (!Number.isInteger(quantity) || quantity <= 0) {
      return { ok: false, message: 'Transfer quantity must be a positive whole number.' }
    }
    if (sourceWarehouseId === destinationWarehouseId) {
      return { ok: false, message: 'Source and destination warehouses must be different.' }
    }

    const state = get()
    const sourceWh = state.warehouses.find((w) => w.id === sourceWarehouseId)
    if (!sourceWh || sourceWh.status !== 'Active') {
      return { ok: false, message: `Source warehouse ${sourceWarehouseId} is inactive or does not exist.` }
    }
    const destWh = state.warehouses.find((w) => w.id === destinationWarehouseId)
    if (!destWh || destWh.status !== 'Active') {
      return { ok: false, message: `Destination warehouse ${destinationWarehouseId} is inactive or does not exist.` }
    }

    const sourceBin = state.bins.find((b) => b.id === sourceBinId)
    if (!sourceBin || (sourceBin.warehouseId || 'WH-HYD-01') !== sourceWarehouseId) {
      return { ok: false, message: `Source bin ${sourceBinId} does not belong to ${sourceWarehouseId}.` }
    }

    const destBin = state.bins.find((b) => b.id === destinationBinId)
    if (!destBin || (destBin.warehouseId || 'WH-HYD-01') !== destinationWarehouseId) {
      return { ok: false, message: `Destination bin ${destinationBinId} does not belong to ${destinationWarehouseId}.` }
    }

    const sourceStock = state.inventory.find(
      (i) => i.binId === sourceBinId && i.skuId === skuId && (i.warehouseId || 'WH-HYD-01') === sourceWarehouseId && !i.archived
    )
    if (!sourceStock) {
      return { ok: false, message: `No active inventory found for ${skuId} at source bin ${sourceBinId}.` }
    }

    const available = Math.max(0, sourceStock.quantity - sourceStock.reserved)
    if (quantity > available) {
      return { ok: false, message: `Insufficient available stock at ${sourceBinId}: requested ${quantity}, available ${available}.` }
    }

    const destStock = state.inventory.find(
      (i) => i.binId === destinationBinId && (i.warehouseId || 'WH-HYD-01') === destinationWarehouseId && !i.archived
    )
    if (destStock && destStock.quantity > 0 && destStock.skuId !== skuId) {
      return { ok: false, message: `Destination bin ${destinationBinId} is occupied by another SKU (${destStock.skuId}). Incompatible mixing blocked.` }
    }

    const destCurrentQty = destStock?.quantity || 0
    const destCap = destStock?.capacity || destBin.capacity || 50
    if (destCurrentQty + quantity > destCap) {
      return { ok: false, message: `Destination bin capacity exceeded: ${destCurrentQty + quantity} units proposed, but capacity is ${destCap}.` }
    }

    const distanceKm = getWarehouseDistanceKm(sourceWarehouseId, destinationWarehouseId)
    const estimatedHours = getEstimatedTransitHours(distanceKm)
    const now = new Date().toISOString()
    const transferId = `TR-${Date.now().toString().slice(-6)}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`

    const newTransfer: InterWarehouseTransfer = {
      id: transferId,
      sourceWarehouseId,
      destinationWarehouseId,
      sourceBinId,
      destinationBinId,
      skuId,
      quantity,
      status: 'REQUESTED',
      requestedAt: now,
      requestedBy,
      estimatedHours,
      transportDistanceKm: distanceKm,
      notes,
      history: [
        {
          status: 'REQUESTED',
          timestamp: now,
          actor: requestedBy,
          note: notes || 'Transfer requested across facility network',
        },
      ],
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Inter-Warehouse Transfer Requested',
      detail: `Transfer ${transferId}: ${quantity}x ${skuId} from ${sourceWh.name} to ${destWh.name}.`,
      source: 'manager',
      tone: 'blue',
    }

    set({
      interWarehouseTransfers: [newTransfer, ...state.interWarehouseTransfers],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer ${transferId} requested successfully.`, transfer: newTransfer }
  },

  approveInterWarehouseTransfer: (transferId, approvedBy = 'Manager') => {
    const state = get()
    const transfer = state.interWarehouseTransfers.find((t) => t.id === transferId)
    if (!transfer) return { ok: false, message: `Transfer ${transferId} not found.` }
    if (transfer.status !== 'REQUESTED') {
      return { ok: false, message: `Cannot approve transfer ${transferId}: status is ${transfer.status} (must be REQUESTED).` }
    }

    const sourceStock = state.inventory.find(
      (i) => i.binId === transfer.sourceBinId && i.skuId === transfer.skuId && (i.warehouseId || 'WH-HYD-01') === transfer.sourceWarehouseId && !i.archived
    )
    if (!sourceStock) {
      return { ok: false, message: `Source inventory for ${transfer.skuId} not found.` }
    }
    const available = Math.max(0, sourceStock.quantity - sourceStock.reserved)
    if (transfer.quantity > available) {
      return { ok: false, message: `Approval blocked: required ${transfer.quantity} units, but only ${available} are currently available in ${transfer.sourceBinId}.` }
    }

    const now = new Date().toISOString()
    // Reserve stock at source bin
    const updatedInventory = state.inventory.map((i) =>
      i.binId === transfer.sourceBinId && i.skuId === transfer.skuId && (i.warehouseId || 'WH-HYD-01') === transfer.sourceWarehouseId
        ? { ...i, reserved: i.reserved + transfer.quantity, updated: now }
        : i
    )

    const updatedTransfer: InterWarehouseTransfer = {
      ...transfer,
      status: 'APPROVED',
      approvedAt: now,
      approvedBy,
      history: [
        ...transfer.history,
        {
          status: 'APPROVED',
          timestamp: now,
          actor: approvedBy,
          note: `Approved transfer. Reserved ${transfer.quantity} units at ${transfer.sourceBinId}.`,
        },
      ],
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Inter-Warehouse Transfer Approved',
      detail: `Transfer ${transferId} approved by ${approvedBy}. ${transfer.quantity} units reserved at source.`,
      source: 'manager',
      tone: 'green',
    }

    set({
      inventory: updatedInventory,
      interWarehouseTransfers: state.interWarehouseTransfers.map((t) => (t.id === transferId ? updatedTransfer : t)),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer ${transferId} approved. Stock reserved at source.`, transfer: updatedTransfer }
  },

  dispatchInterWarehouseTransfer: (transferId, dispatchedBy = 'Dispatch Dock') => {
    const state = get()
    const transfer = state.interWarehouseTransfers.find((t) => t.id === transferId)
    if (!transfer) return { ok: false, message: `Transfer ${transferId} not found.` }
    if (transfer.status !== 'APPROVED') {
      return { ok: false, message: `Cannot dispatch transfer ${transferId}: status is ${transfer.status} (must be APPROVED).` }
    }

    const now = new Date().toISOString()
    // Deduct source physical stock AND release reserved held stock
    const updatedInventory = state.inventory.map((i) =>
      i.binId === transfer.sourceBinId && i.skuId === transfer.skuId && (i.warehouseId || 'WH-HYD-01') === transfer.sourceWarehouseId
        ? {
            ...i,
            quantity: i.quantity - transfer.quantity,
            reserved: Math.max(0, i.reserved - transfer.quantity),
            updated: now,
          }
        : i
    )

    // Auditable movement at source
    const movement = newMovement(
      transfer.sourceBinId,
      transfer.skuId,
      'transfer',
      transfer.quantity,
      'inventory-crud',
      `Inter-warehouse dispatch to ${transfer.destinationWarehouseId} (Transfer ${transfer.id})`,
      transfer.destinationBinId,
      transfer.sourceWarehouseId
    )

    const updatedTransfer: InterWarehouseTransfer = {
      ...transfer,
      status: 'IN TRANSIT',
      dispatchedAt: now,
      dispatchedBy,
      history: [
        ...transfer.history,
        {
          status: 'IN TRANSIT',
          timestamp: now,
          actor: dispatchedBy,
          note: `Dispatched ${transfer.quantity} units from ${transfer.sourceBinId}. Goods in transit.`,
        },
      ],
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Inter-Warehouse Transfer Dispatched',
      detail: `Transfer ${transferId} in transit to ${transfer.destinationWarehouseId}. Source on-hand stock deducted.`,
      source: 'manager',
      tone: 'blue',
    }

    set({
      inventory: updatedInventory,
      movements: [movement, ...state.movements],
      interWarehouseTransfers: state.interWarehouseTransfers.map((t) => (t.id === transferId ? updatedTransfer : t)),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer ${transferId} dispatched. Goods are now in transit.`, transfer: updatedTransfer }
  },

  receiveInterWarehouseTransfer: (transferId, receivedQuantity, receivedBy = 'Receiving Dock', discrepancyReason) => {
    const state = get()
    const transfer = state.interWarehouseTransfers.find((t) => t.id === transferId)
    if (!transfer) return { ok: false, message: `Transfer ${transferId} not found.` }
    if (transfer.status === 'RECEIVED') {
      return { ok: false, message: `Duplicate receipt blocked: transfer ${transferId} has already been received.` }
    }
    if (transfer.status !== 'IN TRANSIT') {
      return { ok: false, message: `Cannot receive transfer ${transferId}: status is ${transfer.status} (must be IN TRANSIT).` }
    }
    if (!Number.isInteger(receivedQuantity) || receivedQuantity < 0 || receivedQuantity > transfer.quantity) {
      return { ok: false, message: `Received quantity must be a whole number between 0 and transfer quantity (${transfer.quantity}).` }
    }

    const now = new Date().toISOString()
    const hasDiscrepancy = receivedQuantity !== transfer.quantity
    const discrepancyDetails = hasDiscrepancy
      ? {
          expectedQuantity: transfer.quantity,
          actualReceivedQuantity: receivedQuantity,
          reason: discrepancyReason?.trim() || `Discrepancy: received ${receivedQuantity} of ${transfer.quantity} units.`,
        }
      : undefined

    // Add received quantity to destination inventory
    let destStockFound = false
    const updatedInventory = state.inventory.map((i) => {
      if (
        i.binId === transfer.destinationBinId &&
        (i.warehouseId || 'WH-HYD-01') === transfer.destinationWarehouseId &&
        !i.archived
      ) {
        destStockFound = true
        return {
          ...i,
          skuId: transfer.skuId,
          quantity: i.quantity + receivedQuantity,
          updated: now,
          available: true,
        }
      }
      return i
    })

    if (!destStockFound && receivedQuantity > 0) {
      const destBin = state.bins.find((b) => b.id === transfer.destinationBinId)
      updatedInventory.push({
        skuId: transfer.skuId,
        binId: transfer.destinationBinId,
        warehouseId: transfer.destinationWarehouseId,
        quantity: receivedQuantity,
        reserved: 0,
        updated: now,
        capacity: destBin?.capacity || 50,
        reorderPoint: 15,
        available: true,
      })
    }

    // Update destination bin record
    const updatedBins = state.bins.map((b) => {
      if (b.id === transfer.destinationBinId && (b.warehouseId || 'WH-HYD-01') === transfer.destinationWarehouseId) {
        return {
          ...b,
          skuId: transfer.skuId,
          quantity: b.quantity + receivedQuantity,
          status: 'Healthy' as const,
        }
      }
      return b
    })

    // Auditable movement at destination
    const movement = newMovement(
      transfer.destinationBinId,
      transfer.skuId,
      'transfer',
      receivedQuantity,
      'inventory-crud',
      `Inter-warehouse receipt from ${transfer.sourceWarehouseId} (Transfer ${transfer.id})${hasDiscrepancy ? ` [Discrepancy: ${discrepancyDetails?.reason}]` : ''}`,
      undefined,
      transfer.destinationWarehouseId
    )

    const updatedTransfer: InterWarehouseTransfer = {
      ...transfer,
      status: 'RECEIVED',
      receivedAt: now,
      receivedBy,
      receivedQuantity,
      ...(discrepancyDetails ? { discrepancyDetails } : {}),
      history: [
        ...transfer.history,
        {
          status: 'RECEIVED',
          timestamp: now,
          actor: receivedBy,
          note: `Received ${receivedQuantity} units into ${transfer.destinationBinId}.${hasDiscrepancy ? ` Discrepancy logged: ${discrepancyDetails?.reason}` : ''}`,
        },
      ],
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: hasDiscrepancy ? 'Transfer Received with Discrepancy' : 'Inter-Warehouse Transfer Received',
      detail: `Transfer ${transferId} received at ${transfer.destinationWarehouseId} (${receivedQuantity}/${transfer.quantity} units).`,
      source: 'manager',
      tone: hasDiscrepancy ? 'amber' : 'green',
    }

    set({
      inventory: updatedInventory,
      bins: updatedBins,
      movements: [movement, ...state.movements],
      interWarehouseTransfers: state.interWarehouseTransfers.map((t) => (t.id === transferId ? updatedTransfer : t)),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return {
      ok: true,
      message: `Transfer ${transferId} received (${receivedQuantity} units added to ${transfer.destinationBinId}).`,
      transfer: updatedTransfer,
    }
  },

  cancelInterWarehouseTransfer: (transferId, cancelledBy = 'Manager', reason) => {
    const state = get()
    const transfer = state.interWarehouseTransfers.find((t) => t.id === transferId)
    if (!transfer) return { ok: false, message: `Transfer ${transferId} not found.` }
    if (['DISPATCHED', 'IN TRANSIT', 'RECEIVED'].includes(transfer.status)) {
      return { ok: false, message: `Cannot cancel transfer ${transferId}: transfer is already ${transfer.status}.` }
    }
    if (transfer.status === 'CANCELLED') {
      return { ok: false, message: `Transfer ${transferId} is already cancelled.` }
    }

    const now = new Date().toISOString()
    let updatedInventory = state.inventory
    if (transfer.status === 'APPROVED') {
      updatedInventory = state.inventory.map((i) =>
        i.binId === transfer.sourceBinId && i.skuId === transfer.skuId && (i.warehouseId || 'WH-HYD-01') === transfer.sourceWarehouseId
          ? { ...i, reserved: Math.max(0, i.reserved - transfer.quantity), updated: now }
          : i
      )
    }

    const updatedTransfer: InterWarehouseTransfer = {
      ...transfer,
      status: 'CANCELLED',
      cancelledAt: now,
      cancelledBy,
      notes: reason || transfer.notes,
      history: [
        ...transfer.history,
        {
          status: 'CANCELLED',
          timestamp: now,
          actor: cancelledBy,
          note: reason || 'Transfer cancelled by user.',
        },
      ],
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: now,
      title: 'Inter-Warehouse Transfer Cancelled',
      detail: `Transfer ${transferId} cancelled by ${cancelledBy}.${transfer.status === 'APPROVED' ? ` Released ${transfer.quantity} reserved units at source.` : ''}`,
      source: 'manager',
      tone: 'amber',
    }

    set({
      inventory: updatedInventory,
      interWarehouseTransfers: state.interWarehouseTransfers.map((t) => (t.id === transferId ? updatedTransfer : t)),
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return { ok: true, message: `Transfer ${transferId} cancelled.`, transfer: updatedTransfer }
  },

  searchGlobalSku: (filters) => {
    const state = get()
    return searchGlobalInventory({
      inventory: state.inventory,
      warehouses: state.warehouses,
      skus: state.skus,
      bins: state.bins,
      filters,
    })
  },

  getWarehouseAvailability: (skuId, requestedQuantity = 1, preferredWarehouseId) => {
    const state = get()
    const targetWhId = preferredWarehouseId || state.selectedWarehouseId || 'WH-HYD-01'
    return findAlternativeWarehouses({
      skuId,
      requestedQuantity,
      preferredWarehouseId: targetWhId,
      inventory: state.inventory,
      warehouses: state.warehouses,
      skus: state.skus,
    })
  },

  getNetworkRebalancingRecommendations: () => {
    const state = get()
    const { profiles } = state.getDemandIntelligence(30)
    return generateNetworkRebalancingRecommendations({
      inventory: state.inventory,
      warehouses: state.warehouses,
      skus: state.skus,
      bins: state.bins,
      profiles,
    }).filter((r) => !state.dismissedRecommendationIds.includes(r.id))
  },

  dismissRecommendation: (id: string) => {
    set((state) => ({
      dismissedRecommendationIds: [...state.dismissedRecommendationIds, id],
    }))
  },

  approveSlottingRecommendation: (recommendationId: string) => {
    const state = get()
    const { recommendations } = state.getDemandIntelligence()
    const rec = recommendations.find((r) => r.id === recommendationId)
    if (!rec) {
      return { ok: false, message: `Slotting recommendation ${recommendationId} not found.` }
    }

    const currentStock = state.inventory.find(
      (i) => i.binId === rec.currentBinId && i.skuId === rec.skuId && !i.archived
    )
    if (!currentStock || currentStock.quantity <= 0) {
      return { ok: false, message: `Source location ${rec.currentBinId} has no inventory for ${rec.skuId}.` }
    }

    const targetBin = state.bins.find((b) => b.id === rec.recommendedBinId)
    if (!targetBin) {
      return { ok: false, message: `Target bin ${rec.recommendedBinId} does not exist.` }
    }

    const availableUnreserved = Math.max(0, currentStock.quantity - currentStock.reserved)
    if (availableUnreserved <= 0) {
      return {
        ok: false,
        message: `All units in ${rec.currentBinId} are reserved (${currentStock.reserved} reserved). Cannot relocate.`,
      }
    }

    const targetCapacity = targetBin.capacity ?? 48
    const qtyToMove = Math.min(availableUnreserved, targetCapacity)

    const res = state.initiateRelocationTransfer({
      skuId: rec.skuId,
      sourceBinId: rec.currentBinId,
      targetBinId: rec.recommendedBinId,
      quantity: qtyToMove,
      notes: `Approved slotting recommendation: ${rec.reason}`,
    })

    if (!res.ok) {
      return { ok: false, message: res.message }
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Storage Slotting Relocation Approved',
      detail: `Staged move of ${qtyToMove} units of ${rec.skuId} from ${rec.currentBinId} to Golden Zone ${rec.recommendedBinId} (saves ${rec.distanceSavedMeters}m/pick).`,
      source: 'manager',
      tone: 'green',
    }

    set((s) => ({
      dismissedRecommendationIds: [...s.dismissedRecommendationIds, recommendationId],
      liveAlerts: [alert, ...s.liveAlerts].slice(0, 10),
    }))

    return {
      ok: true,
      message: `Relocation task staged! ${qtyToMove} units reserved at ${rec.currentBinId}. Complete physical move in Relocation Tasks tab.`,
      taskId: res.task?.id,
    }
  },

  approveRebalancingRecommendation: (recommendationId: string) => {
    const state = get()
    const recs = state.getNetworkRebalancingRecommendations()
    const rec = recs.find((r) => r.id === recommendationId)
    if (!rec) {
      return { ok: false, message: `Rebalancing recommendation ${recommendationId} not found.` }
    }

    const sourceWhItems = state.inventory.filter(
      (i) => i.skuId === rec.skuId && (i.warehouseId || 'WH-HYD-01') === rec.sourceWarehouseId && !i.archived
    )
    const sourceStock = sourceWhItems.find((i) => i.quantity - i.reserved >= rec.suggestedQuantity) || sourceWhItems[0]
    if (!sourceStock) {
      return { ok: false, message: `No stock record found for ${rec.skuId} in ${rec.sourceWarehouseName}.` }
    }

    const sourceAvailable = Math.max(0, sourceStock.quantity - sourceStock.reserved)
    if (sourceAvailable < rec.suggestedQuantity) {
      return {
        ok: false,
        message: `Insufficient available stock in ${rec.sourceWarehouseName}: only ${sourceAvailable} unreserved units.`,
      }
    }

    const sourceBinId = sourceStock.binId
    const destWhItems = state.inventory.filter(
      (i) => i.skuId === rec.skuId && (i.warehouseId || 'WH-HYD-01') === rec.destinationWarehouseId && !i.archived
    )
    const destBin = destWhItems[0]?.binId
      ? state.bins.find((b) => b.id === destWhItems[0].binId)
      : state.bins.find((b) => (b.warehouseId || 'WH-HYD-01') === rec.destinationWarehouseId)

    if (!destBin) {
      return { ok: false, message: `No destination bin found in ${rec.destinationWarehouseName}.` }
    }

    // Request transfer
    const reqRes = state.requestInterWarehouseTransfer({
      sourceWarehouseId: rec.sourceWarehouseId,
      destinationWarehouseId: rec.destinationWarehouseId,
      sourceBinId,
      destinationBinId: destBin.id,
      skuId: rec.skuId,
      quantity: rec.suggestedQuantity,
      requestedBy: 'Analyst / Optimization Engine',
      notes: `Network rebalancing: ${rec.reason}`,
    })

    if (!reqRes.ok || !reqRes.transfer) {
      return { ok: false, message: reqRes.message }
    }

    // Automatically approve the requested transfer
    const approveRes = state.approveInterWarehouseTransfer(reqRes.transfer.id, 'Manager Jordan Mitchell')
    if (!approveRes.ok) {
      return { ok: false, message: approveRes.message }
    }

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Inter-Warehouse Rebalancing Approved',
      detail: `Transfer ${reqRes.transfer.id} approved: ${rec.suggestedQuantity} units of ${rec.skuId} from ${rec.sourceWarehouseName} to ${rec.destinationWarehouseName} (${rec.distanceKm} km).`,
      source: 'manager',
      tone: 'blue',
    }

    set((s) => ({
      dismissedRecommendationIds: [...s.dismissedRecommendationIds, recommendationId],
      liveAlerts: [alert, ...s.liveAlerts].slice(0, 10),
    }))

    return {
      ok: true,
      message: `Rebalancing transfer approved! ${rec.suggestedQuantity} units reserved at ${rec.sourceWarehouseName}. Track transit in Multi-Warehouse tab.`,
      transferId: reqRes.transfer.id,
    }
  },

  setReplenishmentSafetyStockConfig: (config) => {
    set((state) => ({
      replenishmentSafetyStockConfig: { ...state.replenishmentSafetyStockConfig, ...config },
    }))
  },

  getIntelligentReplenishmentRecommendations: (warehouseId) => {
    const state = get()
    const targetWhId = warehouseId || state.selectedWarehouseId || 'WH-HYD-01'
    const recs = calculateReplenishmentRecommendations({
      warehouseId: targetWhId,
      inventory: state.inventory,
      skus: state.skus,
      bins: state.bins,
      warehouses: state.warehouses,
      sales: state.salesHistory,
      movements: state.movements,
      replenishmentRequests: state.replenishmentRequests,
      interWarehouseTransfers: state.interWarehouseTransfers,
      config: state.replenishmentSafetyStockConfig,
    })
    return recs.filter((r) => !state.dismissedReplenishmentRecommendationIds.includes(r.id))
  },

  approveReplenishmentRecommendation: (recommendationId, overrides) => {
    const state = get()
    const targetWhId = overrides?.warehouseId || state.selectedWarehouseId || 'WH-HYD-01'
    let recs = state.getIntelligentReplenishmentRecommendations(targetWhId)
    let rec = recs.find((r) => r.id === recommendationId)
    if (!rec) {
      for (const wh of state.warehouses) {
        if (wh.id !== targetWhId) {
          const altRecs = state.getIntelligentReplenishmentRecommendations(wh.id)
          const found = altRecs.find((r) => r.id === recommendationId)
          if (found) {
            rec = found
            break
          }
        }
      }
    }
    if (!rec) {
      return { ok: false, message: `Replenishment recommendation ${recommendationId} not found.` }
    }

    const qty = overrides?.quantity || rec.recommendedQuantity
    const supplier = overrides?.supplier || rec.supplierName || 'Primary Supplier'

    if (rec.strategy === 'supplier_replenishment') {
      const res = state.createReplenishmentRequest({
        skuId: rec.skuId,
        binId: rec.targetBinId,
        warehouseId: rec.warehouseId,
        quantity: qty,
        supplier,
        expectedDate: new Date(Date.now() + (rec.calculations.leadTimeDays || 3) * 86400000)
          .toISOString()
          .slice(0, 10),
        note: overrides?.note || `Approved intelligent reorder: ${rec.reason}`,
        urgency: rec.urgency,
        recommendationId: rec.id,
        preventDuplicates: true,
      })
      if (!res.ok) {
        return { ok: false, message: res.message }
      }
      set((s) => ({
        dismissedReplenishmentRecommendationIds: [
          ...s.dismissedReplenishmentRecommendationIds,
          recommendationId,
        ],
      }))
      return {
        ok: true,
        message: `Purchase order ${res.request?.id} created for ${qty} units to ${supplier}. Staged in Supplier Portal.`,
        requestId: res.request?.id,
      }
    } else {
      if (!rec.sourceWarehouseId || !rec.sourceBinId) {
        return { ok: false, message: 'Source warehouse and bay location required for inter-warehouse transfer.' }
      }

      // Ensure destination bin is valid and not occupied by an incompatible SKU
      let destBinId = rec.targetBinId
      const destWhBins = state.bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === rec.warehouseId)
      const currentDestBin = destWhBins.find((b) => b.id === destBinId)
      const destStock = state.inventory.find(
        (i) => i.binId === destBinId && (i.warehouseId || 'WH-HYD-01') === rec.warehouseId && !i.archived
      )
      if (!currentDestBin || (destStock && destStock.quantity > 0 && destStock.skuId !== rec.skuId)) {
        const altEmptyBin = destWhBins.find((b) => {
          const occ = state.inventory.find(
            (i) => i.binId === b.id && (i.warehouseId || 'WH-HYD-01') === rec.warehouseId && i.quantity > 0 && !i.archived
          )
          return !occ && (!b.skuId || b.skuId === rec.skuId || b.quantity === 0)
        })
        if (altEmptyBin) destBinId = altEmptyBin.id
      }

      const reqRes = state.requestInterWarehouseTransfer({
        sourceWarehouseId: rec.sourceWarehouseId,
        destinationWarehouseId: rec.warehouseId,
        sourceBinId: rec.sourceBinId,
        destinationBinId: destBinId,
        skuId: rec.skuId,
        quantity: qty,
        requestedBy: 'Manager Jordan Mitchell',
        notes: `Intelligent replenishment transfer: ${rec.reason}`,
      })
      if (!reqRes.ok || !reqRes.transfer) {
        return { ok: false, message: reqRes.message }
      }
      state.approveInterWarehouseTransfer(reqRes.transfer.id, 'Manager Jordan Mitchell')
      set((s) => ({
        dismissedReplenishmentRecommendationIds: [
          ...s.dismissedReplenishmentRecommendationIds,
          recommendationId,
        ],
      }))
      return {
        ok: true,
        message: `Inter-warehouse transfer ${reqRes.transfer.id} staged & approved: ${qty} units allocated from ${rec.sourceWarehouseName}.`,
        transferId: reqRes.transfer.id,
      }
    }
  },

  dismissReplenishmentRecommendation: (id) => {
    set((s) => ({
      dismissedReplenishmentRecommendationIds: [...s.dismissedReplenishmentRecommendationIds, id],
    }))
  },

  setRoutingAlgorithm: (routingAlgorithm) => {
    set({ routingAlgorithm })
    const state = get()
    if (state.activeRoutePreview) {
      state.calculatePickRoute({ algorithm: routingAlgorithm })
    }
  },

  toggleAisleBlock: (warehouseId, aisle) => {
    const state = get()
    const current = state.blockedAislesByWarehouse[warehouseId] || []
    const updated = current.includes(aisle)
      ? current.filter((a) => a !== aisle)
      : [...current, aisle].sort((a, b) => a - b)

    set({
      blockedAislesByWarehouse: {
        ...state.blockedAislesByWarehouse,
        [warehouseId]: updated,
      },
    })

    if (state.activeRoutePreview && state.activeRoutePreview.warehouseId === warehouseId) {
      get().calculatePickRoute({ warehouseId })
    }
  },

  calculatePickRoute: (options) => {
    const state = get()
    const targetWhId = options?.warehouseId || state.selectedWarehouseId || 'WH-HYD-01'
    const targetOrder = state.pickOrder
    const algo = options?.algorithm || state.routingAlgorithm || 'astar'
    const blockedAisles = state.blockedAislesByWarehouse[targetWhId] || []

    const preview = optimizePickRoute({
      warehouseId: targetWhId,
      order: targetOrder,
      bins: state.bins,
      skus: state.skus,
      blockedAisles,
      algorithm: algo,
    })

    set({ activeRoutePreview: preview })
    return preview
  },

  applyOptimizedRoute: (orderId) => {
    const state = get()
    let preview = state.activeRoutePreview
    if (!preview || (orderId && preview.orderId !== orderId)) {
      preview = state.calculatePickRoute({ orderId })
    }

    if (!preview.reachable) {
      return {
        ok: false,
        message: `Cannot apply route: unreachable stops (${preview.unreachableBins.join(', ')}) in blocked areas.`,
      }
    }

    if (preview.stops.length === 0) {
      return { ok: false, message: 'No stops to optimize.' }
    }

    // Reorder pickOrder lines to follow preview.optimizedStopSequence
    const currentLines = [...state.pickOrder.lines]
    const reorderedLines: typeof currentLines = []
    const visitedLineIds = new Set<string>()

    for (const binId of preview.optimizedStopSequence) {
      const matchingLines = currentLines.filter((l) => l.binId === binId && !visitedLineIds.has(l.id))
      for (const line of matchingLines) {
        reorderedLines.push(line)
        visitedLineIds.add(line.id)
      }
    }

    // Append any remaining lines not visited
    for (const line of currentLines) {
      if (!visitedLineIds.has(line.id)) {
        reorderedLines.push(line)
        visitedLineIds.add(line.id)
      }
    }

    const nextPendingIndex = reorderedLines.findIndex((l) => l.picked < l.requested)
    const newStopIndex = nextPendingIndex >= 0 ? nextPendingIndex : 0

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Pick Route 2-Opt Optimization Applied',
      detail: `Alex Morgan's pick sequence reordered to optimal TSP path. Saved ${preview.distanceSavedMeters}m (${preview.percentageDistanceSaved}%).`,
      source: 'picker',
      tone: 'blue',
    }

    set({
      pickOrder: {
        ...state.pickOrder,
        lines: reorderedLines,
        currentStopIndex: newStopIndex,
      },
      selectedBinId: reorderedLines[newStopIndex]?.binId || state.selectedBinId,
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    })

    return {
      ok: true,
      message: `Pick sequence optimized! Walking distance reduced by ${preview.distanceSavedMeters}m (${preview.percentageDistanceSaved}%).`,
    }
  },

  cancelRoutePreview: () => {
    set({ activeRoutePreview: null })
  },

}))

export { getStockStatus }
