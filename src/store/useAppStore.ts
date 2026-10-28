import { create } from 'zustand'
import { activePickOrder, inventory, skus, warehouseBins } from '../data/mockData'
import { getAvailableQuantity, getBoxId, getStockStatus } from '../data/inventoryUtils'
import type { Bin, BinIssueType, InventoryItem, PickBinIssue, PickOrder, PickOrderLine, PickTransactionResult, ScreenId, StockMovement, ReplenishmentRequest, ReplenishmentResult, SupplierResponseKind, ReplenishmentEvent, ReplenishmentReceipt, OptimizationConfig, OptimizationRun, LiveSystemAlert, AnalystLiveMetrics, CoPlacementOrder } from '../types'
import { getReceivedQuantity, validatePositiveQuantity, validateSupplierResponse } from '../data/replenishmentUtils'
import { buildOptimizationRun, validateOptimizationApproval } from '../data/optimizationEngine'

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
  createReplenishmentRequest: (input: { skuId: string; binId: string; quantity: number; supplier: string; expectedDate: string; note?: string }) => ReplenishmentResult
  respondToReplenishment: (requestId: string, kind: SupplierResponseKind, confirmedQuantity: number, expectedDate: string, note: string) => ReplenishmentResult
  dispatchReplenishment: (requestId: string) => ReplenishmentResult
  receiveReplenishment: (requestId: string, delivered: number, accepted: number, transactionId: string) => ReplenishmentResult
  setOptimizationConfig: (config: OptimizationConfig) => void
  runOptimization: () => OptimizationRun
  approveOptimization: (manager: string) => { ok: boolean; message: string; run?: OptimizationRun }
  dispatchPickTask: (input: { skuId: string; binId: string; quantity: number; priority?: 'High' | 'Normal' | 'Low'; notes?: string }) => { ok: boolean; message: string; lineId?: string }
  proposeCoPlacementOrder: (order: Omit<CoPlacementOrder, 'id' | 'createdAt' | 'status'>) => CoPlacementOrder
  approveCoPlacementOrder: (orderId: string, pickerName?: string) => { ok: boolean; message: string }
  completeCoPlacementOrder: (orderId: string) => { ok: boolean; message: string }
  dismissAlert: (id: string) => void
  addAlert: (alert: Omit<LiveSystemAlert, 'id' | 'timestamp'>) => void
}

function validateQuantity(quantity: number): string | null {
  if (!Number.isInteger(quantity) || quantity <= 0) return 'Enter a positive whole-number quantity.'
  return null
}

function newMovement(binId: string, skuId: string, type: StockMovement['type'], quantity: number): StockMovement {
  return { id: `MOV-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, binId, skuId, type, quantity, timestamp: new Date().toISOString(), source: 'digital-twin-demo' }
}

function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'dashboard',
  selectedBinId: 'C-06-02',
  bins: warehouseBins,
  inventory,
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
  setScreen: (screen) => set({ screen }),
  selectBin: (selectedBinId) => set({ selectedBinId }),
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
    const item = state.inventory.find((entry) => entry.binId === input.binId && entry.skuId === input.skuId)
    if (!item) return { ok: false, message: 'The selected SKU and bin do not have a matching inventory record.' }
    if (!item.available) return { ok: false, message: 'Cannot replenish an unavailable bin.' }
    if (!input.supplier.trim()) return { ok: false, message: 'Select a supplier for this request.' }
    const now = new Date().toISOString()
    const id = newId('SR')
    const event: ReplenishmentEvent = { id: newId('EVT'), at: now, actor: 'Manager', label: `Request created for ${input.quantity} units`, ...(input.note?.trim() ? { note: input.note.trim() } : {}) }
    const request: ReplenishmentRequest = { id, skuId: input.skuId, binId: input.binId, quantity: input.quantity, supplier: input.supplier.trim(), createdAt: now, expectedDate: input.expectedDate, status: 'Submitted', confirmedQuantity: null, responseNote: '', receipts: [], timeline: [event] }
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
  receiveReplenishment: (requestId, delivered, accepted, transactionId) => {
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
    const event: ReplenishmentEvent = { id: newId('EVT'), at: receipt.timestamp, actor: 'Manager', label: `${receiptId}: ${delivered} delivered · ${accepted} accepted${receipt.rejected ? ` · ${receipt.rejected} rejected` : ''}` }
    const updated: ReplenishmentRequest = { ...request, receipts, status, timeline: [...request.timeline, event] }
    const movement: StockMovement | null = accepted > 0 ? { id: receiptId, binId: request.binId, skuId: request.skuId, type: 'receive', quantity: accepted, timestamp: receipt.timestamp, source: 'digital-twin-demo' } : null
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
  completeCoPlacementOrder: (orderId) => {
    const current = get().coPlacementOrders.find((o) => o.id === orderId)
    if (!current) return { ok: false, message: 'Co-placement order not found.' }

    const targetBin = current.skuA.targetBin
    const oldBin = current.skuA.currentBin
    const skuId = current.skuA.id

    // Update inventory to reflect the relocated SKU A
    const updatedInventory = get().inventory.map((inv) => {
      if (inv.skuId === skuId && inv.binId === oldBin) {
        return { ...inv, binId: targetBin, updated: new Date().toISOString() }
      }
      return inv
    })

    const alert: LiveSystemAlert = {
      id: newId('ALT'),
      timestamp: new Date().toISOString(),
      title: 'Co-Placement Relocation Completed by Picker!',
      detail: `Worker Alex Morgan confirmed re-slotting of ${current.skuA.name} into Box ${current.skuA.targetBoxId} (${targetBin}) adjacent to ${current.skuB.name}. Sales lift tracking active!`,
      source: 'picker',
      tone: 'green',
    }

    set((state) => ({
      inventory: updatedInventory,
      coPlacementOrders: state.coPlacementOrders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'Completed by Picker',
              pickerCompletedAt: new Date().toISOString(),
            }
          : o
      ),
      movements: [
        newMovement(targetBin, skuId, 'receive', 15),
        ...state.movements,
      ],
      liveAlerts: [alert, ...state.liveAlerts].slice(0, 10),
    }))

    return { ok: true, message: `Co-placement ${orderId} confirmed and warehouse layout updated!` }
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
}))

export { getStockStatus }
