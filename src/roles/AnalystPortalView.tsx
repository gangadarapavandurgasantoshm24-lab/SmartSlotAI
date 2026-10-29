import { useState } from 'react'
import { Activity, BarChart3, Boxes, Building2, CheckCircle2, Compass, Database, Layers, MapPin, Server, Sparkles, TrendingUp, Truck, Warehouse } from 'lucide-react'
import type { FC } from 'react'
import { RoleSwitcherBar } from '../components/RoleSwitcherBar'
import { WarehouseScene } from '../components/digital-twin/WarehouseScene'
import { BrazilianEdaDashboard } from '../components/analyst/BrazilianEdaDashboard'
import { MongoAuditMonitor } from '../components/analyst/MongoAuditMonitor'
import { CoPlacementSalesLift } from '../components/analyst/CoPlacementSalesLift'
import { RegionalDemandForecaster } from '../components/analyst/RegionalDemandForecaster'
import { DemandIntelligenceView } from '../components/analyst/DemandIntelligenceView'
import { MultiWarehouseNetworkView } from '../components/warehouse/MultiWarehouseNetworkView'
import { MultiWarehouseAnalyticsView } from '../components/analytics/MultiWarehouseAnalyticsView'
import { ScreenContent } from '../screens/Screens'
import { useAppStore } from '../store/useAppStore'
import { Badge, Card, Metric, PageHeader } from '../components/ui'

