import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Building2,
  Check,
  CheckCircle2,
  Filter,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Sparkles,
  Truck,
  Warehouse as WarehouseIcon,
  XCircle,
} from 'lucide-react'
import { skus } from '../data/mockData'
import { getIncomingQuantity } from '../data/replenishmentUtils'
import { getStockStatus } from '../data/inventoryUtils'
import {
  DEMO_REPLENISHMENT_DISCLAIMER,
  DEMO_SUPPLIER_REGISTRY,
  DEFAULT_SAFETY_STOCK_CONFIG,
} from '../data/intelligentReplenishmentEngine'
import { useAppStore } from '../store/useAppStore'
import type {
  FulfillmentStrategy,
  IntelligentReorderRecommendation,
  ReplenishmentRequest,
  ReplenishmentUrgency,
  SupplierResponseKind,
} from '../types'
import { Badge, Button, Card, PageHeader } from '../components/ui'

const initialSuppliers = [...new Set(skus.map((sku) => sku.supplier))]
const today = new Date().toISOString().slice(0, 10)

function makeId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}`
  )
}

export function SuppliersScreen() {
  const inventory = useAppStore((state) => state.inventory)
  const requests = useAppStore((state) => state.replenishmentRequests)
  const warehouses = useAppStore((state) => state.warehouses)
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId)
  const setSelectedWarehouseId = useAppStore((state) => state.setSelectedWarehouseId)
  const transfers = useAppStore((state) => state.interWarehouseTransfers)
  const safetyConfig = useAppStore((state) => state.replenishmentSafetyStockConfig)
  const setSafetyConfig = useAppStore((state) => state.setReplenishmentSafetyStockConfig)

  const createRequest = useAppStore((state) => state.createReplenishmentRequest)
  const respond = useAppStore((state) => state.respondToReplenishment)
  const dispatch = useAppStore((state) => state.dispatchReplenishment)
  const receive = useAppStore((state) => state.receiveReplenishment)

  const getRecommendations = useAppStore((state) => state.getIntelligentReplenishmentRecommendations)
  const approveRecommendation = useAppStore((state) => state.approveReplenishmentRecommendation)
  const dismissRecommendation = useAppStore((state) => state.dismissReplenishmentRecommendation)

  const [role, setRole] = useState<'Manager' | 'Supplier'>('Manager')
  const [managerTab, setManagerTab] = useState<'reorder' | 'orders' | 'directory'>('reorder')

  // Selected warehouse for reorder evaluation
  const [targetWarehouseId, setTargetWarehouseId] = useState(selectedWarehouseId || 'WH-HYD-01')

  // Reorder filters
  const [urgencyFilter, setUrgencyFilter] = useState<'all' | ReplenishmentUrgency>('all')
  const [strategyFilter, setStrategyFilter] = useState<'all' | FulfillmentStrategy>('all')
  const [reorderSearch, setReorderSearch] = useState('')
  const [customQuantities, setCustomQuantities] = useState<Record<string, number>>({})
  const [showConfigDrawer, setShowConfigDrawer] = useState(false)

  // Purchase order state
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState('')
  const [skuId, setSkuId] = useState('SKU-2084')
  const [binId, setBinId] = useState('C-06-02')
  const [quantity, setQuantity] = useState('20')
  const [supplier, setSupplier] = useState('Medline Industries')
  const [expectedDate, setExpectedDate] = useState(today)
  const [note, setNote] = useState('')
  const [confirmed, setConfirmed] = useState('20')
  const [responseKind, setResponseKind] = useState<SupplierResponseKind>('full')
  const [delivered, setDelivered] = useState('20')
  const [accepted, setAccepted] = useState('20')
  const [discrepancyReason, setDiscrepancyReason] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Reorder recommendations for the selected warehouse
  const recommendations = useMemo(() => {
    void inventory
    void requests
    void transfers
    void safetyConfig
    return getRecommendations(targetWarehouseId)
  }, [getRecommendations, targetWarehouseId, inventory, requests, transfers, safetyConfig])

  const filteredRecommendations = useMemo(() => {
    return recommendations.filter((r) => {
      const matchUrgency = urgencyFilter === 'all' || r.urgency === urgencyFilter
      const matchStrategy = strategyFilter === 'all' || r.strategy === strategyFilter
      const text = `${r.skuId} ${r.skuName} ${r.category} ${r.reason} ${r.supplierName ?? ''} ${r.sourceWarehouseName ?? ''}`.toLowerCase()
      const matchSearch = !reorderSearch.trim() || text.includes(reorderSearch.toLowerCase())
      return matchUrgency && matchStrategy && matchSearch
    })
  }, [recommendations, urgencyFilter, strategyFilter, reorderSearch])

  // Aggregate metrics
  const criticalCount = recommendations.filter(
    (r) => r.urgency === 'Critical Stockout' || r.urgency === 'Critical Reorder Risk'
  ).length
  const transferCount = recommendations.filter(
    (r) => r.strategy === 'inter_warehouse_transfer'
  ).length
  const poCount = recommendations.filter(
    (r) => r.strategy === 'supplier_replenishment'
  ).length
  const pipelineUnits = recommendations.reduce(
    (sum, r) => sum + r.calculations.inFlightPurchaseOrders + r.calculations.inTransitTransfers,
    0
  )

  const stock = inventory.find((item) => item.skuId === skuId && item.binId === binId)
  const selected = requests.find((item) => item.id === selectedId) ?? requests[0]
  const visibleRequests = useMemo(
    () =>
      requests.filter(
        (request) =>
          (role === 'Manager' || request.supplier === supplier) &&
          `${request.id} ${request.skuId} ${request.binId} ${request.supplier} ${request.status}`
            .toLowerCase()
            .includes(query.toLowerCase())
      ),
    [requests, role, supplier, query]
  )

  const waiting = requests.filter((item) => item.status === 'Submitted').length
  const incoming = requests.reduce((sum, item) => sum + getIncomingQuantity(item), 0)
  const delayed = requests.filter((item) => item.status === 'Delayed').length
  const risk = inventory.filter((item) =>
    ['Low stock', 'Empty', 'Unavailable'].includes(getStockStatus(item))
  ).length
  const filteredBins = inventory.filter((item) => item.skuId === skuId).map((item) => item.binId)

  // Purchase order submissions
  function submitRequest() {
    const result = createRequest({
      skuId,
      binId,
      quantity: Number(quantity),
      supplier,
      expectedDate,
      note,
      warehouseId: targetWarehouseId,
      preventDuplicates: true,
    })
    setMessage({ text: result.message, ok: result.ok })
    if (result.request) setSelectedId(result.request.id)
  }

  function submitResponse() {
    if (!selected) return
    const result = respond(selected.id, responseKind, Number(confirmed), expectedDate, note)
    setMessage({ text: result.message, ok: result.ok })
  }

  function submitReceipt() {
    if (!selected) return
    const result = receive(
      selected.id,
      Number(delivered),
      Number(accepted),
      makeId(),
      discrepancyReason
    )
    setMessage({ text: result.message, ok: result.ok })
    if (result.ok) {
      setDiscrepancyReason('')
    }
  }

  function handleApproveRecommendation(rec: IntelligentReorderRecommendation) {
    const overrideQty = customQuantities[rec.id] || rec.recommendedQuantity
    const result = approveRecommendation(rec.id, {
      quantity: overrideQty,
      warehouseId: targetWarehouseId,
    })
    setMessage({ text: result.message, ok: result.ok })
  }

  function handleDismissRecommendation(id: string) {
    dismissRecommendation(id)
    setMessage({ text: `Recommendation ${id} dismissed.`, ok: true })
  }

  const selectedWh = warehouses.find((w) => w.id === targetWarehouseId)

  return (
    <div className="suppliers-screen-container">
      <PageHeader
        title="Suppliers & Replenishment Intelligence"
        description="Demand-aware inventory reordering, inter-warehouse transfer balancing, and verified dock receiving."
        action={
          <div className="supplier-role-toggle" aria-label="Workspace role">
            <button
              className={role === 'Manager' ? 'active' : ''}
              onClick={() => setRole('Manager')}
            >
              Manager workspace
            </button>
            <button
              className={role === 'Supplier' ? 'active' : ''}
              onClick={() => setRole('Supplier')}
            >
              Supplier workspace
            </button>
          </div>
        }
      />

      {/* Top Banner: Demo Disclaimer */}
      <div className="replenishment-disclaimer-banner">
        <Sparkles size={15} />
        <span>
          <strong>Simulated Demo Telemetry:</strong> {DEMO_REPLENISHMENT_DISCLAIMER}
        </span>
      </div>

      {role === 'Manager' ? (
        <>
          {/* Manager Subnavigation */}
          <div className="replenishment-subnav">
            <button
              className={`reorder-subnav-btn ${managerTab === 'reorder' ? 'active' : ''}`}
              onClick={() => setManagerTab('reorder')}
            >
              <Sparkles size={15} />
              <span>Intelligent Reorder & Shortages</span>
              {recommendations.length > 0 && (
                <span className={`tab-counter ${criticalCount > 0 ? 'red' : 'amber'}`}>
                  {recommendations.length}
                </span>
              )}
            </button>
            <button
              className={`reorder-subnav-btn ${managerTab === 'orders' ? 'active' : ''}`}
              onClick={() => setManagerTab('orders')}
            >
              <Truck size={15} />
              <span>Purchase Orders & Dock Receiving</span>
              {requests.length > 0 && <span className="tab-counter">{requests.length}</span>}
            </button>
            <button
              className={`reorder-subnav-btn ${managerTab === 'directory' ? 'active' : ''}`}
              onClick={() => setManagerTab('directory')}
            >
              <Building2 size={15} />
              <span>Supplier Partner Directory</span>
            </button>
          </div>

          {/* TAB 1: INTELLIGENT REORDER & SHORTAGES */}
          {managerTab === 'reorder' && (
            <div className="reorder-hub-section">
              {/* Facility Selection & KPI Header */}
              <div className="reorder-controls-row">
                <div className="reorder-facility-picker">
                  <label htmlFor="facility-select">
                    <WarehouseIcon size={14} /> EVALUATION FACILITY:
                  </label>
                  <select
                    id="facility-select"
                    value={targetWarehouseId}
                    onChange={(e) => {
                      setTargetWarehouseId(e.target.value)
                      setSelectedWarehouseId(e.target.value)
                    }}
                  >
                    {warehouses.map((wh) => (
                      <option key={wh.id} value={wh.id}>
                        {wh.id} · {wh.name} ({wh.location})
                      </option>
                    ))}
                  </select>
                  <span className="facility-status-badge">
                    {selectedWh?.location} · {selectedWh?.utilization}% capacity
                  </span>
                </div>

                <div className="reorder-actions-right">
                  <Button
                    variant="secondary"
                    onClick={() => setShowConfigDrawer(!showConfigDrawer)}
                  >
                    <Sliders size={14} />
                    <span>Safety Stock Config</span>
                  </Button>
                </div>
              </div>

              {/* Safety Stock Config Panel */}
              {showConfigDrawer && (
                <div className="safety-stock-config-drawer">
                  <div className="config-drawer-header">
                    <h4>
                      <Sliders size={15} /> Replenishment Safety Stock & Lead Time Parameters
                    </h4>
                    <button
                      className="drawer-close-btn"
                      onClick={() => setShowConfigDrawer(false)}
                    >
                      &times;
                    </button>
                  </div>
                  <div className="config-grid">
                    <label>
                      Class A Safety Days (Fast Movers)
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={safetyConfig.classASafetyStockDays ?? 5}
                        onChange={(e) =>
                          setSafetyConfig({ classASafetyStockDays: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Class B Safety Days (Medium Movers)
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={safetyConfig.classBSafetyStockDays ?? 4}
                        onChange={(e) =>
                          setSafetyConfig({ classBSafetyStockDays: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Class C Safety Days (Slow Movers)
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={safetyConfig.classCSafetyStockDays ?? 3}
                        onChange={(e) =>
                          setSafetyConfig({ classCSafetyStockDays: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Target Review Cycle (Days)
                      <input
                        type="number"
                        min="1"
                        max="60"
                        value={safetyConfig.targetReviewCycleDays ?? 7}
                        onChange={(e) =>
                          setSafetyConfig({ targetReviewCycleDays: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Minimum Order Quantity (MOQ)
                      <input
                        type="number"
                        min="1"
                        value={safetyConfig.minOrderQuantity ?? 5}
                        onChange={(e) =>
                          setSafetyConfig({ minOrderQuantity: Number(e.target.value) })
                        }
                      />
                    </label>
                    <div className="config-actions">
                      <Button
                        variant="secondary"
                        onClick={() => setSafetyConfig(DEFAULT_SAFETY_STOCK_CONFIG)}
                      >
                        <RefreshCw size={13} /> Reset to Defaults
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* Metrics Bar */}
              <div className="replenishment-metrics">
                <MetricCard
                  label="Critical Stockouts"
                  value={criticalCount.toString()}
                  detail="Zero or depleted stock"
                />
                <MetricCard
                  label="Total Recommendations"
                  value={recommendations.length.toString()}
                  detail="Based on 30-day velocity"
                />
                <MetricCard
                  label="Sister WH Transfers"
                  value={transferCount.toString()}
                  detail="Surplus network rebalance"
                />
                <MetricCard
                  label="Supplier POs"
                  value={poCount.toString()}
                  detail="Network-wide deficit orders"
                />
                <MetricCard
                  label="Pipeline in Flight"
                  value={pipelineUnits.toLocaleString()}
                  detail="Pending POs + In-transit"
                />
              </div>

              {/* Filtering toolbar */}
              <div className="reorder-filter-toolbar">
                <div className="search-box">
                  <Search size={14} />
                  <input
                    value={reorderSearch}
                    onChange={(e) => setReorderSearch(e.target.value)}
                    placeholder="Search SKU, product name, supplier, or reason..."
                  />
                </div>
                <div className="filter-group">
                  <Filter size={14} />
                  <select
                    value={urgencyFilter}
                    onChange={(e) =>
                      setUrgencyFilter(e.target.value as 'all' | ReplenishmentUrgency)
                    }
                  >
                    <option value="all">All Urgency Levels</option>
                    <option value="Critical Stockout">Critical Stockout</option>
                    <option value="Critical Reorder Risk">Critical Reorder Risk</option>
                    <option value="High Risk">High Risk</option>
                    <option value="Medium Risk">Medium Risk</option>
                    <option value="Healthy">Healthy</option>
                  </select>

                  <select
                    value={strategyFilter}
                    onChange={(e) =>
                      setStrategyFilter(e.target.value as 'all' | FulfillmentStrategy)
                    }
                  >
                    <option value="all">All Fulfillment Strategies</option>
                    <option value="inter_warehouse_transfer">Inter-Warehouse Transfer</option>
                    <option value="supplier_replenishment">Supplier Replenishment</option>
                  </select>
                </div>
              </div>

              {/* Recommendations Cards List */}
              {filteredRecommendations.length === 0 ? (
                <div className="reorder-empty-card">
                  <CheckCircle2 size={36} className="text-green" />
                  <h3>No Urgent Shortages Detected for {selectedWh?.name || targetWarehouseId}</h3>
                  <p>
                    All SKU levels satisfy safety stock and lead-time demand, or active in-flight
                    purchase orders and transfer pipeline already cover projected requirements.
                  </p>
                  <small>
                    Change evaluation facility above to check other distribution centers across the
                    network.
                  </small>
                </div>
              ) : (
                <div className="reorder-recommendations-grid">
                  {filteredRecommendations.map((rec) => {
                    const c = rec.calculations
                    const isTransfer = rec.strategy === 'inter_warehouse_transfer'
                    const userQty = customQuantities[rec.id] ?? rec.recommendedQuantity
                    const urgencyClass = rec.urgency.toLowerCase().replace(/\s+/g, '-')
                    const primarySupplier =
                      rec.availableSuppliers.find((s) => s.isPrimary) ?? rec.availableSuppliers[0]

                    return (
                      <div
                        key={rec.id}
                        className={`reorder-recommendation-card urgency-${urgencyClass}`}
                      >
                        <div className="rec-card-header">
                          <div className="rec-badges-row">
                            <span className={`urgency-pill ${urgencyClass}`}>
                              {rec.urgency.toUpperCase()}
                            </span>
                            <span
                              className={`strategy-pill ${
                                isTransfer ? 'strategy-transfer' : 'strategy-supplier'
                              }`}
                            >
                              {isTransfer ? (
                                <>
                                  <ArrowRightLeft size={12} /> Sister WH Transfer
                                </>
                              ) : (
                                <>
                                  <Truck size={12} /> Supplier Purchase Order
                                </>
                              )}
                            </span>
                            <span className="scope-pill">
                              {rec.shortageScope === 'local'
                                ? 'Local Shortage (Surplus Available)'
                                : 'Network-Wide Deficit'}
                            </span>
                          </div>
                          <div className="rec-id-tag">
                            <code>{rec.id}</code>
                          </div>
                        </div>

                        <div className="rec-product-row">
                          <div>
                            <h3>
                              {rec.skuName}{' '}
                              <span className="sku-code">({rec.skuId})</span>
                            </h3>
                            <span className="rec-category">
                              Category: {rec.category} · Target Rack:{' '}
                              <strong>{rec.targetBinId}</strong>
                            </span>
                          </div>
                          <div className="recommended-qty-hero">
                            <label>Recommended Order</label>
                            <strong>{rec.recommendedQuantity} units</strong>
                          </div>
                        </div>

                        {/* Calculation Breakdown Matrix */}
                        <div className="rec-calculation-matrix">
                          <div className="calc-col">
                            <span className="calc-label">Physical On Hand</span>
                            <strong className="calc-val">{c.onHandStock}</strong>
                            <small>Reserved: {c.reservedStock}</small>
                          </div>
                          <div className="calc-col">
                            <span className="calc-label">Available Unreserved</span>
                            <strong className="calc-val text-amber">{c.availableStock}</strong>
                            <small>Immediate pickable</small>
                          </div>
                          <div className="calc-col">
                            <span className="calc-label">Pipeline In-Flight</span>
                            <strong className="calc-val text-blue">
                              {c.inFlightPurchaseOrders + c.inTransitTransfers}
                            </strong>
                            <small>Not on hand</small>
                          </div>
                          <div className="calc-col">
                            <span className="calc-label">30d Daily Velocity</span>
                            <strong className="calc-val">{c.dailyVelocity.toFixed(1)}/day</strong>
                            <small>Lead time: {c.leadTimeDays}d</small>
                          </div>
                          <div className="calc-col">
                            <span className="calc-label">Safety Stock</span>
                            <strong className="calc-val">{c.safetyStockUnits}</strong>
                            <small>LT Demand: {c.leadTimeDemand}</small>
                          </div>
                          <div className="calc-col highlight">
                            <span className="calc-label">Target Order-Up-To</span>
                            <strong className="calc-val text-green">{c.targetStockLevel}</strong>
                            <small>Deficit: {c.netDeficit}</small>
                          </div>
                        </div>

                        {/* Fulfillment Source Details */}
                        <div className="rec-source-details">
                          {isTransfer ? (
                            <div className="source-box transfer-source">
                              <Building2 size={16} />
                              <div>
                                <strong>Recommended Source: {rec.sourceWarehouseName} ({rec.sourceWarehouseId})</strong>
                                <span>
                                  Surplus Bay: <strong>{rec.sourceBinId}</strong> · Available Surplus:{' '}
                                  <strong>{rec.availableSurplusAtSource} units</strong> · Distance:{' '}
                                  <strong>{rec.transitDistanceKm} km</strong> (~{rec.estimatedTransitHours}h transit)
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="source-box supplier-source">
                              <Truck size={16} />
                              <div>
                                <strong>Vendor: {rec.supplierName}</strong>
                                <span>
                                  Simulated Lead Time: <strong>{c.leadTimeDays} days</strong> · Reliability:{' '}
                                  <strong>{primarySupplier?.reliabilityRating ?? 96}%</strong> · MOQ:{' '}
                                  <strong>{primarySupplier?.minOrderQuantity ?? 5} units</strong>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Rationale & Assumptions */}
                        <div className="rec-assumptions-box">
                          <p className="rec-reason">
                            <strong>Intelligence Rationale:</strong> {rec.reason}
                          </p>
                          <ul className="assumptions-list">
                            {c.assumptions.map((assump: string, idx: number) => (
                              <li key={idx}>{assump}</li>
                            ))}
                          </ul>
                        </div>

                        {/* Action Bar */}
                        <div className="rec-actions-bar">
                          <div className="rec-override-qty">
                            <label htmlFor={`qty-${rec.id}`}>Approve Quantity:</label>
                            <input
                              id={`qty-${rec.id}`}
                              type="number"
                              min="1"
                              value={userQty}
                              onChange={(e) =>
                                setCustomQuantities((prev) => ({
                                  ...prev,
                                  [rec.id]: Number(e.target.value),
                                }))
                              }
                            />
                          </div>

                          <div className="rec-buttons-group">
                            <Button
                              variant="secondary"
                              onClick={() => handleDismissRecommendation(rec.id)}
                            >
                              <XCircle size={14} /> Dismiss
                            </Button>
                            <Button
                              variant="primary"
                              onClick={() => handleApproveRecommendation(rec)}
                            >
                              {isTransfer ? (
                                <>
                                  <ArrowRightLeft size={14} /> Approve &amp; Stage Transfer
                                </>
                              ) : (
                                <>
                                  <Plus size={14} /> Approve &amp; Dispatch PO
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: PURCHASE ORDERS & DOCK RECEIVING */}
          {managerTab === 'orders' && (
            <div className="replenishment-orders-section">
              <div className="replenishment-metrics">
                <MetricCard
                  label="Open requests"
                  value={requests.length.toString()}
                  detail="Includes submitted requests"
                />
                <MetricCard
                  label="Awaiting supplier response"
                  value={waiting.toString()}
                  detail="Availability not yet known"
                />
                <MetricCard
                  label="Confirmed incoming"
                  value={incoming.toLocaleString()}
                  detail="Confirmed · not on hand"
                />
                <MetricCard
                  label="Delayed deliveries"
                  value={delayed.toString()}
                  detail="Revised ETA needs review"
                />
                <MetricCard
                  label="Stockout risks"
                  value={risk.toString()}
                  detail="Derived from shared inventory"
                />
              </div>

              <Card
                title="Replenishment requests"
                subtitle={`${visibleRequests.length} records`}
                action={
                  <span className="supplier-context">
                    {role} workspace · {role === 'Manager' ? 'All suppliers' : supplier} · Demo records
                  </span>
                }
              >
                <div className="request-filters">
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search request, product or SKU"
                    aria-label="Search replenishment requests"
                  />
                  <select
                    aria-label="Supplier workspace filter"
                    value={supplier}
                    onChange={(event) => setSupplier(event.target.value)}
                  >
                    {initialSuppliers.map((name) => (
                      <option key={name}>{name}</option>
                    ))}
                  </select>
                  <span>Statuses update from shared request state</span>
                </div>
                <div className="table-scroll">
                  <table className="replenishment-table">
                    <thead>
                      <tr>
                        <th>REQUEST ID</th>
                        <th>SKU / PRODUCT</th>
                        <th>BIN</th>
                        <th>ON HAND</th>
                        <th>REORDER</th>
                        <th>REQUESTED</th>
                        <th>SUPPLIER</th>
                        <th>STATUS</th>
                        <th>EXPECTED ARRIVAL</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleRequests.map((request) => {
                        const sku = skus.find((item) => item.id === request.skuId)
                        const stockItem = inventory.find(
                          (item) =>
                            item.binId === request.binId && item.skuId === request.skuId
                        )
                        return (
                          <tr
                            key={request.id}
                            className={selected?.id === request.id ? 'selected-request' : ''}
                            onClick={() => {
                              setSelectedId(request.id)
                              setConfirmed(String(request.confirmedQuantity ?? request.quantity))
                              setDelivered(
                                String(
                                  Math.max(
                                    1,
                                    (request.confirmedQuantity ?? request.quantity) -
                                      request.receipts.reduce(
                                        (sum, item) => sum + item.delivered,
                                        0
                                      )
                                  )
                                )
                              )
                              setAccepted(
                                String(
                                  Math.max(
                                    1,
                                    (request.confirmedQuantity ?? request.quantity) -
                                      request.receipts.reduce(
                                        (sum, item) => sum + item.delivered,
                                        0
                                      )
                                  )
                                )
                              )
                            }}
                          >
                            <td>
                              <strong>{request.id}</strong>
                            </td>
                            <td>
                              {sku?.name ?? request.skuId}
                              <small>{request.skuId}</small>
                            </td>
                            <td>{request.binId}</td>
                            <td>{stockItem?.quantity ?? '—'}</td>
                            <td>{stockItem?.reorderPoint ?? '—'}</td>
                            <td>{request.quantity}</td>
                            <td>{request.supplier}</td>
                            <td>
                              <Badge>{request.status}</Badge>
                              {request.confirmedQuantity !== null && (
                                <small>{request.confirmedQuantity} confirmed</small>
                              )}
                            </td>
                            <td>{request.expectedDate || 'Not submitted'}</td>
                          </tr>
                        )
                      })}
                      {visibleRequests.length === 0 && (
                        <tr>
                          <td colSpan={9} className="empty-cell">
                            No matching replenishment requests yet. Create one below or approve an
                            intelligent reorder recommendation.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="request-lifecycle">
                  Draft → Submitted → Supplier Responded → Confirmed → Dispatched → Partially
                  Received → Completed <span>Exceptions: Delayed · Unavailable</span>
                </div>
              </Card>

              <div className="replenishment-work-grid">
                <Card
                  title="Create replenishment request"
                  subtitle="Manual demo request from shared inventory record"
                  action={
                    <Badge>{stock ? getStockStatus(stock) : 'Unavailable'}</Badge>
                  }
                >
                  {stock && stock.quantity <= stock.reorderPoint && (
                    <div className="replenishment-callout">
                      <AlertTriangle size={14} />
                      {stock.quantity} on hand &lt; {stock.reorderPoint} reorder point · Suggested
                      quantity {Math.max(1, stock.capacity - stock.quantity)}
                    </div>
                  )}
                  <div className="replenishment-form">
                    <label>
                      SKU
                      <select
                        value={skuId}
                        onChange={(event) => {
                          setSkuId(event.target.value)
                          const next = inventory.find(
                            (item) => item.skuId === event.target.value
                          )
                          if (next) setBinId(next.binId)
                          const skuObj = skus.find((item) => item.id === event.target.value)
                          if (skuObj) setSupplier(skuObj.supplier)
                        }}
                      >
                        {skus.map((item) => (
                          <option value={item.id} key={item.id}>
                            {item.id} · {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Bin
                      <select
                        value={binId}
                        onChange={(event) => setBinId(event.target.value)}
                      >
                        {filteredBins.map((id) => (
                          <option key={id}>{id}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Current stock · read only
                      <input
                        readOnly
                        value={stock ? `${stock.quantity} units` : 'No inventory record'}
                      />
                    </label>
                    <label>
                      Reorder point
                      <input
                        readOnly
                        value={stock ? `${stock.reorderPoint} units` : '—'}
                      />
                    </label>
                    <label>
                      Requested quantity
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={quantity}
                        onChange={(event) => setQuantity(event.target.value)}
                      />
                    </label>
                    <label>
                      Supplier
                      <select
                        value={supplier}
                        onChange={(event) => setSupplier(event.target.value)}
                      >
                        {initialSuppliers.map((name) => (
                          <option key={name}>{name}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Expected delivery
                      <input
                        type="date"
                        value={expectedDate}
                        onChange={(event) => setExpectedDate(event.target.value)}
                      />
                    </label>
                    <label>
                      Notes
                      <input
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Optional delivery notes"
                      />
                    </label>
                  </div>
                  <div className="replenishment-form-foot">
                    <small>
                      Submitting creates a request only. On-hand inventory remains unchanged.
                    </small>
                    <Button onClick={submitRequest} disabled={!stock}>
                      <Plus size={14} /> Submit request
                    </Button>
                  </div>
                </Card>

                <Card
                  title={
                    selected ? `${selected.id} · Request details` : 'Request details'
                  }
                  subtitle={
                    selected
                      ? `${selected.skuId} · ${selected.binId} · ${selected.supplier}`
                      : 'Select a request to view the timeline'
                  }
                >
                  {!selected ? (
                    <div className="supplier-empty">
                      Choose a replenishment request from the table above.
                    </div>
                  ) : (
                    <>
                      <div className="request-quantities">
                        <Info label="Requested" value={selected.quantity} />
                        <Info label="Confirmed" value={selected.confirmedQuantity ?? '—'} />
                        <Info label="Incoming" value={getIncomingQuantity(selected)} />
                        <Info
                          label="Received"
                          value={selected.receipts.reduce(
                            (sum, item) => sum + item.delivered,
                            0
                          )}
                        />
                        <Info label="Accepted" value={getAccepted(selected)} />
                        <Info
                          label="On hand"
                          value={
                            inventory.find((item) => item.binId === selected.binId)?.quantity ??
                            '—'
                          }
                        />
                      </div>
                      <div className="request-timeline">
                        {selected.timeline.map((event) => (
                          <div key={event.id}>
                            <i />
                            <time>
                              {new Date(event.at).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </time>
                            <span>
                              <b>{event.label}</b>
                              {event.note && <small>{event.note}</small>}
                            </span>
                          </div>
                        ))}
                      </div>
                      {selected.responseNote && (
                        <div className="supplier-response-note">
                          Supplier note: {selected.responseNote}
                        </div>
                      )}
                    </>
                  )}
                </Card>

                {selected && (
                  <Card
                    title="Dock Goods Receipt & Discrepancy Recording"
                    subtitle="Only accepted units enter physical warehouse stock"
                  >
                    <div className="receipt-inputs">
                      <label>
                        Physically Delivered
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={delivered}
                          onChange={(event) => setDelivered(event.target.value)}
                        />
                      </label>
                      <label>
                        Accepted into Inventory
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={accepted}
                          onChange={(event) => setAccepted(event.target.value)}
                        />
                      </label>
                    </div>

                    {Number(accepted) < Number(delivered) && (
                      <div className="discrepancy-warning-box">
                        <AlertTriangle size={14} />
                        <span>
                          Discrepancy: {Number(delivered) - Number(accepted)} units rejected.
                          Reason required for audit tracking:
                        </span>
                        <input
                          className="discrepancy-input"
                          value={discrepancyReason}
                          onChange={(e) => setDiscrepancyReason(e.target.value)}
                          placeholder="e.g., Damaged carton, water leakage, or expired seal"
                        />
                      </div>
                    )}

                    <p className="accounting-note">
                      <PackageCheck size={14} /> Delivery and acceptance are verified together.
                      Rejected units do NOT enter inventory. All receipts are logged in movement
                      history.
                    </p>

                    <Button
                      onClick={submitReceipt}
                      disabled={!['In transit', 'Partially received'].includes(selected.status)}
                    >
                      <Check size={14} /> Record Verified Goods Receipt
                    </Button>

                    <div className="receipt-history-list">
                      {selected.receipts.map((receipt) => (
                        <div className="receipt-history" key={receipt.id}>
                          <strong>{receipt.id}</strong> · {receipt.delivered} delivered ·{' '}
                          <span className="text-green font-bold">{receipt.accepted} accepted</span>{' '}
                          · {receipt.rejected} rejected
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: SUPPLIER PARTNER DIRECTORY */}
          {managerTab === 'directory' && (
            <div className="supplier-directory-section">
              <div className="directory-header-row">
                <div>
                  <h3>Simulated B2B Vendor Directory</h3>
                  <p>
                    Deterministic supplier profiles with simulated lead times, historical
                    reliability ratings, and category allocations.
                  </p>
                </div>
                <div className="directory-disclaimer-pill">
                  <ShieldCheck size={14} />
                  <span>Verified B2B Vendor Network</span>
                </div>
              </div>

              <div className="supplier-master-grid">
                {Object.entries(DEMO_SUPPLIER_REGISTRY).map(([skuKey, supplierOptions]) => {
                  const skuObj = skus.find((s) => s.id === skuKey)
                  return (
                    <div key={skuKey} className="supplier-master-card">
                      <div className="sm-header">
                        <h4>{skuObj?.name ?? skuKey}</h4>
                        <span className="sm-sku-tag">{skuKey}</span>
                      </div>
                      <div className="sm-category">
                        Category: <strong>{skuObj?.category ?? 'General'}</strong>
                      </div>

                      <div className="sm-options-list">
                        {supplierOptions.map((opt, i) => (
                          <div
                            key={i}
                            className={`sm-option-row ${opt.isPrimary ? 'primary-vendor' : ''}`}
                          >
                            <div className="opt-title-row">
                              <strong>{opt.supplierName}</strong>
                              {opt.isPrimary && (
                                <span className="primary-pill">Primary Supplier</span>
                              )}
                            </div>
                            <div className="opt-specs-grid">
                              <div>
                                <span>Simulated Lead Time:</span>
                                <b>{opt.leadTimeDays} days</b>
                              </div>
                              <div>
                                <span>Reliability Rating:</span>
                                <b className="text-green">{opt.reliabilityRating}%</b>
                              </div>
                              <div>
                                <span>Minimum Order (MOQ):</span>
                                <b>{opt.minOrderQuantity} units</b>
                              </div>
                              {opt.costPerUnit && (
                                <div>
                                  <span>Unit Cost:</span>
                                  <b>${opt.costPerUnit.toFixed(2)}</b>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      ) : (
        /* SUPPLIER WORKSPACE VIEW */
        <div className="replenishment-work-grid supplier-view-grid">
          <Card
            title="Supplier incoming requests"
            subtitle={`Showing requests addressed to ${supplier}`}
            action={<Badge>{supplier}</Badge>}
          >
            {visibleRequests
              .filter((request) => request.status === 'Submitted')
              .map((request) => (
                <div className="supplier-incoming" key={request.id}>
                  <div>
                    <strong>
                      {request.id} · {request.skuId}
                    </strong>
                    <span>
                      {request.quantity} requested · Bin {request.binId} · Need by{' '}
                      {request.expectedDate}
                    </span>
                  </div>
                  <Button variant="secondary" onClick={() => setSelectedId(request.id)}>
                    Respond <ArrowRight size={13} />
                  </Button>
                </div>
              ))}
            {!visibleRequests.some((request) => request.status === 'Submitted') && (
              <div className="supplier-empty">
                No requests are awaiting a response for this supplier.
              </div>
            )}
          </Card>

          <Card
            title={selected ? `Respond to ${selected.id}` : 'Supplier response'}
            subtitle="Supplier actions are simulated in this demo"
          >
            {!selected ? (
              <div className="supplier-empty">Select a submitted incoming request.</div>
            ) : (
              <>
                <div className="supplier-request-summary">
                  <b>
                    {selected.skuId} · {selected.quantity} requested
                  </b>
                  <span>
                    {selected.binId} · Expected {selected.expectedDate}
                  </span>
                </div>
                <label className="response-kind">
                  Availability
                  <select
                    value={responseKind}
                    onChange={(event) => {
                      const next = event.target.value as SupplierResponseKind
                      setResponseKind(next)
                      setConfirmed(
                        next === 'full'
                          ? String(selected.quantity)
                          : next === 'unavailable'
                          ? '0'
                          : String(Math.max(1, Math.floor(selected.quantity / 2)))
                      )
                    }}
                  >
                    <option value="full">Available in full</option>
                    <option value="partial">Partially available</option>
                    <option value="unavailable">Unavailable</option>
                    <option value="delayed">Delayed</option>
                  </select>
                </label>
                <div className="response-fields">
                  <label>
                    Confirmed quantity
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={confirmed}
                      onChange={(event) => setConfirmed(event.target.value)}
                      disabled={responseKind === 'unavailable'}
                    />
                  </label>
                  <label>
                    Expected date
                    <input
                      type="date"
                      value={expectedDate}
                      onChange={(event) => setExpectedDate(event.target.value)}
                    />
                  </label>
                </div>
                <label className="response-kind">
                  Supplier note
                  <input
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Add response notes"
                  />
                </label>
                <div className="supplier-action-row">
                  <Button onClick={submitResponse} disabled={selected.status !== 'Submitted'}>
                    Save supplier response
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const result = dispatch(selected.id)
                      setMessage({ text: result.message, ok: result.ok })
                    }}
                    disabled={
                      !['Confirmed full', 'Partial offer', 'Delayed'].includes(selected.status)
                    }
                  >
                    <Truck size={14} /> Mark dispatched
                  </Button>
                </div>
              </>
            )}
          </Card>
        </div>
      )}

      {message && (
        <div className={`replenishment-toast ${message.ok ? 'ok' : 'error'}`} role="status">
          {message.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {message.text}
        </div>
      )}

      <div className="supplier-demo-foot">
        Demo procurement data · Local supplier simulation · On-hand changes only after manager
        acceptance{' '}
        <span>Inventory updates are shared across Dashboard, Picker and Digital Twin</span>
      </div>
    </div>
  )
}

function MetricCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="replenishment-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  )
}

function Info({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <span>{label}</span>
      <b>{value}</b>
    </div>
  )
}

function getAccepted(request: ReplenishmentRequest): number {
  return request.receipts.reduce((sum, receipt) => sum + receipt.accepted, 0)
}
