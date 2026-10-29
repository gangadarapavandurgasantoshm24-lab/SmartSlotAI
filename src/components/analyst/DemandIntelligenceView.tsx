import { useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Compass,
  Flame,
  Info,
  MapPin,
  Package,
  Route,
  Search,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Truck,
  X,
} from 'lucide-react'
import type { FC } from 'react'
import { DEMO_SALES_DISCLAIMER } from '../../data/demandHistoryData'
import { useAppStore } from '../../store/useAppStore'
import type { DemandWindowDays } from '../../types'
import { Badge, Button, Card, PageHeader } from '../ui'

export const DemandIntelligenceView: FC = () => {
  const getDemandIntelligence = useAppStore((state) => state.getDemandIntelligence)
  const selectedWarehouseId = useAppStore((state) => state.selectedWarehouseId)
  const setSelectedWarehouseId = useAppStore((state) => state.setSelectedWarehouseId)
  const warehouses = useAppStore((state) => state.warehouses)
  const getNetworkRebalancingRecommendations = useAppStore((state) => state.getNetworkRebalancingRecommendations)
  const approveSlottingRecommendation = useAppStore((state) => state.approveSlottingRecommendation)
  const approveRebalancingRecommendation = useAppStore((state) => state.approveRebalancingRecommendation)
  const dismissRecommendation = useAppStore((state) => state.dismissRecommendation)

  // View state
  const [subTab, setSubTab] = useState<'ranking' | 'peaks' | 'recommendations' | 'methodology'>('ranking')
  const [recScope, setRecScope] = useState<'local' | 'network'>('local')
  const [windowDays, setWindowDays] = useState<DemandWindowDays>(30)
  const [searchQuery, setSearchQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [zoneFilter, setZoneFilter] = useState('All')
  const [riskFilter, setRiskFilter] = useState('All')

  // Notification toast
  const [toast, setToast] = useState<{ text: string; ok: boolean } | null>(null)
  function showToast(text: string, ok: boolean) {
    setToast({ text, ok })
    setTimeout(() => setToast(null), 6000)
  }

  // Calculate demand intelligence from current live store state
  const { profiles, peaks, recommendations } = useMemo(() => {
    return getDemandIntelligence(windowDays, undefined, selectedWarehouseId)
  }, [getDemandIntelligence, windowDays, selectedWarehouseId])

  const networkRecommendations = useMemo(() => {
    return getNetworkRebalancingRecommendations()
  }, [getNetworkRebalancingRecommendations])

  function handleApproveSlotting(recId: string) {
    const res = approveSlottingRecommendation(recId)
    showToast(res.message, res.ok)
  }

  function handleApproveRebalancing(recId: string) {
    const res = approveRebalancingRecommendation(recId)
    showToast(res.message, res.ok)
  }

  function handleDismiss(recId: string) {
    dismissRecommendation(recId)
    showToast('Recommendation dismissed.', true)
  }

  // Extract unique categories for filter
  const allCategories = useMemo(() => {
    return ['All', ...Array.from(new Set(profiles.map((p) => p.category).filter(Boolean)))]
  }, [profiles])

  const allZones = ['All', 'Zone A', 'Zone B', 'Zone C', 'Zone D']
  const allRisks = ['All', 'Critical Stockout', 'Critical Reorder Risk', 'High Risk', 'Medium Risk', 'Healthy']

  // Filter profiles based on user selections
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const q = searchQuery.toLowerCase().trim()
      const matchesSearch =
        !q ||
        p.skuId.toLowerCase().includes(q) ||
        p.skuName.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.currentBinId.toLowerCase().includes(q)

      const matchesCategory = categoryFilter === 'All' || p.category === categoryFilter
      const matchesZone = zoneFilter === 'All' || p.currentZone === zoneFilter
      const matchesRisk = riskFilter === 'All' || p.reorderRisk === riskFilter

      return matchesSearch && matchesCategory && matchesZone && matchesRisk
    })
  }, [profiles, searchQuery, categoryFilter, zoneFilter, riskFilter])

  // Aggregate KPI metrics
  const totalDailyVelocity = useMemo(() => {
    return Math.round(profiles.reduce((sum, p) => sum + p.dailyVelocity30d, 0) * 10) / 10
  }, [profiles])

  const classACount = useMemo(() => {
    return profiles.filter((p) => p.paretoClass === 'A').length
  }, [profiles])

  const classAVolumePct = useMemo(() => {
    const classAUnits = profiles
      .filter((p) => p.paretoClass === 'A')
      .reduce((sum, p) => sum + p.totalSold30d, 0)
    const totalUnits = profiles.reduce((sum, p) => sum + p.totalSold30d, 0)
    return totalUnits > 0 ? Math.round((classAUnits / totalUnits) * 100) : 0
  }, [profiles])

  const stockoutAlertsCount = useMemo(() => {
    return profiles.filter((p) => p.reorderRisk.includes('Critical') || p.reorderRisk === 'High Risk').length
  }, [profiles])

  const reslotOpportunitiesCount = recommendations.length

  return (
    <div className="demand-intelligence-root">
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

      {/* Header and Disclaimer */}
      <PageHeader
        title="Sales-Demand Intelligence & Pareto Velocity Analysis"
        description="Identify fast-moving products, forecast stockout risks, analyze peak-order patterns, and recommend optimal storage allocations."
        action={
          <div className="telemetry-online-badge">
            <Sparkles size={13} />
            <span>Demand Engine: <strong>Active & Calibrated</strong></span>
          </div>
        }
      />

      {/* Disclaimer Notice */}
      <div className="demand-disclaimer-banner">
        <Info size={16} />
        <div>
          <strong>Deterministic Sales & Fulfillment Velocity Model</strong>
          <p>{DEMO_SALES_DISCLAIMER}</p>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="metric-grid four">
        <div className="metric">
          <div className="metric-icon blue">
            <TrendingUp size={16} />
          </div>
          <div className="metric-label">Warehouse Demand Velocity</div>
          <div className="metric-value">{totalDailyVelocity.toLocaleString()} <small>units/day</small></div>
          <div className="metric-note">Aggregate sales & completed picks</div>
        </div>

        <div className="metric">
          <div className="metric-icon green">
            <Flame size={16} />
          </div>
          <div className="metric-label">Pareto Class A (Fast Movers)</div>
          <div className="metric-value">{classACount} SKUs <small>({classAVolumePct}%)</small></div>
          <div className="metric-note">80% of aggregate fulfillment volume</div>
        </div>

        <div className="metric">
          <div className="metric-icon amber">
            <AlertTriangle size={16} />
          </div>
          <div className="metric-label">Stockout / Reorder Risks</div>
          <div className="metric-value">{stockoutAlertsCount}</div>
          <div className="metric-note">Projected stockout within lead time</div>
        </div>

        <div className="metric">
          <div className="metric-icon navy">
            <Compass size={16} />
          </div>
          <div className="metric-label">Golden Zone Opportunities</div>
          <div className="metric-value">{reslotOpportunitiesCount}</div>
          <div className="metric-note">Class A items slotted in high racks</div>
        </div>
      </div>

      {/* Subnav Navigation */}
      <div className="inventory-nav-tabs">
        <button
          className={`inv-tab-btn ${subTab === 'ranking' ? 'active' : ''}`}
          onClick={() => setSubTab('ranking')}
        >
          <Package size={15} />
          <span>Pareto SKU Velocity & Stockout Forecast</span>
          <span className="tab-pill-count">{filteredProfiles.length}</span>
        </button>

        <button
          className={`inv-tab-btn ${subTab === 'peaks' ? 'active' : ''}`}
          onClick={() => setSubTab('peaks')}
        >
          <Clock size={15} />
          <span>Peak Demand & Hourly / Day Distribution</span>
          {peaks.detectedSpikes.length > 0 && (
            <span className="tab-pill-alert">{peaks.detectedSpikes.length} Spikes</span>
          )}
        </button>

        <button
          className={`inv-tab-btn ${subTab === 'recommendations' ? 'active' : ''}`}
          onClick={() => setSubTab('recommendations')}
        >
          <Route size={15} />
          <span>Demand-Aware Storage Rebalancing</span>
          {recommendations.length > 0 && (
            <span className="tab-pill-count">{recommendations.length}</span>
          )}
        </button>

        <button
          className={`inv-tab-btn ${subTab === 'methodology' ? 'active' : ''}`}
          onClick={() => setSubTab('methodology')}
        >
          <Info size={15} />
          <span>Methodology & Assumptions</span>
        </button>
      </div>

      {/* TAB 1: PARETO SKU VELOCITY & STOCKOUT FORECAST */}
      {subTab === 'ranking' && (
        <Card
          title="Product Velocity Ranking & Coverage Forecast"
          subtitle="Pareto classification (80/15/5), daily fulfillment velocity, reserved-aware available stock, and projected stockout dates"
        >
          {/* Filter Toolbar */}
          <div className="inv-filter-toolbar">
            <div className="inv-search-box">
              <Search size={14} />
              <input
                type="text"
                placeholder="Search SKU code, name, category, or bin..."
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
                <span>TIME WINDOW</span>
                <select
                  value={windowDays}
                  onChange={(e) => setWindowDays(Number(e.target.value) as DemandWindowDays)}
                >
                  <option value={7}>Last 7 Days</option>
                  <option value={30}>Last 30 Days</option>
                  <option value={90}>Last 90 Days</option>
                </select>
              </label>

              <label>
                <span>CATEGORY</span>
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                  {allCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>LOCATION ZONE</span>
                <select value={zoneFilter} onChange={(e) => setZoneFilter(e.target.value)}>
                  {allZones.map((z) => (
                    <option key={z} value={z}>{z}</option>
                  ))}
                </select>
              </label>

              <label>
                <span>REORDER RISK</span>
                <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
                  {allRisks.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* Table */}
          {filteredProfiles.length === 0 ? (
            <div className="inv-empty-state">
              <Package size={28} />
              <strong>No products match current filters</strong>
              <p>Try clearing your search query or selecting a broader category/zone filter.</p>
            </div>
          ) : (
            <div className="table-scroll">
              <table className="inv-master-table">
                <thead>
                  <tr>
                    <th>RANK</th>
                    <th>SKU / PRODUCT NAME</th>
                    <th>CATEGORY</th>
                    <th>LOCATION</th>
                    <th>ON HAND (AVAIL)</th>
                    <th>7D VELOCITY</th>
                    <th>{windowDays}D VELOCITY</th>
                    <th>TREND</th>
                    <th>STOCK COVERAGE</th>
                    <th>EST. STOCKOUT</th>
                    <th>PARETO CLASS</th>
                    <th>REORDER RISK</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProfiles.map((p, idx) => {
                    const isCritical = p.reorderRisk.includes('Critical')
                    const isHigh = p.reorderRisk === 'High Risk'

                    return (
                      <tr
                        key={p.skuId}
                        className={isCritical ? 'row-critical-risk' : isHigh ? 'row-warning' : ''}
                      >
                        <td>
                          <span className="rank-badge">#{idx + 1}</span>
                        </td>
                        <td className="td-product">
                          <strong>{p.skuId}</strong>
                          <span className="td-subtext">{p.skuName}</span>
                        </td>
                        <td>
                          <span className="category-pill">{p.category}</span>
                        </td>
                        <td>
                          <strong className="bin-code">{p.currentBinId}</strong>
                          <span className="td-subtext">
                            {p.currentZone} · L{p.currentLevel} {p.isGoldenZone ? '★ Golden' : ''}
                          </span>
                        </td>
                        <td>
                          <strong>{p.onHand} <small>{p.unit}</small></strong>
                          <span className="td-subtext">
                            {p.availableStock} pickable ({p.reserved} held)
                          </span>
                        </td>
                        <td>
                          <strong>{p.dailyVelocity7d} <small>u/day</small></strong>
                          <span className="td-subtext">{p.totalSold7d} units</span>
                        </td>
                        <td>
                          <strong>{p.dailyVelocity30d} <small>u/day</small></strong>
                          <span className="td-subtext">{p.totalSold30d} units</span>
                        </td>
                        <td>
                          <span className={`trend-pill ${p.trend}`}>
                            {p.trend === 'growing' && <TrendingUp size={12} />}
                            {p.trend === 'declining' && <TrendingDown size={12} />}
                            {p.velocityGrowthPct > 0 ? `+${p.velocityGrowthPct}%` : `${p.velocityGrowthPct}%`}
                          </span>
                        </td>
                        <td>
                          <strong>
                            {isFinite(p.daysOfStockRemaining)
                              ? `${p.daysOfStockRemaining} days`
                              : '> 90 days (Stable)'}
                          </strong>
                          <span className="td-subtext">
                            {p.dailyVelocity30d > 0
                              ? `@ ${p.dailyVelocity30d} u/day burn rate`
                              : '0 burn rate observed'}
                          </span>
                        </td>
                        <td>
                          {p.stockoutDate ? (
                            <span className={isCritical ? 'text-red font-bold' : ''}>
                              {p.stockoutDate}
                            </span>
                          ) : (
                            <span className="td-subtext">No risk</span>
                          )}
                        </td>
                        <td>
                          <Badge
                            tone={
                              p.paretoClass === 'A'
                                ? 'green'
                                : p.paretoClass === 'B'
                                ? 'blue'
                                : 'amber'
                            }
                          >
                            Class {p.paretoClass} ({p.cumulativeVolumePct}%)
                          </Badge>
                        </td>
                        <td>
                          <span className={`risk-tag ${p.reorderRisk.toLowerCase().replace(/\s+/g, '-')}`}>
                            {p.reorderRisk}
                          </span>
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

      {/* TAB 2: PEAK DEMAND & HOURLY / DAY DISTRIBUTION */}
      {subTab === 'peaks' && (
        <div className="peaks-dashboard-layout">
          {/* Summary Strip */}
          <div className="metric-grid four">
            <div className="metric">
              <div className="metric-icon blue"><Clock size={16} /></div>
              <div className="metric-label">Observed Peak Fulfillment Hour</div>
              <div className="metric-value">{peaks.peakHourLabel}</div>
              <div className="metric-note">{peaks.peakHourUnits.toLocaleString()} units concentrated</div>
            </div>

            <div className="metric">
              <div className="metric-icon green"><Calendar size={16} /></div>
              <div className="metric-label">Observed Peak Fulfillment Day</div>
              <div className="metric-value">{peaks.peakDayName}</div>
              <div className="metric-note">{peaks.peakDayUnits.toLocaleString()} units concentrated</div>
            </div>

            <div className="metric">
              <div className="metric-icon amber"><Flame size={16} /></div>
              <div className="metric-label">Active Demand Spikes</div>
              <div className="metric-value">{peaks.detectedSpikes.length} SKUs</div>
              <div className="metric-note">&gt; +30% acceleration vs 30D baseline</div>
            </div>

            <div className="metric">
              <div className="metric-icon navy"><CheckCircle2 size={16} /></div>
              <div className="metric-label">Observation Depth</div>
              <div className="metric-value">{peaks.observationCount} <small>events</small></div>
              <div className="metric-note">Across {peaks.observationDays} distinct calendar days</div>
            </div>
          </div>

          {!peaks.hasSufficientObservations && (
            <div className="demand-disclaimer-banner warning">
              <AlertCircle size={16} />
              <div>
                <strong>Insufficient Observation Sample Size</strong>
                <p>{peaks.dataDisclaimer}</p>
              </div>
            </div>
          )}

          {/* Spikes Callout */}
          {peaks.detectedSpikes.length > 0 && (
            <Card
              title="Demand Spikes & Velocity Accelerations"
              subtitle="Products experiencing sharp order volume increases requiring safety stock attention"
            >
              <div className="spikes-list-grid">
                {peaks.detectedSpikes.map((spike) => (
                  <div key={spike.skuId} className="spike-card">
                    <div className="spike-header">
                      <strong>{spike.skuId} · {spike.skuName}</strong>
                      <span className="spike-badge">+{spike.spikePct}% surge</span>
                    </div>
                    <p className="spike-reason">{spike.reason}</p>
                    <div className="spike-stats">
                      <span>7-Day Velocity: <b>{spike.velocity7d} u/day</b></span>
                      <span>30-Day Velocity: <b>{spike.velocity30d} u/day</b></span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Hourly and Day-of-Week Charts Grid */}
          <div className="dashboard-grid">
            <Card
              title="Hourly Demand Concentration (24h Distribution)"
              subtitle="Fulfillment order lines and picked units grouped by UTC hour of day"
            >
              <div className="demand-bar-chart-container">
                <div className="chart-bars-row">
                  {peaks.hourlyDistribution.map((h) => {
                    const maxVal = Math.max(1, peaks.peakHourUnits)
                    const heightPct = Math.min(100, Math.round((h.totalUnits / maxVal) * 100))

                    return (
                      <div key={h.hour} className="chart-bar-col" title={`${h.label}: ${h.totalUnits} units (${h.orderCount} orders)`}>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${h.isPeak ? 'peak' : ''}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="bar-label">{h.hour % 3 === 0 ? h.hour : ''}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="chart-axis-label">Hour of Day (00:00 to 23:00 UTC)</div>
              </div>
            </Card>

            <Card
              title="Day-of-Week Demand Distribution"
              subtitle="Aggregated pick and sales volume from Sunday through Saturday"
            >
              <div className="demand-bar-chart-container">
                <div className="chart-bars-row days-row">
                  {peaks.dailyDistribution.map((d) => {
                    const maxVal = Math.max(1, peaks.peakDayUnits)
                    const heightPct = Math.min(100, Math.round((d.totalUnits / maxVal) * 100))

                    return (
                      <div key={d.dayOfWeek} className="chart-bar-col day-col" title={`${d.dayName}: ${d.totalUnits} units (${d.orderCount} orders)`}>
                        <span className="bar-top-value">{d.totalUnits}</span>
                        <div className="bar-track">
                          <div
                            className={`bar-fill ${d.isPeak ? 'peak' : ''}`}
                            style={{ height: `${heightPct}%` }}
                          />
                        </div>
                        <span className="bar-label day">{d.dayName}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="chart-axis-label">Day of Week</div>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* TAB 3: DEMAND-AWARE STORAGE REBALANCING & INVENTORY RESLOTTING */}
      {subTab === 'recommendations' && (
        <Card
          title="Demand-Aware Storage Slotting & Inventory Rebalancing Center"
          subtitle="Pareto Class A fast-movers relocated to Golden Zone picking racks, and inter-facility stock transfers to avert regional stockouts"
          action={
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Building2 size={14} style={{ color: '#00e5ff' }} />
              <select
                value={selectedWarehouseId}
                onChange={(e) => setSelectedWarehouseId(e.target.value)}
                className="warehouse-switcher-select"
                aria-label="Filter recommendations by warehouse facility"
                style={{
                  background: '#0e1823',
                  color: '#dbeafe',
                  border: '1px solid #1e3a5f',
                  borderRadius: '6px',
                  padding: '5px 10px',
                  fontSize: '12px',
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
        >
          {/* Scope Selector: Local Slotting vs Network Rebalancing */}
          <div className="reslot-scope-toggle">
            <button
              type="button"
              className={`scope-pill-btn ${recScope === 'local' ? 'active' : ''}`}
              onClick={() => setRecScope('local')}
            >
              <Building2 size={14} />
              <span>Intra-Warehouse Golden Zone Slotting</span>
              <Badge tone={recommendations.length > 0 ? 'green' : 'neutral'}>
                {recommendations.length}
              </Badge>
            </button>
            <button
              type="button"
              className={`scope-pill-btn ${recScope === 'network' ? 'active' : ''}`}
              onClick={() => setRecScope('network')}
            >
              <Truck size={14} />
              <span>Inter-Warehouse Network Rebalancing</span>
              <Badge tone={networkRecommendations.length > 0 ? 'blue' : 'neutral'}>
                {networkRecommendations.length}
              </Badge>
            </button>
          </div>

          <div className="demand-disclaimer-banner info" style={{ margin: '10px 14px 6px' }}>
            <Info size={15} />
            <div>
              <strong>Operational Non-Destructive Guard</strong>
              <p>
                Generating or previewing recommendations never modifies inventory or allocations. Approving a local move stages an explicit transfer task with reserved stock; approving an inter-warehouse move stages an approved freight transfer. Physical stock counts update only upon verified picker execution or destination dock receipt.
              </p>
            </div>
          </div>

          {/* SCOPE 1: LOCAL STORAGE SLOTTING */}
          {recScope === 'local' && (
            <>
              {recommendations.length === 0 ? (
                <div className="inv-empty-state">
                  <CheckCircle2 size={32} className="text-green" />
                  <strong>All Fast-Moving SKUs Are Optimally Slotted in {selectedWarehouseId}!</strong>
                  <p>
                    Every Pareto Class A fast-moving product in {selectedWarehouseId} is currently stored in an accessible Golden Zone rack (Levels 1–2 in Zone A or B). No urgent re-slotting required.
                  </p>
                </div>
              ) : (
                <div className="recommendations-container">
                  <div className="rec-summary-banner">
                    <Compass size={16} />
                    <span>
                      <strong>{recommendations.length} High-Impact Slotting Improvements in {selectedWarehouseId}:</strong> Staging these relocations will save an estimated{' '}
                      <b>
                        {Math.round(recommendations.reduce((s, r) => s + r.weeklyKmSaved, 0) * 10) / 10} km
                      </b>{' '}
                      of picker traversal each week while eliminating ladder climbing for fast-moving items.
                    </span>
                  </div>

                  <div className="recommendations-grid">
                    {recommendations.map((rec) => (
                      <div key={rec.id} className="recommendation-card">
                        <div className="rec-header">
                          <div className="rec-sku-title">
                            <Badge tone="green">Class {rec.paretoClass}</Badge>
                            <strong>{rec.skuId} · {rec.skuName}</strong>
                            <span className="td-subtext">{rec.category} · {rec.dailyVelocity} units/day</span>
                          </div>
                          <div className="rec-savings-badge">
                            <span>Save</span>
                            <strong>{rec.distanceSavedMeters}m</strong>
                            <small>per pick</small>
                          </div>
                        </div>

                        {/* Path & Movement Visualization */}
                        <div className="reslot-movement-box">
                          <div className="reslot-loc source">
                            <span className="loc-label">CURRENT LOCATION (NON-OPTIMAL)</span>
                            <strong className="loc-rack">Rack {rec.currentBinId}</strong>
                            <span className="loc-box">
                              {rec.currentZone} · Tier Level {rec.currentLevel}
                            </span>
                            <span className="loc-distance">{rec.currentDistanceMeters}m from Depot</span>
                          </div>

                          <div className="reslot-arrow">
                            <ArrowRight size={20} />
                            <small>Move to Golden Zone</small>
                          </div>

                          <div className="reslot-loc target">
                            <span className="loc-label">RECOMMENDED GOLDEN ZONE BIN</span>
                            <strong className="loc-rack highlight-target">Rack {rec.recommendedBinId}</strong>
                            <span className="loc-box">
                              {rec.recommendedZone} · Tier Level {rec.recommendedLevel} (Ergonomic)
                            </span>
                            <span className="loc-distance text-teal">{rec.recommendedDistanceMeters}m from Depot</span>
                          </div>
                        </div>

                        {/* Rationale explanation */}
                        <p className="rec-rationale">{rec.reason}</p>

                        {/* Physical constraints verification */}
                        <div className="rec-checks-strip">
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Unit Capacity Verified
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Bin Weight Rating OK
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Handling Match OK
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> No SKU Mixing
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Active Pick Reservations Safe
                          </span>
                        </div>

                        {/* Action Bar */}
                        <div className="rec-action-bar">
                          <div className="rec-impact-stat">
                            <span>Projected Impact:</span>{' '}
                            <strong>~{rec.weeklyKmSaved} km saved / week</strong> ·{' '}
                            <small>~{rec.estimatedSecondsSavedPerPick}s faster per pick</small>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button
                              variant="primary"
                              onClick={() => handleApproveSlotting(rec.id)}
                              title="Stage physical inventory move in warehouse relocation transfer workflow"
                            >
                              <Check size={14} />
                              <span>Approve & Stage Relocation</span>
                            </Button>
                            <Button
                              variant="quiet"
                              onClick={() => handleDismiss(rec.id)}
                              title="Dismiss this recommendation"
                            >
                              <X size={14} />
                              <span>Dismiss</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* SCOPE 2: NETWORK REBALANCING TRANSFERS */}
          {recScope === 'network' && (
            <>
              {networkRecommendations.length === 0 ? (
                <div className="inv-empty-state">
                  <CheckCircle2 size={32} className="text-green" />
                  <strong>Network Inventory Balanced!</strong>
                  <p>
                    No severe regional stockout deficits or excess single-site stock accumulations detected across active network facilities.
                  </p>
                </div>
              ) : (
                <div className="recommendations-container">
                  <div className="rec-summary-banner" style={{ borderLeftColor: '#3b82f6' }}>
                    <Truck size={16} />
                    <span>
                      <strong>{networkRecommendations.length} Inter-Warehouse Rebalance Opportunities Identified:</strong> Transferring surplus stock from well-supplied distribution hubs to deficit regional facilities averts stockouts and improves fulfillment coverage.
                    </span>
                  </div>

                  <div className="recommendations-grid">
                    {networkRecommendations.map((rec) => (
                      <div key={rec.id} className="recommendation-card" style={{ borderLeftColor: '#3b82f6' }}>
                        <div className="rec-header">
                          <div className="rec-sku-title">
                            <Badge tone="blue">Inter-Facility Rebalance</Badge>
                            <strong>{rec.skuId} · {rec.skuName}</strong>
                            <span className="td-subtext">Suggested Freight Transfer: <strong>{rec.suggestedQuantity} units</strong></span>
                          </div>
                          <div className="rec-savings-badge" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1e40af' }}>
                            <span>Transfer</span>
                            <strong>{rec.suggestedQuantity}u</strong>
                            <small>rebalance</small>
                          </div>
                        </div>

                        {/* Origin -> Destination Box */}
                        <div className="reslot-movement-box">
                          <div className="reslot-loc source">
                            <span className="loc-label">SURPLUS SOURCE WAREHOUSE</span>
                            <strong className="loc-rack">{rec.sourceWarehouseName}</strong>
                            <span className="loc-box">
                              {rec.sourceWarehouseId} · Rack {rec.sourceBinId || 'Primary Bay'}
                            </span>
                            <span className="loc-distance text-green font-bold">
                              {rec.sourceAvailable} units available (~{rec.sourceCoverageDays}d coverage)
                            </span>
                          </div>

                          <div className="reslot-arrow">
                            <Truck size={20} />
                            <small>{rec.distanceKm} km transit</small>
                          </div>

                          <div className="reslot-loc target">
                            <span className="loc-label">DEFICIT TARGET WAREHOUSE</span>
                            <strong className="loc-rack highlight-target">{rec.destinationWarehouseName}</strong>
                            <span className="loc-box">
                              {rec.destinationWarehouseId} · Rack {rec.destinationBinId || 'Assigned Bay'}
                            </span>
                            <span className="loc-distance text-red font-bold">
                              {rec.destinationAvailable} units available (~{rec.destinationCoverageDays}d coverage)
                            </span>
                          </div>
                        </div>

                        {/* Rationale & Expected Benefit */}
                        <p className="rec-rationale">{rec.reason}</p>
                        {rec.expectedBenefit && (
                          <div className="rec-benefit-pill">
                            <Sparkles size={13} />
                            <span>{rec.expectedBenefit}</span>
                          </div>
                        )}

                        {/* Constraints checklist */}
                        <div className="rec-checks-strip">
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Source Stock Sufficient ({rec.sourceAvailable} &ge; {rec.suggestedQuantity})
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Active Pick Reservations Safe
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Freight Route Validated ({rec.distanceKm} km · ~{rec.estimatedTransitHours || Math.round(rec.distanceKm / 50 + 1)} hrs)
                          </span>
                          <span className="check-pill ok">
                            <CheckCircle2 size={12} /> Multi-Facility Boundary Enforced
                          </span>
                        </div>

                        {/* Action Bar */}
                        <div className="rec-action-bar">
                          <div className="rec-impact-stat">
                            <span className="network-transit-badge">
                              <MapPin size={11} /> {rec.distanceKm} km illustrative road distance
                            </span>
                          </div>

                          <div style={{ display: 'flex', gap: '8px' }}>
                            <Button
                              variant="primary"
                              onClick={() => handleApproveRebalancing(rec.id)}
                              title="Create approved inter-warehouse transfer task in network dispatch"
                            >
                              <Truck size={14} />
                              <span>Approve Inter-Warehouse Transfer</span>
                            </Button>
                            <Button
                              variant="quiet"
                              onClick={() => handleDismiss(rec.id)}
                              title="Dismiss this recommendation"
                            >
                              <X size={14} />
                              <span>Dismiss</span>
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      )}

      {/* TAB 4: METHODOLOGY & ASSUMPTIONS */}
      {subTab === 'methodology' && (
        <Card title="Sales-Demand Analytics Methodology & Model Assumptions" subtitle="Transparent documentation of calculations, constraints, and forecasting limits">
          <div className="methodology-content">
            <div className="methodology-section">
              <h4>1. Demand Event Filtering (Sales vs. Operations Invariant)</h4>
              <p>
                To avoid artificial demand distortion, the intelligence engine strictly distinguishes fulfillment demand from internal movements:
              </p>
              <ul>
                <li><strong>Included:</strong> Customer sale order events and confirmed warehouse pick movements (Alex Morgan confirmations).</li>
                <li><strong>Strictly Excluded:</strong> Supplier dock goods receipts (<code>receive</code>), internal bin transfers (<code>relocate</code>, <code>transfer</code>), and stock count adjustments (<code>adjust</code>). Stock receipts increase inventory but do not represent sales velocity.</li>
              </ul>
            </div>

            <div className="methodology-section">
              <h4>2. Pareto (ABC) Cumulative Velocity Classification</h4>
              <p>
                Products are ranked in descending order by aggregate demand volume over the selected window. Classification thresholds follow the standard supply-chain Pareto principle:
              </p>
              <ul>
                <li><strong>Class A (Fast Movers):</strong> The top products that cumulatively account for up to <strong>80% of aggregate fulfillment units</strong>. These items should be slotted in the Golden Zone (Levels 1–2 in Zones A/B) closest to packing stations.</li>
                <li><strong>Class B (Medium Movers):</strong> The next tier of products accounting for up to <strong>95% of cumulative volume</strong>. Typically slotted in middle aisles or tier Level 2.</li>
                <li><strong>Class C (Slow Movers):</strong> The remaining items accounting for the bottom <strong>5% of volume</strong> (or items with zero demand). Slotted in upper rack tiers (Level 3) or deeper zones (Zone C/D).</li>
              </ul>
            </div>

            <div className="methodology-section">
              <h4>3. Stockout Date & Coverage Assumptions</h4>
              <p>
                Stockout projections are computed strictly as:
              </p>
              <code>Days of Stock Remaining = (On-Hand Quantity - Reserved Units) ÷ 30-Day Daily Velocity</code>
              <ul>
                <li><strong>Reservation Awareness:</strong> Units held for active pick orders or pending relocation transfers are subtracted from available stock.</li>
                <li><strong>Zero-Demand Edge Case:</strong> SKUs with zero demand over the window return <code>Infinity</code> days remaining and <code>null</code> stockout date without throwing errors.</li>
                <li><strong>Lead Time Buffer:</strong> Default supplier replenishment lead time is modeled as 3 business days. If projected stockout days &le; lead time, the item is flagged as <code>Critical Reorder Risk</code>.</li>
              </ul>
            </div>

            <div className="methodology-section">
              <h4>4. Demand-Aware Travel Distance Calculation</h4>
              <p>
                Depot travel distance is calculated via warehouse grid coordinates:
              </p>
              <code>Distance (m) = 12 + ((Aisle - 1) × 8) + ((Bay - 1) × 3) + ((Level - 1) × 3.5)</code>
              <p>
                Moving a Class A product from an upper level in Zone C to Level 1 in Zone A saves an estimated 14 to 28 meters per pick stop. Recommendations are strictly advisory and do not mutate stock until approved via the transfer task workflow.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  )
}