export const AnalystPortalView: FC = () => {
  const [activeTab, setActiveTab] = useState<'demand-intelligence' | 'network' | 'co-placement' | 'regional-demand' | 'brazilian-eda' | 'mongo-audit' | 'live-kpis' | 'studio' | 'analytics' | '3d-heatmap'>('demand-intelligence')
  const bins = useAppStore((state) => state.bins)
  const inventory = useAppStore((state) => state.inventory)
  const metrics = useAppStore((state) => state.analystMetrics)
  const movements = useAppStore((state) => state.movements)
  const alerts = useAppStore((state) => state.liveAlerts)
  const [selectedBinId, setSelectedBinId] = useState('A-01-01')

  return (
    <div className="character-app-root analyst-theme">
      <RoleSwitcherBar currentRole="analyst" />
      <header className="character-header analyst-header">
        <div className="char-brand">
          <span className="char-badge analyst">
            <Boxes size={18} />
          </span>
          <div>
            <h1>SmartSlot <span>ANALYST STUDIO</span></h1>
            <small>Warehouse Intelligence & Demand Forecasting · Brazilian E-Commerce Fulfillment DC</small>
          </div>
        </div>
        <div className="char-user-info">
          <div className="operator-pill analyst-pill">
            <Activity size={14} />
            <span>Workspace: <strong>Operations Intelligence</strong></span>
          </div>
          <div className="shift-pill">
            <Sparkles size={14} />
            <span>AI Layout Optimization Engine v2.4</span>
          </div>
        </div>
      </header>

      <div className="manager-subnav analyst-subnav">
        <button
          className={`manager-tab-btn ${activeTab === 'demand-intelligence' ? 'active' : ''}`}
          onClick={() => setActiveTab('demand-intelligence')}
        >
          <TrendingUp size={15} />
          <span>📈 Demand Intelligence & Pareto (Stage 3)</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'network' ? 'active' : ''}`}
          onClick={() => setActiveTab('network')}
        >
          <Building2 size={15} />
          <span>🌐 Multi-Warehouse Network (Stage 4)</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'co-placement' ? 'active' : ''}`}
          onClick={() => setActiveTab('co-placement')}
        >
          <Compass size={15} />
          <span>🎯 Co-Placement Sales Lift Model</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'regional-demand' ? 'active' : ''}`}
          onClick={() => setActiveTab('regional-demand')}
        >
          <MapPin size={15} />
          <span>🌦️ Regional Demand & Seasonal Forecaster</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'brazilian-eda' ? 'active' : ''}`}
          onClick={() => setActiveTab('brazilian-eda')}
        >
          <Database size={15} />
          <span>⚡ Brazilian E-Commerce EDA</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'mongo-audit' ? 'active' : ''}`}
          onClick={() => setActiveTab('mongo-audit')}
        >
          <Server size={15} />
          <span>MongoDB Cloud Audit Stream</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'live-kpis' ? 'active' : ''}`}
          onClick={() => setActiveTab('live-kpis')}
        >
          <TrendingUp size={15} />
          <span>Real-Time Operational Statistics</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
          onClick={() => setActiveTab('studio')}
        >
          <Boxes size={15} />
          <span>Analyst Studio & SKU Forecasts</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={15} />
          <span>Impact & Performance Analytics</span>
        </button>
        <button
          className={`manager-tab-btn ${activeTab === '3d-heatmap' ? 'active' : ''}`}
          onClick={() => setActiveTab('3d-heatmap')}
        >
          <Layers size={15} />
          <span>3D Warehouse Velocity Heatmap</span>
        </button>
      </div>

      <main className="character-main">
        {activeTab === 'demand-intelligence' && <DemandIntelligenceView />}
        {activeTab === 'network' && <MultiWarehouseNetworkView />}
        {activeTab === 'co-placement' && <CoPlacementSalesLift />}
        {activeTab === 'regional-demand' && <RegionalDemandForecaster />}
        {activeTab === 'brazilian-eda' && <BrazilianEdaDashboard />}
        {activeTab === 'mongo-audit' && <MongoAuditMonitor />}

        {activeTab === 'live-kpis' && (
          <div className="analyst-live-kpis-layout">
            <PageHeader
              title="Real-Time Operations & High-Level Statistics"
              description="Live telemetry aggregated across Manager, Supplier, and Order Picker workspaces. Statistics update dynamically as orders are confirmed and picked."
              action={
                <div className="analyst-live-sync-badge">
                  <span className="pulse-dot" />
                  <span>Telemetry Feed: <strong>Active & Streaming</strong></span>
                </div>
              }
            />

            <div className="metric-grid five-metrics">
              <Metric
                label="Orders Fulfilled"
                value={metrics.ordersFulfilled.toLocaleString()}
                note="Increments as picker confirms YES"
                tone="blue"
              />
              <Metric
                label="Units Shipped"
                value={metrics.unitsShipped.toLocaleString()}
                note="Total units picked & dispatched"
                tone="green"
              />
              <Metric
                label="Pick Accuracy"
                value={`${metrics.pickAccuracy}%`}
                note="Verified bin barcodes & box IDs"
                tone="navy"
              />
              <Metric
                label="On-Time Dispatch"
                value={`${metrics.onTimeDispatch}%`}
                note="Supplier & dock receiving SLA"
                tone="green"
              />
              <Metric
                label="Golden Zone Efficiency"
                value={`${metrics.goldenZoneEfficiency}%`}
                note="+6.3% pick path efficiency gain"
                tone="blue"
              />
            </div>

            <div className="analyst-kpis-grid">
              <Card
                title="Live Operations Audit Stream"
                subtitle="Connected lifecycle events: Manager → Supplier → Receiving → Picker → Analyst"
                action={<Badge>Live Stream</Badge>}
              >
                <div className="analyst-audit-stream">
                  {alerts.length === 0 && movements.length === 0 ? (
                    <div className="live-stock-empty">
                      Waiting for warehouse events. Create a PO or confirm a pick to see live operational logs here.
                    </div>
                  ) : (
                    alerts.map((alert) => (
                      <div key={alert.id} className={`audit-event-row source-${alert.source}`}>
                        <div className="audit-icon-col">
                          {alert.source === 'picker' && <CheckCircle2 size={16} />}
                          {alert.source === 'supplier' && <Truck size={16} />}
                          {alert.source === 'manager' && <Warehouse size={16} />}
                          {alert.source === 'analyst' && <Activity size={16} />}
                        </div>
                        <div className="audit-body-col">
                          <div className="audit-title-row">
                            <strong>{alert.title}</strong>
                            <span className="audit-time">{new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
                          </div>
                          <p>{alert.detail}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </Card>

              <Card
                title="Connected Character Workspaces Telemetry"
                subtitle="Port connections and shared state data flow"
              >
                <div className="telemetry-connections-card">
                  <div className="connection-step">
                    <span className="step-port">:5175</span>
                    <div className="step-info">
                      <strong>Warehouse Manager (Jordan Mitchell)</strong>
                      <p>Dispatches purchase orders to suppliers and pick orders to Alex Morgan.</p>
                    </div>
                  </div>
                  <div className="connection-arrow">↓ Real-time PO dispatch</div>
                  <div className="connection-step">
                    <span className="step-port">:5174</span>
                    <div className="step-info">
                      <strong>Supplier Hub (Medline & Vendors)</strong>
                      <p>Confirms availability, delivery ETA, and dispatches in-transit shipments.</p>
                    </div>
                  </div>
                  <div className="connection-arrow">↓ Dock goods receipt & pick order dispatch</div>
                  <div className="connection-step">
                    <span className="step-port">:5173</span>
                    <div className="step-info">
                      <strong>Order Picker (Alex Morgan · Cart P-07)</strong>
                      <p>Locates rack and unique box in 3D. Confirms pick by clicking YES.</p>
                    </div>
                  </div>
                  <div className="connection-arrow">↓ Stock decremented & live telemetry forwarded</div>
                  <div className="connection-step active">
                    <span className="step-port">:5176</span>
                    <div className="step-info">
                      <strong>Analyst Studio (Operations Intelligence)</strong>
                      <p>Aggregates high-level KPIs, inventory turns, and space optimization reports.</p>
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        )}

        {activeTab === 'studio' && <ScreenContent screen="analyst" />}
        {activeTab === 'analytics' && <MultiWarehouseAnalyticsView />}
        {activeTab === '3d-heatmap' && (
          <div className="analyst-3d-layout">
            <PageHeader
              title="3D Warehouse Velocity & Utilization Heatmap"
              description="Visualizing pick frequency density across Zones A through D. High-velocity items (Zone A/B) are concentrated in ergonomic golden zones for faster pick travel."
              action={
                <div className="heatmap-legend-pills">
                  <span className="legend-pill hot">● High Velocity (Class A)</span>
                  <span className="legend-pill med">● Medium (Class B)</span>
                  <span className="legend-pill cool">● Low Velocity (Class C)</span>
                </div>
              }
            />

            <Card title="Interactive 3D Digital Twin — Slot Heat Analysis" subtitle="Oakland DC · 4 Zones · Golden Zone Optimization Active">
              <div className="analyst-canvas-wrap">
                <WarehouseScene
                  bins={bins}
                  inventory={inventory}
                  selectedBinId={selectedBinId}
                  onSelect={(id) => setSelectedBinId(id)}
                  resetVersion={0}
                  zoomVersion={0}
                  focusVersion={0}
                />
              </div>
              <div className="analyst-canvas-footer">
                <div>
                  <strong>Selected Bin: {selectedBinId}</strong>
                  <span>Click any bin in the 3D scene to inspect slot velocity and demand classification.</span>
                </div>
                <div className="analyst-golden-stat">
                  <span>Golden Zone Pick Efficiency:</span> <strong>84.2% (+6.3% gained)</strong>
                </div>
              </div>
            </Card>
          </div>
        )}
      </main>

      <footer className="character-footer">
        <span>SmartSlot AI Analyst Studio · Port 5176</span>
        <span>Warehouse Intelligence Model · Oakland Distribution Center · Live Synced</span>
      </footer>
    </div>
  )
}
