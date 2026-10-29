import { useState } from 'react'
import { AlertCircle, BarChart3, Box, Boxes, Building2, Check, ClipboardCheck, Clock3, LayoutDashboard, Send, Shield, Sparkles, TrendingUp, Truck, User, Warehouse, Zap } from 'lucide-react'
import type { FC } from 'react'
import { RoleSwitcherBar } from '../components/RoleSwitcherBar'
import { InventoryManagementView } from '../components/inventory/InventoryManagementView'
import { DemandIntelligenceView } from '../components/analyst/DemandIntelligenceView'
import { MultiWarehouseNetworkView } from '../components/warehouse/MultiWarehouseNetworkView'
import { MultiWarehouseAnalyticsView } from '../components/analytics/MultiWarehouseAnalyticsView'
import { DigitalTwinScreen } from '../screens/DigitalTwinScreen'
import { OptimizationLabScreen } from '../screens/OptimizationLabScreen'
import { SuppliersScreen } from '../screens/SuppliersScreen'
import { ScreenContent } from '../screens/Screens'
import { useAppStore } from '../store/useAppStore'
import { skus } from '../data/mockData'
import { getAvailableQuantity, getBoxId } from '../data/inventoryUtils'
import { Badge, Button, Card, PageHeader } from '../components/ui'

