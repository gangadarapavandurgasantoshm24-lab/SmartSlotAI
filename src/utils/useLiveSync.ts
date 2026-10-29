import { useEffect } from 'react'
import { useAppStore } from '../store/useAppStore'

let isReceivingRemoteSync = false

export function useLiveSync() {
  const store = useAppStore

  useEffect(() => {
    if (typeof window === 'undefined' || !window.EventSource) return

    fetch('/api/state')
      .then((r) => r.json())
      .then((payload) => {
        if (payload && Object.keys(payload).length > 0) {
          isReceivingRemoteSync = true
          store.setState((prev) => ({ ...prev, ...payload }))
          setTimeout(() => {
            isReceivingRemoteSync = false
          }, 50)
        }
      })
      .catch(() => {})

    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/api/events')

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data && data.type === 'SYNC_STATE' && data.payload) {
            isReceivingRemoteSync = true
            store.setState((prev) => ({
              ...prev,
              ...data.payload,
            }))
            // Reset flag on next tick
            setTimeout(() => {
              isReceivingRemoteSync = false
            }, 50)
          }
        } catch {
          // Ignore parse errors from SSE ping
        }
      }
    } catch {
      // Offline / standalone mode
    }

    // Subscribe to local state mutations and push to other ports
    let debounceTimer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = store.subscribe((state, prevState) => {
      if (isReceivingRemoteSync) return

      // Check if syncable slices changed
      const inventoryChanged = state.inventory !== prevState.inventory
      const requestsChanged = state.replenishmentRequests !== prevState.replenishmentRequests
      const orderChanged = state.pickOrder !== prevState.pickOrder
      const movementsChanged = state.movements !== prevState.movements
      const issuesChanged = state.pickIssues !== prevState.pickIssues
      const alertsChanged = state.liveAlerts !== prevState.liveAlerts
      const metricsChanged = state.analystMetrics !== prevState.analystMetrics
      const skusChanged = state.skus !== prevState.skus
      const transfersChanged = state.transferTasks !== prevState.transferTasks

      if (inventoryChanged || requestsChanged || orderChanged || movementsChanged || issuesChanged || alertsChanged || metricsChanged || skusChanged || transfersChanged) {
        if (debounceTimer) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          broadcastStateChange({
            inventory: state.inventory,
            replenishmentRequests: state.replenishmentRequests,
            pickOrder: state.pickOrder,
            movements: state.movements,
            pickIssues: state.pickIssues,
            lastPickResult: state.lastPickResult,
            liveAlerts: state.liveAlerts,
            analystMetrics: state.analystMetrics,
            skus: state.skus,
            transferTasks: state.transferTasks,
          })
        }, 30)
      }
    })

    return () => {
      eventSource?.close()
      unsubscribe()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [store])
}

export function broadcastStateChange(payload: Record<string, unknown>) {
  if (typeof window === 'undefined') return
  try {
    fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'SYNC_STATE', payload }),
    }).catch(() => {})
  } catch {
    // Ignore network errors in local dev
  }
}
