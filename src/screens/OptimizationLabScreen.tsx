import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, CircleAlert, LockKeyhole, Play, RotateCcw, ShieldCheck, SlidersHorizontal, Warehouse as WarehouseIcon } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import type { OptimizationRun, OptimizerWeights } from '../types'
import { Badge, Button, Card, Metric, PageHeader } from '../components/ui'
import { WarehouseScene } from '../components/digital-twin/WarehouseScene'

type LabView = 'configuration' | 'results' | 'warnings' | 'review' | 'approved'
const weightInfo: { key: keyof OptimizerWeights; label: string; description: string }[] = [
  { key: 'travelDistance', label: 'Travel distance', description: 'Reduce estimated walk distance, weighted by demo pick frequency.' },
  { key: 'cubeUtilization', label: 'Cube utilization', description: 'Prefer bins closer to the target fill ratio, subject to capacity.' },
  { key: 'goldenZone', label: 'Golden-zone preference', description: 'Prefer front pick zones for higher-frequency demo SKUs.' },
  { key: 'skuAffinity', label: 'SKU affinity', description: 'Keep co-picked SKU groups close in the same aisle.' },
]
const defaultView: LabView = 'configuration'

export function OptimizationLabScreen() {
  const bins = useAppStore((state) => state.bins)
  const inventory = useAppStore((state) => state.inventory)
  const config = useAppStore((state) => state.optimizationConfig)
  const run = useAppStore((state) => state.optimizationRun)
  const history = useAppStore((state) => state.optimizationHistory)
  const setConfig = useAppStore((state) => state.setOptimizationConfig)
  const runOptimizer = useAppStore((state) => state.runOptimization)
  const approve = useAppStore((state) => state.approveOptimization)
  const [view, setView] = useState<LabView>(defaultView)
  const [selectedWarning, setSelectedWarning] = useState(0)
  const [reviewed, setReviewed] = useState(false)
  const [message, setMessage] = useState('')
  const [selectedBinId, setSelectedBinId] = useState('')
  const isApproved = Boolean(run?.approvedAt)
  const revision = run ? `R${String(run.revision).padStart(2, '0')}` : 'Draft'
  const selectedRejected = run?.rejectedCandidates[selectedWarning]
  const liveFeasible = Boolean(run && run.placements.every((placement) => placement.feasible) && run.proposed.hardConstraintViolations === 0)
  const currentView: LabView = view
  const reviewLabel = useMemo(() => run ? `${run.placements.length} primary SKU placements · ${run.proposed.movementCount} proposed moves` : 'No proposal has been generated', [run])

  function changeWeight(key: keyof OptimizerWeights, value: number) {
    const others = weightInfo.map((item) => item.key).filter((item) => item !== key)
    const remaining = 100 - value
    const otherTotal = others.reduce((sum, other) => sum + config.weights[other], 0)
    const next = { ...config.weights, [key]: value }
    for (const other of others) next[other] = otherTotal ? Math.round(remaining * config.weights[other] / otherTotal) : Math.floor(remaining / others.length)
    const sum = Object.values(next).reduce((total, weight) => total + weight, 0)
    if (sum !== 100) next[others[0]] += 100 - sum
    setConfig({ ...config, weights: next })
  }

  function handleRun() {
    const result = runOptimizer()
    setMessage(`Generated ${`R${String(result.revision).padStart(2, '0')}`} from current shared inventory. No stock was moved.`)
    setReviewed(false)
    setView('results')
  }

  function handleApprove() {
    const result = approve('Jamie Rivera')
    setMessage(result.message)
    if (result.ok) setView('approved')
  }

  const metrics = run?.proposed
  const baseline = run?.baseline
  const movementRows = run?.placements ?? []

  return <>
    <PageHeader title="Warehouse Optimization Lab" description="Compare a deterministic demo placement proposal before authorizing any movement." action={<div className="optimization-header-actions"><span className="optimization-revision">{revision} · {currentView === 'configuration' ? 'Configuration' : currentView}</span>{run && <Button variant="secondary" onClick={() => setView('results')}>View proposal</Button>}{currentView === 'configuration' && <Button onClick={handleRun}><Play size={14}/> Run optimization</Button>}</div>} />
    <div className={`optimization-banner ${run && !liveFeasible ? 'warning' : isApproved ? 'success' : ''}`}><span>{isApproved ? <ShieldCheck size={16}/> : run && !liveFeasible ? <AlertTriangle size={16}/> : <LockKeyhole size={15}/>}</span><div><strong>{isApproved && run ? `Revision ${revision} approved` : run && !liveFeasible ? `${run.proposed.hardConstraintViolations} selected placement constraint violations · Approval blocked` : run ? `${revision} generated · ${run.rejectedCandidates.length} infeasible alternatives rejected` : 'Simulation only · the optimizer never moves inventory'}</strong><small>{isApproved && run ? `${run.approvedBy} · ${new Date(run.approvedAt!).toLocaleString()} · Approval records authorization only; no physical stock was moved.` : 'Hard constraints are applied before objective weights. Results are recommendations based on demo estimates.'}</small></div><b>DEMONSTRATION DATA</b></div>
    <div className="optimization-tabs" role="tablist" aria-label="Optimization workflow">{(['configuration', 'results', 'warnings', 'review', 'approved'] as LabView[]).map((tab) => <button key={tab} role="tab" aria-selected={currentView === tab} className={currentView === tab ? 'active' : ''} disabled={!run && tab !== 'configuration' || tab === 'approved' && !isApproved} onClick={() => setView(tab)}>{tab === 'configuration' ? 'Configuration' : tab === 'results' ? 'Results' : tab === 'warnings' ? `Constraint warnings${run?.rejectedCandidates.length ? ` · ${run.rejectedCandidates.length}` : ''}` : tab === 'review' ? 'Review changes' : 'Approved'}</button>)}</div>

    {currentView === 'configuration' && <div className="optimization-config-grid">
      <Card title="Optimization configuration" subtitle="Set objective weights and review enforced safety constraints" action={<Badge>All 4 zones</Badge>}>
        <div className="optimization-weight-heading"><strong>Objective weights</strong><span>Total {Object.values(config.weights).reduce((sum, value) => sum + value, 0)}%</span></div>
        <div className="optimization-weight-grid">{weightInfo.map((item) => <label key={item.key}><span>{item.label}<b>{config.weights[item.key]}%</b></span><input type="range" min="0" max="100" step="5" value={config.weights[item.key]} onChange={(event) => changeWeight(item.key, Number(event.target.value))}/><small>{item.description}</small></label>)}</div>
        <label className="optimization-toggle"><input type="checkbox" checked={config.preferGoldenZone} onChange={(event) => setConfig({ ...config, preferGoldenZone: event.target.checked })}/><span><b>Ergonomic golden-zone preference</b><small>Soft preference: favor A/B zone, levels 1–2 for faster-moving SKUs.</small></span><em>Soft</em></label>
        <div className="optimization-constraints-heading"><div><ShieldCheck size={15}/><strong>Hard constraints · always enforced</strong></div><small>Objective weights cannot relax these checks.</small></div>
        <div className="optimization-constraint-grid">{[
          ['Bin capacity', 'Do not exceed available unit capacity'], ['Cube volume', 'Estimated package volume must fit available bin volume'], ['Dimensions', 'SKU dimensions must fit; rotation is not assumed'], ['Maximum weight', 'Estimated combined load must stay within bin rating'], ['Handling', 'Required handling must be supported by location'], ['Hazard compatibility', 'Use only locations with a matching certification when specified'], ['Shelf height', 'Uses demo location dimensions; no separate height override'],
        ].map(([title, detail]) => <div key={title}><Badge>Enforced</Badge><b>{title}</b><span>{detail}</span></div>)}</div>
        <div className="optimization-data-note"><AlertTriangle size={14}/> SKU dimensions, package weights, pick frequency, affinity and rack ratings are demo estimates. Replace with measured WMS/master data before operational use.</div>
        <div className="optimization-config-footer"><small>Re-running creates a new revision and preserves the previous review.</small><Button onClick={handleRun}><Play size={14}/> Run optimization</Button></div>
      </Card>
      <div className="optimization-side-stack"><Card title="Warehouse digital twin" subtitle="Live shared inventory · baseline layout"><div className="optimization-scene"><WarehouseScene bins={bins} inventory={inventory} selectedBinId={selectedBinId} onSelect={setSelectedBinId} resetVersion={0} zoomVersion={0} focusVersion={0} focusBin={bins.find((bin) => bin.id === selectedBinId)}/></div><div className="optimization-scene-caption"><WarehouseIcon size={13}/>{selectedBinId ? `Selected ${selectedBinId}` : 'Select a bin to inspect'} · Proposal does not move physical stock</div></Card><Card title="Like-for-like comparison · DEMO" subtitle="Fixed assumptions for baseline and proposal"><p className="optimization-assumption">Shared demo SKU set and inventory snapshot. Same dispatch point, aisle distance model and estimated walking speed. Objective values are comparative heuristic scores, not measured savings.</p></Card>{history.length > 0 && <Card title="Revision history" subtitle={`${history.length} saved revision${history.length === 1 ? '' : 's'}`}><div className="optimization-history-list">{history.map((item) => <div key={item.id}><Badge>{item.approvedAt ? 'Approved' : `R${String(item.revision).padStart(2, '0')}`}</Badge><span>{item.id} · {new Date(item.createdAt).toLocaleString()}</span></div>)}</div></Card>}</div>
    </div>}

    {currentView === 'results' && run && <>
      {metrics && baseline && <div className="optimization-metric-grid"><Metric label="Estimated travel distance" value={`${metrics.travelMeters} m`} note={`${baseline.travelMeters} m baseline · ${signedPercent(metrics.travelMeters, baseline.travelMeters)}`} tone="blue"/><Metric label="Estimated picking time" value={`${metrics.pickTimeMinutes} min`} note={`${baseline.pickTimeMinutes} min baseline · 50 m/min demo rate`} tone="navy"/><Metric label="Cube utilization" value={`${metrics.cubeUtilizationPercent}%`} note={`${baseline.cubeUtilizationPercent}% baseline · selected pick faces`} tone="green"/><Metric label="Golden-zone placements" value={metrics.goldenZoneCount.toString()} note={`${baseline.goldenZoneCount} baseline · A/B levels 1–2`} tone="blue"/><Metric label="Proposed movements" value={metrics.movementCount.toString()} note="Recommendations only · 0 physical moves" tone="navy"/><Metric label="Hard violations" value={metrics.hardConstraintViolations.toString()} note={`${baseline.hardConstraintViolations} baseline · ${run.rejectedCandidates.length} rejected alternatives`} tone={metrics.hardConstraintViolations ? 'amber' : 'green'}/></div>}
      <div className="optimization-results-grid"><Card title="Warehouse digital twin" subtitle="Current shared inventory · proposed placements are listed below" action={<div className="optimization-view-toggle"><button className="active">Baseline</button><button disabled title="Proposal is a plan, not a physical layout change">Proposed</button></div>}><div className="optimization-scene results"><WarehouseScene bins={bins} inventory={inventory} selectedBinId={selectedBinId} onSelect={setSelectedBinId} resetVersion={0} zoomVersion={0} focusVersion={0} focusBin={bins.find((bin) => bin.id === selectedBinId)}/></div><div className="optimization-legend"><span><i className="occupied"/> Current shared stock</span><span><i className="target"/> Proposed target, see plan</span><span><i className="rejected"/> Rejected target</span></div><div className="optimization-scene-note">The 3D view shows current inventory. Proposed bin assignments are displayed in the movement plan and are not painted as live stock.</div></Card><Card title={`${revision} · Proposal summary`} subtitle="A deterministic greedy heuristic selected the highest-scoring feasible bin per primary SKU"><div className="optimization-summary-list"><div><span>Baseline objective score</span><b>{baseline?.objectiveScore ?? 0}/100</b></div><div><span>Proposal objective score</span><b>{metrics?.objectiveScore ?? 0}/100</b></div><div><span>Movements recommended</span><b>{metrics?.movementCount ?? 0}</b></div><div><span>Selected plan feasibility</span><Badge>{liveFeasible ? 'All feasible' : 'Blocked'}</Badge></div></div><div className="optimization-actions"><Button variant="secondary" onClick={() => setView('configuration')}><SlidersHorizontal size={14}/> Revise configuration</Button><Button variant="secondary" onClick={() => setView('warnings')} disabled={!run.rejectedCandidates.length}><AlertTriangle size={14}/> Review warnings ({run.rejectedCandidates.length})</Button><Button onClick={() => { setReviewed(false); setView('review') }} disabled={!liveFeasible}><ArrowRight size={14}/> Review changes</Button></div></Card></div>
      <MovementPlan rows={movementRows}/>
      <AssumptionList assumptions={run.assumptions}/>
    </>}

    {currentView === 'warnings' && run && <>
      <div className="optimization-warning-banner"><AlertTriangle size={16}/><span><b>{run.rejectedCandidates.length} infeasible candidate assignments rejected.</b> These are actual failed hard-constraint checks; rejected alternatives are not part of the selected plan.</span><strong>DEMONSTRATION DATA</strong></div>
      <div className="optimization-warning-grid"><Card title="Rejected candidates" subtitle="Select a rejected SKU-to-bin assignment for its validation detail">{run.rejectedCandidates.length ? <div className="warning-candidate-list">{run.rejectedCandidates.map((placement, index) => <button key={`${placement.skuId}-${placement.toBinId}`} className={selectedWarning === index ? 'active' : ''} onClick={() => setSelectedWarning(index)}><span><b>{placement.skuId}</b><small>{placement.skuName}</small></span><span>{placement.fromBinId} → {placement.toBinId}</span><Badge>Rejected</Badge></button>)}</div> : <div className="optimization-empty"><ShieldCheck size={20}/>No infeasible alternatives were found in this run.</div>}</Card><Card title="Constraint validation" subtitle={selectedRejected ? `${selectedRejected.skuId} · proposed target ${selectedRejected.toBinId}` : 'No rejected assignment selected'}>{selectedRejected ? <><div className="rejected-heading"><h3>{selectedRejected.skuName}</h3><Badge>Rejected</Badge></div><p className="rejected-route">Current {selectedRejected.fromBinId} <ArrowRight size={13}/> Candidate {selectedRejected.toBinId}</p><div className="violations-list">{selectedRejected.violations.map((violation, index) => <div key={`${violation.code}-${index}`}><b>{violation.title}</b><p>{violation.explanation}</p><small>Expected: {violation.expected} · Actual: {violation.actual}</small></div>)}</div><div className="warning-next-step">Rejected candidate is excluded from the proposed plan. The optimizer selects only a placement that passes all enabled hard checks.</div></> : <div className="optimization-empty">No rejected candidate selected.</div>}</Card></div>
      <div className="optimization-page-actions"><Button variant="secondary" onClick={() => setView('results')}><ArrowLeft size={14}/> Back to results</Button><Button variant="secondary" onClick={() => setView('configuration')}><RotateCcw size={14}/> Revise and rerun</Button></div>
    </>}

    {currentView === 'review' && run && <>
      <div className="optimization-review-banner"><ShieldCheck size={16}/><span><b>{revision} · Reconciled review</b> {run.proposed.hardConstraintViolations} infeasible selected placements · approval requires zero.</span><strong>DEMONSTRATION DATA</strong></div>
      <div className="optimization-review-grid"><Card title="Movement recommendations" subtitle={reviewLabel}><ComparisonMetrics baseline={baseline} proposed={metrics}/><MovementPlan rows={movementRows}/></Card><Card title="Review and approval" subtitle="Explicit manager checkpoint"><div className="review-checks"><div><Check size={13}/> Dimensions, capacity, handling and weight rules checked</div><div><Check size={13}/> Rejected alternatives excluded from selected placements</div><div><Check size={13}/> On-hand stock and pick history remain unchanged</div></div><div className="optimization-review-data">{run.assumptions.map((assumption) => <p key={assumption}>• {assumption}</p>)}</div><label className="review-confirm"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)}/><span>I reviewed {revision}. Approval authorizes this versioned plan only; it does not confirm physical movement.</span></label><div className="approval-owner">Manager checkpoint · Jamie Rivera · {isApproved ? 'Approved' : 'Awaiting approval'}</div><Button onClick={handleApprove} disabled={!reviewed || !liveFeasible || isApproved}><Check size={14}/> Approve layout</Button>{!liveFeasible && <div className="approval-blocked"><CircleAlert size={13}/> Approval blocked until selected hard-constraint violations are resolved.</div>}</Card></div>
    </>}

    {currentView === 'approved' && run && <>
      <div className="optimization-approved-banner"><ShieldCheck size={17}/><span><b>{run.approvedBy} approved {run.id} · {revision}</b><small>Approved {run.approvedAt ? new Date(run.approvedAt).toLocaleString() : ''} · {run.placements.length} primary placements · {run.proposed.movementCount} planned moves. Physical inventory remains unchanged.</small></span><Badge>Approved</Badge></div><div className="optimization-results-grid"><Card title="Approved movement plan" subtitle="Versioned authorization · no stock was moved"><MovementPlan rows={run.placements} approved/></Card><Card title="Approval record" subtitle="Audit details"><div className="optimization-summary-list"><div><span>Plan identifier</span><b>{run.id}</b></div><div><span>Revision</span><b>{revision}</b></div><div><span>Approved by</span><b>{run.approvedBy}</b></div><div><span>Approval timestamp</span><b>{run.approvedAt ? new Date(run.approvedAt).toLocaleString() : '—'}</b></div><div><span>Hard-constraint violations</span><Badge>0</Badge></div></div><div className="optimization-physical-note"><LockKeyhole size={15}/> Approval does not release a WMS work order. Physical relocation, scan confirmation and stock updates are not implemented in this stage.</div><Button variant="secondary" onClick={() => setView('results')}>Return to results</Button></Card></div>
    </>}

    {message && <div className="optimization-status-message" role="status">{message}</div>}
  </>
}

