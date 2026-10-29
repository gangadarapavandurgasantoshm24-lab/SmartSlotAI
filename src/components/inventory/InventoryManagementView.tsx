import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  Archive,
  ArrowRight,
  ArrowRightLeft,
  Boxes,
  Check,
  CheckCircle2,
  Clock,
  Edit3,
  Eye,
  History,
  Package,
  PackagePlus,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react'
import type { FC } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { getAvailableQuantity, getBoxId, getStockStatus } from '../../data/inventoryUtils'
import type { CreateProductInput, HandlingType, InventoryItem, SKU } from '../../types'
import { Badge, Button, Card } from '../ui'

export const InventoryManagementView: FC = () => {
  const skus = useAppStore((state) => state.skus)
  const inventory = useAppStore((state) => state.inventory)
  const bins = useAppStore((state) => state.bins)
  const movements = useAppStore((state) => state.movements)
  const transferTasks = useAppStore((state) => state.transferTasks)
  const pickOrder = useAppStore((state) => state.pickOrder)
  const replenishmentRequests = useAppStore((state) => state.replenishmentRequests)

  const createProduct = useAppStore((state) => state.createProduct)
  const updateProductMetadata = useAppStore((state) => state.updateProductMetadata)
  const adjustStock = useAppStore((state) => state.adjustStock)
  const archiveInventoryItem = useAppStore((state) => state.archiveInventoryItem)
  const restoreInventoryItem = useAppStore((state) => state.restoreInventoryItem)
  const initiateRelocationTransfer = useAppStore((state) => state.initiateRelocationTransfer)
  const completeRelocationTransfer = useAppStore((state) => state.completeRelocationTransfer)
  const cancelRelocationTransfer = useAppStore((state) => state.cancelRelocationTransfer)

  // Subtab navigation: 'active' | 'transfers' | 'archived'
  const [activeTab, setActiveTab] = useState<'active' | 'transfers' | 'archived'>('active')

  // Search and filters
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [zoneFilter, setZoneFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')

  // Feedback notifications
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  function showToast(text: string, ok: boolean) {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 6000)
  }

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [adjustingItem, setAdjustingItem] = useState<{ item: InventoryItem; sku: SKU } | null>(null)
  const [relocatingItem, setRelocatingItem] = useState<{ item: InventoryItem; sku: SKU } | null>(null)
  const [editingSku, setEditingSku] = useState<SKU | null>(null)
  const [inspectingItem, setInspectingItem] = useState<{ item: InventoryItem; sku: SKU } | null>(null)
  const [archivingItem, setArchivingItem] = useState<{ item: InventoryItem; sku: SKU } | null>(null)

  // Dynamic filter values
  const allCategories = useMemo(() => {
    return ['All', ...Array.from(new Set(skus.map((s) => s.category).filter(Boolean)))]
  }, [skus])

  const allZones = ['All', 'Zone A', 'Zone B', 'Zone C', 'Zone D']

  // Filtered active inventory records
  const activeRecords = useMemo(() => {
    return inventory.filter((item) => {
      if (item.archived) return false
      const sku = skus.find((s) => s.id === item.skuId)
      const bin = bins.find((b) => b.id === item.binId)
      const status = getStockStatus(item)

      // Search match
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        item.skuId.toLowerCase().includes(q) ||
        (sku?.name && sku.name.toLowerCase().includes(q)) ||
        (sku?.category && sku.category.toLowerCase().includes(q)) ||
        item.binId.toLowerCase().includes(q) ||
        (sku?.supplier && sku.supplier.toLowerCase().includes(q))

      // Category match
      const matchesCategory = categoryFilter === 'All' || sku?.category === categoryFilter

      // Zone match
      const matchesZone = zoneFilter === 'All' || (bin && `Zone ${bin.zone}` === zoneFilter)

      // Status match
      let matchesStatus = true
      if (statusFilter === 'Healthy') matchesStatus = status === 'Healthy'
      else if (statusFilter === 'Low stock') matchesStatus = status === 'Low stock'
      else if (statusFilter === 'Empty') matchesStatus = status === 'Empty'
      else if (statusFilter === 'Unavailable') matchesStatus = status === 'Unavailable'

      return matchesSearch && matchesCategory && matchesZone && matchesStatus
    })
  }, [inventory, skus, bins, searchQuery, categoryFilter, zoneFilter, statusFilter])

  // Archived items
  const archivedRecords = useMemo(() => {
    return inventory.filter((item) => item.archived)
  }, [inventory])

  // Pending transfers count
  const pendingTransfersCount = transferTasks.filter((t) => t.status === 'Pending').length

  // Quick statistics
  const totalActiveSkus = new Set(inventory.filter((i) => !i.archived && i.quantity > 0).map((i) => i.skuId)).size
  const totalUnitsOnHand = inventory.filter((i) => !i.archived).reduce((sum, i) => sum + i.quantity, 0)
  const totalLowStockAlerts = inventory.filter((i) => !i.archived && ['Low stock', 'Empty', 'Unavailable'].includes(getStockStatus(i))).length

  return (
    <div className="inventory-crud-root">
      {/* Toast Feedback */}
      {toast && (
        <aside className={`crud-toast ${toast.ok ? 'success' : 'error'}`} role="alert">
          {toast.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toast.text}</span>
          <button onClick={() => setToast(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </aside>
      )}

      {/* Header and Quick Stats */}
      <div className="inventory-header-strip">
        <div>
          <h2>Master Inventory &amp; Storage Management</h2>
          <p>Create products, track real stock movements, adjust counts, and execute rack transfers.</p>
        </div>
        <div className="inventory-header-actions">
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            <Plus size={15} />
            <span>Add New Product / Stock In</span>
          </Button>
        </div>
      </div>

      <div className="metric-grid four">
        <div className="metric">
          <div className="metric-icon blue"><Package size={15} /></div>
          <div className="metric-label">Active Slotted SKUs</div>
          <div className="metric-value">{totalActiveSkus}</div>
          <div className="metric-note">Across warehouse layout</div>
        </div>
        <div className="metric">
          <div className="metric-icon green"><Boxes size={15} /></div>
          <div className="metric-label">Total Units On Hand</div>
          <div className="metric-value">{totalUnitsOnHand.toLocaleString()}</div>
          <div className="metric-note">Live shared physical inventory</div>
        </div>
        <div className="metric">
          <div className="metric-icon amber"><AlertCircle size={15} /></div>
          <div className="metric-label">Low Stock Alerts</div>
          <div className="metric-value">{totalLowStockAlerts}</div>
          <div className="metric-note">At or below reorder threshold</div>
        </div>
        <div className="metric">
          <div className="metric-icon navy"><ArrowRightLeft size={15} /></div>
          <div className="metric-label">Pending Transfers</div>
          <div className="metric-value">{pendingTransfersCount}</div>
          <div className="metric-note">Staged warehouse moves</div>
        </div>
      </div>

      {/* Tabs: Active / Transfers / Archived */}
      <div className="inventory-nav-tabs">
        <button
          className={`inv-tab-btn ${activeTab === 'active' ? 'active' : ''}`}
          onClick={() => setActiveTab('active')}
        >
          <Package size={15} />
          <span>Active Warehouse Inventory</span>
          <span className="tab-pill-count">{activeRecords.length}</span>
        </button>

        <button
          className={`inv-tab-btn ${activeTab === 'transfers' ? 'active' : ''}`}
          onClick={() => setActiveTab('transfers')}
        >
          <ArrowRightLeft size={15} />
          <span>Relocation Transfers</span>
          {pendingTransfersCount > 0 && <span className="tab-pill-alert">{pendingTransfersCount}</span>}
        </button>

        <button
          className={`inv-tab-btn ${activeTab === 'archived' ? 'active' : ''}`}
          onClick={() => setActiveTab('archived')}
        >
          <Archive size={15} />
          <span>Archived Products</span>
          {archivedRecords.length > 0 && <span className="tab-pill-count">{archivedRecords.length}</span>}
        </button>
      </div>

      {/* TAB 1: ACTIVE INVENTORY */}
      {activeTab === 'active' && (
        <Card title="Catalog Inventory Records" subtitle="Search, filter, adjust stock, relocate, and inspect individual SKU allocations">
          {/* Filter Bar */}
          <div className="inv-filter-toolbar">
            <div className="inv-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search by SKU, product name, category, or bin ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="clear-search-btn">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="inv-dropdown-filters">
              <label>
                <span>CATEGORY</span>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>LOCATION</span>
                <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
                  {allZones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>STOCK STATUS</span>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="All">All Statuses</option>
                  <option value="Healthy">Healthy</option>
                  <option value="Low stock">Low stock</option>
                  <option value="Empty">Empty</option>
                  <option value="Unavailable">Unavailable</option>
                </select>
              </label>
            </div>
          </div>

          {/* Table */}
          {activeRecords.length === 0 ? (
            <div className="inv-empty-state">
              <Package size={28} />
              <strong>No inventory matches found</strong>
              <p>Try modifying your search filter, or add a new product using the button above.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="inv-master-table">
                <thead>
                  <tr>
                    <th>SKU / PRODUCT</th>
                    <th>CATEGORY</th>
                    <th>LOCATION / BOX</th>
                    <th>ON HAND</th>
                    <th>AVAILABLE</th>
                    <th>REORDER</th>
                    <th>DEMAND</th>
                    <th>STATUS</th>
                    <th className="th-actions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {activeRecords.map((item) => {
                    const sku = skus.find((s) => s.id === item.skuId) || {
                      id: item.skuId,
                      name: 'Catalog Item',
                      category: 'General',
                      unit: 'units',
                      reorderPoint: item.reorderPoint,
                      supplier: 'Direct',
                    }
                    const available = getAvailableQuantity(item)
                    const status = getStockStatus(item)
                    const demandClass = sku.optimizationProfile?.demandClass ?? 'B'
                    const boxId = getBoxId(item.binId)
                    const utilPercent = Math.min(100, Math.round((item.quantity / item.capacity) * 100))

                    return (
                      <tr key={`${item.binId}-${item.skuId}`} className={status === 'Low stock' ? 'row-warning' : ''}>
                        <td className="td-product">
                          <strong>{item.skuId}</strong>
                          <span className="td-subtext">{sku.name}</span>
                        </td>
                        <td>
                          <span className="category-pill">{sku.category}</span>
                        </td>
                        <td>
                          <strong className="bin-code">{item.binId}</strong>
                          <span className="td-subtext">{boxId}</span>
                        </td>
                        <td>
                          <div className="qty-with-bar">
                            <strong>{item.quantity} <small>{sku.unit}</small></strong>
                            <div className="mini-progress-track" title={`${utilPercent}% capacity utilization (${item.quantity}/${item.capacity})`}>
                              <div
                                className={`mini-progress-fill ${utilPercent > 90 ? 'high' : utilPercent > 30 ? 'normal' : 'low'}`}
                                style={{ width: `${utilPercent}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={available === 0 ? 'text-red' : ''}>
                            {available} <small>{sku.unit}</small>
                          </span>
                        </td>
                        <td>
                          <span>{item.reorderPoint}</span>
                        </td>
                        <td>
                          <Badge tone={demandClass === 'A' ? 'green' : demandClass === 'B' ? 'blue' : 'amber'}>
                            Class {demandClass}
                          </Badge>
                        </td>
                        <td>
                          <Badge>{status}</Badge>
                        </td>
                        <td className="td-actions">
                          <button
                            className="inv-action-icon-btn"
                            title="Inspect product & movement history"
                            onClick={() => setInspectingItem({ item, sku })}
                          >
                            <Eye size={14} />
                          </button>
                          <button
                            className="inv-action-icon-btn"
                            title="Adjust inventory count"
                            onClick={() => setAdjustingItem({ item, sku })}
                          >
                            <SlidersHorizontal size={14} />
                          </button>
                          <button
                            className="inv-action-icon-btn"
                            title="Relocate to another storage bin"
                            onClick={() => setRelocatingItem({ item, sku })}
                            disabled={available <= 0}
                          >
                            <ArrowRightLeft size={14} />
                          </button>
                          <button
                            className="inv-action-icon-btn"
                            title="Edit product metadata"
                            onClick={() => setEditingSku(sku)}
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            className="inv-action-icon-btn danger"
                            title="Archive product record"
                            onClick={() => setArchivingItem({ item, sku })}
                          >
                            <Archive size={14} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 2: RELOCATION TRANSFERS */}
      {activeTab === 'transfers' && (
        <Card title="Warehouse Relocation Transfer Tasks" subtitle="Stage and execute physical inventory moves between rack locations">
          {transferTasks.length === 0 ? (
            <div className="inv-empty-state">
              <ArrowRightLeft size={28} />
              <strong>No transfer tasks recorded</strong>
              <p>To relocate stock, click the Relocate icon next to any product in the Active Inventory tab.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="inv-master-table">
                <thead>
                  <tr>
                    <th>TASK ID</th>
                    <th>SKU / PRODUCT</th>
                    <th>ROUTE (SOURCE &rarr; TARGET)</th>
                    <th>QUANTITY</th>
                    <th>STAGED AT</th>
                    <th>STATUS</th>
                    <th>NOTES</th>
                    <th className="th-actions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {transferTasks.map((task) => {
                    const sku = skus.find((s) => s.id === task.skuId)
                    return (
                      <tr key={task.id}>
                        <td>
                          <code>{task.id}</code>
                        </td>
                        <td>
                          <strong>{task.skuId}</strong>
                          <span className="td-subtext">{sku?.name || 'Item'}</span>
                        </td>
                        <td>
                          <div className="transfer-route-cell">
                            <span>{task.sourceBinId}</span>
                            <ArrowRight size={13} />
                            <strong className="text-teal">{task.targetBinId}</strong>
                          </div>
                        </td>
                        <td>
                          <strong>{task.quantity} units</strong>
                        </td>
                        <td>
                          <span className="td-subtext">{new Date(task.createdAt).toLocaleString()}</span>
                        </td>
                        <td>
                          <Badge tone={task.status === 'Completed' ? 'green' : task.status === 'Pending' ? 'amber' : 'red'}>
                            {task.status}
                          </Badge>
                        </td>
                        <td>
                          <span className="td-subtext">{task.notes || '—'}</span>
                        </td>
                        <td className="td-actions">
                          {task.status === 'Pending' && (
                            <>
                              <button
                                className="button button-primary button-xs"
                                onClick={() => {
                                  const res = completeRelocationTransfer(task.id)
                                  showToast(res.message, res.ok)
                                }}
                              >
                                <Check size={12} />
                                <span>Complete Move</span>
                              </button>
                              <button
                                className="button button-secondary button-xs"
                                onClick={() => {
                                  const res = cancelRelocationTransfer(task.id)
                                  showToast(res.message, res.ok)
                                }}
                              >
                                <X size={12} />
                                <span>Cancel</span>
                              </button>
                            </>
                          )}
                          {task.status !== 'Pending' && (
                            <span className="td-subtext">Archived record</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* TAB 3: ARCHIVED ITEMS */}
      {activeTab === 'archived' && (
        <Card title="Archived Inventory Catalog" subtitle="Products deactivated from picking and replenishment. Historical movement records remain intact.">
          {archivedRecords.length === 0 ? (
            <div className="inv-empty-state">
              <Archive size={28} />
              <strong>No archived inventory items</strong>
              <p>Active items can be archived from the action menu in the Active Inventory tab.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="inv-master-table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>PRODUCT</th>
                    <th>LAST BIN LOCATION</th>
                    <th>UNITS ARCHIVED</th>
                    <th>STATUS</th>
                    <th className="th-actions">ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {archivedRecords.map((item) => {
                    const sku = skus.find((s) => s.id === item.skuId)
                    return (
                      <tr key={`${item.binId}-${item.skuId}`}>
                        <td>
                          <strong>{item.skuId}</strong>
                        </td>
                        <td>
                          <span>{sku?.name || 'Catalog Product'}</span>
                          <span className="td-subtext">{sku?.category}</span>
                        </td>
                        <td>
                          <code>{item.binId}</code>
                        </td>
                        <td>
                          <span>{item.quantity} {sku?.unit || 'units'}</span>
                        </td>
                        <td>
                          <Badge tone="amber">Archived</Badge>
                        </td>
                        <td className="td-actions">
                          <button
                            className="button button-primary button-xs"
                            onClick={() => {
                              const res = restoreInventoryItem(item.skuId, item.binId)
                              showToast(res.message, res.ok)
                            }}
                          >
                            <RotateCcw size={12} />
                            <span>Restore to Active</span>
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* MODAL 1: CREATE NEW PRODUCT */}
      {showCreateModal && (
        <CreateProductModal
          bins={bins}
          inventory={inventory}
          skus={skus}
          onClose={() => setShowCreateModal(false)}
          onCreate={(input) => {
            const res = createProduct(input)
            showToast(res.message, res.ok)
            if (res.ok) setShowCreateModal(false)
            return res
          }}
        />
      )}

      {/* MODAL 2: ADJUST STOCK */}
      {adjustingItem && (
        <AdjustStockModal
          item={adjustingItem.item}
          sku={adjustingItem.sku}
          onClose={() => setAdjustingItem(null)}
          onAdjust={(delta, reason) => {
            const res = adjustStock({
              binId: adjustingItem.item.binId,
              skuId: adjustingItem.item.skuId,
              delta,
              reason,
            })
            showToast(res.message, res.ok)
            if (res.ok) setAdjustingItem(null)
            return res
          }}
        />
      )}

      {/* MODAL 3: RELOCATE STOCK (TRANSFER) */}
      {relocatingItem && (
        <RelocateModal
          item={relocatingItem.item}
          sku={relocatingItem.sku}
          bins={bins}
          inventory={inventory}
          onClose={() => setRelocatingItem(null)}
          onTransfer={(targetBinId, quantity, notes) => {
            const res = initiateRelocationTransfer({
              skuId: relocatingItem.item.skuId,
              sourceBinId: relocatingItem.item.binId,
              targetBinId,
              quantity,
              notes,
            })
            showToast(res.message, res.ok)
            if (res.ok) setRelocatingItem(null)
            return res
          }}
        />
      )}

      {/* MODAL 4: EDIT METADATA */}
      {editingSku && (
        <EditMetadataModal
          sku={editingSku}
          onClose={() => setEditingSku(null)}
          onSave={(updates) => {
            const res = updateProductMetadata(editingSku.id, updates)
            showToast(res.message, res.ok)
            if (res.ok) setEditingSku(null)
            return res
          }}
        />
      )}

      {/* MODAL 5: INSPECT PRODUCT & MOVEMENT HISTORY */}
      {inspectingItem && (
        <ProductDetailsModal
          item={inspectingItem.item}
          sku={inspectingItem.sku}
          movements={movements.filter((m) => m.skuId === inspectingItem.item.skuId)}
          onClose={() => setInspectingItem(null)}
        />
      )}

      {/* MODAL 6: CONFIRM ARCHIVE */}
      {archivingItem && (
        <ConfirmArchiveModal
          item={archivingItem.item}
          sku={archivingItem.sku}
          pickOrder={pickOrder}
          replenishmentRequests={replenishmentRequests}
          transferTasks={transferTasks}
          onClose={() => setArchivingItem(null)}
          onConfirm={() => {
            const res = archiveInventoryItem(archivingItem.item.skuId, archivingItem.item.binId)
            showToast(res.message, res.ok)
            if (res.ok) setArchivingItem(null)
            return res
          }}
        />
      )}
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// SUB-MODAL 1: CREATE PRODUCT MODAL
// ------------------------------------------------------------------------------------------------
interface CreateProductModalProps {
  bins: any[]
  inventory: InventoryItem[]
  skus: SKU[]
  onClose: () => void
  onCreate: (input: CreateProductInput) => { ok: boolean; message: string }
}

const CreateProductModal: FC<CreateProductModalProps> = ({
  bins,
  inventory,
  skus,
  onClose,
  onCreate,
}) => {
  const [skuId, setSkuId] = useState('SKU-')
  const [name, setName] = useState('')
  const [category, setCategory] = useState('General Merchandise')
  const [unit, setUnit] = useState('box')
  const [quantity, setQuantity] = useState('24')
  const [reorderPoint, setReorderPoint] = useState('15')
  const [weightKg, setWeightKg] = useState('1.2')
  const [supplier, setSupplier] = useState('Direct Vendor')
  const [binId, setBinId] = useState('')
  const [handling, setHandling] = useState<HandlingType>('standard')
  const [errorMsg, setErrorMsg] = useState('')

  // Filter available bins
  const compatibleBins = useMemo(() => {
    return bins.filter((b) => {
      const existing = inventory.find((i) => i.binId === b.id && !i.archived)
      // Bin is empty or has 0 units
      return !existing || existing.quantity === 0
    })
  }, [bins, inventory])

  // Set default bin
  if (!binId && compatibleBins.length > 0) {
    setBinId(compatibleBins[0].id)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const existingSku = skus.find((s) => s.id.toLowerCase() === skuId.trim().toLowerCase())
    if (existingSku && existingSku.name.toLowerCase() !== name.trim().toLowerCase()) {
      setErrorMsg(`SKU code "${skuId}" is already used by "${existingSku.name}".`)
      return
    }
    const res = onCreate({
      skuId: skuId.trim(),
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      quantity: Number(quantity),
      reorderPoint: Number(reorderPoint),
      weightKg: Number(weightKg),
      binId: binId.trim(),
      supplier: supplier.trim(),
      handling,
    })
    if (!res.ok) {
      setErrorMsg(res.message)
    }
  }

  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container crud-dialog-container" onClick={(e) => e.stopPropagation()}>
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon"><PackagePlus size={20} /></span>
            <div>
              <h3>Add New Product &amp; Storage Slot</h3>
              <p className="td-subtext">Register product into warehouse catalog and allocate to a compatible shelf bin.</p>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit} className="crud-form">
          <div className="crud-form-grid">
            <label>
              <span>SKU IDENTIFIER *</span>
              <input
                type="text"
                required
                value={skuId}
                onChange={(e) => setSkuId(e.target.value)}
                placeholder="e.g. SKU-5080"
              />
            </label>

            <label>
              <span>PRODUCT NAME *</span>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ergonomic Standing Mat"
              />
            </label>

            <label>
              <span>CATEGORY *</span>
              <input
                type="text"
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder="e.g. Warehouse & Safety"
              />
            </label>

            <label>
              <span>UNIT TYPE</span>
              <select value={unit} onChange={(e) => setUnit(e.target.value)}>
                <option value="box">box</option>
                <option value="case">case</option>
                <option value="roll">roll</option>
                <option value="pallet">pallet</option>
                <option value="units">units</option>
              </select>
            </label>

            <label>
              <span>INITIAL QUANTITY</span>
              <input
                type="number"
                min="0"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              />
            </label>

            <label>
              <span>REORDER THRESHOLD</span>
              <input
                type="number"
                min="1"
                required
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </label>

            <label>
              <span>UNIT WEIGHT (KG)</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={weightKg}
                onChange={(e) => setWeightKg(e.target.value)}
              />
            </label>

            <label>
              <span>SUPPLIER</span>
              <input
                type="text"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Medline Industries"
              />
            </label>

            <label>
              <span>HANDLING TYPE</span>
              <select value={handling} onChange={(e) => setHandling(e.target.value as HandlingType)}>
                <option value="standard">Standard</option>
                <option value="fragile">Fragile</option>
                <option value="heavy">Heavy</option>
                <option value="hazmat">Hazmat</option>
              </select>
            </label>

            <label className="col-span-full">
              <span>STORAGE BIN LOCATION *</span>
              <select value={binId} onChange={(e) => setBinId(e.target.value)}>
                {compatibleBins.map((b) => (
                  <option key={b.id} value={b.id}>
                    Rack {b.id} (Zone {b.zone} · Capacity {b.capacity} units · Max {b.optimizationConstraints?.maxWeightKg ?? 25} kg)
                  </option>
                ))}
              </select>
            </label>
          </div>

          {errorMsg && (
            <div className="crud-error-box">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <footer className="crud-modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary">
              <Plus size={15} />
              <span>Save &amp; Slot Product</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// SUB-MODAL 2: ADJUST STOCK MODAL
// ------------------------------------------------------------------------------------------------
interface AdjustStockModalProps {
  item: InventoryItem
  sku: SKU
  onClose: () => void
  onAdjust: (delta: number, reason: string) => { ok: boolean; message: string }
}

const AdjustStockModal: FC<AdjustStockModalProps> = ({ item, sku, onClose, onAdjust }) => {
  const [deltaStr, setDeltaStr] = useState('5')
  const [reason, setReason] = useState('Cycle count physical audit')
  const [customReason, setCustomReason] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const delta = Number(deltaStr) || 0
  const projectedBalance = item.quantity + delta
  const isOverCapacity = projectedBalance > item.capacity
  const isNegative = projectedBalance < 0
  const isUnderReserved = projectedBalance < item.reserved

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const finalReason = reason === 'Other' ? customReason.trim() : reason
    if (!finalReason) {
      setErrorMsg('Please enter a reason for stock adjustment.')
      return
    }
    const res = onAdjust(delta, finalReason)
    if (!res.ok) setErrorMsg(res.message)
  }

  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container crud-dialog-container" onClick={(e) => e.stopPropagation()}>
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon"><SlidersHorizontal size={20} /></span>
            <div>
              <h3>Stock Adjustment · {item.skuId}</h3>
              <p className="td-subtext">Location: Rack {item.binId} · {sku.name}</p>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit} className="crud-form">
          <div className="crud-balance-overview">
            <div>
              <span>Current On Hand</span>
              <strong>{item.quantity} {sku.unit}</strong>
            </div>
            <div>
              <span>Reserved Stock</span>
              <strong>{item.reserved} {sku.unit}</strong>
            </div>
            <div>
              <span>Bin Capacity</span>
              <strong>{item.capacity} {sku.unit}</strong>
            </div>
            <div className={projectedBalance < item.reorderPoint ? 'balance-warn' : ''}>
              <span>Projected Balance</span>
              <strong>{projectedBalance} {sku.unit}</strong>
            </div>
          </div>

          <label>
            <span>QUANTITY DELTA (+ for add, - for subtract)</span>
            <input
              type="number"
              required
              value={deltaStr}
              onChange={(e) => setDeltaStr(e.target.value)}
              placeholder="e.g. 5 or -2"
            />
          </label>

          <label>
            <span>REASON FOR ADJUSTMENT *</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="Cycle count physical audit">Cycle count physical audit</option>
              <option value="Damaged packaging / shrinkage">Damaged packaging / shrinkage</option>
              <option value="Customer return restocking">Customer return restocking</option>
              <option value="Internal warehouse sample">Internal warehouse sample</option>
              <option value="Other">Other (custom note)</option>
            </select>
          </label>

          {reason === 'Other' && (
            <label>
              <span>CUSTOM EXPLANATION</span>
              <input
                type="text"
                required
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Specify adjustment notes..."
              />
            </label>
          )}

          {isOverCapacity && (
            <div className="crud-error-box">
              <AlertTriangle size={15} />
              <span>Projected stock ({projectedBalance}) exceeds bin capacity ({item.capacity}).</span>
            </div>
          )}

          {isNegative && (
            <div className="crud-error-box">
              <AlertCircle size={15} />
              <span>Projected stock cannot be negative.</span>
            </div>
          )}

          {isUnderReserved && (
            <div className="crud-error-box">
              <AlertTriangle size={15} />
              <span>Cannot reduce stock below {item.reserved} reserved units assigned to active orders.</span>
            </div>
          )}

          {errorMsg && (
            <div className="crud-error-box">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <footer className="crud-modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="button button-primary"
              disabled={delta === 0 || isOverCapacity || isNegative || isUnderReserved}
            >
              <Check size={15} />
              <span>Confirm Stock Adjustment</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// SUB-MODAL 3: RELOCATE STOCK (TRANSFER)
// ------------------------------------------------------------------------------------------------
interface RelocateModalProps {
  item: InventoryItem
  sku: SKU
  bins: any[]
  inventory: InventoryItem[]
  onClose: () => void
  onTransfer: (targetBinId: string, quantity: number, notes?: string) => { ok: boolean; message: string }
}

const RelocateModal: FC<RelocateModalProps> = ({ item, sku, bins, inventory, onClose, onTransfer }) => {
  const available = getAvailableQuantity(item)
  const [targetBinId, setTargetBinId] = useState('')
  const [quantity, setQuantity] = useState(String(available || 1))
  const [notes, setNotes] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  // Compatible target bins: must not be source bin, and either empty or already holds same SKU
  const compatibleTargets = useMemo(() => {
    return bins.filter((b) => {
      if (b.id === item.binId) return false
      const targetStock = inventory.find((i) => i.binId === b.id && !i.archived)
      if (!targetStock || targetStock.quantity === 0) return true
      return targetStock.skuId === item.skuId && targetStock.quantity < targetStock.capacity
    })
  }, [bins, inventory, item])

  if (!targetBinId && compatibleTargets.length > 0) {
    setTargetBinId(compatibleTargets[0].id)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg('')
    const qNum = Number(quantity)
    if (qNum <= 0 || qNum > available) {
      setErrorMsg(`Quantity must be between 1 and ${available} available units.`)
      return
    }
    const res = onTransfer(targetBinId, qNum, notes)
    if (!res.ok) setErrorMsg(res.message)
  }

  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container crud-dialog-container" onClick={(e) => e.stopPropagation()}>
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon"><ArrowRightLeft size={20} /></span>
            <div>
              <h3>Initiate Stock Relocation · {item.skuId}</h3>
              <p className="td-subtext">Current Location: Rack {item.binId} &middot; Available: {available} units</p>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit} className="crud-form">
          <div className="reslot-movement-box">
            <div className="reslot-loc source">
              <span className="loc-label">SOURCE LOCATION</span>
              <strong className="loc-rack">Rack {item.binId}</strong>
              <span className="loc-box">{available} units available</span>
              <span className="loc-item">{sku.name}</span>
            </div>
            <div className="reslot-arrow">
              <ArrowRight size={20} />
            </div>
            <div className="reslot-loc target">
              <span className="loc-label">TARGET LOCATION</span>
              <strong className="loc-rack highlight-target">{targetBinId || 'Select bin'}</strong>
            </div>
          </div>

          <label>
            <span>TARGET COMPATIBLE STORAGE BIN *</span>
            <select value={targetBinId} onChange={(e) => setTargetBinId(e.target.value)}>
              {compatibleTargets.map((b) => (
                <option key={b.id} value={b.id}>
                  Rack {b.id} (Zone {b.zone} · Cap {b.capacity} · Max {b.optimizationConstraints?.maxWeightKg ?? 25} kg)
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>TRANSFER QUANTITY (MAX: {available})</span>
            <input
              type="number"
              min="1"
              max={available}
              required
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>

          <label>
            <span>TRANSFER NOTES</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Ergonomic re-slotting closer to front pick zone"
            />
          </label>

          {errorMsg && (
            <div className="crud-error-box">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="inv-info-note">
            <Clock size={14} />
            <span>
              Transfer will stage a pending relocation task. Units remain in {item.binId} (reserved) until the transfer is executed.
            </span>
          </div>

          <footer className="crud-modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary" disabled={available <= 0 || !targetBinId}>
              <ArrowRightLeft size={15} />
              <span>Stage Relocation Transfer</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// SUB-MODAL 4: EDIT METADATA MODAL
// ------------------------------------------------------------------------------------------------
interface EditMetadataModalProps {
  sku: SKU
  onClose: () => void
  onSave: (updates: Partial<SKU>) => { ok: boolean; message: string }
}

const EditMetadataModal: FC<EditMetadataModalProps> = ({ sku, onClose, onSave }) => {
  const [name, setName] = useState(sku.name)
  const [category, setCategory] = useState(sku.category)
  const [unit, setUnit] = useState(sku.unit)
  const [supplier, setSupplier] = useState(sku.supplier)
  const [reorderPoint, setReorderPoint] = useState(String(sku.reorderPoint))
  const [errorMsg, setErrorMsg] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const res = onSave({
      name: name.trim(),
      category: category.trim(),
      unit: unit.trim(),
      supplier: supplier.trim(),
      reorderPoint: Number(reorderPoint) || sku.reorderPoint,
    })
    if (!res.ok) setErrorMsg(res.message)
  }

  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container crud-dialog-container" onClick={(e) => e.stopPropagation()}>
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon"><Edit3 size={20} /></span>
            <div>
              <h3>Edit Product Metadata · {sku.id}</h3>
              <p className="td-subtext">Update SKU master catalog information.</p>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <form onSubmit={handleSubmit} className="crud-form">
          <div className="crud-form-grid">
            <label className="col-span-full">
              <span>PRODUCT NAME</span>
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <label>
              <span>CATEGORY</span>
              <input type="text" required value={category} onChange={(e) => setCategory(e.target.value)} />
            </label>

            <label>
              <span>UNIT OF MEASURE</span>
              <input type="text" required value={unit} onChange={(e) => setUnit(e.target.value)} />
            </label>

            <label>
              <span>SUPPLIER / VENDOR</span>
              <input type="text" required value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </label>

            <label>
              <span>REORDER THRESHOLD</span>
              <input
                type="number"
                min="1"
                required
                value={reorderPoint}
                onChange={(e) => setReorderPoint(e.target.value)}
              />
            </label>
          </div>

          {errorMsg && (
            <div className="crud-error-box">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <footer className="crud-modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="button button-primary">
              <Check size={15} />
              <span>Save Changes</span>
            </button>
          </footer>
        </form>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// SUB-MODAL 5: PRODUCT DETAILS & MOVEMENT HISTORY MODAL
// ------------------------------------------------------------------------------------------------
interface ProductDetailsModalProps {
  item: InventoryItem
  sku: SKU
  movements: any[]
  onClose: () => void
}

const ProductDetailsModal: FC<ProductDetailsModalProps> = ({ item, sku, movements, onClose }) => {
  const profile = sku.optimizationProfile
  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container crud-dialog-container wide" onClick={(e) => e.stopPropagation()}>
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon"><Eye size={20} /></span>
            <div>
              <h3>Product Specification &amp; Stock Audit · {sku.id}</h3>
              <p className="td-subtext">{sku.name} &middot; Rack Location: {item.binId}</p>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="crud-details-body">
          {/* Specs Grid */}
          <div className="specs-card-grid">
            <div className="spec-tile">
              <span>Category</span>
              <strong>{sku.category}</strong>
            </div>
            <div className="spec-tile">
              <span>Supplier</span>
              <strong>{sku.supplier}</strong>
            </div>
            <div className="spec-tile">
              <span>Dimensions</span>
              <strong>{profile ? profile.dimensionsCm.join(' × ') : '30 × 20 × 15'} cm</strong>
            </div>
            <div className="spec-tile">
              <span>Unit Weight</span>
              <strong>{profile ? profile.weightKg : 1.0} kg</strong>
            </div>
            <div className="spec-tile">
              <span>Demand Velocity</span>
              <strong>Class {profile?.demandClass ?? 'B'} ({profile?.weeklyPickFrequency ?? 120}/wk)</strong>
            </div>
            <div className="spec-tile">
              <span>Handling Type</span>
              <strong>{profile?.handling ?? 'standard'}</strong>
            </div>
          </div>

          {/* Movement Log */}
          <h4><History size={16} /> Movement History &amp; Audit Trail</h4>
          {movements.length === 0 ? (
            <div className="inv-empty-state-sm">
              <p>No logged movement records for this SKU yet.</p>
            </div>
          ) : (
            <div className="table-scroll movement-audit-table">
              <table>
                <thead>
                  <tr>
                    <th>TIMESTAMP</th>
                    <th>TYPE</th>
                    <th>QUANTITY</th>
                    <th>LOCATION</th>
                    <th>SOURCE / REASON</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <td><span className="td-subtext">{new Date(m.timestamp).toLocaleString()}</span></td>
                      <td>
                        <Badge tone={m.type === 'pick' ? 'blue' : m.type === 'receive' ? 'green' : m.type === 'relocate' ? 'purple' : 'amber'}>
                          {m.type.toUpperCase()}
                        </Badge>
                      </td>
                      <td><strong>{m.quantity}</strong></td>
                      <td><code>{m.binId}{m.destinationBinId ? ` → ${m.destinationBinId}` : ''}</code></td>
                      <td><span className="td-subtext">{m.reason || m.source}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <footer className="crud-modal-footer">
          <button type="button" className="button button-secondary" onClick={onClose}>
            Close Inspector
          </button>
        </footer>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------------------------------------
// SUB-MODAL 6: CONFIRM ARCHIVE MODAL
// ------------------------------------------------------------------------------------------------
interface ConfirmArchiveModalProps {
  item: InventoryItem
  sku: SKU
  pickOrder: any
  replenishmentRequests: any[]
  transferTasks: any[]
  onClose: () => void
  onConfirm: () => { ok: boolean; message: string }
}

const ConfirmArchiveModal: FC<ConfirmArchiveModalProps> = ({
  item,
  sku,
  pickOrder,
  replenishmentRequests,
  transferTasks,
  onClose,
  onConfirm,
}) => {
  const [errorMsg, setErrorMsg] = useState('')

  // Check blockers
  const hasActivePick = pickOrder.lines.some((l: any) => l.skuId === sku.id && l.picked < l.requested) && pickOrder.status !== 'Complete'
  const hasActivePO = replenishmentRequests.some((r) => r.skuId === sku.id && !['Completed', 'Cancelled'].includes(r.status))
  const hasActiveTransfer = transferTasks.some((t) => t.skuId === sku.id && t.status === 'Pending')
  const hasReserved = item.reserved > 0
  const isBlocked = hasActivePick || hasActivePO || hasActiveTransfer || hasReserved

  function handleConfirm() {
    setErrorMsg('')
    const res = onConfirm()
    if (!res.ok) setErrorMsg(res.message)
  }

  return (
    <div className="bin-modal-backdrop" onClick={onClose}>
      <div className="bin-modal-container crud-dialog-container" onClick={(e) => e.stopPropagation()}>
        <header className="bin-modal-header">
          <div className="bin-header-title">
            <span className="box-badge-icon danger"><Archive size={20} /></span>
            <div>
              <h3>Archive Inventory Product · {sku.id}</h3>
              <p className="td-subtext">{sku.name} &middot; Rack {item.binId}</p>
            </div>
          </div>
          <button className="bin-modal-close" onClick={onClose}><X size={18} /></button>
        </header>

        <div className="crud-form">
          <p className="archive-warn-text">
            Archiving removes this product from active picking routes and replenishment ordering.
            Existing stock movements and audit records will remain preserved.
          </p>

          {hasActivePick && (
            <div className="crud-error-box">
              <AlertTriangle size={15} />
              <span>Blocked: Product is currently assigned to active pick order {pickOrder.id}. Complete or pause the order first.</span>
            </div>
          )}

          {hasActivePO && (
            <div className="crud-error-box">
              <AlertTriangle size={15} />
              <span>Blocked: Product has an open replenishment PO awaiting delivery or dock receipt.</span>
            </div>
          )}

          {hasActiveTransfer && (
            <div className="crud-error-box">
              <AlertTriangle size={15} />
              <span>Blocked: Product has a pending relocation transfer task.</span>
            </div>
          )}

          {hasReserved && (
            <div className="crud-error-box">
              <AlertTriangle size={15} />
              <span>Blocked: {item.reserved} units are currently reserved for pending orders.</span>
            </div>
          )}

          {errorMsg && (
            <div className="crud-error-box">
              <AlertCircle size={15} />
              <span>{errorMsg}</span>
            </div>
          )}

          <footer className="crud-modal-footer">
            <button type="button" className="button button-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="button button-primary danger"
              disabled={isBlocked}
              onClick={handleConfirm}
            >
              <Archive size={15} />
              <span>Confirm Archive</span>
            </button>
          </footer>
        </div>
      </div>
    </div>
  )
}
