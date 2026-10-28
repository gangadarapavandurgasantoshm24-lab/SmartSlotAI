import type { UserRole } from '../types'

declare global {
  interface Window {
    __SMARTSLOT_ROLE__?: UserRole
    __SMARTSLOT_PORT__?: number
  }
}

export function detectCurrentRole(): UserRole {
  if (typeof window === 'undefined') return 'manager'

  // 1. Explicit injection by dev server
  if (window.__SMARTSLOT_ROLE__) {
    return window.__SMARTSLOT_ROLE__
  }

  // 2. Detection by port
  const port = window.location.port
  if (port === '5173') return 'picker'
  if (port === '5174') return 'supplier'
  if (port === '5175') return 'manager'
  if (port === '5176') return 'analyst'

  // 3. Detection by URL query param (?role=picker / supplier / manager / analyst)
  const urlParam = new URLSearchParams(window.location.search).get('role')
  if (urlParam === 'picker' || urlParam === 'supplier' || urlParam === 'manager' || urlParam === 'analyst') {
    return urlParam
  }

  return 'manager'
}
