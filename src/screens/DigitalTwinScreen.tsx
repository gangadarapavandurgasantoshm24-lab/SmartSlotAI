import { useMemo, useState } from 'react'
import { AlertTriangle, Box, Crosshair, Minus, Plus, RotateCcw, Search, Truck, ZoomIn, ZoomOut } from 'lucide-react'
import { skus, warehouses } from '../data/mockData'
import { getAvailableQuantity, getStockStatus, searchWarehouseBins } from '../data/inventoryUtils'
import { getIncomingQuantity } from '../data/replenishmentUtils'
import { useAppStore } from '../store/useAppStore'
import { Badge, Button, Card, Metric, PageHeader } from '../components/ui'
import { WarehouseScene } from '../components/digital-twin/WarehouseScene'
import type { Bin, InventoryItem } from '../types'

export function DigitalTwinScreen() {
  const bins = useAppStore((state) => state.bins)
  const inventory = useAppStore((state) => state.inventory)
  const selectedBinId = useAppStore((state) => state.selectedBinId)
  const selectBin = useAppStore((state) => state.selectBin)
  const simulatePick = useAppStore((state) => state.simulatePick)
  const receiveStock = useAppStore((state) => state.receiveStock)
  const movements = useAppStore((state) => state.movements)
  const replenishmentRequests = useAppStore((state) => state.replenishmentRequests)
  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [resetVersion, setResetVersion] = useState(0)
  const [zoomVersion, setZoomVersion] = useState(0)
  const [focusVersion, setFocusVersion] = useState(0)
  const selectedBin = bins.find((bin) => bin.id === selectedBinId)
  const selectedStock = inventory.find((item) => item.binId === selectedBinId)
  const selectedSku = selectedBin ? skus.find((sku) => sku.id === selectedStock?.skuId) : undefined
  const stockByBin = useMemo(() => new Map(inventory.map((item) => [item.binId, item])), [inventory])
  const results = useMemo(() => searchWarehouseBins(query, bins, inventory, skus), [bins, inventory, query])
  const amount = Number(quantity)
  const warehouse = warehouses[0]
  const currentMovement = movements.find((movement) => movement.binId === selectedBinId)

  function runStockAction(action: 'pick' | 'receive') {
    if (!selectedBin) return
    const result = action === 'pick' ? simulatePick(selectedBin.id, amount) : receiveStock(selectedBin.id, amount)
    const success = result.startsWith(action === 'pick' ? 'Picked ' : 'Received ')
    setMessage({ text: result, success })
  }

  function chooseBin(bin: Bin) {
    selectBin(bin.id)
    setQuery('')
    setMessage(null)
  }

  function adjustZoom(direction: -1 | 1) { setZoomVersion((version) => version + direction) }

  return <>
    <PageHeader title="3D Warehouse" description="Explore your digital twin. Locate stock and plan every move." action={<Button variant="secondary" disabled title="Warehouse settings are not available in this demo"><Truck size={14}/> Warehouse settings</Button>} />
    {bins.length === 0 ? <div className="twin-empty"><Box size={25}/><strong>Warehouse layout is empty</strong><span>Add bin records to populate the digital twin.</span></div> : <div className="digital-twin-grid">
      <Card title="Warehouse digital twin" subtitle={`${warehouse.location} · ${warehouse.zones} zones · ${bins.length} storage bins`} className="digital-twin-card">
        <div className="twin-search-row">
          <div className="twin-search"><Search size={15}/><span className="search-prefix">SKU / Bin ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search warehouse locations or SKUs" aria-label="Search by bin ID or SKU"/><span className="result-count">{query ? `${results.length} found` : ''}</span>{query && <button aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
            {query && <div className="search-results">{results.length ? results.map((bin) => { const stock = stockByBin.get(bin.id); const sku = skus.find((entry) => entry.id === stock?.skuId); return <button key={bin.id} onClick={() => chooseBin(bin)}><span><b>{bin.id}</b><small>{sku?.id} · {sku?.name}</small></span><Badge>{stock ? getStockStatus(stock) : 'Unavailable'}</Badge></button> }) : <div className="search-no-results">No matching bins or SKUs.</div>}</div>}
          </div>
          <Button onClick={() => selectedBin && setFocusVersion((version) => version + 1)}><Crosshair size={14}/> Locate bin</Button>
          <button className="twin-tool-button" onClick={() => { setResetVersion((version) => version + 1); setMessage(null) }}><RotateCcw size={14}/> Reset view</button>
          <div className="zoom-tools"><button aria-label="Zoom in" onClick={() => adjustZoom(1)}><ZoomIn size={15}/></button><button aria-label="Zoom out" onClick={() => adjustZoom(-1)}><ZoomOut size={15}/></button></div>
        </div>
        <div className="twin-canvas"><WarehouseScene bins={bins} inventory={inventory} selectedBinId={selectedBinId} onSelect={(id) => { const bin = bins.find((entry) => entry.id === id); if (bin) chooseBin(bin) }} resetVersion={resetVersion} zoomVersion={zoomVersion} focusVersion={focusVersion} focusBin={selectedBin}/><div className="scene-help">Drag to orbit · Right drag to pan · Scroll to zoom</div><div className="scene-view-label">ISOMETRIC VIEW <span>·</span> {bins.length} BINS</div><div className="scene-status"><i/> LIVE INVENTORY</div></div>
        <div className="twin-legend"><span><i className="legend-healthy"/> Healthy</span><span><i className="legend-low"/> Low stock</span><span><i className="legend-empty"/> Empty</span><span><i className="legend-unavailable"/> Unavailable</span><span><i className="legend-selected"/> Selected</span></div>
        <div className="twin-route"><span className="route-icon"><Crosshair size={16}/></span><span><b>Warehouse navigation</b><small>{selectedBin ? `Selected location · ${selectedBin.id} · Zone ${selectedBin.zone}` : 'Select any bin to inspect its inventory'}</small></span><span className="route-distance">Orbit and zoom to explore</span></div>
      </Card>
      <Card title="Bin inspector" subtitle="Selected location" className="bin-inspector">
        {!selectedBin ? <div className="inspector-empty"><Box size={22}/><b>Bin could not be loaded</b><span>Select a bin in the scene or search by its ID.</span></div> : !selectedStock ? <div className="inspector-empty error"><AlertTriangle size={22}/><b>Inventory record unavailable</b><span>No shared stock record is linked to {selectedBin.id}.</span></div> : <Inspector bin={selectedBin} stock={selectedStock} sku={selectedSku} incoming={replenishmentRequests.filter((request) => request.binId === selectedBin.id).reduce((sum, request) => sum + getIncomingQuantity(request), 0)} quantity={quantity} setQuantity={setQuantity} message={message} currentMovement={currentMovement} onAction={runStockAction}/>}
      </Card>
    </div>}
    <div className="metric-grid three twin-metrics"><Metric label="Total locations" value={bins.length.toLocaleString()} note="Across the modeled warehouse"/><Metric label="Units on hand" value={inventory.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} note="Inventory linked to bin records" tone="green"/><Metric label="Flagged locations" value={inventory.filter((item) => ['Low stock', 'Empty', 'Unavailable'].includes(getStockStatus(item))).length.toString()} note="Low stock · empty · unavailable" tone="amber"/></div>
  </>
}

