import { create } from 'zustand'
import { activePickOrder, inventory, skus, warehouseBins } from '../data/mockData'
import { getAvailableQuantity, getStockStatus } from '../data/inventoryUtils'
import type { Bin, BinIssueType, InventoryItem, PickBinIssue, PickOrder, PickTransactionResult, ScreenId, StockMovement, ReplenishmentRequest, ReplenishmentResult, SupplierResponseKind, ReplenishmentEvent, ReplenishmentReceipt, OptimizationConfig, OptimizationRun } from '../types'
import { getReceivedQuantity, validatePositiveQuantity, validateSupplierResponse } from '../data/replenishmentUtils'
import { buildOptimizationRun, validateOptimizationApproval } from '../data/optimizationEngine'

const initialOptimizationConfig: OptimizationConfig = { weights: { travelDistance: 35, cubeUtilization: 20, goldenZone: 25, skuAffinity: 20 }, preferGoldenZone: true }

interface AppState { screen: ScreenId; selectedBinId: string; bins: Bin[]; inventory: InventoryItem[]; movements: StockMovement[]; pickOrder: PickOrder; pickIssues: PickBinIssue[]; replenishmentRequests: ReplenishmentRequest[]; processedReceiptTransactionIds: string[]; processedPickTransactionIds: string[]; lastPickResult: PickTransactionResult | null; optimizationConfig: OptimizationConfig; optimizationRun: OptimizationRun | null; optimizationHistory: OptimizationRun[]; setScreen: (screen: ScreenId) => void; selectBin: (id: string) => void; simulatePick: (binId: string, quantity: number) => string; receiveStock: (binId: string, quantity: number) => string; confirmPick: (lineId: string, quantity: number, transactionId: string) => PickTransactionResult; selectPickStop: (lineId: string) => void; nextPendingStop: () => void; reportPickIssue: (type: BinIssueType, description: string, manualCount?: number) => PickBinIssue | null; createReplenishmentRequest: (input: { skuId: string; binId: string; quantity: number; supplier: string; expectedDate: string; note?: string }) => ReplenishmentResult; respondToReplenishment: (requestId: string, kind: SupplierResponseKind, confirmedQuantity: number, expectedDate: string, note: string) => ReplenishmentResult; dispatchReplenishment: (requestId: string) => ReplenishmentResult; receiveReplenishment: (requestId: string, delivered: number, accepted: number, transactionId: string) => ReplenishmentResult; setOptimizationConfig: (config: OptimizationConfig) => void; runOptimization: () => OptimizationRun; approveOptimization: (manager: string) => { ok: boolean; message: string; run?: OptimizationRun } }

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
  screen: 'dashboard', selectedBinId: 'C-06-02', bins: warehouseBins, inventory, movements: [], pickOrder: activePickOrder, pickIssues: [], replenishmentRequests: [], processedReceiptTransactionIds: [], processedPickTransactionIds: [], lastPickResult: null, optimizationConfig: initialOptimizationConfig, optimizationRun: null, optimizationHistory: [],
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
    const result: PickTransactionResult = { ok: true, kind: 'success', message: `Pick confirmed · ${quantity} unit${quantity === 1 ? '' : 's'} picked from ${line.binId}.`, binId: line.binId, skuId: line.skuId, quantity, remaining: updatedItem.quantity, lowStock }
    const movement: StockMovement = { id: newId('MOV'), binId: line.binId, skuId: line.skuId, type: 'pick', quantity, timestamp: new Date().toISOString(), source: 'picker-workspace' }
    set({ selectedBinId: updatedLines[currentStopIndex]?.binId ?? line.binId, inventory: state.inventory.map((entry) => entry.binId === updatedItem.binId ? updatedItem : entry), movements: [movement, ...state.movements], pickOrder: { ...state.pickOrder, lines: updatedLines, status: completed ? 'Complete' : 'In progress', currentStopIndex: currentStopIndex < 0 ? 0 : currentStopIndex }, processedPickTransactionIds: [...state.processedPickTransactionIds, transactionId], lastPickResult: result })
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
    set({ pickIssues: [issue, ...state.pickIssues], pickOrder: { ...state.pickOrder, status: 'Paused' } })
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
    set((current) => ({ replenishmentRequests: [request, ...current.replenishmentRequests] }))
    return { ok: true, message: `${id} submitted to ${request.supplier}. On-hand inventory was not changed.`, request }
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
    set((state) => ({ replenishmentRequests: state.replenishmentRequests.map((entry) => entry.id === requestId ? updated : entry) }))
    return { ok: true, message: `Supplier response recorded for ${requestId}. On-hand inventory was not changed.`, request: updated }
  },
  dispatchReplenishment: (requestId) => {
    const request = get().replenishmentRequests.find((entry) => entry.id === requestId)
    if (!request) return { ok: false, message: 'Replenishment request not found.' }
    if (!['Confirmed full', 'Partial offer', 'Delayed'].includes(request.status) || !request.confirmedQuantity) return { ok: false, message: 'A positive supplier-confirmed quantity is required before dispatch.' }
    const at = new Date().toISOString()
    const event: ReplenishmentEvent = { id: newId('EVT'), at, actor: 'Supplier', label: 'Dispatched · in transit' }
    const updated = { ...request, status: 'In transit' as const, dispatchedAt: at, timeline: [...request.timeline, event] }
    set((state) => ({ replenishmentRequests: state.replenishmentRequests.map((entry) => entry.id === requestId ? updated : entry) }))
    return { ok: true, message: `${requestId} marked in transit. On-hand inventory was not changed.`, request: updated }
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
    set({ replenishmentRequests: state.replenishmentRequests.map((entry) => entry.id === requestId ? updated : entry), inventory: state.inventory.map((entry) => entry.binId === request.binId && entry.skuId === request.skuId ? { ...entry, quantity: entry.quantity + accepted, updated: receipt.timestamp } : entry), movements: movement ? [movement, ...state.movements] : state.movements, processedReceiptTransactionIds: [...state.processedReceiptTransactionIds, transactionId] })
    return { ok: true, message: `${receiptId} recorded: ${accepted} accepted units added to on-hand stock${receipt.rejected ? `; ${receipt.rejected} rejected` : ''}.`, request: updated, receipt }
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
    set({ optimizationRun: approved, optimizationHistory: [...state.optimizationHistory.filter((entry) => entry.id !== approved.id), approved] })
    return { ok: true, message: `Revision R${String(approved.revision).padStart(2, '0')} approved. Physical inventory remains unchanged.`, run: approved }
  },
}))

export { getStockStatus }