export const ManagerPortalView: FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'demand-intelligence' | 'network' | 'warehouse' | 'replenishment' | 'dispatch-picker' | 'co-placement' | 'optimization' | 'analytics'>('dashboard')
  const requests = useAppStore((state) => state.replenishmentRequests)
  const pendingInTransit = requests.filter((r) => r.status === 'In transit').length
  const order = useAppStore((state) => state.pickOrder)
  const inventory = useAppStore((state) => state.inventory)
  const bins = useAppStore((state) => state.bins)
  const dispatchPickTask = useAppStore((state) => state.dispatchPickTask)
  const coPlacementOrders = useAppStore((state) => state.coPlacementOrders)
  const approveCoPlacementOrder = useAppStore((state) => state.approveCoPlacementOrder)
  const [managerApprovalMsg, setManagerApprovalMsg] = useState('')

  const proposedCoPlacements = coPlacementOrders.filter((o) => o.status === 'Proposed by Analyst')

  // Dispatch pick form state
  const [skuId, setSkuId] = useState('SKU-2084')
  const [binId, setBinId] = useState('C-06-02')
  const [quantity, setQuantity] = useState('5')
  const [priority, setPriority] = useState<'High' | 'Normal' | 'Low'>('High')
  const [orderRef, setOrderRef] = useState('ORD-98402')
  const [dispatchMsg, setDispatchMsg] = useState<{ text: string; ok: boolean } | null>(null)

  const selectedStock = inventory.find((item) => item.skuId === skuId && item.binId === binId)
  const selectedBin = bins.find((b) => b.id === binId)
  const availableQty = selectedStock ? getAvailableQuantity(selectedStock) : 0
  const boxId = getBoxId(binId, selectedBin?.level ?? 2, selectedBin?.face === 'back' ? 'B' : 'F')
  const matchingBins = inventory.filter((item) => item.skuId === skuId && item.available && item.quantity > 0)

  function handleDispatchPick() {
    const qtyNum = Number(quantity)
    if (!selectedStock) {
      setDispatchMsg({ text: 'Selected SKU and Rack location have no inventory record.', ok: false })
      return
    }
    const result = dispatchPickTask({
      skuId,
      binId,
      quantity: qtyNum,
      priority,
      notes: `Order Ref: ${orderRef} · Express Pick`,
    })
    setDispatchMsg({ text: result.message, ok: result.ok })
  }

  const completedStops = order.lines.filter((l) => l.picked >= l.requested).length
  const totalStops = order.lines.length
  const totalPicked = order.lines.reduce((s, l) => s + l.picked, 0)
  const totalRequested = order.lines.reduce((s, l) => s + l.requested, 0)

  return (
    <div className="character-app-root manager-theme">
      <RoleSwitcherBar currentRole="manager" />
      <header className="character-header manager-header">
        <div className="char-brand">
          <span className="char-badge manager">
            <Warehouse size={18} />
          </span>
          <div>
            <h1>SmartSlot <span>MANAGER</span></h1>
            <small>DC Operations Command Center · Oakland, CA</small>
          </div>
        </div>
        <div className="char-user-info">
          <div className="operator-pill manager-pill">
            <User size={14} />
            <span>Warehouse Manager: <strong>Jordan Mitchell</strong></span>
          </div>
          <div className="shift-pill">
            <Shield size={14} />
            <span>Checkpoint Reviewer: <strong>Jamie Rivera</strong></span>
          </div>
        </div>
      </header>

      <div className="manager-subnav">
        <button
          className={`manager-tab-btn ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          <LayoutDashboard size={15} />
          <span>Dashboard Overview</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'inventory' ? 'active' : ''}`}
          onClick={() => setActiveTab('inventory')}
        >
          <Boxes size={15} />
          <span>Inventory Master (CRUD)</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'demand-intelligence' ? 'active' : ''}`}
          onClick={() => setActiveTab('demand-intelligence')}
        >
          <TrendingUp size={15} />
          <span>Demand Intelligence & Pareto</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveTab('network')}
        >
          <Building2 size={15} />
          <span>Multi-Warehouse Network</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'warehouse' ? 'active' : ''}`}
          onClick={() => setActiveTab('warehouse')}
        >
          <Warehouse size={15} />
          <span>3D Warehouse Digital Twin</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'replenishment' ? 'active' : ''}`}
          onClick={() => setActiveTab('replenishment')}
        >
          <Truck size={15} />
          <span>Replenishment & Receiving</span>
          {pendingInTransit > 0 && <span className="tab-counter">{pendingInTransit}</span>}
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'dispatch-picker' ? 'active' : ''}`}
          onClick={() => setActiveTab('dispatch-picker')}
        >
          <ClipboardCheck size={15} />
          <span>Order Picker Dispatch</span>
          {totalStops - completedStops > 0 && <span className="tab-counter">{totalStops - completedStops}</span>}
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'co-placement' ? 'active' : ''}`}
          onClick={() => setActiveTab('co-placement')}
        >
          <Boxes size={15} />
          <span>Analyst Co-Placement Orders</span>
          {proposedCoPlacements.length > 0 && <span className="tab-counter amber">{proposedCoPlacements.length}</span>}
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'optimization' ? 'active' : ''}`}
          onClick={() => setActiveTab('optimization')}
        >
          <Zap size={15} />
          <span>Optimization Lab & Approvals</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={15} />
          <span>Multi-Warehouse Analytics</span>
        </button>
      </div>

      <main className="character-main">
        {activeTab === 'dashboard' && <ScreenContent screen="dashboard" />}
        {activeTab === 'inventory' && <InventoryManagementView />}
        {activeTab === 'demand-intelligence' && <DemandIntelligenceView />}
        {activeTab === 'network' && <MultiWarehouseNetworkView />}
        {activeTab === 'warehouse' && <DigitalTwinScreen />}
        {activeTab === 'replenishment' && <SuppliersScreen />}
        {activeTab === 'optimization' && <OptimizationLabScreen />}
        {activeTab === 'analytics' && <MultiWarehouseAnalyticsView />}

        {activeTab === 'dispatch-picker' && (
          <div className="dispatch-picker-layout">
            <PageHeader
              title="Order Picker Tasks & Live Telemetry"
              description="Command order pickers to retrieve specific stock boxes from warehouse racks. Tasks appear live on Alex Morgan's handheld terminal on Port 5173."
              action={
                <div className="picker-telemetry-badge">
                  <User size={13} />
                  <span>Assigned Operator: <strong>Alex Morgan (Cart P-07)</strong></span>
                  <span className="telemetry-online">ONLINE :5173</span>
                </div>
              }
            />

            {dispatchMsg && (
              <div className={`replenishment-toast ${dispatchMsg.ok ? 'ok' : 'error'}`} role="status">
                {dispatchMsg.ok ? <Check size={14} /> : <AlertCircle size={14} />} {dispatchMsg.text}
              </div>
            )}

            <div className="dispatch-grid">
              <Card
                title="Dispatch Pick Task to Alex Morgan"
                subtitle="Select SKU, Rack location, Box ID, and quantity to order pick"
                action={<Badge>{priority} Priority</Badge>}
              >
                <div className="dispatch-form">
                  <label>
                    SELECT SKU / PRODUCT
                    <select
                      value={skuId}
                      onChange={(e) => {
                        setSkuId(e.target.value)
                        const next = inventory.find((it) => it.skuId === e.target.value && it.available && it.quantity > 0)
                        if (next) setBinId(next.binId)
                      }}
                    >
                      {skus.map((item) => (
                        <option key={item.id} value={item.id}>{item.id} · {item.name}</option>
                      ))}
                    </select>
                  </label>

                  <label>
                    RACK LOCATION (BIN)
                    <select
                      value={binId}
                      onChange={(e) => setBinId(e.target.value)}
                    >
                      {matchingBins.map((it) => (
                        <option key={it.binId} value={it.binId}>
                          Rack {it.binId} (On Hand: {it.quantity} units)
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="rack-box-info-pill">
                    <div className="info-block">
                      <span>UNIQUE BOX ID</span>
                      <strong><Box size={13} /> {boxId}</strong>
                    </div>
                    <div className="info-block">
                      <span>RACK COORDINATES</span>
                      <strong>Zone {selectedBin?.zone ?? 'C'} · Aisle {selectedBin?.aisle ?? 6} · Bay {selectedBin?.bay ?? 2} · Level {selectedBin?.level ?? 2}</strong>
                    </div>
                    <div className="info-block">
                      <span>AVAILABLE UNRESERVED</span>
                      <strong className="text-green">{availableQty} units</strong>
                    </div>
                  </div>

                  <div className="form-row-two">
                    <label>
                      QUANTITY TO PICK
                      <input
                        type="number"
                        min="1"
                        max={availableQty || 1}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                      />
                    </label>
                    <label>
                      TASK PRIORITY
                      <select
                        value={priority}
                        onChange={(e) => setPriority(e.target.value as 'High' | 'Normal' | 'Low')}
                      >
                        <option value="High">High Priority</option>
                        <option value="Normal">Normal</option>
                        <option value="Low">Low</option>
                      </select>
                    </label>
                  </div>

                  <label>
                    CUSTOMER ORDER REFERENCE / NOTES
                    <input
                      value={orderRef}
                      onChange={(e) => setOrderRef(e.target.value)}
                      placeholder="e.g. ORD-98402 · Express priority"
                    />
                  </label>

                  <Button
                    onClick={handleDispatchPick}
                    disabled={availableQty <= 0}
                  >
                    <Send size={14} /> Send Pick Task to Order Picker (Alex Morgan · Port 5173)
                  </Button>
                </div>
              </Card>

              <Card
                title={`Live Picker Telemetry · ${order.id}`}
                subtitle={`Assigned to ${order.picker} · Cart ${order.assignedTo} · Status: ${order.status}`}
                action={
                  <span className="telemetry-progress-pill">
                    {completedStops} / {totalStops} stops complete ({totalPicked}/{totalRequested} units)
                  </span>
                }
              >
                <div className="picker-telemetry-body">
                  <div className="telemetry-bar-wrap">
                    <div
                      className="telemetry-bar-fill"
                      style={{ width: `${totalRequested ? (totalPicked / totalRequested) * 100 : 0}%` }}
                    />
                  </div>

                  <div className="telemetry-stops-list">
                    <h4>Assigned Pick Route Stops:</h4>
                    {order.lines.map((line, idx) => {
                      const sku = skus.find((s) => s.id === line.skuId)
                      const isDone = line.picked >= line.requested
                      const isCurrent = idx === order.currentStopIndex && !isDone

                      return (
                        <div
                          key={line.id}
                          className={`telemetry-stop-row ${isCurrent ? 'active' : ''} ${isDone ? 'done' : ''}`}
                        >
                          <span className="stop-idx">
                            {isDone ? <Check size={12} /> : idx + 1}
                          </span>
                          <div className="stop-details">
                            <strong>Rack {line.binId}</strong>
                            <small className="box-tag"><Box size={10} /> {line.boxId || getBoxId(line.binId)}</small>
                            <span className="stop-product">{sku?.name ?? line.skuId}</span>
                          </div>
                          <div className="stop-status-col">
                            <b>{line.picked}/{line.requested} picked</b>
                            <Badge>{isDone ? 'Picked' : isCurrent ? 'Active Stop' : 'Pending'}</Badge>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  <div className="telemetry-note">
                    <Clock3 size={13} />
                    <span>When Alex Morgan confirms pick on Port 5173 by pressing YES, inventory decrements automatically and confirmation reflects here in real time.</span>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'co-placement' && (
          <div className="manager-co-placement-layout">
            <PageHeader
              title="Analyst Co-Placement &amp; Spacing Work Orders"
              description="Review cross-selling layout recommendations from Data Analyst Studio. Approve work orders to dispatch physical re-slotting missions to Order Picker Alex Morgan on Port 5173."
              action={
                <div className="picker-telemetry-badge">
                  <Sparkles size={13} />
                  <span>Analyst Feed: <strong>{proposedCoPlacements.length} Pending Review</strong></span>
                </div>
              }
            />

            {managerApprovalMsg && (
              <div className="co-dispatch-toast">
                <Check size={16} />
                <span>{managerApprovalMsg}</span>
              </div>
            )}

            <div className="co-manager-cards-list">
              {coPlacementOrders.map((ord) => {
                const isProposed = ord.status === 'Proposed by Analyst'
                const isAssigned = ord.status === 'Assigned to Picker'
                const isDone = ord.status === 'Completed by Picker'

                return (
                  <Card key={ord.id} className="manager-co-card">
                    <div className="mco-header">
                      <div>
                        <div className="mco-badge-row">
                          <code className="order-id-code">{ord.id}</code>
                          <Badge tone={isDone ? 'green' : isAssigned ? 'blue' : 'amber'}>
                            {ord.status}
                          </Badge>
                          <span className="mco-cat">{ord.category}</span>
                        </div>
                        <h3 className="mco-title">{ord.title}</h3>
                      </div>
                      <div className="mco-kpis">
                        <div className="mco-kpi-item green">
                          <span>Predicted Sales Lift</span>
                          <strong>+{ord.predictedSalesLiftPercent}%</strong>
                        </div>
                        <div className="mco-kpi-item purple">
                          <span>Est. Revenue</span>
                          <strong>+R$ {ord.predictedMonthlyRevenue.toLocaleString()}</strong>
                        </div>
                        <div className="mco-kpi-item blue">
                          <span>Travel Saved</span>
                          <strong>-{ord.pickerTimeSavedSeconds}s</strong>
                        </div>
                      </div>
                    </div>

                    <div className="mco-spacing-grid">
                      <div className="spacing-cell">
                        <span className="spacing-sub">Current Distance</span>
                        <div className="spacing-val text-red">{ord.initialDistanceMeters}m Apart</div>
                        <div className="spacing-locs">
                          <span>{ord.skuA.name}: Rack {ord.skuA.currentBin} ({ord.skuA.currentBoxId})</span>
                          <span>{ord.skuB.name}: Rack {ord.skuB.currentBin} ({ord.skuB.currentBoxId})</span>
                        </div>
                      </div>

                      <div className="spacing-cell highlight">
                        <span className="spacing-sub">Target Co-Placement</span>
                        <div className="spacing-val text-green">{ord.targetDistanceMeters}m Adjacent</div>
                        <div className="spacing-locs">
                          <span>Move {ord.skuA.name} &rarr; <strong>Rack {ord.skuA.targetBin} ({ord.skuA.targetBoxId})</strong></span>
                          <span>Adjacent to {ord.skuB.name} in <strong>Rack {ord.skuB.targetBin} ({ord.skuB.targetBoxId})</strong></span>
                        </div>
                      </div>
                    </div>

                    <p className="mco-rationale">
                      <strong>Analyst Rationale:</strong> {ord.rationale}
                    </p>

                    <div className="mco-actions-bar">
                      <div className="mco-meta-note">
                        {isProposed && <span>Submitted by Data Analyst Studio (:5176) &middot; Awaiting Manager Approval</span>}
                        {isAssigned && <span>Assigned to <strong>{ord.assignedPicker}</strong> &middot; Mission active on handheld terminal :5173</span>}
                        {isDone && <span className="text-green font-bold">&#x2714; Verified Re-Slotted &middot; Items adjacent in warehouse &middot; Live sales lift active</span>}
                      </div>

                      {isProposed && (
                        <Button
                          variant="primary"
                          onClick={() => {
                            approveCoPlacementOrder(ord.id, 'Alex Morgan (P-07)')
                            setManagerApprovalMsg(`Approved! Work order ${ord.id} ordered to Picker Alex Morgan (Cart P-07).`)
                            setTimeout(() => setManagerApprovalMsg(''), 6000)
                          }}
                        >
                          <Send size={14} />
                          <span>Approve &amp; Order Worker (Alex Morgan) to Re-Slot</span>
                        </Button>
                      )}
                    </div>
                  </Card>
                )
              })}
            </div>
          </div>
        )}
      </main>

      <footer className="character-footer">
        <span>SmartSlot AI Manager Portal · Jordan Mitchell & Jamie Rivera · Port 5175</span>
        <span>Executive Command Center · West Coast DC · Live Synced</span>
      </footer>
    </div>
  )
}
