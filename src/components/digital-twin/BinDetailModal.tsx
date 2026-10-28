import {
  Box,
  Clock,
  Layers,
  Package,
  Scale,
  Send,
  Sparkles,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react'
import type { FC } from 'react'
import { getAvailableQuantity, getBoxId, getStockStatus } from '../../data/inventoryUtils'
import { skus } from '../../data/mockData'
import { useAppStore } from '../../store/useAppStore'
import { Badge, Button } from '../ui'

interface BinDetailModalProps {
  binId: string | null
  onClose: () => void
  onDispatchPick?: (skuId: string, binId: string) => void
  onReplenish?: (skuId: string, binId: string) => void
}

export const BinDetailModal: FC<BinDetailModalProps> = ({
  binId,
  onClose,
  onDispatchPick,
  onReplenish,
}) => {
  const bins = useAppStore((state) => state.bins)
  const inventory = useAppStore((state) => state.inventory)
  const dispatchPickTask = useAppStore((state) => state.dispatchPickTask)
  const createReplenishmentRequest = useAppStore((state) => state.createReplenishmentRequest)
  const movements = useAppStore((state) => state.movements)

  if (!binId) return null

  const bin = bins.find((b) => b.id === binId)
  if (!bin) return null

  const stock = inventory.find((i) => i.binId === binId)
  const sku = skus.find((s) => s.id === stock?.skuId || s.id === bin.skuId)
  const available = stock ? getAvailableQuantity(stock) : 0
  const status = stock ? getStockStatus(stock) : 'Unavailable'
  const boxId = getBoxId(bin.id, bin.level ?? 1, bin.face === 'back' ? 'B' : 'F')
  const utilization = stock ? Math.round((stock.quantity / stock.capacity) * 100) : 0
  const recentMovement = movements.find((m) => m.binId === binId)

  const isGoldenZone = (bin.level ?? 1) === 2 || (bin.level ?? 1) === 3
  const demandClass = sku?.optimizationProfile?.demandClass ?? 'B'

  function handleQuickPick() {
    if (!bin || !stock || available <= 0) return
    const pickQty = Math.min(available, 5)
    dispatchPickTask({
      skuId: stock.skuId,
      binId: bin.id,
      quantity: pickQty,
      priority: 'High',
      notes: 'Dispatched via 3D Rack Box Inspector',
    })
    if (onDispatchPick) onDispatchPick(stock.skuId, bin.id)
    onClose()
  }

  function handleQuickReplenish() {
    if (!bin || !sku) return
    createReplenishmentRequest({
      skuId: sku.id,
      binId: bin.id,
      quantity: 20,
      supplier: sku.supplier,
      expectedDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
      note: 'Auto-requested from 3D Rack Box Inspector',
    })
    if (onReplenish) onReplenish(sku.id, bin.id)
    onClose()
  }

  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon">
              <Box size={20} />
            </span>
            <div>
              <div className="bin-header-breadcrumbs">
                <span>ZONE {bin.zone}</span> · <span>AISLE {bin.aisle ?? bin.x + 1}</span> · <span>BAY {bin.bay ?? bin.y + 1}</span> · <span>LEVEL {bin.level ?? 1}</span> · <span>{bin.face?.toUpperCase()}</span>
              </div>
              <h3>Rack Location: {bin.id}</h3>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose} aria-label="Close inspector">
            <X size={18} />
          </button>
        </header>

        {/* Unique Box Identification Pill */}
        <div className="bin-box-identifier-bar">
          <div className="identifier-tag">
            <span>UNIQUE BOX ID</span>
            <strong>{boxId}</strong>
          </div>
          <div className="golden-zone-tag">
            {isGoldenZone ? (
              <span className="gz-badge active">
                <Sparkles size={12} /> GOLDEN ZONE (Levels 2 &amp; 3)
              </span>
            ) : (
              <span className="gz-badge standard">
                <Layers size={12} /> Standard Storage Tier (Level {bin.level ?? 1})
              </span>
            )}
          </div>
          <Badge>{status}</Badge>
        </div>

        {/* Product Details Card */}
        <div className="bin-modal-body">
          <div className="bin-product-card">
            <div className="prod-badge-row">
              <span className={`demand-pill ${demandClass.toLowerCase()}`}>
                <TrendingUp size={12} /> PARETO CLASS {demandClass}
              </span>
              <span className="sku-id-pill">
                SKU CODE: <strong>{sku?.id ?? 'N/A'}</strong>
              </span>
            </div>
            <h4>{sku?.name ?? 'Unassigned Storage Box'}</h4>
            <div className="prod-meta-row">
              <span>Category: <strong>{sku?.category ?? 'General'}</strong></span>
              <span>Supplier: <strong>{sku?.supplier ?? 'Vendor Network'}</strong></span>
              <span>Unit: <strong>{sku?.unit ?? 'item'}</strong></span>
            </div>
          </div>

          {/* Quantities & Inventory Grid */}
          <div className="bin-quantities-grid">
            <div className="qty-cell">
              <span>ON-HAND STOCK</span>
              <strong className="qty-main">{stock?.quantity ?? 0} units</strong>
            </div>
            <div className="qty-cell">
              <span>AVAILABLE (PICKABLE)</span>
              <strong className="qty-avail">{available} units</strong>
            </div>
            <div className="qty-cell">
              <span>RESERVED</span>
              <strong>{stock?.reserved ?? 0} units</strong>
            </div>
            <div className="qty-cell">
              <span>BOX CAPACITY</span>
              <strong>{stock?.capacity ?? bin.capacity} units</strong>
            </div>
          </div>

          {/* Capacity Utilization Bar */}
          <div className="bin-util-section">
            <div className="util-header">
              <span>Capacity Fill Rate</span>
              <strong>{utilization}% Filled</strong>
            </div>
            <div className="util-track">
              <div
                className={`util-fill ${utilization > 85 ? 'high' : utilization < 25 ? 'low' : 'optimal'}`}
                style={{ width: `${Math.min(100, utilization)}%` }}
              />
            </div>
            <small>{stock?.quantity ?? 0} of {stock?.capacity ?? bin.capacity} units stored in Box {boxId}</small>
          </div>

          {/* Physical Specifications & Hard Constraints */}
          <div className="bin-specs-grid">
            <div className="spec-item">
              <Scale size={14} />
              <div>
                <span>UNIT WEIGHT</span>
                <strong>{sku?.optimizationProfile?.weightKg ?? 1.0} kg</strong>
              </div>
            </div>
            <div className="spec-item">
              <Box size={14} />
              <div>
                <span>DIMENSIONS (L×W×H)</span>
                <strong>
                  {sku?.optimizationProfile?.dimensionsCm
                    ? `${sku.optimizationProfile.dimensionsCm[0]}×${sku.optimizationProfile.dimensionsCm[1]}×${sku.optimizationProfile.dimensionsCm[2]} cm`
                    : '30×25×15 cm'}
                </strong>
              </div>
            </div>
            <div className="spec-item">
              <Clock size={14} />
              <div>
                <span>REORDER POINT</span>
                <strong>{stock?.reorderPoint ?? 20} units</strong>
              </div>
            </div>
            <div className="spec-item">
              <Package size={14} />
              <div>
                <span>HANDLING TYPE</span>
                <strong>{sku?.optimizationProfile?.handling?.toUpperCase() ?? 'STANDARD'}</strong>
              </div>
            </div>
          </div>

          {/* Recent Movement Info */}
          {recentMovement && (
            <div className="bin-recent-log">
              <Clock size={13} />
              <span>
                Last movement: <strong>{recentMovement.type.toUpperCase()} of {recentMovement.quantity} units</strong> at {new Date(recentMovement.timestamp).toLocaleTimeString()}
              </span>
            </div>
          )}
        </div>

        {/* Modal Action Buttons */}
        <footer className="bin-modal-footer">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>

          <Button
            variant="secondary"
            onClick={handleQuickReplenish}
            title="Create replenishment purchase order to supplier"
          >
            <Truck size={14} /> Replenish +20 Units
          </Button>

          <Button
            onClick={handleQuickPick}
            disabled={available <= 0}
            title={available <= 0 ? 'No pickable stock available in this box' : 'Dispatch pick order to Order Picker Alex Morgan'}
          >
            <Send size={14} /> Order Pick ({Math.min(available, 5)} Units)
          </Button>
        </footer>
      </div>
    </div>
  )
}
