import { useMemo, useState } from 'react'
import { AlertTriangle, Box, Building2, Crosshair, Minus, Plus, RotateCcw, Search, ZoomIn, ZoomOut } from 'lucide-react'
import { skus } from '../data/mockData'
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
  const warehouses = useAppStore((state) => state.warehouses)
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId)
  const setSelectedWarehouseId = useAppStore((state) => state.setSelectedWarehouseId)

  const [query, setQuery] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [message, setMessage] = useState<{ text: string; success: boolean } | null>(null)
  const [resetVersion, setResetVersion] = useState(0)
  const [zoomVersion, setZoomVersion] = useState(0)
  const [focusVersion, setFocusVersion] = useState(0)

  // Filter bins and inventory strictly to the selected warehouse
  const activeBins = useMemo(
    () => bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === selectedWarehouseId),
    [bins, selectedWarehouseId]
  )
  const activeInventory = useMemo(
    () => inventory.filter((i) => (i.warehouseId || 'WH-HYD-01') === selectedWarehouseId),
    [inventory, selectedWarehouseId]
  )

  const selectedBin = activeBins.find((bin) => bin.id === selectedBinId)
  const storeSkus = useAppStore((state) => state.skus)
  const allSkus = storeSkus?.length ? storeSkus : skus
  const selectedStock = activeInventory.find((item) => item.binId === selectedBinId)
  const selectedSku = selectedBin ? allSkus.find((sku) => sku.id === selectedStock?.skuId) : undefined
  const stockByBin = useMemo(() => new Map(activeInventory.map((item) => [item.binId, item])), [activeInventory])
  const results = useMemo(() => searchWarehouseBins(query, activeBins, activeInventory, allSkus), [activeBins, activeInventory, allSkus, query])
  const amount = Number(quantity)
  const currentWarehouse = warehouses.find((w) => w.id === selectedWarehouseId) || warehouses[0]
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

  function handleWarehouseChange(newWarehouseId: string) {
    setSelectedWarehouseId(newWarehouseId)
    setQuery('')
    setMessage(null)
    setResetVersion((v) => v + 1)
  }

  function adjustZoom(direction: -1 | 1) { setZoomVersion((version) => version + direction) }

  return <>
    <PageHeader
      title="3D Warehouse Digital Twin"
      description="Inspect warehouse geometry, bin capacity, and real-time stock levels across facility network."
      action={
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Building2 size={15} style={{ color: '#00e5ff' }} />
          <select
            value={selectedWarehouseId}
            onChange={(e) => handleWarehouseChange(e.target.value)}
            className="warehouse-switcher-select"
            aria-label="Select warehouse facility"
            style={{
              background: '#0e1823',
              color: '#dbeafe',
              border: '1px solid #1e3a5f',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.id} · {w.name} ({w.city})
              </option>
            ))}
          </select>
        </div>
      }
    />
    {activeBins.length === 0 ? <div className="twin-empty"><Box size={25}/><strong>Warehouse layout is empty</strong><span>Add bin records to populate the digital twin for {currentWarehouse.name}.</span></div> : <div className="digital-twin-grid">
      <Card
        title={`${currentWarehouse.name} (${currentWarehouse.city})`}
        subtitle={`${currentWarehouse.type || 'Distribution Center'} · ${currentWarehouse.location} · ${activeBins.length} bins · Status: ${currentWarehouse.status || 'Active'}`}
        className="digital-twin-card"
      >
        <div className="twin-search-row">
          <div className="twin-search"><Search size={15}/><span className="search-prefix">SKU / Bin ID</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${currentWarehouse.city} locations or SKUs`} aria-label="Search by bin ID or SKU"/><span className="result-count">{query ? `${results.length} found` : ''}</span>{query && <button aria-label="Clear search" onClick={() => setQuery('')}>×</button>}
            {query && <div className="search-results">{results.length ? results.map((bin) => { const stock = stockByBin.get(bin.id); const sku = allSkus.find((entry) => entry.id === stock?.skuId); return <button key={bin.id} onClick={() => chooseBin(bin)}><span><b>{bin.id}</b><small>{sku?.id} · {sku?.name}</small></span><Badge>{stock ? getStockStatus(stock) : 'Unavailable'}</Badge></button> }) : <div className="search-no-results">No matching bins or SKUs in this warehouse.</div>}</div>}
          </div>
          <Button onClick={() => selectedBin && setFocusVersion((version) => version + 1)}><Crosshair size={14}/> Locate bin</Button>
          <button className="twin-tool-button" onClick={() => { setResetVersion((version) => version + 1); setMessage(null) }}><RotateCcw size={14}/> Reset view</button>
          <div className="zoom-tools"><button aria-label="Zoom in" onClick={() => adjustZoom(1)}><ZoomIn size={15}/></button><button aria-label="Zoom out" onClick={() => adjustZoom(-1)}><ZoomOut size={15}/></button></div>
        </div>
        <div className="twin-canvas">
          <WarehouseScene
            bins={activeBins}
            inventory={activeInventory}
            selectedBinId={selectedBinId}
            onSelect={(id) => {
              const bin = activeBins.find((entry) => entry.id === id)
              if (bin) chooseBin(bin)
            }}
            resetVersion={resetVersion}
            zoomVersion={zoomVersion}
            focusVersion={focusVersion}
            focusBin={selectedBin}
          />
          <div className="scene-help">Drag to orbit · Right drag to pan · Scroll to zoom</div>
          <div className="scene-view-label">{currentWarehouse.id} <span>·</span> {activeBins.length} BINS</div>
          <div className="scene-status"><i/> LIVE INVENTORY</div>
        </div>
        <div className="twin-legend"><span><i className="legend-healthy"/> Healthy</span><span><i className="legend-low"/> Low stock</span><span><i className="legend-empty"/> Empty</span><span><i className="legend-unavailable"/> Unavailable</span><span><i className="legend-selected"/> Selected</span></div>
        <div className="twin-route"><span className="route-icon"><Crosshair size={16}/></span><span><b>Warehouse navigation</b><small>{selectedBin ? `Selected location · ${selectedBin.id} · Zone ${selectedBin.zone}` : 'Select any bin in ' + currentWarehouse.name + ' to inspect inventory'}</small></span><span className="route-distance">Orbit and zoom to explore</span></div>
      </Card>
      <Card title="Bin inspector" subtitle={`Selected location at ${currentWarehouse.id}`} className="bin-inspector">
        {!selectedBin ? <div className="inspector-empty"><Box size={22}/><b>No bin selected</b><span>Select a bin in the 3D scene or search above to view details.</span></div> : !selectedStock ? <div className="inspector-empty"><Box size={22}/><b>Empty Storage Bin</b><span>Location {selectedBin.id} is available for SKU allocation (Capacity: {selectedBin.capacity} units, Max Weight: {selectedBin.optimizationConstraints?.maxWeightKg ?? 25} kg).</span></div> : <Inspector bin={selectedBin} stock={selectedStock} sku={selectedSku} incoming={replenishmentRequests.filter((request) => request.binId === selectedBin.id).reduce((sum, request) => sum + getIncomingQuantity(request), 0)} quantity={quantity} setQuantity={setQuantity} message={message} currentMovement={currentMovement} onAction={runStockAction}/>}
      </Card>
    </div>}
    <div className="metric-grid three twin-metrics">
      <Metric label="Warehouse locations" value={activeBins.length.toLocaleString()} note={`Bins active in ${currentWarehouse.name}`}/>
      <Metric label="Units on hand" value={activeInventory.reduce((sum, item) => sum + item.quantity, 0).toLocaleString()} note="Local warehouse physical inventory" tone="green"/>
      <Metric label="Flagged locations" value={activeInventory.filter((item) => ['Low stock', 'Empty', 'Unavailable'].includes(getStockStatus(item))).length.toString()} note="Low stock · empty · unavailable" tone="amber"/>
    </div>
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
