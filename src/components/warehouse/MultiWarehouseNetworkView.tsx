import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  CheckCircle2,
  Compass,
  Filter,
  Info,
  RefreshCw,
  Search,
  Send,
  Truck,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Badge, Button, Card } from '../ui'
import { DEMO_WAREHOUSE_DISCLAIMER } from '../../data/multiWarehouseData'
import { calculateWarehouseKpis } from '../../data/multiWarehouseEngine'
import type { InterWarehouseTransfer } from '../../types'

export function MultiWarehouseNetworkView() {
  const warehouses = useAppStore((state) => state.warehouses)
  const inventory = useAppStore((state) => state.inventory)
  const bins = useAppStore((state) => state.bins)
  const skus = useAppStore((state) => state.skus)
  const transfers = useAppStore((state) => state.interWarehouseTransfers)
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId)
  const setSelectedWarehouseId = useAppStore((state) => state.setSelectedWarehouseId)
  const setScreen = useAppStore((state) => state.setScreen)

  const requestInterWarehouseTransfer = useAppStore((state) => state.requestInterWarehouseTransfer)
  const approveInterWarehouseTransfer = useAppStore((state) => state.approveInterWarehouseTransfer)
  const dispatchInterWarehouseTransfer = useAppStore((state) => state.dispatchInterWarehouseTransfer)
  const receiveInterWarehouseTransfer = useAppStore((state) => state.receiveInterWarehouseTransfer)
  const cancelInterWarehouseTransfer = useAppStore((state) => state.cancelInterWarehouseTransfer)
  const searchGlobalSku = useAppStore((state) => state.searchGlobalSku)
  const getWarehouseAvailability = useAppStore((state) => state.getWarehouseAvailability)
  const getNetworkRebalancingRecommendations = useAppStore(
    (state) => state.getNetworkRebalancingRecommendations
  )

  // Filters & Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState('ALL')
  const [selectedHealthFilter, setSelectedHealthFilter] = useState<'All' | 'Available' | 'Low stock' | 'Critical' | 'Empty'>('All')
  const [requestedFulfillmentQty, setRequestedFulfillmentQty] = useState<number>(10)
  const [activeTab, setActiveTab] = useState<'search' | 'transfers' | 'rebalancing'>('search')
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)

  // Modals state
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)
  const [transferSourceWh, setTransferSourceWh] = useState('WH-VJA-02')
  const [transferDestWh, setTransferDestWh] = useState('WH-HYD-01')
  const [transferSkuId, setTransferSkuId] = useState('SKU-2084')
  const [transferSourceBin, setTransferSourceBin] = useState('')
  const [transferDestBin, setTransferDestBin] = useState('')
  const [transferQty, setTransferQty] = useState<number>(10)
  const [transferNotes, setTransferNotes] = useState('')

  const [receiveModalTransfer, setReceiveModalTransfer] = useState<InterWarehouseTransfer | null>(null)
  const [receivedQtyInput, setReceivedQtyInput] = useState<number>(0)
  const [discrepancyReasonInput, setDiscrepancyReasonInput] = useState('')

  // Calculate Warehouse KPI cards
  const warehouseKpis = useMemo(() => {
    return warehouses.map((wh) => {
      const kpis = calculateWarehouseKpis({
        warehouseId: wh.id,
        inventory,
        bins,
        transfers,
      })
      return { ...wh, kpis }
    })
  }, [warehouses, inventory, bins, transfers])

  // Global search results
  const searchResults = useMemo(() => {
    return searchGlobalSku({
      query: searchQuery,
      warehouseId: selectedFacilityFilter,
      stockHealth: selectedHealthFilter,
      requestedQuantity: requestedFulfillmentQty,
    })
  }, [searchGlobalSku, searchQuery, selectedFacilityFilter, selectedHealthFilter, requestedFulfillmentQty])

  // Availability assessment for search query if exact SKU matched
  const activeAvailability = useMemo(() => {
    const trimmed = searchQuery.trim().toUpperCase()
    const matchingSku = skus.find((s) => s.id === trimmed || s.name.toUpperCase().includes(trimmed))
    if (!matchingSku) return null
    return getWarehouseAvailability(
      matchingSku.id,
      requestedFulfillmentQty,
      selectedWarehouseId || 'WH-HYD-01'
    )
  }, [searchQuery, skus, getWarehouseAvailability, requestedFulfillmentQty, selectedWarehouseId])

  // Network rebalancing recommendations
  const rebalancingRecommendations = useMemo(() => {
    return getNetworkRebalancingRecommendations()
  }, [getNetworkRebalancingRecommendations])

  // Auto-fill source & dest bins when modal opens or selections change
  const availableSourceBins = useMemo(() => {
    return bins.filter(
      (b) => (b.warehouseId || 'WH-HYD-01') === transferSourceWh && b.skuId === transferSkuId
    )
  }, [bins, transferSourceWh, transferSkuId])

  const availableDestBins = useMemo(() => {
    return bins.filter(
      (b) =>
        (b.warehouseId || 'WH-HYD-01') === transferDestWh &&
        (b.skuId === transferSkuId || b.quantity === 0)
    )
  }, [bins, transferDestWh, transferSkuId])

  function handleOpenTransferModal(preset?: {
    skuId?: string
    sourceWarehouseId?: string
    destinationWarehouseId?: string
    suggestedQty?: number
  }) {
    if (preset) {
      if (preset.skuId) setTransferSkuId(preset.skuId)
      if (preset.sourceWarehouseId) setTransferSourceWh(preset.sourceWarehouseId)
      if (preset.destinationWarehouseId) setTransferDestWh(preset.destinationWarehouseId)
      if (preset.suggestedQty) setTransferQty(preset.suggestedQty)
    }
    setIsTransferModalOpen(true)
    setMessage(null)
  }

  function handleCreateTransfer() {
    const sBin = transferSourceBin || availableSourceBins[0]?.id || ''
    const dBin = transferDestBin || availableDestBins[0]?.id || ''
    if (!sBin) {
      setMessage({ text: 'Please select a valid source bin with stock.', success: false })
      return
    }
    if (!dBin) {
      setMessage({ text: 'Please select a compatible destination storage bin.', success: false })
      return
    }
    const result = requestInterWarehouseTransfer({
      sourceWarehouseId: transferSourceWh,
      destinationWarehouseId: transferDestWh,
      sourceBinId: sBin,
      destinationBinId: dBin,
      skuId: transferSkuId,
      quantity: transferQty,
      requestedBy: 'Manager',
      notes: transferNotes || 'Multi-warehouse rebalancing request',
    })
    setMessage({ text: result.message, success: result.ok })
    if (result.ok) {
      setIsTransferModalOpen(false)
      setActiveTab('transfers')
    }
  }

  function handleApprove(transferId: string) {
    const result = approveInterWarehouseTransfer(transferId, 'Jordan Mitchell (Manager)')
    setMessage({ text: result.message, success: result.ok })
  }

  function handleDispatch(transferId: string) {
    const result = dispatchInterWarehouseTransfer(transferId, 'Fleet Dispatch Dock')
    setMessage({ text: result.message, success: result.ok })
  }

  function handleOpenReceiveModal(t: InterWarehouseTransfer) {
    setReceiveModalTransfer(t)
    setReceivedQtyInput(t.quantity)
    setDiscrepancyReasonInput('')
  }

  function handleConfirmReceive() {
    if (!receiveModalTransfer) return
    const result = receiveInterWarehouseTransfer(
      receiveModalTransfer.id,
      receivedQtyInput,
      'Inbound Receiving Dock',
      discrepancyReasonInput
    )
    setMessage({ text: result.message, success: result.ok })
    if (result.ok) {
      setReceiveModalTransfer(null)
    }
  }

  function handleCancelTransfer(transferId: string) {
    const result = cancelInterWarehouseTransfer(transferId, 'Manager', 'Cancelled by warehouse supervisor')
    setMessage({ text: result.message, success: result.ok })
  }

  function handleInspectIn3D(whId: string) {
    setSelectedWarehouseId(whId)
    setScreen('warehouse')
  }

  return (
    <div className="multi-warehouse-container" style={{ padding: '20px', maxWidth: '1440px', margin: '0 auto' }}>
      {/* Network Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Multi-Warehouse Inventory Network
            </h1>
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                textTransform: 'uppercase',
                padding: '3px 8px',
                borderRadius: '4px',
                background: 'rgba(0, 229, 255, 0.12)',
                color: '#00e5ff',
                border: '1px solid rgba(0, 229, 255, 0.3)',
              }}
            >
              Simulated Network Mode
            </span>
          </div>
          <p style={{ color: '#94a3b8', fontSize: '13px', margin: '6px 0 0 0' }}>
            Search inventory across regional distribution facilities, evaluate stockout alternatives, and manage auditable inter-warehouse transfer workflows.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <Button
            variant="secondary"
            onClick={() => handleOpenTransferModal()}
          >
            <Send size={14} style={{ marginRight: '6px' }} />
            New Transfer Request
          </Button>
        </div>
      </div>

      {/* Synthetic Data Disclaimer Banner */}
      <div
        style={{
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid #1e293b',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
          fontSize: '12px',
          color: '#cbd5e1',
        }}
      >
        <Info size={15} style={{ color: '#38bdf8', flexShrink: 0 }} />
        <span>
          <strong>Data Disclaimer:</strong> {DEMO_WAREHOUSE_DISCLAIMER} No live external WMS connections are altered.
        </span>
      </div>

      {/* Feedback Banner */}
      {message && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '6px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '13px',
            background: message.success ? 'rgba(34, 197, 94, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            color: message.success ? '#4ade80' : '#f87171',
            border: `1px solid ${message.success ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
          }}
        >
          {message.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Warehouse Facility Cards Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {warehouseKpis.map((wh) => {
          const isSelected = wh.id === selectedWarehouseId
          return (
            <Card
              key={wh.id}
              style={{
                borderColor: isSelected ? '#00e5ff' : '#1e293b',
                background: isSelected ? 'rgba(14, 24, 35, 0.95)' : '#0b1320',
                boxShadow: isSelected ? '0 0 16px rgba(0, 229, 255, 0.15)' : 'none',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Building2 size={15} style={{ color: isSelected ? '#00e5ff' : '#94a3b8' }} />
                    <strong style={{ fontSize: '14px', color: '#f8fafc' }}>{wh.name}</strong>
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                    {wh.id} · {wh.city} · {wh.type}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '4px',
                    background: wh.status === 'Active' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                    color: wh.status === 'Active' ? '#4ade80' : '#f87171',
                  }}
                >
                  {wh.status}
                </span>
              </div>

              {/* Capacity Utilization Bar */}
              <div style={{ margin: '14px 0 10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>
                  <span>Capacity Utilization</span>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{wh.kpis.utilization}%</span>
                </div>
                <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${wh.kpis.utilization}%`,
                      background: wh.kpis.utilization > 85 ? '#f59e0b' : '#00e5ff',
                      borderRadius: '3px',
                    }}
                  />
                </div>
              </div>

              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '12px', marginTop: '10px' }}>
                <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 8px', borderRadius: '4px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px', display: 'block' }}>AVAILABLE STOCK</span>
                  <strong style={{ color: '#38bdf8', fontSize: '14px' }}>{wh.kpis.totalAvailable}</strong>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}> / {wh.kpis.totalOnHand} on hand</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 8px', borderRadius: '4px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px', display: 'block' }}>RESERVED UNITS</span>
                  <strong style={{ color: '#f59e0b', fontSize: '14px' }}>{wh.kpis.totalReserved}</strong>
                  <span style={{ fontSize: '10px', color: '#94a3b8' }}> held units</span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 8px', borderRadius: '4px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px', display: 'block' }}>AT-RISK / OOS SKUS</span>
                  <span style={{ fontWeight: 600, color: wh.kpis.lowStockCount > 0 ? '#fbbf24' : '#94a3b8' }}>
                    {wh.kpis.lowStockCount} low · {wh.kpis.outOfStockCount} out
                  </span>
                </div>

                <div style={{ background: 'rgba(15, 23, 42, 0.5)', padding: '6px 8px', borderRadius: '4px' }}>
                  <span style={{ color: '#64748b', fontSize: '10px', display: 'block' }}>ACTIVE TRANSFERS</span>
                  <span style={{ fontWeight: 600, color: '#c084fc' }}>
                    {wh.kpis.inboundTransfers} in · {wh.kpis.outboundTransfers} out
                  </span>
                </div>
              </div>

              {/* Action Link */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                <span style={{ fontSize: '11px', color: '#64748b' }}>{wh.kpis.totalBins} Storage Bins</span>
                <button
                  onClick={() => handleInspectIn3D(wh.id)}
                  style={{
                    background: 'transparent',
                    border: 'none',
                    color: '#00e5ff',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: 0,
                  }}
                >
                  <Compass size={13} />
                  Inspect in 3D
                </button>
              </div>
            </Card>
          )
        })}
      </div>

      {/* Navigation Sub-Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #1e293b', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('search')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'search' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'search' ? '#00e5ff' : '#94a3b8',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Search size={14} />
          Global Inventory Search ({searchResults.length})
        </button>

        <button
          onClick={() => setActiveTab('transfers')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'transfers' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'transfers' ? '#00e5ff' : '#94a3b8',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <Truck size={14} />
          Inter-Warehouse Transfers ({transfers.length})
        </button>

        <button
          onClick={() => setActiveTab('rebalancing')}
          style={{
            background: 'transparent',
            border: 'none',
            borderBottom: activeTab === 'rebalancing' ? '2px solid #00e5ff' : '2px solid transparent',
            color: activeTab === 'rebalancing' ? '#00e5ff' : '#94a3b8',
            padding: '8px 16px',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <RefreshCw size={14} />
          Network Rebalancing Insights ({rebalancingRecommendations.length})
        </button>
      </div>

      {/* TAB 1: Global Inventory Search & Alternative Sourcing */}
      {activeTab === 'search' && (
        <div>
          {/* Search Bar & Filters */}
          <div
            style={{
              background: '#0e1823',
              border: '1px solid #1e3a5f',
              borderRadius: '8px',
              padding: '14px',
              display: 'flex',
              gap: '12px',
              alignItems: 'center',
              flexWrap: 'wrap',
              marginBottom: '16px',
            }}
          >
            <div style={{ flex: '1 1 240px', position: 'relative' }}>
              <Search size={15} style={{ position: 'absolute', left: '10px', top: '10px', color: '#64748b' }} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by SKU (e.g. SKU-2084), Product Name, or City..."
                style={{
                  width: '100%',
                  padding: '7px 10px 7px 32px',
                  background: '#080d16',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  color: '#f8fafc',
                  fontSize: '13px',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Building2 size={14} style={{ color: '#64748b' }} />
              <select
                value={selectedFacilityFilter}
                onChange={(e) => setSelectedFacilityFilter(e.target.value)}
                style={{
                  background: '#080d16',
                  color: '#cbd5e1',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                }}
              >
                <option value="ALL">All Warehouses</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.id} ({w.city})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Filter size={14} style={{ color: '#64748b' }} />
              <select
                value={selectedHealthFilter}
                onChange={(e) => setSelectedHealthFilter(e.target.value as any)}
                style={{
                  background: '#080d16',
                  color: '#cbd5e1',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '12px',
                }}
              >
                <option value="All">All Health Statuses</option>
                <option value="Available">Available Stock Only</option>
                <option value="Low stock">Low Stock</option>
                <option value="Critical">Critical</option>
                <option value="Empty">Empty / Out of Stock</option>
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>Requested Units:</span>
              <input
                type="number"
                min={1}
                value={requestedFulfillmentQty}
                onChange={(e) => setRequestedFulfillmentQty(Math.max(1, parseInt(e.target.value) || 1))}
                style={{
                  width: '60px',
                  background: '#080d16',
                  color: '#f8fafc',
                  border: '1px solid #1e293b',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '12px',
                  textAlign: 'center',
                }}
              />
            </div>
          </div>

          {/* Alternative Warehouse Sourcing Intelligence Card */}
          {activeAvailability && (
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.85)',
                border: '1px solid #00e5ff33',
                borderRadius: '8px',
                padding: '14px 16px',
                marginBottom: '16px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Compass size={16} style={{ color: '#00e5ff' }} />
                    <strong style={{ fontSize: '14px', color: '#f8fafc' }}>
                      Alternative Sourcing Analysis for {activeAvailability.skuName} ({activeAvailability.skuId})
                    </strong>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0 0' }}>
                    Requesting <strong>{activeAvailability.requestedQuantity} units</strong> at preferred warehouse{' '}
                    <strong>{activeAvailability.preferredWarehouseId}</strong> (Current available:{' '}
                    <span style={{ color: activeAvailability.preferredCanFulfill ? '#4ade80' : '#f87171' }}>
                      {activeAvailability.preferredAvailable} units
                    </span>
                    ).
                  </p>
                </div>

                <div>
                  <span
                    style={{
                      fontSize: '12px',
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: '4px',
                      background: activeAvailability.preferredCanFulfill
                        ? 'rgba(34, 197, 94, 0.2)'
                        : activeAvailability.networkCanFulfill
                        ? 'rgba(56, 189, 248, 0.2)'
                        : 'rgba(239, 68, 68, 0.2)',
                      color: activeAvailability.preferredCanFulfill
                        ? '#4ade80'
                        : activeAvailability.networkCanFulfill
                        ? '#38bdf8'
                        : '#f87171',
                    }}
                  >
                    {activeAvailability.preferredCanFulfill
                      ? 'Local Warehouse Can Fulfill'
                      : activeAvailability.networkCanFulfill
                      ? 'Network Sourcing Required'
                      : 'Network Shortage'}
                  </span>
                </div>
              </div>

              {/* Recommended Alternatives Strip */}
              {!activeAvailability.preferredCanFulfill && (
                <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                  {activeAvailability.alternativeWarehouses.length === 0 ? (
                    <div style={{ fontSize: '12px', color: '#f87171' }}>
                      No alternative warehouses hold available stock for this SKU. Consider raising a supplier replenishment request.
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize: '12px', fontWeight: 600, color: '#e2e8f0', marginBottom: '8px' }}>
                        Ranked Viable Alternative Sources:
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '10px' }}>
                        {activeAvailability.alternativeWarehouses.map((alt, idx) => (
                          <div
                            key={alt.warehouseId}
                            style={{
                              background: idx === 0 ? 'rgba(0, 229, 255, 0.08)' : '#080d16',
                              border: `1px solid ${idx === 0 ? '#00e5ff66' : '#1e293b'}`,
                              borderRadius: '6px',
                              padding: '10px 12px',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <strong style={{ fontSize: '13px', color: '#f8fafc' }}>
                                {idx === 0 && '★ Top Pick: '}
                                {alt.warehouseName}
                              </strong>
                              <span style={{ fontSize: '11px', color: '#38bdf8', fontWeight: 600 }}>
                                {alt.availableStock} available
                              </span>
                            </div>
                            <div style={{ fontSize: '11px', color: '#94a3b8', margin: '4px 0' }}>
                              {alt.warehouseCity} · ~{alt.distanceKm} km · ~{alt.leadTimeHours} hrs transit
                            </div>
                            <p style={{ fontSize: '11px', color: '#cbd5e1', margin: '4px 0 8px 0' }}>{alt.reason}</p>
                            <Button
                                                            variant={idx === 0 ? 'primary' : 'secondary'}
                              onClick={() =>
                                handleOpenTransferModal({
                                  skuId: activeAvailability.skuId,
                                  sourceWarehouseId: alt.warehouseId,
                                  destinationWarehouseId: activeAvailability.preferredWarehouseId,
                                  suggestedQty: Math.min(alt.availableStock, activeAvailability.requestedQuantity),
                                })
                              }
                            >
                              Request Inter-Warehouse Transfer
                            </Button>
                          </div>
                        ))}
                      </div>

                      {activeAvailability.isMultiWarehouseSplitPossible && (
                        <div style={{ marginTop: '8px', fontSize: '11px', color: '#fbbf24' }}>
                          * Note: Combined stock across multiple regional warehouses ({activeAvailability.networkTotalAvailable} units) could satisfy your request via split transfers.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Search Results Table */}
          <div style={{ background: '#080d16', border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0e1823', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                  <th style={{ padding: '10px 12px' }}>SKU / Product Name</th>
                  <th style={{ padding: '10px 12px' }}>Warehouse Facility</th>
                  <th style={{ padding: '10px 12px' }}>Bin Location</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>On-Hand</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Reserved</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Available</th>
                  <th style={{ padding: '10px 12px' }}>Stock Health</th>
                  <th style={{ padding: '10px 12px' }}>Fulfill {requestedFulfillmentQty}u?</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {searchResults.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No inventory records match the current search filters.
                    </td>
                  </tr>
                ) : (
                  searchResults.map((row, idx) => (
                    <tr
                      key={`${row.warehouseId}-${row.binId}-${row.skuId}-${idx}`}
                      style={{
                        borderBottom: '1px solid #121c2d',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.3)',
                      }}
                    >
                      <td style={{ padding: '10px 12px' }}>
                        <strong style={{ color: '#f8fafc', display: 'block' }}>{row.skuId}</strong>
                        <span style={{ color: '#94a3b8', fontSize: '11px' }}>{row.skuName}</span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{row.warehouseName}</span>
                        <span style={{ display: 'block', color: '#64748b', fontSize: '10px' }}>
                          {row.warehouseId} · {row.warehouseCity}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', color: '#38bdf8' }}>
                        {row.binId}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                        {row.onHand}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'right', color: row.reserved > 0 ? '#f59e0b' : '#64748b' }}>
                        {row.reserved}
                      </td>
                      <td
                        style={{
                          padding: '10px 12px',
                          textAlign: 'right',
                          fontWeight: 700,
                          color: row.availableStock > 0 ? '#4ade80' : '#f87171',
                        }}
                      >
                        {row.availableStock}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge>{row.stockHealth}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        {row.canFulfill ? (
                          <span style={{ color: '#4ade80', fontWeight: 600, fontSize: '11px' }}>
                            ✓ Full ({row.availableStock})
                          </span>
                        ) : row.availableStock > 0 ? (
                          <span style={{ color: '#fbbf24', fontSize: '11px' }}>
                            Partial ({row.availableStock})
                          </span>
                        ) : (
                          <span style={{ color: '#f87171', fontSize: '11px' }}>Cannot fulfill</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <Button
                                                    variant="secondary"
                          onClick={() =>
                            handleOpenTransferModal({
                              skuId: row.skuId,
                              sourceWarehouseId: row.warehouseId,
                              destinationWarehouseId: selectedWarehouseId !== row.warehouseId ? selectedWarehouseId : 'WH-HYD-01',
                              suggestedQty: Math.min(row.availableStock, requestedFulfillmentQty) || 5,
                            })
                          }
                          disabled={row.availableStock <= 0}
                        >
                          Transfer
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: Inter-Warehouse Transfer Workflow Management */}
      {activeTab === 'transfers' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', color: '#94a3b8' }}>
              Showing {transfers.length} inter-warehouse transfers across network lifecycle.
            </span>
            <Button onClick={() => handleOpenTransferModal()}>
              <Send size={13} style={{ marginRight: '6px' }} />
              Create Transfer
            </Button>
          </div>

          <div style={{ background: '#080d16', border: '1px solid #1e293b', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#0e1823', color: '#94a3b8', borderBottom: '1px solid #1e293b' }}>
                  <th style={{ padding: '10px 12px' }}>Transfer ID</th>
                  <th style={{ padding: '10px 12px' }}>SKU</th>
                  <th style={{ padding: '10px 12px' }}>Source → Destination</th>
                  <th style={{ padding: '10px 12px', textAlign: 'right' }}>Quantity</th>
                  <th style={{ padding: '10px 12px' }}>Transit Lead Time</th>
                  <th style={{ padding: '10px 12px' }}>Status</th>
                  <th style={{ padding: '10px 12px' }}>Discrepancies / Notes</th>
                  <th style={{ padding: '10px 12px', textAlign: 'center' }}>Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody>
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '24px', color: '#64748b' }}>
                      No inter-warehouse transfers requested yet.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t, idx) => (
                    <tr
                      key={t.id}
                      style={{
                        borderBottom: '1px solid #121c2d',
                        background: idx % 2 === 0 ? 'transparent' : 'rgba(15, 23, 42, 0.3)',
                      }}
                    >
                      <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#f8fafc' }}>
                        {t.id}
                        <span style={{ display: 'block', fontSize: '10px', color: '#64748b' }}>
                          {new Date(t.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <strong style={{ color: '#38bdf8' }}>{t.skuId}</strong>
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, color: '#f8fafc' }}>{t.sourceWarehouseId}</span>
                          <span style={{ color: '#64748b' }}>({t.sourceBinId})</span>
                          <ArrowRight size={12} style={{ color: '#64748b' }} />
                          <span style={{ fontWeight: 600, color: '#00e5ff' }}>{t.destinationWarehouseId}</span>
                          <span style={{ color: '#64748b' }}>({t.destinationBinId})</span>
                        </div>
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700, color: '#f8fafc' }}>
                        {t.status === 'RECEIVED' && t.receivedQuantity !== undefined && t.receivedQuantity !== t.quantity ? (
                          <span>
                            <span style={{ color: '#4ade80' }}>{t.receivedQuantity}</span>
                            <span style={{ color: '#64748b' }}> / {t.quantity}</span>
                          </span>
                        ) : (
                          `${t.quantity} units`
                        )}
                      </td>

                      <td style={{ padding: '10px 12px', color: '#94a3b8' }}>
                        {t.transportDistanceKm} km (~{t.estimatedHours} hrs)
                      </td>

                      <td style={{ padding: '10px 12px' }}>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            padding: '3px 8px',
                            borderRadius: '4px',
                            background:
                              t.status === 'RECEIVED'
                                ? 'rgba(34, 197, 94, 0.15)'
                                : t.status === 'IN TRANSIT'
                                ? 'rgba(192, 132, 252, 0.15)'
                                : t.status === 'APPROVED'
                                ? 'rgba(251, 191, 36, 0.15)'
                                : t.status === 'REQUESTED'
                                ? 'rgba(56, 189, 248, 0.15)'
                                : 'rgba(148, 163, 184, 0.15)',
                            color:
                              t.status === 'RECEIVED'
                                ? '#4ade80'
                                : t.status === 'IN TRANSIT'
                                ? '#c084fc'
                                : t.status === 'APPROVED'
                                ? '#fbbf24'
                                : t.status === 'REQUESTED'
                                ? '#38bdf8'
                                : '#94a3b8',
                          }}
                        >
                          {t.status}
                        </span>
                      </td>

                      <td style={{ padding: '10px 12px', fontSize: '11px', color: '#cbd5e1' }}>
                        {t.discrepancyDetails ? (
                          <span style={{ color: '#f87171' }}>
                            ⚠️ Short: {t.discrepancyDetails.actualReceivedQuantity}/{t.discrepancyDetails.expectedQuantity} ({t.discrepancyDetails.reason})
                          </span>
                        ) : (
                          t.notes || 'Normal transfer'
                        )}
                      </td>

                      <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                          {t.status === 'REQUESTED' && (
                            <>
                              <Button onClick={() => handleApprove(t.id)}>
                                Approve
                              </Button>
                              <Button variant="secondary" onClick={() => handleCancelTransfer(t.id)}>
                                Cancel
                              </Button>
                            </>
                          )}

                          {t.status === 'APPROVED' && (
                            <>
                              <Button onClick={() => handleDispatch(t.id)}>
                                Dispatch
                              </Button>
                              <Button variant="secondary" onClick={() => handleCancelTransfer(t.id)}>
                                Cancel
                              </Button>
                            </>
                          )}

                          {t.status === 'IN TRANSIT' && (
                            <Button onClick={() => handleOpenReceiveModal(t)}>
                              Receive Stock
                            </Button>
                          )}

                          {['RECEIVED', 'CANCELLED'].includes(t.status) && (
                            <span style={{ fontSize: '11px', color: '#64748b' }}>Complete</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: Network Demand Rebalancing Insights */}
      {activeTab === 'rebalancing' && (
        <div>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginBottom: '12px' }}>
            Demand intelligence identifies warehouse imbalances: facilities with excess coverage surplus alongside facilities with imminent stockout risk.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' }}>
            {rebalancingRecommendations.length === 0 ? (
              <div style={{ gridColumn: '1 / -1', padding: '30px', textAlign: 'center', background: '#080d16', borderRadius: '8px', color: '#64748b' }}>
                All facilities currently hold balanced inventory coverage relative to local demand velocity.
              </div>
            ) : (
              rebalancingRecommendations.map((rec) => (
                <Card key={rec.id} style={{ background: '#0e1823', border: '1px solid #1e3a5f' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <strong style={{ fontSize: '14px', color: '#f8fafc' }}>{rec.skuName}</strong>
                      <span style={{ display: 'block', fontSize: '11px', color: '#38bdf8' }}>{rec.skuId}</span>
                    </div>
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '4px',
                        background: 'rgba(251, 191, 36, 0.15)',
                        color: '#fbbf24',
                      }}
                    >
                      Surplus → Deficit
                    </span>
                  </div>

                  <div style={{ margin: '12px 0', fontSize: '12px', color: '#cbd5e1' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ color: '#94a3b8' }}>Source: {rec.sourceWarehouseName}</span>
                      <strong style={{ color: '#4ade80' }}>{rec.sourceAvailable}u ({rec.sourceCoverageDays}d)</strong>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: '#94a3b8' }}>Destination: {rec.destinationWarehouseName}</span>
                      <strong style={{ color: '#f87171' }}>{rec.destinationAvailable}u ({rec.destinationCoverageDays}d)</strong>
                    </div>
                    <p style={{ fontSize: '11px', color: '#94a3b8', margin: '6px 0 0 0' }}>{rec.reason}</p>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #1e293b' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Suggested: {rec.suggestedQuantity} units</span>
                    <Button
                                            onClick={() =>
                        handleOpenTransferModal({
                          skuId: rec.skuId,
                          sourceWarehouseId: rec.sourceWarehouseId,
                          destinationWarehouseId: rec.destinationWarehouseId,
                          suggestedQty: rec.suggestedQuantity,
                        })
                      }
                    >
                      Stage Rebalancing Transfer
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {/* Modal: New Inter-Warehouse Transfer Request */}
      {isTransferModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#0b1320',
              border: '1px solid #1e3a5f',
              borderRadius: '10px',
              padding: '24px',
              maxWidth: '520px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Request Inter-Warehouse Transfer
              </h2>
              <button
                onClick={() => setIsTransferModalOpen(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>PRODUCT SKU</label>
                <select
                  value={transferSkuId}
                  onChange={(e) => setTransferSkuId(e.target.value)}
                  style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                >
                  {skus.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>SOURCE FACILITY</label>
                  <select
                    value={transferSourceWh}
                    onChange={(e) => setTransferSourceWh(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id} disabled={w.id === transferDestWh}>
                        {w.id} ({w.city})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>DESTINATION FACILITY</label>
                  <select
                    value={transferDestWh}
                    onChange={(e) => setTransferDestWh(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                  >
                    {warehouses.map((w) => (
                      <option key={w.id} value={w.id} disabled={w.id === transferSourceWh}>
                        {w.id} ({w.city})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>SOURCE BIN</label>
                  <select
                    value={transferSourceBin || availableSourceBins[0]?.id || ''}
                    onChange={(e) => setTransferSourceBin(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                  >
                    {availableSourceBins.length === 0 ? (
                      <option value="">No bins hold this SKU</option>
                    ) : (
                      availableSourceBins.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id} ({b.quantity} on hand)
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>DESTINATION BIN</label>
                  <select
                    value={transferDestBin || availableDestBins[0]?.id || ''}
                    onChange={(e) => setTransferDestBin(e.target.value)}
                    style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                  >
                    {availableDestBins.length === 0 ? (
                      <option value="">No compatible bins</option>
                    ) : (
                      availableDestBins.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.id} ({b.quantity === 0 ? 'Empty' : `${b.quantity}u held`})
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>TRANSFER QUANTITY</label>
                <input
                  type="number"
                  min={1}
                  value={transferQty}
                  onChange={(e) => setTransferQty(Math.max(1, parseInt(e.target.value) || 1))}
                  style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>REASON & NOTES</label>
                <input
                  type="text"
                  value={transferNotes}
                  onChange={(e) => setTransferNotes(e.target.value)}
                  placeholder="e.g. Replenish urban fulfillment stockout"
                  style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <Button variant="secondary" onClick={() => setIsTransferModalOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateTransfer}>
                Submit Transfer Request
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirm Receipt & Discrepancy Recording */}
      {receiveModalTransfer && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              background: '#0b1320',
              border: '1px solid #1e3a5f',
              borderRadius: '10px',
              padding: '24px',
              maxWidth: '460px',
              width: '100%',
              boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                Confirm Transfer Receipt
              </h2>
              <button
                onClick={() => setReceiveModalTransfer(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '16px' }}>
              Receiving transfer <strong>{receiveModalTransfer.id}</strong> ({receiveModalTransfer.quantity} units of {receiveModalTransfer.skuId}) at destination {receiveModalTransfer.destinationWarehouseId} ({receiveModalTransfer.destinationBinId}).
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '13px' }}>
              <div>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '11px', marginBottom: '4px' }}>ACTUAL DELIVERED QUANTITY</label>
                <input
                  type="number"
                  min={0}
                  max={receiveModalTransfer.quantity}
                  value={receivedQtyInput}
                  onChange={(e) => setReceivedQtyInput(Math.min(receiveModalTransfer.quantity, Math.max(0, parseInt(e.target.value) || 0)))}
                  style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #1e293b', borderRadius: '6px', color: '#f8fafc' }}
                />
              </div>

              {receivedQtyInput < receiveModalTransfer.quantity && (
                <div>
                  <label style={{ display: 'block', color: '#f87171', fontSize: '11px', marginBottom: '4px' }}>DISCREPANCY EXPLANATION (REQUIRED)</label>
                  <input
                    type="text"
                    value={discrepancyReasonInput}
                    onChange={(e) => setDiscrepancyReasonInput(e.target.value)}
                    placeholder="e.g. 2 units damaged in freight transit"
                    style={{ width: '100%', padding: '8px', background: '#080d16', border: '1px solid #f87171', borderRadius: '6px', color: '#f8fafc' }}
                  />
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <Button variant="secondary" onClick={() => setReceiveModalTransfer(null)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmReceive}>
                Confirm Receipt & Update Stock
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
