import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  Check,
  MapPin,
  Package,
  ShieldCheck,
  Sparkles,
  Truck,
  Warehouse,
} from 'lucide-react'
import type { FC } from 'react'
import { RoleSwitcherBar } from '../components/RoleSwitcherBar'
import { WarehouseScene } from '../components/digital-twin/WarehouseScene'
import { skus } from '../data/mockData'
import { DEMO_REPLENISHMENT_DISCLAIMER } from '../data/intelligentReplenishmentEngine'
import { useAppStore } from '../store/useAppStore'
import type { ReplenishmentRequest, SupplierResponseKind } from '../types'
import { Badge, Button, Card, PageHeader } from '../components/ui'

const suppliers = ['Medline Industries', 'Avery Dennison', 'Uline', 'Berry Global']

export const SupplierPortalView: FC = () => {
  const bins = useAppStore((state) => state.bins)
  const inventory = useAppStore((state) => state.inventory)
  const requests = useAppStore((state) => state.replenishmentRequests)
  const respond = useAppStore((state) => state.respondToReplenishment)
  const dispatch = useAppStore((state) => state.dispatchReplenishment)
  const [selectedSupplier, setSelectedSupplier] = useState('Medline Industries')
  const [selectedId, setSelectedId] = useState('')
  const [responseKind, setResponseKind] = useState<SupplierResponseKind>('full')
  const [confirmed, setConfirmed] = useState('20')
  const [expectedDate, setExpectedDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const visibleRequests = useMemo(
    () => requests.filter((r) => r.supplier === selectedSupplier),
    [requests, selectedSupplier],
  )

  const selected: ReplenishmentRequest | undefined =
    visibleRequests.find((r) => r.id === selectedId) ?? visibleRequests[0]

  const destinationBin = selected ? bins.find((b) => b.id === selected.binId) : undefined
  const selectedSku = selected ? skus.find((s) => s.id === selected.skuId) : undefined

  const openCount = visibleRequests.filter((r) => r.status === 'Submitted').length
  const inTransitCount = visibleRequests.filter((r) => r.status === 'In transit').length
  const totalUnits = visibleRequests.reduce((sum, r) => sum + r.quantity, 0)

  function handleSaveResponse() {
    if (!selected) return
    const result = respond(selected.id, responseKind, Number(confirmed), expectedDate, note)
    setMessage({ text: result.message, ok: result.ok })
  }

  function handleDispatch() {
    if (!selected) return
    const result = dispatch(selected.id)
    setMessage({ text: result.message, ok: result.ok })
  }

  return (
    <div className="character-app-root supplier-theme">
      <RoleSwitcherBar currentRole="supplier" />
      <header className="character-header supplier-header">
        <div className="char-brand">
          <span className="char-badge supplier">
            <Truck size={18} />
          </span>
          <div>
            <h1>SmartSlot <span>SUPPLIER HUB</span></h1>
            <small>B2B Vendor Portal · Oakland DC Receiving</small>
          </div>
        </div>
        <div className="supplier-vendor-select">
          <label htmlFor="vendor-picker">VENDOR ACCOUNT:</label>
          <select
            id="vendor-picker"
            value={selectedSupplier}
            onChange={(e) => {
              setSelectedSupplier(e.target.value)
              setSelectedId('')
              setMessage(null)
            }}
          >
            {suppliers.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      </header>

      <main className="character-main">
        <PageHeader
          title={`${selectedSupplier} — Vendor Dispatch Portal`}
          description="Acknowledge incoming warehouse purchase orders, confirm fulfillment quantities, and dispatch shipments into Oakland DC."
          action={
            <div className="supplier-badge-pill">
              <ShieldCheck size={14} />
              <span>Verified Supplier · Tier 1</span>
            </div>
          }
        />

        <div className="replenishment-disclaimer-banner">
          <Sparkles size={15} />
          <span>
            <strong>Simulated B2B Vendor Telemetry:</strong> {DEMO_REPLENISHMENT_DISCLAIMER}
          </span>
        </div>

        {message && (
          <div className={`replenishment-toast ${message.ok ? 'ok' : 'error'}`} role="status">
            {message.ok ? <Check size={14} /> : <AlertTriangle size={14} />} {message.text}
          </div>
        )}

        <div className="replenishment-metrics">
          <div className="replenishment-metric">
            <span>Awaiting Vendor Response</span>
            <strong>{openCount}</strong>
            <small>Requires action</small>
          </div>
          <div className="replenishment-metric">
            <span>Dispatched / In Transit</span>
            <strong>{inTransitCount}</strong>
            <small>En route to warehouse</small>
          </div>
          <div className="replenishment-metric">
            <span>Total Units Requested</span>
            <strong>{totalUnits}</strong>
            <small>Across active POs</small>
          </div>
        </div>

        <div className="supplier-grid-layout">
          <div className="supplier-left-col">
            <Card
              title="Incoming Purchase Orders"
              subtitle={`Orders addressed to ${selectedSupplier}`}
              action={<Badge>{selectedSupplier}</Badge>}
            >
              {visibleRequests.length === 0 ? (
                <div className="supplier-empty">
                  <Package size={28} />
                  <strong>No purchase orders right now for {selectedSupplier}.</strong>
                  <span>Create replenishment requests from the Manager portal to send orders here.</span>
                </div>
              ) : (
                <div className="supplier-orders-list">
                  {visibleRequests.map((req) => (
                    <div
                      key={req.id}
                      className={`supplier-order-item ${selected?.id === req.id ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedId(req.id)
                        setConfirmed(String(req.confirmedQuantity ?? req.quantity))
                        setMessage(null)
                      }}
                    >
                      <div className="order-item-header">
                        <div className="order-item-tags">
                          <strong>{req.id}</strong>
                          {req.urgency && (
                            <span className={`urgency-pill ${req.urgency}`}>
                              {req.urgency.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <Badge>{req.status}</Badge>
                      </div>
                      <div className="order-item-body">
                        <div>
                          <span>Item:</span> <strong>{req.skuId}</strong>
                        </div>
                        <div>
                          <span>Requested:</span> <strong>{req.quantity} units</strong>
                        </div>
                        <div>
                          <span>Destination:</span> <strong>Bin {req.binId}</strong>
                        </div>
                      </div>
                      <div className="order-item-date">Need by: {req.expectedDate || 'ASAP'}</div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {selected && (
              <Card
                title={`Respond & Dispatch · ${selected.id}`}
                subtitle={`SKU: ${selected.skuId} · Requested: ${selected.quantity} units`}
              >
                <div className="supplier-response-form">
                  <label>
                    Availability Status
                    <select
                      value={responseKind}
                      onChange={(e) => {
                        const val = e.target.value as SupplierResponseKind
                        setResponseKind(val)
                        if (val === 'full') setConfirmed(String(selected.quantity))
                        else if (val === 'unavailable') setConfirmed('0')
                        else setConfirmed(String(Math.max(1, Math.floor(selected.quantity / 2))))
                      }}
                    >
                      <option value="full">Available in Full ({selected.quantity} units)</option>
                      <option value="partial">Partially Available</option>
                      <option value="delayed">Delayed Delivery</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </label>

                  <div className="form-row-two">
                    <label>
                      Confirmed Quantity
                      <input
                        type="number"
                        min="0"
                        value={confirmed}
                        onChange={(e) => setConfirmed(e.target.value)}
                        disabled={responseKind === 'unavailable'}
                      />
                    </label>
                    <label>
                      Estimated Delivery Date
                      <input
                        type="date"
                        value={expectedDate}
                        onChange={(e) => setExpectedDate(e.target.value)}
                      />
                    </label>
                  </div>

                  <label>
                    Supplier Tracking / Delivery Notes
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="e.g. Carrier BOL #89421, truck departs 08:00 AM"
                    />
                  </label>

                  <div className="supplier-action-buttons">
                    <Button
                      onClick={handleSaveResponse}
                      disabled={selected.status !== 'Submitted'}
                    >
                      <Check size={14} /> Save Confirmation
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={handleDispatch}
                      disabled={!['Confirmed full', 'Partial offer', 'Delayed'].includes(selected.status)}
                    >
                      <Truck size={14} /> Dispatch Shipment (In Transit)
                    </Button>
                  </div>

                  <div className="supplier-dispatch-hint">
                    <small>
                      Goods remain in transit until physically accepted at DC receiving dock. Dispatching updates shipment status only.
                    </small>
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="supplier-right-col">
            <Card
              title="3D Warehouse Receiving Dock & Target Bin"
              subtitle={destinationBin ? `Visualizing destination slot ${destinationBin.id} for incoming ${selectedSku?.name ?? ''}` : 'Select a purchase order to locate receiving rack'}
              className="supplier-3d-card"
            >
              <div className="supplier-canvas-wrap">
                <WarehouseScene
                  bins={bins}
                  inventory={inventory}
                  selectedBinId={destinationBin?.id ?? 'C-06-02'}
                  onSelect={() => {}}
                  resetVersion={0}
                  zoomVersion={0}
                  focusVersion={0}
                  focusBin={destinationBin}
                />
                <div className="supplier-canvas-overlay">
                  <MapPin size={13} />
                  <span>Target Staging Rack: {destinationBin?.id ?? 'None'} (Zone {destinationBin?.zone ?? 'C'})</span>
                </div>
              </div>
              <div className="supplier-3d-note">
                <Warehouse size={13} />
                <span>Goods will be unloaded at Dock Bay 4 and transferred to Bin <strong>{destinationBin?.id ?? 'C-06-02'}</strong> upon warehouse manager acceptance.</span>
              </div>
            </Card>

            {selected && (
              <Card title="Order Lifecycle & Audit Timeline" subtitle={`${selected.id} · ${selected.supplier}`}>
                <div className="request-timeline">
                  {selected.timeline.map((event) => (
                    <div key={event.id}>
                      <i />
                      <time>{new Date(event.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
                      <span>
                        <b>{event.label}</b>
                        {event.note && <small>{event.note}</small>}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </div>
      </main>

      <footer className="character-footer">
        <span>SmartSlot AI Supplier Portal · {selectedSupplier} · Port 5174</span>
        <span>Connected to Oakland DC WMS · Real-time event synchronization</span>
      </footer>
    </div>
  )
}
