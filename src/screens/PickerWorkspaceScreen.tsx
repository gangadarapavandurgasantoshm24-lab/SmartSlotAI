import { useRef, useState } from 'react'
import { AlertTriangle, ArrowRight, Box, Check, CheckCircle2, ChevronRight, CircleAlert, Clock3, Compass, Flag, Footprints, MapPin, PackageCheck, PauseCircle, RotateCcw, Route, ShieldAlert, Sparkles, X } from 'lucide-react'
import { skus } from '../data/mockData'
import { getAvailableQuantity, getBoxId, getStockStatus } from '../data/inventoryUtils'
import { useAppStore } from '../store/useAppStore'
import { Badge, Button, Card, PageHeader } from '../components/ui'
import { WarehouseScene } from '../components/digital-twin/WarehouseScene'
import type { BinIssueType } from '../types'

const issueTypes: BinIssueType[] = ['Empty Bin', 'Damaged Product', 'Incorrect Location', 'Quantity Mismatch', 'Other']

function createTransactionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `PICK-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export function PickerWorkspaceScreen() {
  const bins = useAppStore((state) => state.bins)
  const inventory = useAppStore((state) => state.inventory)
  const selectedBinId = useAppStore((state) => state.selectedBinId)
  const selectBin = useAppStore((state) => state.selectBin)
  const order = useAppStore((state) => state.pickOrder)
  const issues = useAppStore((state) => state.pickIssues)
  const lastResult = useAppStore((state) => state.lastPickResult)
  const confirmPick = useAppStore((state) => state.confirmPick)
  const selectPickStop = useAppStore((state) => state.selectPickStop)
  const nextPendingStop = useAppStore((state) => state.nextPendingStop)
  const reportPickIssue = useAppStore((state) => state.reportPickIssue)
  const coPlacementOrders = useAppStore((state) => state.coPlacementOrders)
  const completeCoPlacementOrder = useAppStore((state) => state.completeCoPlacementOrder)
  const activeRoutePreview = useAppStore((state) => state.activeRoutePreview)
  const calculatePickRoute = useAppStore((state) => state.calculatePickRoute)
  const applyOptimizedRoute = useAppStore((state) => state.applyOptimizedRoute)
  const cancelRoutePreview = useAppStore((state) => state.cancelRoutePreview)
  const blockedAislesByWarehouse = useAppStore((state) => state.blockedAislesByWarehouse)
  const toggleAisleBlock = useAppStore((state) => state.toggleAisleBlock)
  const routingAlgorithm = useAppStore((state) => state.routingAlgorithm)
  const setRoutingAlgorithm = useAppStore((state) => state.setRoutingAlgorithm)
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId)
  const [routeMsg, setRouteMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [quantityOverride, setQuantityOverride] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [issueOpen, setIssueOpen] = useState(false)
  const [transactionId, setTransactionId] = useState<string | null>(null)
  const [validationMessage, setValidationMessage] = useState('')
  const [coPlacementMsg, setCoPlacementMsg] = useState<{ text: string; ok: boolean } | null>(null)
  const [issueType, setIssueType] = useState<BinIssueType>('Quantity Mismatch')
  const [issueDescription, setIssueDescription] = useState('')
  const [manualCount, setManualCount] = useState('')
  const [issueMessage, setIssueMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const activeLine = order.lines[order.currentStopIndex]
  const activeSku = activeLine ? skus.find((sku) => sku.id === activeLine.skuId) : undefined
  const activeStock = activeLine ? inventory.find((item) => item.binId === activeLine.binId && item.skuId === activeLine.skuId) : undefined
  const targetBin = activeLine ? bins.find((bin) => bin.id === activeLine.binId) : undefined
  const selectedBin = bins.find((bin) => bin.id === selectedBinId)
  const selectedIssue = issues.find((issue) => issue.taskId === order.id)
  const issueStock = selectedIssue ? inventory.find((item) => item.binId === selectedIssue.binId) : undefined
  const pickedUnits = order.lines.reduce((sum, line) => sum + line.picked, 0)
  const totalUnits = order.lines.reduce((sum, line) => sum + line.requested, 0)
  const completedStops = order.lines.filter((line) => line.picked >= line.requested).length
  const remainingStops = order.lines.length - completedStops
  const available = activeStock ? getAvailableQuantity(activeStock) : 0
  const alreadyPicked = activeLine?.picked ?? 0
  const lineRemaining = activeLine ? activeLine.requested - activeLine.picked : 0
  const quantity = quantityOverride ?? String(lineRemaining || 1)
  const amount = Number(quantity)
  const calculatedStatus = activeStock ? getStockStatus(activeStock) : 'Unavailable'
  const latestWarning = lastResult?.ok && lastResult.lowStock ? lastResult : null
  const currentMovement = useAppStore((state) => lastResult ? state.movements.find((movement) => movement.binId === lastResult.binId && movement.source === 'picker-workspace') : undefined)
  const routeDistance = Math.max(0, 186 - completedStops * 44)
  const sceneFocusBin = selectedBin

  function openConfirmation() {
    setValidationMessage('')
    setTransactionId(createTransactionId())
    setConfirmOpen(true)
  }

  function handleConfirmPick() {
    if (!activeLine || !transactionId || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    const result = confirmPick(activeLine.id, amount, transactionId)
    setSubmitting(false)
    submittingRef.current = false
    if (!result.ok) {
      setValidationMessage(result.message)
      return
    }
    setConfirmOpen(false)
    setValidationMessage('')
    setTransactionId(null)
    setQuantityOverride(null)
  }

  function handleReportIssue() {
    const parsedCount = manualCount.trim() ? Number(manualCount) : undefined
    if (parsedCount !== undefined && (!Number.isInteger(parsedCount) || parsedCount < 0)) {
      setIssueMessage('Manual count must be a non-negative whole number.')
      return
    }
    const issue = reportPickIssue(issueType, issueDescription, parsedCount)
    if (!issue) {
      setIssueMessage('This task cannot accept another issue report while paused or complete.')
      return
    }
    setIssueMessage('')
    setIssueOpen(false)
    setIssueDescription('')
    setManualCount('')
  }

  function selectFromScene(binId: string) {
    selectBin(binId)
    const stop = order.lines.find((line) => line.binId === binId && line.picked < line.requested)
    if (stop) { selectPickStop(stop.id); setQuantityOverride(null) }
  }

  const currentWarehouseBlockedAisles = blockedAislesByWarehouse[selectedWarehouseId || 'WH-HYD-01'] || []

  function handleCalculateRoute(algo?: 'astar' | 'dijkstra') {
    const res = calculatePickRoute({
      warehouseId: selectedWarehouseId || 'WH-HYD-01',
      algorithm: algo || routingAlgorithm,
    })
    if (!res.reachable) {
      setRouteMsg({
        text: `Routing restriction: ${res.unreachableBins.join(', ')} is unreachable in blocked aisles. Diversion active.`,
        ok: false,
      })
    } else {
      setRouteMsg({
        text: `Shortest tour generated via ${res.algorithm}. Saved ${res.distanceSavedMeters}m (${res.percentageDistanceSaved}%).`,
        ok: true,
      })
    }
  }

  function handleApplyRoute() {
    const res = applyOptimizedRoute()
    setRouteMsg({ text: res.message, ok: res.ok })
    setTimeout(() => setRouteMsg(null), 6000)
  }

  const paused = order.status === 'Paused'
  const complete = order.status === 'Complete'

  return <>
    <PageHeader title="Picker Workspace" description="One order. A clear route. Every pick accounted for." action={<div className="picker-assignment"><span className="picker-avatar">AM</span><span>Assigned to you · {order.assignedTo}</span></div>} />
    <section className="picker-order-summary">
      <div className="picker-order-id"><span>ACTIVE ORDER</span><strong>{order.id}</strong><Badge>{`${order.priority} priority`}</Badge><Badge>{order.status}</Badge></div>
      <div className="order-summary-stat"><span>Completed</span><b>{completedStops}/{order.lines.length}</b></div>
      <div className="order-summary-stat"><span>Remaining</span><b>{remainingStops} stops</b></div>
      <div className="order-summary-stat"><span>Est. distance</span><b>{activeRoutePreview?.reachable ? `${activeRoutePreview.optimizedDistanceMeters} m` : `${routeDistance} m`}</b></div>
      <div className="order-progress"><div><i style={{ width: `${totalUnits ? (pickedUnits / totalUnits) * 100 : 0}%` }}/></div><span>{pickedUnits} / {totalUnits} units picked</span></div>
    </section>

    {paused && <div className="picker-state-banner issue-state"><PauseCircle size={17}/><div><strong>Issue reported · Pick paused</strong><span>{selectedIssue?.type} at {selectedIssue?.binId} is awaiting supervisor review. No inventory was changed; this task stays paused until the issue is reviewed.</span></div><Badge>Pick paused</Badge></div>}
    {paused && selectedIssue && <Card title="Reported bin issue" subtitle={`Awaiting supervisor review · ${selectedIssue.id}`} className="reported-issue-card"><div className="reported-issue-grid"><div><span>Bin location</span><strong>{selectedIssue.binId}</strong></div><div><span>Issue type</span><strong>{selectedIssue.type}</strong></div><div><span>Recorded on hand</span><strong>{issueStock?.quantity ?? '—'} units · unchanged</strong></div><div><span>Manual count</span><strong>{selectedIssue.manualCount === undefined ? 'Not provided' : `${selectedIssue.manualCount} units`}</strong></div><div className="reported-issue-description"><span>Notes</span><strong>{selectedIssue.description || 'No additional notes provided.'}</strong></div><div><span>Submitted (UTC)</span><strong>{selectedIssue.timestamp.slice(0, 16).replace('T', ' ')}</strong></div></div><div className="issue-pause-note"><PauseCircle size={14}/> The route is paused at this stop until a supervisor reviews the count and resumes the order.</div></Card>}
    {complete && <div className="picker-state-banner success-state"><CheckCircle2 size={17}/><div><strong>Order complete</strong><span>All {order.lines.length} stops have been picked and recorded in shared inventory.</span></div><Badge>Complete</Badge></div>}
    {lastResult?.ok && <div className="picker-state-banner success-state"><CheckCircle2 size={17}/><div><strong>Pick confirmed · {lastResult.quantity} units picked</strong><span>{lastResult.skuId} from {lastResult.binId} · {lastResult.remaining} units remain in the shared bin record.</span></div><Badge>Success</Badge></div>}
    {latestWarning && <div className="picker-state-banner low-stock-state"><AlertTriangle size={17}/><div><strong>{latestWarning.remaining === 0 ? 'Empty bin · Replenishment attention' : 'Low stock · Replenishment attention'}</strong><span>{latestWarning.binId} now has {latestWarning.remaining} units, at or below its reorder point of {inventory.find((item) => item.binId === latestWarning.binId)?.reorderPoint}. No replenishment request was created.</span></div><Badge>{latestWarning.remaining === 0 ? 'Empty' : 'Low stock'}</Badge></div>}

    {coPlacementMsg && (
      <div className={`picker-state-banner ${coPlacementMsg.ok ? 'success-state' : 'issue-state'}`}>
        {coPlacementMsg.ok ? <CheckCircle2 size={17} /> : <AlertTriangle size={17} />}
        <div>
          <strong>{coPlacementMsg.ok ? 'Re-Slotting Verified & Completed!' : 'Re-Slotting Validation Error'}</strong>
          <span>{coPlacementMsg.text}</span>
        </div>
        <Badge tone={coPlacementMsg.ok ? 'green' : 'amber'}>{coPlacementMsg.ok ? 'Re-Slotted' : 'Action Blocked'}</Badge>
      </div>
    )}

    {coPlacementOrders.filter((o) => o.status === 'Assigned to Picker').map((mission) => (
      <Card key={mission.id} className="picker-reslot-mission-card">
        <div className="reslot-header">
          <div className="reslot-badge-row">
            <span className="reslot-tag">🎯 SUPERVISOR RE-SLOTTING MISSION</span>
            <code className="order-id-code">{mission.id}</code>
            <Badge tone="purple">Cross-Selling Layout Lift: +{mission.predictedSalesLiftPercent}%</Badge>
          </div>
          <h3 className="reslot-title">{mission.title}</h3>
          <p className="reslot-desc">
            Supervisor Jordan Mitchell assigned you to relocate this item next to its complementary product to increase customer sales and minimize walking travel.
          </p>
        </div>

        <div className="reslot-movement-box">
          <div className="reslot-loc source">
            <span className="loc-label">1. RETRIEVE FROM CURRENT BOX</span>
            <strong className="loc-rack">Rack {mission.skuA.currentBin}</strong>
            <span className="loc-box">Box ID: <strong>{mission.skuA.currentBoxId}</strong></span>
            <span className="loc-item">{mission.skuA.name} ({mission.skuA.id})</span>
          </div>

          <div className="reslot-arrow">
            <ArrowRight size={22} />
            <small>RELOCATE</small>
          </div>

          <div className="reslot-loc target">
            <span className="loc-label">2. PLACE INTO ADJACENT TARGET BOX</span>
            <strong className="loc-rack highlight-target">Rack {mission.skuA.targetBin}</strong>
            <span className="loc-box">Box ID: <strong>{mission.skuA.targetBoxId}</strong></span>
            <span className="loc-item">Adjacent to: <strong>{mission.skuB.name}</strong> ({mission.skuB.targetBin})</span>
          </div>
        </div>

        <div className="reslot-action-row">
          <div className="reslot-benefit">
            <span>⏱️ Saves <strong>{mission.pickerTimeSavedSeconds}s</strong> per pick &middot; 📈 Forecasts <strong>+{mission.predictedSalesLiftPercent}%</strong> bundle conversion</span>
          </div>
          <Button
            variant="primary"
            onClick={() => {
              const res = completeCoPlacementOrder(mission.id)
              setCoPlacementMsg({ text: res.message, ok: res.ok })
              setTimeout(() => setCoPlacementMsg(null), 8000)
            }}
          >
            <Check size={16} />
            <span>YES, CONFIRM RE-SLOT / CO-PLACEMENT EXECUTED</span>
          </Button>
        </div>
      </Card>
    ))}

    {/* Route Optimization Control Card */}
    <Card className="picker-optimizer-card" title="Shortest-Route Optimization & Obstacle Navigation" subtitle="Graph-based A* & Dijkstra pathfinding with Nearest-Neighbor + 2-Opt TSP heuristic tour improvement">
      <div className="optimizer-top-bar">
        <div className="algo-selector-group">
          <span className="algo-label"><Compass size={14} /> Algorithm:</span>
          <div className="algo-pill-buttons">
            <button
              type="button"
              className={`algo-btn ${routingAlgorithm === 'astar' ? 'active' : ''}`}
              onClick={() => {
                setRoutingAlgorithm('astar')
                handleCalculateRoute('astar')
              }}
            >
              A* Search (Admissible Heuristic)
            </button>
            <button
              type="button"
              className={`algo-btn ${routingAlgorithm === 'dijkstra' ? 'active' : ''}`}
              onClick={() => {
                setRoutingAlgorithm('dijkstra')
                handleCalculateRoute('dijkstra')
              }}
            >
              Dijkstra (Exact Shortest Paths)
            </button>
          </div>
        </div>

        <div className="optimizer-action-btns">
          <Button
            variant="primary"
            onClick={() => handleCalculateRoute()}
          >
            <Sparkles size={14} />
            <span>{activeRoutePreview ? 'Recalculate Route' : 'Optimize Route (2-Opt TSP)'}</span>
          </Button>

          {activeRoutePreview && (
            <Button
              variant="secondary"
              onClick={handleApplyRoute}
              disabled={!activeRoutePreview.reachable || activeRoutePreview.distanceSavedMeters <= 0}
            >
              <Check size={14} />
              <span>Apply Optimized Sequence</span>
            </Button>
          )}

          {activeRoutePreview && (
            <Button
              variant="quiet"
              onClick={() => {
                cancelRoutePreview()
                setRouteMsg(null)
              }}
            >
              <RotateCcw size={13} />
              <span>Reset</span>
            </Button>
          )}
        </div>
      </div>

      {routeMsg && (
        <div className={`picker-state-banner ${routeMsg.ok ? 'success-state' : 'issue-state'}`} style={{ margin: '8px 14px' }}>
          {routeMsg.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <div>
            <strong>{routeMsg.ok ? 'Route Calculated' : 'Routing Alert'}</strong>
            <span>{routeMsg.text}</span>
          </div>
          <Badge tone={routeMsg.ok ? 'green' : 'amber'}>{routeMsg.ok ? 'Optimal' : 'Obstacle'}</Badge>
        </div>
      )}

      {activeRoutePreview && activeRoutePreview.reachable && (
        <div className="route-comparison-dashboard">
          <div className="route-stat-box">
            <span className="stat-label">Original Sequential Distance</span>
            <strong className="stat-value">{activeRoutePreview.originalDistanceMeters} m</strong>
            <small className="stat-sub">Depot → sequential lines → Depot</small>
          </div>

          <div className="route-stat-box highlight-opt">
            <span className="stat-label">Optimized 2-Opt TSP Distance</span>
            <strong className="stat-value opt-green">{activeRoutePreview.optimizedDistanceMeters} m</strong>
            <small className="stat-sub">Shortest non-crossing tour</small>
          </div>

          <div className="route-stat-box highlight-savings">
            <span className="stat-label">Total Walking Saved</span>
            <strong className="stat-value savings-blue">-{activeRoutePreview.distanceSavedMeters} m</strong>
            <small className="stat-sub">{activeRoutePreview.percentageDistanceSaved}% route reduction</small>
          </div>

          <div className="route-stat-box">
            <span className="stat-label">Est. Walking Time Saved</span>
            <strong className="stat-value">~{activeRoutePreview.estimatedWalkingTime.savedSeconds}s</strong>
            <small className="stat-sub">@ 1.2 m/s human cart speed</small>
          </div>
        </div>
      )}

      {activeRoutePreview && activeRoutePreview.reachable && (
        <div className="route-stops-preview-strip">
          <span className="strip-label"><Footprints size={13} /> Tour Sequence:</span>
          <div className="strip-stops">
            <span className="strip-depot">DEPOT</span>
            <ArrowRight size={12} className="strip-arrow" />
            {activeRoutePreview.stops.map((stop, idx) => (
              <span key={stop.binId} className="strip-stop-badge">
                <span className="badge-idx">{idx + 1}</span>
                <strong>{stop.binId}</strong>
                <small>({stop.requestedUnits}u)</small>
                {idx < activeRoutePreview.stops.length - 1 && <ArrowRight size={12} className="strip-arrow" />}
              </span>
            ))}
            <ArrowRight size={12} className="strip-arrow" />
            <span className="strip-depot">PACKING DEPOT</span>
          </div>
        </div>
      )}

      {/* Aisle Obstacle Simulation Controls */}
      <div className="obstacle-sim-row">
        <div className="obstacle-sim-label">
          <ShieldAlert size={14} />
          <span>Simulate Dynamic Aisle Blockage (Obstacle Avoidance):</span>
        </div>
        <div className="aisle-pills">
          {[1, 2, 3, 4, 5, 6].map((a) => {
            const isBlocked = currentWarehouseBlockedAisles.includes(a)
            return (
              <button
                key={a}
                type="button"
                className={`aisle-pill-btn ${isBlocked ? 'blocked' : ''}`}
                onClick={() => toggleAisleBlock(selectedWarehouseId || 'WH-HYD-01', a)}
              >
                {isBlocked ? `🚫 Aisle ${a} Blocked` : `Aisle ${a} Clear`}
              </button>
            )
          })}
        </div>
      </div>
    </Card>

    <div className="picker-main-grid">
      <Card title={paused ? 'Pick paused' : complete ? 'Order complete' : `Current pick · Stop ${order.currentStopIndex + 1} of ${order.lines.length}`} subtitle={paused ? 'Awaiting supervisor review' : 'Check unique box barcode and rack label before confirming'} className="active-pick-card">
        {activeLine && activeSku && activeStock && targetBin ? <>
          <div className="current-bin-heading">
            <div>
              <span className="bin-location-label">RACK LOCATION</span>
              <h2>Rack {activeLine.binId}</h2>
              <span>Zone {targetBin.zone} · Aisle {String(targetBin.aisle ?? 1).padStart(2, '0')} · Bay {String(targetBin.bay ?? 1).padStart(2, '0')} · Level {String(targetBin.level ?? 1).padStart(2, '0')} ({targetBin.face === 'back' ? 'Back' : 'Front'} Shelf)</span>
            </div>
            <div className="box-unique-badge">
              <Box size={14}/>
              <span>Unique Box ID: <strong>{activeLine.boxId || getBoxId(activeLine.binId, targetBin.level ?? 2, targetBin.face === 'back' ? 'B' : 'F')}</strong></span>
            </div>
            <Badge>{calculatedStatus}</Badge>
          </div>
          <div className="pick-product"><div className="product-symbol"><PackageCheck size={20}/></div><div><strong>{activeSku.name}</strong><span>{activeSku.id} · {activeSku.category} · Assigned by Manager</span></div></div>
          <div className="pick-quantities"><div><span>Required quantity</span><strong>{lineRemaining} <small>{activeSku.unit}{lineRemaining === 1 ? '' : 's'}</small></strong><small>{alreadyPicked} of {activeLine.requested} already picked</small></div><div><span>Available in bin</span><strong>{available} <small>{activeSku.unit}{available === 1 ? '' : 's'}</small></strong><small>On hand {activeStock.quantity} · reorder at {activeStock.reorderPoint}</small></div></div>
          <label className="pick-quantity-input">QUANTITY TO PICK<input type="number" min="1" max={Math.min(lineRemaining, available)} step="1" value={quantity} onChange={(event) => setQuantityOverride(event.target.value)} disabled={paused || complete}/></label>
          <div className="pick-action-row"><Button onClick={openConfirmation} disabled={paused || complete || !activeStock.available}><Check size={15}/> YES, I CONFIRM PICK</Button><Button variant="secondary" onClick={() => { setIssueMessage(''); setManualCount(''); setIssueOpen(true) }} disabled={paused || complete}><Flag size={14}/> Report Bin Issue</Button></div>
          {!activeStock.available && <div className="pick-inline-error"><CircleAlert size={14}/> This bin is unavailable; picking cannot continue from this location.</div>}
          <div className="pick-helper"><CircleAlert size={13}/>{activeStock.reserved > 0 ? `${activeStock.reserved} units are reserved and excluded from available stock.` : 'Pressing YES decrements warehouse stock and updates Manager & Analyst Studio in real time.'}</div>
        </> : <div className="picker-empty"><PackageCheck size={24}/><strong>{complete ? 'All stops are complete.' : 'No active pick line is available.'}</strong><span>{complete ? 'The order has no remaining quantities.' : 'Waiting for Warehouse Manager Jordan Mitchell to dispatch pick task.'}</span></div>}
      </Card>

      <Card title="Warehouse digital twin" subtitle={`${targetBin ? `Target Rack ${targetBin.id} · Box ${activeLine?.boxId || getBoxId(targetBin.id)}` : 'Tap a route stop to locate it'}`} className="picker-map-card" action={<span className="picker-view-label">ISOMETRIC VIEW</span>}>
        <div className="picker-canvas-wrap"><WarehouseScene bins={bins} inventory={inventory} selectedBinId={selectedBinId} onSelect={selectFromScene} resetVersion={0} zoomVersion={0} focusVersion={0} focusBin={sceneFocusBin}/><div className="picker-map-target"><MapPin size={12}/>{targetBin?.id ?? 'No target'}</div><div className="picker-map-legend"><span><i className="legend-healthy"/> Healthy</span><span><i className="legend-low"/> Low stock</span><span><i className="legend-empty"/> Empty</span><span><i className="legend-selected"/> Selected</span></div></div>
        <div className="picker-route-header">
          <span><Route size={14}/> Your picking route</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {activeRoutePreview && activeRoutePreview.reachable && activeRoutePreview.distanceSavedMeters > 0 && (
              <Badge tone="green">Saved {activeRoutePreview.distanceSavedMeters}m ({activeRoutePreview.percentageDistanceSaved}%)</Badge>
            )}
            <span>{completedStops}/{order.lines.length} done</span>
          </span>
        </div>
        <div className="picker-route-list">{order.lines.map((line, index) => { const sku = skus.find((item) => item.id === line.skuId); const done = line.picked >= line.requested; const current = index === order.currentStopIndex && !done; return <button key={line.id} className={`picker-route-stop ${current ? 'current' : ''} ${done ? 'done' : ''}`} onClick={() => { selectPickStop(line.id); setQuantityOverride(null) }} disabled={paused || complete || done}><span className="route-stop-number">{done ? <Check size={12}/> : index + 1}</span><span className="route-stop-copy"><strong>Rack {line.binId} <small className="inline-box-id">({line.boxId || getBoxId(line.binId)})</small></strong><small>{sku?.name ?? line.skuId} · {line.picked}/{line.requested} picked</small></span><span className="route-stop-status">{done ? 'Complete' : current ? 'Current stop' : 'Next stop'}</span>{!done && <ChevronRight size={13}/>}</button>})}</div>
        <div className="picker-route-footer"><span><Clock3 size={12}/> {order.picker} · Due {order.due}</span><Button variant="quiet" onClick={() => { nextPendingStop(); setQuantityOverride(null) }} disabled={paused || complete || remainingStops < 2}>Next pending stop <ArrowRight size={13}/></Button></div>
      </Card>
    </div>

    <div className="picker-lower-grid">
      <Card title="Order items" subtitle={`${order.id} · ${order.lines.length} items · ${totalUnits} units`}>
        <div className="picker-table-scroll"><table className="picker-items-table"><thead><tr><th>SKU</th><th>PRODUCT & BOX ID</th><th>REQ.</th><th>PICKED</th><th>STATUS</th></tr></thead><tbody>{order.lines.map((line, index) => { const sku = skus.find((item) => item.id === line.skuId); const done = line.picked >= line.requested; const current = index === order.currentStopIndex && !done; return <tr key={line.id} className={current ? 'current-row' : ''} onClick={() => !done && selectPickStop(line.id)} tabIndex={done || paused || complete ? -1 : 0} onKeyDown={(event) => { if (event.key === 'Enter' && !done) selectPickStop(line.id) }}><td><strong>{line.skuId}</strong></td><td>{sku?.name ?? 'Unknown item'}<small>Rack {line.binId} · <strong>{line.boxId || getBoxId(line.binId)}</strong></small></td><td>{line.requested}</td><td>{line.picked}/{line.requested}</td><td>{done ? <Badge>Picked</Badge> : current ? <Badge>Current pick</Badge> : <Badge>Pending</Badge>}</td></tr>})}</tbody><tfoot><tr><td colSpan={3}>{order.lines.length} items shown · Assigned to {order.picker}</td><td colSpan={2}>{pickedUnits} / {totalUnits} units picked</td></tr></tfoot></table></div>
      </Card>
      <Card title="Pick activity" subtitle="Recent actions on this order" className="picker-activity-card">
        {lastResult?.ok ? <div className="picker-activity-item"><span className="activity-success-icon"><Check size={13}/></span><div><strong>{lastResult.quantity} units picked · Rack {lastResult.binId}</strong><small>{lastResult.skuId} · {currentMovement?.id ?? 'Movement recorded'}</small></div></div> : <div className="picker-activity-item"><span className="activity-success-icon neutral"><Clock3 size={13}/></span><div><strong>Order assigned to {order.picker}</strong><small>Pick order {order.id} · Due {order.due}</small></div></div>}
        {selectedIssue && <div className="picker-activity-item"><span className="activity-issue-icon"><Flag size={13}/></span><div><strong>Issue reported · {selectedIssue.type}</strong><small>{selectedIssue.binId} · {new Date(selectedIssue.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></div></div>}
        {currentMovement && <div className="picker-activity-meta">Movement {currentMovement.id} saved to inventory history.</div>}
        {issueMessage && <div className="pick-inline-error">{issueMessage}</div>}
      </Card>
    </div>

    {confirmOpen && activeLine && activeSku && activeStock && <QuantityConfirmationDialog skuName={activeSku.name} skuId={activeSku.id} binId={activeLine.binId} boxId={activeLine.boxId || getBoxId(activeLine.binId)} requested={lineRemaining} alreadyPicked={alreadyPicked} available={available} onHand={activeStock.quantity} reorderPoint={activeStock.reorderPoint} quantity={quantity} setQuantity={setQuantityOverride} error={validationMessage} submitting={submitting} onClose={() => { setConfirmOpen(false); setValidationMessage('') }} onConfirm={handleConfirmPick}/>}
    {issueOpen && activeLine && activeSku && <ReportIssueDialog binId={activeLine.binId} skuName={activeSku.name} type={issueType} setType={setIssueType} description={issueDescription} setDescription={setIssueDescription} manualCount={manualCount} setManualCount={setManualCount} error={issueMessage} onClose={() => setIssueOpen(false)} onSubmit={handleReportIssue}/>}
  </>
}

interface QuantityConfirmationDialogProps {
  skuName: string
  skuId: string
  binId: string
  boxId: string
  requested: number
  alreadyPicked: number
  available: number
  onHand: number
  reorderPoint: number
  quantity: string
  setQuantity: (value: string) => void
  error: string
  submitting: boolean
  onClose: () => void
  onConfirm: () => void
}

function QuantityConfirmationDialog({
  skuName,
  skuId,
  binId,
  boxId,
  requested,
  alreadyPicked,
  available,
  onHand,
  reorderPoint,
  quantity,
  setQuantity,
  error,
  submitting,
  onClose,
  onConfirm,
}: QuantityConfirmationDialogProps) {
  const amount = Number(quantity)
  const projectionValid = Number.isInteger(amount) && amount > 0 && amount <= available && amount <= requested

  return (
    <div
      className="picker-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="picker-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-pick-title">
        <header>
          <div className="dialog-icon">
            <PackageCheck size={18} />
          </div>
          <div>
            <h2 id="confirm-pick-title">Confirm Pick from Rack</h2>
            <p>Rack {binId} · Box {boxId}</p>
          </div>
          <button className="dialog-close" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </header>

        <div className="dialog-product">
          <strong>{skuName}</strong>
          <span>
            {skuId} <i /> Rack {binId} <i /> <strong>{boxId}</strong>
          </span>
        </div>

        <div className="dialog-stock-grid">
          <div>
            <span>Available in Rack</span>
            <b>{available} units</b>
          </div>
          <div>
            <span>Required to Pick</span>
            <b>{requested} units</b>
          </div>
          <div>
            <span>Already Picked</span>
            <b>{alreadyPicked}/{alreadyPicked + requested}</b>
          </div>
        </div>

        <label className="dialog-quantity">
          Quantity to pick
          <input
            autoFocus
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-invalid={Boolean(error)}
          />
        </label>

        <div className={`projected-balance ${projectionValid && onHand - amount <= reorderPoint ? 'warning' : ''}`}>
          <div>
            <span>Projected balance after this pick</span>
            <strong>{projectionValid ? `${onHand - amount} remaining` : 'Cannot fulfill this quantity'}</strong>
          </div>
          {projectionValid && (
            <small>
              <AlertTriangle size={12} />
              {onHand - amount <= reorderPoint
                ? `This leaves ${onHand - amount} units, at or below the reorder point of ${reorderPoint}. Manager will receive low-stock notification.`
                : 'Stock and route progress update across Manager and Analyst Studio instantly.'}
            </small>
          )}
        </div>

        {error && (
          <div className="dialog-validation" role="alert">
            <CircleAlert size={15} />
            <span>
              {error}
              <small>Nothing changed. Correct the quantity and try again.</small>
            </span>
          </div>
        )}

        <footer>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm} disabled={submitting}>
            <Check size={14} />
            {submitting ? 'Confirming…' : 'YES, I CONFIRM PICK'}
          </Button>
        </footer>
      </section>
    </div>
  )
}

interface ReportIssueDialogProps {
  binId: string
  skuName: string
  type: BinIssueType
  setType: (value: BinIssueType) => void
  description: string
  setDescription: (value: string) => void
  manualCount: string
  setManualCount: (value: string) => void
  error: string
  onClose: () => void
  onSubmit: () => void
}

function ReportIssueDialog({
  binId,
  skuName,
  type,
  setType,
  description,
  setDescription,
  manualCount,
  setManualCount,
  error,
  onClose,
  onSubmit,
}: ReportIssueDialogProps) {
  return (
    <div
      className="picker-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section className="picker-dialog issue-dialog" role="dialog" aria-modal="true" aria-labelledby="report-issue-title">
        <header>
          <div className="dialog-icon issue">
            <Flag size={17} />
          </div>
          <div>
            <h2 id="report-issue-title">Report bin issue</h2>
            <p>Picking will pause until a supervisor reviews the report.</p>
          </div>
          <button className="dialog-close" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </header>

        <div className="dialog-product">
          <strong>{binId}</strong>
          <span>{skuName} <i /> {binId}</span>
        </div>

        <fieldset className="issue-options">
          <legend>Issue type</legend>
          {issueTypes.map((option) => (
            <label key={option}>
              <input
                type="radio"
                name="issue-type"
                checked={type === option}
                onChange={() => setType(option)}
              />
              <span>{option}</span>
            </label>
          ))}
        </fieldset>

        {type === 'Quantity Mismatch' && (
          <label className="issue-count">
            Manual count (optional)
            <input
              type="number"
              min="0"
              step="1"
              value={manualCount}
              onChange={(event) => setManualCount(event.target.value)}
              placeholder="Enter the units you counted"
            />
          </label>
        )}

        <label className="issue-description">
          Notes (optional)
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Describe what you found at this bin..."
            rows={3}
          />
        </label>

        {error && (
          <div className="dialog-validation" role="alert">
            {error}
          </div>
        )}

        <div className="issue-stock-note">
          <AlertTriangle size={14} />
          <span>Reporting records the discrepancy only. Shared inventory will remain unchanged while the task is paused.</span>
        </div>

        <footer>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit}>
            <Flag size={14} /> Submit report
          </Button>
        </footer>
      </section>
    </div>
  )
}
