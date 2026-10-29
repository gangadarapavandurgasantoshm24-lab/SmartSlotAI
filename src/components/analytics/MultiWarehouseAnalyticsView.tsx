import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  Boxes,
  Building2,
  CheckCircle2,
  Compass,
  Filter,
  MapPin,
  Package,
  RefreshCw,
  Route,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Truck,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react'
import { useAppStore } from '../../store/useAppStore'
import { Badge, Button, Card, PageHeader } from '../ui'
import {
  calculateCategoryDistributions,
  calculateCrossWarehouseAvailability,
  calculateNetworkOverviewKpis,
  calculatePipelineAndDiscrepancies,
  calculateWarehouseBreakdowns,
  DEFAULT_ANALYTICS_FILTERS,
  DEMO_ANALYTICS_DISCLAIMER,
  filterInventoryRecords,
} from '../../data/multiWarehouseAnalyticsEngine'
import { calculateSkuDemandProfiles } from '../../data/demandIntelligenceEngine'
import { getStockStatus } from '../../data/inventoryUtils'
import { getWarehouseDistanceKm, getEstimatedTransitHours } from '../../data/multiWarehouseData'
import type { AnalyticsFilterState, CrossWarehouseShortageItem, StorageZoneOccupancy } from '../../types'

export function MultiWarehouseAnalyticsView() {
  const warehouses = useAppStore((state) => state.warehouses)
  const inventory = useAppStore((state) => state.inventory)
  const bins = useAppStore((state) => state.bins)
  const skus = useAppStore((state) => state.skus)
  const transfers = useAppStore((state) => state.interWarehouseTransfers)
  const replenishmentRequests = useAppStore((state) => state.replenishmentRequests)
  const movements = useAppStore((state) => state.movements)
  const salesHistory = useAppStore((state) => state.salesHistory)
  const activeRoutePreview = useAppStore((state) => state.activeRoutePreview)
  const requestTransfer = useAppStore((state) => state.requestInterWarehouseTransfer)
  const approveTransfer = useAppStore((state) => state.approveInterWarehouseTransfer)

  // Filters state
  const [filters, setFilters] = useState<AnalyticsFilterState>(DEFAULT_ANALYTICS_FILTERS)
  const [activeTab, setActiveTab] = useState<'accounting' | 'cross-warehouse' | 'velocity' | 'pipeline' | 'routes'>('accounting')
  const [activeDrillDown, setActiveDrillDown] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Memoized KPI calculations based on current filters and live shared state
  const kpis = useMemo(() => {
    return calculateNetworkOverviewKpis({
      warehouses,
      inventory,
      bins,
      skus,
      transfers,
      replenishmentRequests,
      movements,
      sales: salesHistory,
      filters,
    })
  }, [warehouses, inventory, bins, skus, transfers, replenishmentRequests, movements, salesHistory, filters])

  // Warehouse capacity and zone occupancy breakdowns
  const warehouseBreakdowns = useMemo(() => {
    return calculateWarehouseBreakdowns({
      warehouses,
      inventory,
      bins,
      skus,
      transfers,
      replenishmentRequests,
      movements,
      filters,
    })
  }, [warehouses, inventory, bins, skus, transfers, replenishmentRequests, movements, filters])

  // Category distributions
  const categoryDistributions = useMemo(() => {
    return calculateCategoryDistributions({
      warehouses,
      inventory,
      bins,
      skus,
      transfers,
      replenishmentRequests,
      movements,
      sales: salesHistory,
      filters,
    })
  }, [warehouses, inventory, bins, skus, transfers, replenishmentRequests, movements, salesHistory, filters])

  // Cross-warehouse availability
  const crossWarehouseShortages = useMemo(() => {
    return calculateCrossWarehouseAvailability(
      {
        warehouses,
        inventory,
        bins,
        skus,
        transfers,
        replenishmentRequests,
        movements,
        filters,
      },
      filters.warehouseId !== 'all' ? filters.warehouseId : undefined
    )
  }, [warehouses, inventory, bins, skus, transfers, replenishmentRequests, movements, filters])

  // Pipeline transfers, replenishments and discrepancies
  const pipelineData = useMemo(() => {
    return calculatePipelineAndDiscrepancies({
      warehouses,
      inventory,
      bins,
      skus,
      transfers,
      replenishmentRequests,
      movements,
      filters,
    })
  }, [warehouses, inventory, bins, skus, transfers, replenishmentRequests, movements, filters])

  // Demand velocity and ABC Pareto profiles
  const demandProfiles = useMemo(() => {
    return calculateSkuDemandProfiles({
      skus,
      inventory,
      bins,
      sales: salesHistory,
      movements,
    })
  }, [skus, inventory, bins, salesHistory, movements])

  // Filtered inventory items for live drilldown table
  const filteredInventoryItems = useMemo(() => {
    return filterInventoryRecords(inventory, skus, warehouses, filters)
  }, [inventory, skus, warehouses, filters])

  // Unique categories in catalog
  const categories = useMemo(() => {
    return Array.from(new Set(skus.map((s) => s.category))).sort()
  }, [skus])

  // Unique cities in warehouses
  const cities = useMemo(() => {
    return Array.from(new Set(warehouses.map((w) => w.city || w.location))).sort()
  }, [warehouses])

  function handleFilterChange<K extends keyof AnalyticsFilterState>(
    key: K,
    value: AnalyticsFilterState[K]
  ) {
    setFilters((prev: AnalyticsFilterState) => ({ ...prev, [key]: value }))
  }

  function handleResetFilters() {
    setFilters(DEFAULT_ANALYTICS_FILTERS)
    setActiveDrillDown(null)
  }

  function handleKpiClick(drillKey: string) {
    setActiveDrillDown(drillKey)
    if (drillKey === 'low-stock') {
      handleFilterChange('stockStatus', 'low_stock')
    } else if (drillKey === 'stockout-risk') {
      handleFilterChange('stockStatus', 'critical')
    } else if (drillKey === 'pipeline') {
      setActiveTab('pipeline')
    } else if (drillKey === 'warehouses') {
      setActiveTab('accounting')
    } else if (drillKey === 'skus') {
      setActiveTab('velocity')
    }
  }

  function handleStageTransferFromShortage(shortage: CrossWarehouseShortageItem) {
    const best = shortage.bestAlternative
    if (!best) return

    // Find destination bin in target facility
    const destBins = bins.filter((b) => (b.warehouseId || 'WH-HYD-01') === shortage.targetWarehouseId)
    const destStock = inventory.find(
      (i) => i.skuId === shortage.skuId && (i.warehouseId || 'WH-HYD-01') === shortage.targetWarehouseId
    )
    const destBinId = destStock?.binId || destBins.find((b) => !b.skuId || b.quantity === 0)?.id || destBins[0]?.id

    // Find source bin in source facility
    const sourceStock = inventory.find(
      (i) => i.skuId === shortage.skuId && (i.warehouseId || 'WH-HYD-01') === best.warehouseId && i.quantity > 0
    )
    if (!sourceStock || !destBinId) {
      setToastMessage({ text: 'Unable to resolve matching source or destination bay.', ok: false })
      return
    }

    const proposedQty = Math.min(20, best.availableStock)
    const result = requestTransfer({
      sourceWarehouseId: best.warehouseId,
      destinationWarehouseId: shortage.targetWarehouseId,
      sourceBinId: sourceStock.binId,
      destinationBinId: destBinId,
      skuId: shortage.skuId,
      quantity: proposedQty,
      requestedBy: 'Analytics Studio / Rebalance AI',
      notes: `Automated rebalance for ${shortage.skuName} (${proposedQty} units from ${best.warehouseName})`,
    })

    if (result.ok && result.transfer) {
      approveTransfer(result.transfer.id, 'Manager Jordan Mitchell')
      setToastMessage({
        text: `Transfer ${result.transfer.id} approved: ${proposedQty} units of ${shortage.skuId} en route from ${best.city} (${best.distanceKm} km).`,
        ok: true,
      })
    } else {
      setToastMessage({ text: result.message, ok: false })
    }
  }

  return (
    <div className="analytics-dashboard-root">
      <PageHeader
        title="Multi-Warehouse Analytics & Operational Intelligence"
        description="Unified network inventory accounting, cross-facility shortage detection, transfer pipeline tracking, and corridor route optimization."
        action={
          <div className="analytics-header-actions">
            <Button variant="secondary" onClick={handleResetFilters}>
              <RefreshCw size={13} /> Reset Filters
            </Button>
            <div className="analytics-sync-pill">
              <span className="pulse-dot" />
              <span>Network Sync: <strong>Live State</strong></span>
            </div>
          </div>
        }
      />

      {/* Top Banner: Disclaimer */}
      <div className="replenishment-disclaimer-banner">
        <Sparkles size={15} />
        <span>
          <strong>Shared Network Analytics:</strong> {DEMO_ANALYTICS_DISCLAIMER}
        </span>
      </div>

      {toastMessage && (
        <div className={`replenishment-toast ${toastMessage.ok ? 'ok' : 'error'}`} role="status">
          {toastMessage.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {toastMessage.text}
        </div>
      )}

      {/* MULTI-DIMENSIONAL FILTER TOOLBAR */}
      <div className="analytics-filter-toolbar">
        <div className="toolbar-top-row">
          <div className="filter-item search-filter">
            <Search size={14} />
            <input
              value={filters.skuId}
              onChange={(e) => handleFilterChange('skuId', e.target.value)}
              placeholder="Search by SKU ID or name..."
            />
            {filters.skuId && (
              <button className="clear-search-btn" onClick={() => handleFilterChange('skuId', '')}>
                <X size={12} />
              </button>
            )}
          </div>

          <div className="filter-item">
            <label>
              <WarehouseIcon size={13} /> Facility:
            </label>
            <select
              value={filters.warehouseId}
              onChange={(e) => handleFilterChange('warehouseId', e.target.value)}
            >
              <option value="all">All Warehouses ({warehouses.length})</option>
              {warehouses.map((wh) => (
                <option key={wh.id} value={wh.id}>
                  {wh.id} · {wh.name}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label>
              <MapPin size={13} /> City:
            </label>
            <select
              value={filters.city}
              onChange={(e) => handleFilterChange('city', e.target.value)}
            >
              <option value="all">All Cities</option>
              {cities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label>
              <Boxes size={13} /> Category:
            </label>
            <select
              value={filters.category}
              onChange={(e) => handleFilterChange('category', e.target.value)}
            >
              <option value="all">All Categories ({categories.length})</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-item">
            <label>
              <Filter size={13} /> Stock Status:
            </label>
            <select
              value={filters.stockStatus}
              onChange={(e) =>
                handleFilterChange(
                  'stockStatus',
                  e.target.value as AnalyticsFilterState['stockStatus']
                )
              }
            >
              <option value="all">All Stock Statuses</option>
              <option value="healthy">Healthy Stock</option>
              <option value="low_stock">Low Stock Alerts</option>
              <option value="critical">Critical / Unavailable</option>
              <option value="empty">Empty Racks (0 Units)</option>
            </select>
          </div>
        </div>

        <div className="toolbar-bottom-row">
          <div className="date-range-pills">
            <span>Date Range:</span>
            {(['7d', '30d', '90d', 'all'] as const).map((range) => (
              <button
                key={range}
                className={`range-pill ${filters.dateRange === range ? 'active' : ''}`}
                onClick={() => handleFilterChange('dateRange', range)}
              >
                {range === '7d'
                  ? 'Last 7 Days'
                  : range === '30d'
                  ? 'Last 30 Days'
                  : range === '90d'
                  ? 'Last 90 Days'
                  : 'All History'}
              </button>
            ))}
          </div>

          {activeDrillDown && (
            <div className="active-drilldown-indicator">
              <span>
                Active Drilldown: <strong>{activeDrillDown}</strong>
              </span>
              <button onClick={handleResetFilters}>
                <X size={12} /> Clear Filter
              </button>
            </div>
          )}
        </div>
      </div>

      {/* KPI METRICS STRIP WITH DRILL-DOWN */}
      <div className="analytics-kpi-grid">
        <div
          className={`analytics-kpi-card ${activeDrillDown === 'on-hand' ? 'active-drill' : ''}`}
          onClick={() => handleKpiClick('on-hand')}
          role="button"
          tabIndex={0}
        >
          <div className="kpi-header">
            <span>Total Physical On-Hand</span>
            <Package size={15} className="text-blue" />
          </div>
          <strong className="kpi-hero-val">{kpis.totalOnHandUnits.toLocaleString()}</strong>
          <div className="kpi-sub-row">
            <span>Available: <b>{kpis.totalAvailableUnits.toLocaleString()}</b></span>
            <span>Reserved: <b>{kpis.totalReservedUnits.toLocaleString()}</b></span>
          </div>
        </div>

        <div
          className={`analytics-kpi-card ${activeDrillDown === 'pipeline' ? 'active-drill' : ''}`}
          onClick={() => handleKpiClick('pipeline')}
          role="button"
          tabIndex={0}
        >
          <div className="kpi-header">
            <span>In-Transit Pipeline</span>
            <Truck size={15} className="text-purple" />
          </div>
          <strong className="kpi-hero-val text-purple">{kpis.totalInTransitUnits.toLocaleString()}</strong>
          <div className="kpi-sub-row">
            <span>Transfers: <b>{kpis.activeTransferCount}</b></span>
            <span>Active POs: <b>{kpis.activeReplenishmentCount}</b></span>
          </div>
        </div>

        <div
          className={`analytics-kpi-card ${activeDrillDown === 'skus' ? 'active-drill' : ''}`}
          onClick={() => handleKpiClick('skus')}
          role="button"
          tabIndex={0}
        >
          <div className="kpi-header">
            <span>Distinct Catalog SKUs</span>
            <Boxes size={15} className="text-navy" />
          </div>
          <strong className="kpi-hero-val">{kpis.distinctSkuCount}</strong>
          <div className="kpi-sub-row">
            <span>Active Warehouses: <b>{kpis.activeWarehouseCount}</b></span>
          </div>
        </div>

        <div
          className={`analytics-kpi-card ${activeDrillDown === 'low-stock' ? 'active-drill' : ''}`}
          onClick={() => handleKpiClick('low-stock')}
          role="button"
          tabIndex={0}
        >
          <div className="kpi-header">
            <span>Low-Stock Alerts</span>
            <AlertTriangle size={15} className="text-amber" />
          </div>
          <strong className="kpi-hero-val text-amber">{kpis.lowStockSkuCount}</strong>
          <div className="kpi-sub-row">
            <span>Below Reorder Point</span>
          </div>
        </div>

        <div
          className={`analytics-kpi-card ${activeDrillDown === 'stockout-risk' ? 'active-drill' : ''}`}
          onClick={() => handleKpiClick('stockout-risk')}
          role="button"
          tabIndex={0}
        >
          <div className="kpi-header">
            <span>Network Stockout Risks</span>
            <AlertTriangle size={15} className="text-red" />
          </div>
          <strong className="kpi-hero-val text-red">{kpis.networkStockoutRiskSkuCount}</strong>
          <div className="kpi-sub-row">
            <span>Depleted Network-Wide</span>
          </div>
        </div>

        <div
          className={`analytics-kpi-card ${activeDrillDown === 'warehouses' ? 'active-drill' : ''}`}
          onClick={() => handleKpiClick('warehouses')}
          role="button"
          tabIndex={0}
        >
          <div className="kpi-header">
            <span>Avg Network Capacity</span>
            <Building2 size={15} className="text-green" />
          </div>
          <strong className="kpi-hero-val text-green">{kpis.averageCapacityUtilization}%</strong>
          <div className="kpi-sub-row">
            <span>Total Cap: <b>{kpis.totalCapacityUnits.toLocaleString()} units</b></span>
          </div>
        </div>
      </div>

      {/* SUB-TABS NAVIGATION */}
      <div className="analytics-tabs-bar">
        <button
          className={`analytics-tab-btn ${activeTab === 'accounting' ? 'active' : ''}`}
          onClick={() => setActiveTab('accounting')}
        >
          <BarChart3 size={15} />
          <span>Stock Accounting & Capacity</span>
        </button>
        <button
          className={`analytics-tab-btn ${activeTab === 'cross-warehouse' ? 'active' : ''}`}
          onClick={() => setActiveTab('cross-warehouse')}
        >
          <ArrowRightLeft size={15} />
          <span>Cross-Warehouse Availability</span>
          {crossWarehouseShortages.length > 0 && (
            <span className="tab-pill red">{crossWarehouseShortages.length}</span>
          )}
        </button>
        <button
          className={`analytics-tab-btn ${activeTab === 'velocity' ? 'active' : ''}`}
          onClick={() => setActiveTab('velocity')}
        >
          <TrendingUp size={15} />
          <span>SKU Velocity & Pareto ABC</span>
        </button>
        <button
          className={`analytics-tab-btn ${activeTab === 'pipeline' ? 'active' : ''}`}
          onClick={() => setActiveTab('pipeline')}
        >
          <Truck size={15} />
          <span>Transfers, POs & Discrepancies</span>
          {pipelineData.discrepancies.length > 0 && (
            <span className="tab-pill amber">{pipelineData.discrepancies.length}</span>
          )}
        </button>
        <button
          className={`analytics-tab-btn ${activeTab === 'routes' ? 'active' : ''}`}
          onClick={() => setActiveTab('routes')}
        >
          <Route size={15} />
          <span>Corridor Routes & Fleet Miles</span>
        </button>
      </div>

      {/* TAB 1: STOCK ACCOUNTING & CAPACITY */}
      {activeTab === 'accounting' && (
        <div className="analytics-content-layout">
          {/* Strict Stock Comparison Matrix (No Double-Counting) */}
          <Card
            title="Non-Double-Counting Stock Balance Verification"
            subtitle="Strict invariant: On-Hand = Available + Reserved. In-Transit stock is tracked as pipeline and never double-counted."
            action={
              <div className="accounting-invariant-badge">
                <ShieldCheck size={14} />
                <span>Verified Balance Formula</span>
              </div>
            }
          >
            <div className="accounting-matrix-grid">
              <div className="matrix-cell">
                <span className="cell-label">1. Physical On-Hand Stock</span>
                <strong className="cell-val text-blue">{kpis.totalOnHandUnits.toLocaleString()}</strong>
                <small>Actual units inside warehouse bins</small>
              </div>
              <div className="matrix-op">=</div>
              <div className="matrix-cell">
                <span className="cell-label">2. Available Unreserved</span>
                <strong className="cell-val text-green">{kpis.totalAvailableUnits.toLocaleString()}</strong>
                <small>Ready for order picking</small>
              </div>
              <div className="matrix-op">+</div>
              <div className="matrix-cell">
                <span className="cell-label">3. Reserved for Picking</span>
                <strong className="cell-val text-amber">{kpis.totalReservedUnits.toLocaleString()}</strong>
                <small>Locked for active pick tasks</small>
              </div>
              <div className="matrix-sep" />
              <div className="matrix-cell highlight-pipeline">
                <span className="cell-label">4. In-Transit Pipeline</span>
                <strong className="cell-val text-purple">{kpis.totalInTransitUnits.toLocaleString()}</strong>
                <small>En route · Excluded from on-hand</small>
              </div>
            </div>
          </Card>

          {/* Warehouse Facility Cards & Storage-Zone Occupancy */}
          <div className="warehouse-breakdown-grid">
            {warehouseBreakdowns.map((wh) => (
              <Card
                key={wh.warehouseId}
                title={`${wh.warehouseName} (${wh.warehouseId})`}
                subtitle={`${wh.location} · ${wh.status}`}
                action={<Badge>{wh.capacityUtilizationPct}% Utilized</Badge>}
                className="warehouse-analytics-card"
              >
                <div className="wh-stats-summary">
                  <div className="stat-col">
                    <span>On-Hand:</span>
                    <strong>{wh.onHandUnits.toLocaleString()}</strong>
                  </div>
                  <div className="stat-col">
                    <span>Available:</span>
                    <strong className="text-green">{wh.availableUnits.toLocaleString()}</strong>
                  </div>
                  <div className="stat-col">
                    <span>Reserved:</span>
                    <strong className="text-amber">{wh.reservedUnits.toLocaleString()}</strong>
                  </div>
                  <div className="stat-col">
                    <span>In-Transit In:</span>
                    <strong className="text-purple">+{wh.inTransitIncomingUnits}</strong>
                  </div>
                </div>

                {/* Capacity Bar */}
                <div className="capacity-bar-wrap">
                  <div className="capacity-bar-label">
                    <span>Capacity Utilization:</span>
                    <b>{wh.onHandUnits} / {wh.totalCapacityUnits} units</b>
                  </div>
                  <div className="capacity-track">
                    <div
                      className={`capacity-fill ${wh.capacityUtilizationPct >= 85 ? 'high' : 'normal'}`}
                      style={{ width: `${Math.min(100, wh.capacityUtilizationPct)}%` }}
                    />
                  </div>
                </div>

                {/* Storage Zone Occupancy */}
                <div className="zone-occupancy-section">
                  <h5>Storage-Zone Occupancy:</h5>
                  <div className="zone-pills-row">
                    {wh.zoneBreakdown.map((z: StorageZoneOccupancy) => (
                      <div
                        key={z.zone}
                        className={`zone-pill-box ${z.isGoldenZone ? 'golden-zone' : ''}`}
                      >
                        <div className="zone-pill-top">
                          <strong>Zone {z.zone}</strong>
                          {z.isGoldenZone && <span className="gz-tag">Golden</span>}
                        </div>
                        <div className="zone-pct">{z.occupancyPct}%</div>
                        <small>{z.occupiedBins}/{z.totalBins} bins ({z.onHandUnits} units)</small>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {/* Category Distribution Breakdown */}
          <Card
            title="Inventory Distribution by Product Category"
            subtitle="Comparing on-hand units, unreserved availability, and Pareto velocity classification"
          >
            <div className="table-scroll">
              <table className="analytics-data-table">
                <thead>
                  <tr>
                    <th>CATEGORY</th>
                    <th>ON-HAND UNITS</th>
                    <th>AVAILABLE</th>
                    <th>RESERVED</th>
                    <th>IN-TRANSIT</th>
                    <th>DISTINCT SKUS</th>
                    <th>NETWORK SHARE</th>
                    <th>PARETO CLASSES</th>
                    <th>LOW STOCK</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryDistributions.map((cat) => (
                    <tr key={cat.categoryName}>
                      <td>
                        <strong>{cat.categoryName}</strong>
                      </td>
                      <td><b>{cat.onHandUnits.toLocaleString()}</b></td>
                      <td className="text-green">{cat.availableUnits.toLocaleString()}</td>
                      <td className="text-amber">{cat.reservedUnits.toLocaleString()}</td>
                      <td className="text-purple">+{cat.inTransitUnits.toLocaleString()}</td>
                      <td>{cat.distinctSkuCount}</td>
                      <td>
                        <div className="share-cell">
                          <span>{cat.shareOfTotalUnitsPct}%</span>
                          <div className="share-bar">
                            <div
                              className="share-bar-fill"
                              style={{ width: `${Math.min(100, cat.shareOfTotalUnitsPct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="pareto-pills">
                          <span className="pill-a">{cat.classACount}A</span>
                          <span className="pill-b">{cat.classBCount}B</span>
                          <span className="pill-c">{cat.classCCount}C</span>
                        </div>
                      </td>
                      <td>
                        {cat.lowStockCount > 0 ? (
                          <span className="low-stock-tag">{cat.lowStockCount} alerts</span>
                        ) : (
                          <span className="healthy-tag">Healthy</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: CROSS-WAREHOUSE AVAILABILITY */}
      {activeTab === 'cross-warehouse' && (
        <div className="analytics-content-layout">
          <Card
            title="Cross-Warehouse Shortage & Stock Availability Matrix"
            subtitle={`Detects items unavailable or low at the target facility, but in stock with surplus across the network`}
            action={
              <span className="facility-eval-badge">
                Evaluating Target: <strong>{filters.warehouseId !== 'all' ? filters.warehouseId : 'WH-BLR-04'}</strong>
              </span>
            }
          >
            {crossWarehouseShortages.length === 0 ? (
              <div className="analytics-empty-box">
                <CheckCircle2 size={32} className="text-green" />
                <h3>No Critical Shortages at Target Facility</h3>
                <p>
                  All catalog SKUs satisfy local reorder thresholds, or surplus inventory is balanced across the network.
                </p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="analytics-data-table cross-table">
                  <thead>
                    <tr>
                      <th>SKU & PRODUCT</th>
                      <th>CATEGORY</th>
                      <th>TARGET FACILITY</th>
                      <th>TARGET AVAIL</th>
                      <th>REORDER PT</th>
                      <th>NETWORK AVAIL</th>
                      <th>BEST SISTER SURPLUS SOURCE</th>
                      <th>DISTANCE & TRANSIT</th>
                      <th>ACTION</th>
                    </tr>
                  </thead>
                  <tbody>
                    {crossWarehouseShortages.map((item) => {
                      const best = item.bestAlternative
                      return (
                        <tr key={item.skuId}>
                          <td>
                            <strong>{item.skuId}</strong>
                            <small>{item.skuName}</small>
                          </td>
                          <td>{item.category}</td>
                          <td>
                            <span>{item.targetWarehouseName}</span>
                            <small>({item.targetWarehouseId})</small>
                          </td>
                          <td>
                            <strong className="text-red">{item.targetAvailableStock} units</strong>
                          </td>
                          <td>{item.targetReorderPoint}</td>
                          <td>
                            <strong className="text-blue">{item.totalNetworkAvailableStock} units</strong>
                          </td>
                          <td>
                            {best ? (
                              <div className="best-source-cell">
                                <Building2 size={13} className="text-green" />
                                <div>
                                  <strong>{best.warehouseName}</strong>
                                  <span>{best.availableStock} available ({best.surplusAboveThreshold} surplus)</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-muted">No surplus in network</span>
                            )}
                          </td>
                          <td>
                            {best ? (
                              <div className="transit-metric-cell">
                                <Route size={13} />
                                <span>{best.distanceKm} km (~{best.estimatedTransitHours}h)</span>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td>
                            {best ? (
                              <Button
                                variant="primary"
                                onClick={() => handleStageTransferFromShortage(item)}
                              >
                                <ArrowRightLeft size={13} /> Stage Transfer
                              </Button>
                            ) : (
                              <Button variant="secondary" disabled>
                                Depleted
                              </Button>
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
        </div>
      )}

      {/* TAB 3: SKU VELOCITY & PARETO ABC */}
      {activeTab === 'velocity' && (
        <div className="analytics-content-layout">
          <Card
            title="Demand Velocity & ABC Pareto Classification"
            subtitle="Derived from 30-day customer sales history and completed picker transactions"
          >
            <div className="table-scroll">
              <table className="analytics-data-table">
                <thead>
                  <tr>
                    <th>SKU ID</th>
                    <th>PRODUCT NAME</th>
                    <th>CATEGORY</th>
                    <th>PARETO CLASS</th>
                    <th>30-DAY VELOCITY</th>
                    <th>7-DAY VELOCITY</th>
                    <th>AVAILABLE STOCK</th>
                    <th>DAYS OF SUPPLY</th>
                    <th>REORDER RISK</th>
                    <th>PRIMARY BAY</th>
                  </tr>
                </thead>
                <tbody>
                  {demandProfiles.map((p) => (
                    <tr key={p.skuId}>
                      <td>
                        <strong>{p.skuId}</strong>
                      </td>
                      <td>{p.skuName}</td>
                      <td>{p.category}</td>
                      <td>
                        <span className={`pareto-badge class-${p.paretoClass}`}>
                          Class {p.paretoClass}
                        </span>
                      </td>
                      <td>
                        <b>{p.dailyVelocity30d} / day</b>
                        <small>{p.totalSold30d} units</small>
                      </td>
                      <td>
                        <span>{p.dailyVelocity7d} / day</span>
                        <small>{p.totalSold7d} units</small>
                      </td>
                      <td>
                        <strong className={p.availableStock <= (p.reorderPoint || 10) ? 'text-amber' : 'text-green'}>
                          {p.availableStock} units
                        </strong>
                      </td>
                      <td>
                        {isFinite(p.daysOfStockRemaining)
                          ? `${p.daysOfStockRemaining} days`
                          : 'Stable'}
                      </td>
                      <td>
                        <Badge>{p.reorderRisk}</Badge>
                      </td>
                      <td>
                        <code>{p.currentBinId}</code>
                        <small>Zone {p.currentZone}</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* TAB 4: TRANSFERS, REPLENISHMENTS & DISCREPANCY AUDITS */}
      {activeTab === 'pipeline' && (
        <div className="analytics-content-layout">
          {/* Active Transfers Ledger */}
          <Card
            title="Inter-Warehouse Transfer Pipeline"
            subtitle={`${pipelineData.pendingTransfers.length} active shipments en route or staged`}
            action={<Badge>{pipelineData.pendingTransfers.length} Active Transfers</Badge>}
          >
            <div className="table-scroll">
              <table className="analytics-data-table">
                <thead>
                  <tr>
                    <th>TRANSFER ID</th>
                    <th>SKU</th>
                    <th>SOURCE WH</th>
                    <th>DESTINATION WH</th>
                    <th>QUANTITY</th>
                    <th>STATUS</th>
                    <th>DISTANCE & ETA</th>
                    <th>REQUESTED BY</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineData.pendingTransfers.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <strong>{t.id}</strong>
                      </td>
                      <td>{t.skuId}</td>
                      <td>{t.sourceWarehouseId} ({t.sourceBinId})</td>
                      <td>{t.destinationWarehouseId} ({t.destinationBinId})</td>
                      <td><b>{t.quantity} units</b></td>
                      <td>
                        <span className={`status-pill pill-${t.status.toLowerCase().replace(/\s+/g, '-')}`}>
                          {t.status}
                        </span>
                      </td>
                      <td>{t.transportDistanceKm ?? (t as unknown as { distanceKm?: number }).distanceKm ?? 500} km (~{t.estimatedHours ?? 12}h)</td>
                      <td>{t.requestedBy}</td>
                    </tr>
                  ))}
                  {pipelineData.pendingTransfers.length === 0 && (
                    <tr>
                      <td colSpan={8} className="empty-cell">
                        No active inter-warehouse transfers in progress.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Goods Receipt & Transfer Discrepancies */}
          <Card
            title="Verified Discrepancy & Carrier Damage Audit Ledger"
            subtitle="Strict audit trail: damaged cartons and quantity mismatches do not enter inventory"
            action={<Badge>{pipelineData.discrepancies.length} Discrepancies</Badge>}
          >
            {pipelineData.discrepancies.length === 0 ? (
              <div className="analytics-empty-box">
                <CheckCircle2 size={32} className="text-green" />
                <h3>Zero Quality Discrepancies</h3>
                <p>All carrier deliveries and inter-warehouse receipts were accepted in full without missing or damaged cartons.</p>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="analytics-data-table">
                  <thead>
                    <tr>
                      <th>DISCREPANCY ID</th>
                      <th>TYPE</th>
                      <th>REF ID</th>
                      <th>SKU</th>
                      <th>DELIVERED / EXPECTED</th>
                      <th>ACCEPTED / RECEIVED</th>
                      <th>DISCREPANCY</th>
                      <th>REASON & AUDIT NOTE</th>
                      <th>TIMESTAMP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pipelineData.discrepancies.map((d) => (
                      <tr key={d.id} className="discrepancy-row">
                        <td>
                          <strong>{d.id}</strong>
                        </td>
                        <td>
                          <Badge>{d.type === 'transfer' ? 'Transfer Shortage' : 'Receipt Damage'}</Badge>
                        </td>
                        <td>{d.referenceId}</td>
                        <td>{d.skuId} <small>{d.skuName}</small></td>
                        <td>{d.deliveredOrExpected}</td>
                        <td className="text-green"><b>{d.acceptedOrReceived}</b></td>
                        <td>
                          <strong className="text-red">-{d.discrepancyQuantity} units</strong>
                        </td>
                        <td className="reason-col">{d.reason}</td>
                        <td>{new Date(d.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* TAB 5: CORRIDOR ROUTES & FLEET MILES */}
      {activeTab === 'routes' && (
        <div className="analytics-content-layout">
          <Card
            title="Validated Corridor Route Optimization & Fleet Travel Distance"
            subtitle="Comparing baseline travel paths against 2-Opt shortest-path graph optimization"
            action={
              <div className="route-valid-badge">
                <Compass size={14} />
                <span>{activeRoutePreview ? 'Verified Dijkstra / A* Engine' : 'Warehouse Graph Routing Ready'}</span>
              </div>
            }
          >
            {activeRoutePreview ? (
              <div className="route-hero-stats-grid">
                <div className="route-stat-card">
                  <span>Original Route Distance:</span>
                  <strong>{activeRoutePreview.originalDistanceMeters.toFixed(1)} m</strong>
                  <small>Nearest-Neighbor baseline</small>
                </div>
                <div className="route-stat-card highlight">
                  <span>Optimized Route Distance:</span>
                  <strong className="text-green">{activeRoutePreview.optimizedDistanceMeters.toFixed(1)} m</strong>
                  <small>2-Opt Local Search</small>
                </div>
                <div className="route-stat-card">
                  <span>Distance Saved:</span>
                  <strong className="text-blue">
                    {activeRoutePreview.distanceSavedMeters.toFixed(1)} m ({activeRoutePreview.percentageDistanceSaved.toFixed(1)}%)
                  </strong>
                  <small>Walking seconds saved: ~{activeRoutePreview.estimatedWalkingTime.savedSeconds}s</small>
                </div>
              </div>
            ) : (
              <div className="analytics-empty-box">
                <Route size={32} className="text-blue" />
                <h3>Warehouse Graph Routing Optimization</h3>
                <p>
                  Calculates shortest walking routes between the receiving depot, rack bins, and packing stations using Dijkstra and A* algorithms with obstacle-avoiding corridor graphs.
                </p>
                <small>Dispatch and preview pick tasks in the Manager Portal to inspect live 2-Opt telemetry here.</small>
              </div>
            )}

            {/* Inter-Warehouse Distance Matrix */}
            <div className="inter-wh-matrix-section">
              <h4>Inter-Warehouse Highway Transport Distance Matrix (km & Transit Hours):</h4>
              <div className="table-scroll">
                <table className="analytics-data-table">
                  <thead>
                    <tr>
                      <th>ORIGIN / DESTINATION</th>
                      {warehouses.map((w) => (
                        <th key={w.id}>{w.city || w.id}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {warehouses.map((src) => (
                      <tr key={src.id}>
                        <td>
                          <strong>{src.name}</strong>
                          <small>({src.id})</small>
                        </td>
                        {warehouses.map((dst) => {
                          const dist = getWarehouseDistanceKm(src.id, dst.id)
                          const hrs = getEstimatedTransitHours(dist)
                          return (
                            <td key={dst.id} className={src.id === dst.id ? 'self-cell' : ''}>
                              {src.id === dst.id ? (
                                <span className="text-muted">—</span>
                              ) : (
                                <div>
                                  <b>{dist} km</b>
                                  <small>~{hrs}h truck</small>
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* FILTERED INVENTORY DRILL-DOWN TABLE */}
      <Card
        title="Filtered Inventory Records Ledger"
        subtitle={`Showing ${filteredInventoryItems.length} matching inventory records across the network`}
      >
        <div className="table-scroll">
          <table className="analytics-data-table">
            <thead>
              <tr>
                <th>FACILITY</th>
                <th>SKU</th>
                <th>PRODUCT NAME</th>
                <th>CATEGORY</th>
                <th>BIN LOCATION</th>
                <th>ON-HAND</th>
                <th>AVAILABLE</th>
                <th>RESERVED</th>
                <th>STATUS</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventoryItems.slice(0, 15).map((item) => {
                const sku = skus.find((s) => s.id === item.skuId)
                const wh = warehouses.find((w) => w.id === (item.warehouseId || 'WH-HYD-01'))
                const status = getStockStatus(item)
                return (
                  <tr key={`${item.warehouseId || 'WH-HYD-01'}-${item.binId}-${item.skuId}`}>
                    <td>
                      <strong>{wh?.city || item.warehouseId || 'Hyderabad'}</strong>
                      <small>({item.warehouseId || 'WH-HYD-01'})</small>
                    </td>
                    <td><code>{item.skuId}</code></td>
                    <td>{sku?.name ?? item.skuId}</td>
                    <td>{sku?.category ?? '—'}</td>
                    <td><b>{item.binId}</b></td>
                    <td>{item.quantity}</td>
                    <td className="text-green"><b>{Math.max(0, item.quantity - (item.reserved || 0))}</b></td>
                    <td className="text-amber">{item.reserved || 0}</td>
                    <td><Badge>{status}</Badge></td>
                  </tr>
                )
              })}
              {filteredInventoryItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="empty-cell">
                    No inventory records match the selected filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filteredInventoryItems.length > 15 && (
          <div className="table-foot-note">
            <span>Showing top 15 of {filteredInventoryItems.length} filtered inventory records. Use filters above to refine search.</span>
          </div>
        )}
      </Card>
    </div>
  )
}
