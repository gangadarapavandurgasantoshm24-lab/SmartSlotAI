import type { ReplenishmentRequest, SupplierResponseKind } from '../types'

export function validatePositiveQuantity(quantity: number): string | null {
  return Number.isInteger(quantity) && quantity > 0 ? null : 'Enter a positive whole-number quantity.'
}

export function validateSupplierResponse(kind: SupplierResponseKind, confirmed: number, requested: number): string | null {
  if (!Number.isInteger(confirmed) || confirmed < 0) return 'Confirmed quantity must be a non-negative whole number.'
  if (confirmed > requested) return 'Confirmed quantity cannot exceed the requested quantity.'
  if (kind === 'full' && confirmed !== requested) return 'Full availability must match the requested quantity.'
  if (kind === 'partial' && (confirmed <= 0 || confirmed >= requested)) return 'A partial offer must be greater than zero and less than the requested quantity.'
  if (kind === 'unavailable' && confirmed !== 0) return 'Unavailable responses must confirm zero units.'
  if (kind === 'delayed' && confirmed === 0) return 'Enter the quantity expected after the delay.'
  return null
}

export function getIncomingQuantity(request: ReplenishmentRequest): number {
  if (request.confirmedQuantity === null || !['Confirmed full', 'Partial offer', 'Delayed', 'In transit', 'Partially received'].includes(request.status)) return 0
  return Math.max(0, request.confirmedQuantity - request.receipts.reduce((sum, receipt) => sum + receipt.delivered, 0))
}

export function getReceivedQuantity(request: ReplenishmentRequest): number {
  return request.receipts.reduce((sum, receipt) => sum + receipt.delivered, 0)
}

export function getAcceptedQuantity(request: ReplenishmentRequest): number {
  return request.receipts.reduce((sum, receipt) => sum + receipt.accepted, 0)
}