function MovementPlan({ rows, approved = false }: { rows: OptimizationRun['placements']; approved?: boolean }) { return <Card title={approved ? 'Approved movement plan' : 'Movement recommendations'} subtitle={`${rows.length} primary SKU placement records · plan does not mutate shared inventory`}><div className="table-scroll"><table className="optimization-movement-table"><thead><tr><th>SKU</th><th>PRODUCT</th><th>QTY</th><th>CURRENT BIN</th><th>PROPOSED BIN</th><th>RATIONALE</th><th>FEASIBILITY</th><th>STATUS</th></tr></thead><tbody>{rows.map((row) => <tr key={row.skuId} className={row.feasible ? '' : 'infeasible-row'}><td><strong>{row.skuId}</strong></td><td>{row.skuName}</td><td>{row.quantity}</td><td>{row.fromBinId}</td><td>{row.toBinId}</td><td>{row.reason}</td><td><Badge>{row.feasible ? 'Feasible' : `${row.violations.length} violations`}</Badge></td><td>{approved ? 'Planned' : row.fromBinId === row.toBinId ? 'Retain' : 'Proposed'}</td></tr>)}</tbody></table></div></Card> }
function AssumptionList({ assumptions }: { assumptions: string[] }) { return <details className="optimization-assumptions"><summary>Scoring definitions and assumptions</summary>{assumptions.map((assumption) => <p key={assumption}>{assumption}</p>)}<p>Objective score is the weighted average of normalized travel efficiency, closeness to a 70% capacity fill target, demand-weighted golden-zone placement, and same-aisle affinity matches. Hard constraints are evaluated before scoring.</p></details> }
function ComparisonMetrics({ baseline, proposed }: { baseline?: OptimizationRun['baseline']; proposed?: OptimizationRun['proposed'] }) { if (!baseline || !proposed) return null; return <div className="comparison-metrics"><div><span>Estimated travel</span><b>{baseline.travelMeters} m → {proposed.travelMeters} m</b></div><div><span>Cube utilization</span><b>{baseline.cubeUtilizationPercent}% → {proposed.cubeUtilizationPercent}%</b></div><div><span>Golden-zone placements</span><b>{baseline.goldenZoneCount} → {proposed.goldenZoneCount}</b></div><div><span>Movement recommendations</span><b>{proposed.movementCount}</b></div><div><span>Hard violations in selected plan</span><b>{proposed.hardConstraintViolations}</b></div></div> }
function signedPercent(value: number, baseline: number): string { if (!baseline) return 'no baseline'; const delta = Math.round((value - baseline) / baseline * 100); return `${delta > 0 ? '+' : ''}${delta}% vs baseline` }
