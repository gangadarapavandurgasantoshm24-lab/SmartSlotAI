import type { UserRole } from '../types'

declare global {
  interface Window {
    __SMARTSLOT_ROLE__?: UserRole
    __SMARTSLOT_PORT__?: number
  }
}

export function detectCurrentRole(): UserRole {
  if (typeof window === 'undefined') return 'manager'

  // 1. Explicit selection by URL query param (?role=manager / picker / supplier / analyst)
  const urlParam = new URLSearchParams(window.location.search).get('role')
  if (urlParam === 'picker' || urlParam === 'supplier' || urlParam === 'manager' || urlParam === 'analyst') {
    return urlParam
  }

  // 2. Explicit injection by dev-all multi-port server
  if (window.__SMARTSLOT_ROLE__) {
    return window.__SMARTSLOT_ROLE__
  }

  // 3. Port detection when running under multi-port dev server without script injection
  const port = window.location.port
  if (port === '5174') return 'supplier'
  if (port === '5175') return 'manager'
  if (port === '5176') return 'analyst'

  // 4. Default for single-port mode (dev:single, port 5173 or other) is manager
  return 'manager'
}