function Inspector({ bin, stock, sku, incoming, quantity, setQuantity, message, currentMovement, onAction }: { bin: Bin; stock: InventoryItem; sku: typeof skus[number] | undefined; incoming: number; quantity: string; setQuantity: (value: string) => void; message: { text: string; success: boolean } | null; currentMovement: ReturnType<typeof useAppStore.getState>['movements'][number] | undefined; onAction: (action: 'pick' | 'receive') => void }) {
  const status = getStockStatus(stock)
  const available = getAvailableQuantity(stock)
  const utilization = Math.round((stock.quantity / stock.capacity) * 100)
  return <>
    <div className="inspector-location"><div><h3>{bin.id}</h3><p>Zone {bin.zone} · Aisle {String(bin.aisle ?? bin.x + 1).padStart(2, '0')} · Level {String(bin.level ?? 1).padStart(2, '0')}</p></div><Badge>{status}</Badge></div>
    <div className="inspector-product"><strong>{sku?.name ?? 'Unassigned SKU'}</strong><span>SKU&nbsp; {stock.skuId}</span></div>
    {status === 'Low stock' && <div className="stock-warning"><AlertTriangle size={14}/><span>{stock.quantity < stock.reorderPoint ? `${stock.reorderPoint - stock.quantity} units below reorder point.` : 'At the reorder point.'}<small>Replenishment attention may be needed.</small></span></div>}
    {!stock.available && <div className="stock-warning unavailable-warning"><AlertTriangle size={14}/><span>This location is marked unavailable.<small>Demo stock actions are disabled for unavailable bins.</small></span></div>}
    <div className="inspector-quantities"><div><span>On-hand quantity</span><b>{stock.quantity} units</b></div><div><span>Incoming confirmed</span><b>{incoming} units</b></div><div><span>Reserved quantity</span><b>{stock.reserved} units</b></div><div><span>Available quantity</span><b className="available-value">{available} units</b></div><div><span>Bin capacity</span><b>{stock.capacity} units</b></div><div><span>Reorder point</span><b>{stock.reorderPoint} units</b></div></div>
    <div className="capacity-meter"><div><span>Capacity utilization</span><b>{utilization}%</b></div><div className="capacity-track"><i style={{ width: `${Math.min(100, utilization)}%` }}/></div><small>{stock.quantity} of {stock.capacity} units</small></div>
    <label className="stock-quantity-label">DEMO QUANTITY<input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} aria-label="Demo stock action quantity"/></label>
    {message && <div className={`stock-message ${message.success ? 'success' : 'error'}`} role="status">{message.text}</div>}
    {currentMovement && <div className="last-movement"><b>Last demo movement</b><span>{currentMovement.type === 'pick' ? 'Picked' : 'Received'} {currentMovement.quantity} units · {new Date(currentMovement.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></div>}
    <div className="inspector-actions"><Button onClick={() => onAction('pick')}><Minus size={14}/> Simulate Pick</Button><Button variant="secondary" onClick={() => onAction('receive')}><Plus size={14}/> Receive Stock</Button></div>
    <p className="demo-note">Local demo operations only. No live inventory or supplier records are changed.</p>
  </>
}
