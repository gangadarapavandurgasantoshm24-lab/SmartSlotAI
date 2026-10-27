import { useMemo, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, PackageCheck, Plus, Truck } from 'lucide-react'
import { skus } from '../data/mockData'
import { getIncomingQuantity } from '../data/replenishmentUtils'
import { getStockStatus } from '../data/inventoryUtils'
import { useAppStore } from '../store/useAppStore'
import type { ReplenishmentRequest, SupplierResponseKind } from '../types'
import { Badge, Button, Card, PageHeader } from '../components/ui'

const suppliers = [...new Set(skus.map((sku) => sku.supplier))]
const today = new Date().toISOString().slice(0, 10)
function makeId(): string { return globalThis.crypto?.randomUUID?.() ?? `receipt-${Date.now()}-${Math.random().toString(36).slice(2)}` }

export function SuppliersScreen() {
  const inventory = useAppStore((state) => state.inventory)
  const requests = useAppStore((state) => state.replenishmentRequests)
  const createRequest = useAppStore((state) => state.createReplenishmentRequest)
  const respond = useAppStore((state) => state.respondToReplenishment)
  const dispatch = useAppStore((state) => state.dispatchReplenishment)
  const receive = useAppStore((state) => state.receiveReplenishment)
  const [role, setRole] = useState<'Manager' | 'Supplier'>('Manager')
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
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const stock = inventory.find((item) => item.skuId === skuId && item.binId === binId)
  const selected = requests.find((item) => item.id === selectedId) ?? requests[0]
  const visibleRequests = useMemo(() => requests.filter((request) => (role === 'Manager' || request.supplier === supplier) && `${request.id} ${request.skuId} ${request.binId} ${request.supplier} ${request.status}`.toLowerCase().includes(query.toLowerCase())), [requests, role, supplier, query])
  const waiting = requests.filter((item) => item.status === 'Submitted').length
  const incoming = requests.reduce((sum, item) => sum + getIncomingQuantity(item), 0)
  const delayed = requests.filter((item) => item.status === 'Delayed').length
  const risk = inventory.filter((item) => ['Low stock', 'Empty', 'Unavailable'].includes(getStockStatus(item))).length
  const filteredBins = inventory.filter((item) => item.skuId === skuId).map((item) => item.binId)

  function submitRequest() {
    const result = createRequest({ skuId, binId, quantity: Number(quantity), supplier, expectedDate, note })
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
    const result = receive(selected.id, Number(delivered), Number(accepted), makeId())
    setMessage({ text: result.message, ok: result.ok })
  }

  return <>
    <PageHeader title="Suppliers & Replenishment" description="Resolve low stock, coordinate suppliers and verify every delivery." action={<div className="supplier-role-toggle" aria-label="Workspace role"><button className={role === 'Manager' ? 'active' : ''} onClick={() => setRole('Manager')}>Manager workspace</button><button className={role === 'Supplier' ? 'active' : ''} onClick={() => setRole('Supplier')}>Supplier workspace</button></div>} />
    <div className="replenishment-metrics"><MetricCard label="Open requests" value={requests.length.toString()} detail="Includes submitted requests"/><MetricCard label="Awaiting supplier response" value={waiting.toString()} detail="Availability not yet known"/><MetricCard label="Confirmed incoming" value={incoming.toLocaleString()} detail="Confirmed · not on hand"/><MetricCard label="Delayed deliveries" value={delayed.toString()} detail="Revised ETA needs review"/><MetricCard label="Stockout risks" value={risk.toString()} detail="Derived from shared inventory"/></div>
    <Card title="Replenishment requests" subtitle={`${visibleRequests.length} records`} action={<span className="supplier-context">{role} workspace · {role === 'Manager' ? 'All suppliers' : supplier} · Demo records</span>}>
      <div className="request-filters"><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search request, product or SKU" aria-label="Search replenishment requests"/><select aria-label="Supplier workspace filter" value={supplier} onChange={(event) => setSupplier(event.target.value)}>{suppliers.map((name) => <option key={name}>{name}</option>)}</select><span>Statuses update from shared request state</span></div>
      <div className="table-scroll"><table className="replenishment-table"><thead><tr><th>REQUEST ID</th><th>SKU / PRODUCT</th><th>BIN</th><th>ON HAND</th><th>REORDER</th><th>REQUESTED</th><th>SUPPLIER</th><th>STATUS</th><th>EXPECTED ARRIVAL</th></tr></thead><tbody>{visibleRequests.map((request) => { const sku = skus.find((item) => item.id === request.skuId); const stockItem = inventory.find((item) => item.binId === request.binId && item.skuId === request.skuId); return <tr key={request.id} className={selected?.id === request.id ? 'selected-request' : ''} onClick={() => { setSelectedId(request.id); setConfirmed(String(request.confirmedQuantity ?? request.quantity)); setDelivered(String(Math.max(1, (request.confirmedQuantity ?? request.quantity) - request.receipts.reduce((sum, item) => sum + item.delivered, 0)))); setAccepted(String(Math.max(1, (request.confirmedQuantity ?? request.quantity) - request.receipts.reduce((sum, item) => sum + item.delivered, 0)))); }}><td><strong>{request.id}</strong></td><td>{sku?.name ?? request.skuId}<small>{request.skuId}</small></td><td>{request.binId}</td><td>{stockItem?.quantity ?? '—'}</td><td>{stockItem?.reorderPoint ?? '—'}</td><td>{request.quantity}</td><td>{request.supplier}</td><td><Badge>{request.status}</Badge>{request.confirmedQuantity !== null && <small>{request.confirmedQuantity} confirmed</small>}</td><td>{request.expectedDate || 'Not submitted'}</td></tr> })}{visibleRequests.length === 0 && <tr><td colSpan={9} className="empty-cell">No matching replenishment requests yet. Create one from the manager workspace.</td></tr>}</tbody></table></div>
      <div className="request-lifecycle">Draft → Submitted → Supplier Responded → Confirmed → Dispatched → Partially Received → Completed <span>Exceptions: Delayed · Unavailable</span></div>
    </Card>

    {role === 'Manager' ? <div className="replenishment-work-grid">
      <Card title="Create replenishment request" subtitle="Create a demo request from a shared inventory record" action={<Badge>{stock ? getStockStatus(stock) : 'Unavailable'}</Badge>}>
        {stock && stock.quantity <= stock.reorderPoint && <div className="replenishment-callout"><AlertTriangle size={14}/>{stock.quantity} on hand &lt; {stock.reorderPoint} reorder point · Suggested quantity {Math.max(1, stock.capacity - stock.quantity)}</div>}
        <div className="replenishment-form"><label>SKU<select value={skuId} onChange={(event) => { setSkuId(event.target.value); const next = inventory.find((item) => item.skuId === event.target.value); if (next) setBinId(next.binId); const sku = skus.find((item) => item.id === event.target.value); if (sku) setSupplier(sku.supplier) }}>{skus.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.name}</option>)}</select></label><label>Bin<select value={binId} onChange={(event) => setBinId(event.target.value)}>{filteredBins.map((id) => <option key={id}>{id}</option>)}</select></label><label>Current stock · read only<input readOnly value={stock ? `${stock.quantity} units` : 'No inventory record'}/></label><label>Reorder point<input readOnly value={stock ? `${stock.reorderPoint} units` : '—'}/></label><label>Requested quantity<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)}/></label><label>Supplier<select value={supplier} onChange={(event) => setSupplier(event.target.value)}>{suppliers.map((name) => <option key={name}>{name}</option>)}</select></label><label>Expected delivery<input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)}/></label><label>Notes<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional delivery notes"/></label></div>
        <div className="replenishment-form-foot"><small>Submitting creates a request only. On-hand inventory remains unchanged.</small><Button onClick={submitRequest} disabled={!stock}><Plus size={14}/> Submit request</Button></div>
      </Card>
      <Card title={selected ? `${selected.id} · Request details` : 'Request details'} subtitle={selected ? `${selected.skuId} · ${selected.binId} · ${selected.supplier}` : 'Select a request to view the timeline'}>
        {!selected ? <div className="supplier-empty">Choose a replenishment request from the table above.</div> : <><div className="request-quantities"><Info label="Requested" value={selected.quantity}/><Info label="Confirmed" value={selected.confirmedQuantity ?? '—'}/><Info label="Incoming" value={getIncomingQuantity(selected)}/><Info label="Received" value={selected.receipts.reduce((sum, item) => sum + item.delivered, 0)}/><Info label="Accepted" value={getAccepted(selected)}/><Info label="On hand" value={inventory.find((item) => item.binId === selected.binId)?.quantity ?? '—'}/></div><div className="request-timeline">{selected.timeline.map((event) => <div key={event.id}><i/><time>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><span><b>{event.label}</b>{event.note && <small>{event.note}</small>}</span></div>)}</div>{selected.responseNote && <div className="supplier-response-note">Supplier note: {selected.responseNote}</div>}</>}
      </Card>
      {selected && <Card title="Goods receipt" subtitle="Only accepted units are added to on-hand stock"><div className="receipt-inputs"><label>Physically delivered<input type="number" min="1" step="1" value={delivered} onChange={(event) => setDelivered(event.target.value)}/></label><label>Accepted<input type="number" min="0" step="1" value={accepted} onChange={(event) => setAccepted(event.target.value)}/></label></div><p className="accounting-note"><PackageCheck size={14}/> Delivery and acceptance are recorded together. Rejected units do not enter inventory.</p><Button onClick={submitReceipt} disabled={!['In transit', 'Partially received'].includes(selected.status)}><Check size={14}/> Record accepted receipt</Button>{selected.receipts.map((receipt) => <div className="receipt-history" key={receipt.id}>{receipt.id} · {receipt.delivered} delivered · {receipt.accepted} accepted · {receipt.rejected} rejected</div>)}</Card>}
    </div> : <div className="replenishment-work-grid supplier-view-grid">
      <Card title="Supplier incoming requests" subtitle={`Showing requests addressed to ${supplier}`} action={<Badge>{supplier}</Badge>}>
        {visibleRequests.filter((request) => request.status === 'Submitted').map((request) => <div className="supplier-incoming" key={request.id}><div><strong>{request.id} · {request.skuId}</strong><span>{request.quantity} requested · Bin {request.binId} · Need by {request.expectedDate}</span></div><Button variant="secondary" onClick={() => setSelectedId(request.id)}>Respond <ArrowRight size={13}/></Button></div>)}
        {!visibleRequests.some((request) => request.status === 'Submitted') && <div className="supplier-empty">No requests are awaiting a response for this supplier.</div>}
      </Card>
      <Card title={selected ? `Respond to ${selected.id}` : 'Supplier response'} subtitle="Supplier actions are simulated in this demo">
        {!selected ? <div className="supplier-empty">Select a submitted incoming request.</div> : <><div className="supplier-request-summary"><b>{selected.skuId} · {selected.quantity} requested</b><span>{selected.binId} · Expected {selected.expectedDate}</span></div><label className="response-kind">Availability<select value={responseKind} onChange={(event) => { const next = event.target.value as SupplierResponseKind; setResponseKind(next); setConfirmed(next === 'full' ? String(selected.quantity) : next === 'unavailable' ? '0' : String(Math.max(1, Math.floor(selected.quantity / 2)))) }}><option value="full">Available in full</option><option value="partial">Partially available</option><option value="unavailable">Unavailable</option><option value="delayed">Delayed</option></select></label><div className="response-fields"><label>Confirmed quantity<input type="number" min="0" step="1" value={confirmed} onChange={(event) => setConfirmed(event.target.value)} disabled={responseKind === 'unavailable'}/></label><label>Expected date<input type="date" value={expectedDate} onChange={(event) => setExpectedDate(event.target.value)}/></label></div><label className="response-kind">Supplier note<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add response notes"/></label><div className="supplier-action-row"><Button onClick={submitResponse} disabled={selected.status !== 'Submitted'}>Save supplier response</Button><Button variant="secondary" onClick={() => { const result = dispatch(selected.id); setMessage({ text: result.message, ok: result.ok }) }} disabled={!['Confirmed full', 'Partial offer', 'Delayed'].includes(selected.status)}><Truck size={14}/> Mark dispatched</Button></div></>}
      </Card>
    </div>}
    {message && <div className={`replenishment-toast ${message.ok ? 'ok' : 'error'}`} role="status">{message.ok ? <Check size={14}/> : <AlertTriangle size={14}/>} {message.text}</div>}
    <div className="supplier-demo-foot">Demo procurement data · Local supplier simulation · On-hand changes only after manager acceptance <span>Inventory updates are shared across Dashboard, Picker and Digital Twin</span></div>
  </>
}

function MetricCard({ label, value, detail }: { label: string; value: string; detail: string }) { return <div className="replenishment-metric"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div> }
function Info({ label, value }: { label: string; value: number | string }) { return <div><span>{label}</span><b>{value}</b></div> }
function getAccepted(request: ReplenishmentRequest): number { return request.receipts.reduce((sum, receipt) => sum + receipt.accepted, 0) }
