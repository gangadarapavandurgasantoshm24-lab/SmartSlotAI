import { useState } from 'react'
import { AlertTriangle, CheckCircle2, CloudRain, CloudSnow, CreditCard, DollarSign, Flame, MapPin, PackagePlus, ShieldAlert, ShoppingBag, Star, Sun, TrendingUp } from 'lucide-react'
import type { FC } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Badge, Button, Card } from '../ui'

interface RegionalInsight {
  stateCode: string
  stateName: string
  totalOrders: number
  percentShare: number
  topCategory: string
  topSku: string
  skuName: string
  currentStock: number
  monthlyRunRate: number
  recommendedReorderQty: number
  stockoutRisk: 'Critical' | 'Medium' | 'Low'
  growthRate: string
}

const regionalData: RegionalInsight[] = [
  {
    stateCode: 'SP',
    stateName: 'São Paulo (Southeast Metro)',
    totalOrders: 41746,
    percentShare: 42.1,
    topCategory: 'Computers & Peripherals',
    topSku: 'SKU-0914',
    skuName: 'HyperDrive USB-C Hub 8-in-1',
    currentStock: 34,
    monthlyRunRate: 190,
    recommendedReorderQty: 250,
    stockoutRisk: 'Critical',
    growthRate: '+18.4%',
  },
  {
    stateCode: 'RJ',
    stateName: 'Rio de Janeiro (Coastal)',
    totalOrders: 12852,
    percentShare: 13.0,
    topCategory: 'Home & Bedding Decor',
    topSku: 'SKU-2084',
    skuName: 'AuraGlow Smart Luminary',
    currentStock: 52,
    monthlyRunRate: 110,
    recommendedReorderQty: 120,
    stockoutRisk: 'Medium',
    growthRate: '+12.6%',
  },
  {
    stateCode: 'MG',
    stateName: 'Minas Gerais (Central)',
    totalOrders: 11635,
    percentShare: 11.7,
    topCategory: 'Kitchen & Gourmet Coffee',
    topSku: 'SKU-5100',
    skuName: 'Espresso Artisan Ceramic Mug Set',
    currentStock: 28,
    monthlyRunRate: 85,
    recommendedReorderQty: 100,
    stockoutRisk: 'Critical',
    growthRate: '+14.2%',
  },
  {
    stateCode: 'RS',
    stateName: 'Rio Grande do Sul (Southern)',
    totalOrders: 5466,
    percentShare: 5.5,
    topCategory: 'Winter Apparel & Thermal Goods',
    topSku: 'SKU-4412',
    skuName: 'Cold Weather Thermal Fleece Jacket',
    currentStock: 18,
    monthlyRunRate: 145,
    recommendedReorderQty: 220,
    stockoutRisk: 'Critical',
    growthRate: '+46.8%',
  },
  {
    stateCode: 'PR',
    stateName: 'Paraná (Southern DC Hub)',
    totalOrders: 5045,
    percentShare: 5.1,
    topCategory: 'Warm Bedding & Quilts',
    topSku: 'SKU-1102',
    skuName: 'Nordic Duvet Cover Queen',
    currentStock: 40,
    monthlyRunRate: 98,
    recommendedReorderQty: 140,
    stockoutRisk: 'Medium',
    growthRate: '+28.5%',
  },
]

type SeasonId = 'winter' | 'summer' | 'rain' | 'black-friday'

interface SeasonalScenario {
  id: SeasonId
  name: string
  icon: typeof CloudSnow
  color: string
  triggerCondition: string
  affectedRegions: string
  surgeMultiplier: string
  highlightedItems: { sku: string; name: string; currentDemand: number; forecastDemand: number; suggestedPO: number; supplier: string; bin: string }[]
  advisoryNote: string
}

const seasonalScenarios: SeasonalScenario[] = [
  {
    id: 'winter',
    name: 'Winter Logistics Surge (Cold Front)',
    icon: CloudSnow,
    color: '#38bdf8',
    triggerCondition: 'Subtropical polar mass moving across RS, SC, PR, and southern SP.',
    affectedRegions: 'RS (Porto Alegre), PR (Curitiba), SP South Corridor',
    surgeMultiplier: '+142% Volume Spike',
    highlightedItems: [
      {
        sku: 'SKU-4412',
        name: 'Cold Weather Thermal Fleece Jacket',
        currentDemand: 145,
        forecastDemand: 350,
        suggestedPO: 220,
        supplier: 'Nordic Apparel Co.',
        bin: 'D-08-01',
      },
      {
        sku: 'SKU-1102',
        name: 'Nordic Duvet Cover Queen (Thermal Fill)',
        currentDemand: 98,
        forecastDemand: 225,
        suggestedPO: 150,
        supplier: 'Nordic Weave Supply',
        bin: 'A-01-02',
      },
      {
        sku: 'SKU-5890',
        name: 'Thermos Vacuum Food & Soup Flask 750ml',
        currentDemand: 65,
        forecastDemand: 160,
        suggestedPO: 110,
        supplier: 'Apex Logistics Supply',
        bin: 'C-01-02',
      },
    ],
    advisoryNote: 'Winter incoming! High customer conversion for thermal jackets, insulated food containers, and heavy duvets. Urgent stock replenishment required before sub-zero temperatures hit Southern DCs. Move SKUs to Golden Zone Level 1.',
  },
  {
    id: 'summer',
    name: 'Summer Heatwave & Outdoor Vacation',
    icon: Sun,
    color: '#fbbf24',
    triggerCondition: 'Coastal summer heatwave across RJ, BA, and SP Coast (>34°C).',
    affectedRegions: 'RJ (Rio Metro), SP Coast, Salvador',
    surgeMultiplier: '+95% Volume Spike',
    highlightedItems: [
      {
        sku: 'SKU-2084',
        name: 'AuraGlow Smart Luminary (Patio Edition)',
        currentDemand: 110,
        forecastDemand: 215,
        suggestedPO: 130,
        supplier: 'Pacific Imports Co.',
        bin: 'C-06-02',
      },
      {
        sku: 'SKU-7701',
        name: 'Solar Powered Garden Pathway Lanterns (4pk)',
        currentDemand: 75,
        forecastDemand: 170,
        suggestedPO: 120,
        supplier: 'Pacific Imports Co.',
        bin: 'B-01-02',
      },
    ],
    advisoryNote: 'Outdoor lighting and patio decor demand surging. Accelerate inbound delivery from Pacific Imports.',
  },
  {
    id: 'rain',
    name: 'Monsoon Heavy Rainfall Alert',
    icon: CloudRain,
    color: '#818cf8',
    triggerCondition: 'Atlantic moisture corridor causing persistent torrential rain.',
    affectedRegions: 'Serra do Mar, Santos Logistics Port, SP Ring Road',
    surgeMultiplier: '+40% Delay / Water Resistance Need',
    highlightedItems: [
      {
        sku: 'SKU-0914',
        name: 'HyperDrive USB-C Hub (Waterproof Sealed Pack)',
        currentDemand: 190,
        forecastDemand: 240,
        suggestedPO: 80,
        supplier: 'Apex Logistics Supply',
        bin: 'B-04-03',
      },
    ],
    advisoryNote: 'High humidity and delivery transit splash risk. Require suppliers to apply double shrink-wrap and elevate bottom floor storage by +15cm.',
  },
  {
    id: 'black-friday',
    name: 'Q4 Black Friday & Cyber Week Peak',
    icon: Flame,
    color: '#f43f5e',
    triggerCondition: 'Annual nationwide promotional peak week.',
    affectedRegions: 'Nationwide (All 27 Brazilian States)',
    surgeMultiplier: '+280% Peak Velocity',
    highlightedItems: [
      {
        sku: 'SKU-3120',
        name: 'LogiType Wireless Mechanical Keyboard',
        currentDemand: 140,
        forecastDemand: 420,
        suggestedPO: 300,
        supplier: 'Apex Logistics Supply',
        bin: 'B-02-02',
      },
      {
        sku: 'SKU-0914',
        name: 'HyperDrive USB-C Hub 8-in-1',
        currentDemand: 190,
        forecastDemand: 550,
        suggestedPO: 380,
        supplier: 'Apex Logistics Supply',
        bin: 'B-04-03',
      },
    ],
    advisoryNote: 'Pre-order buffer stock 45 days in advance. Warehouse capacity utilization will surpass 94%.',
  },
]

export const RegionalDemandForecaster: FC = () => {
  const [activeSeason, setActiveSeason] = useState<SeasonId>('winter')
  const [poDispatchSuccess, setPoDispatchSuccess] = useState('')
  const createReplenishmentRequest = useAppStore((state) => state.createReplenishmentRequest)

  const currentScenario = seasonalScenarios.find((s) => s.id === activeSeason) || seasonalScenarios[0]

  function handleDispatchSeasonalPO(item: typeof currentScenario.highlightedItems[0]) {
    const res = createReplenishmentRequest({
      skuId: item.sku,
      binId: item.bin,
      quantity: item.suggestedPO,
      supplier: item.supplier,
      expectedDate: new Date(Date.now() + 86400000 * 3).toISOString().slice(0, 10),
      note: `Seasonal Weather Surge PO: ${currentScenario.name}. Order quantity boosted +${item.suggestedPO} units for regional fulfillment.`,
    })

    if (res.ok) {
      setPoDispatchSuccess(`Seasonal PO dispatched to Supplier Hub (:5174)! Ordered ${item.suggestedPO} units of ${item.name} from ${item.supplier}.`)
      setTimeout(() => setPoDispatchSuccess(''), 7000)
    }
  }

  return (
    <div className="regional-forecaster-container">
      {/* Top Banner */}
      <div className="regional-hero">
        <div className="regional-hero-icon">
          <TrendingUp size={28} />
        </div>
        <div className="regional-hero-text">
          <h2>Regional Demand, Customer Sentiment &amp; Seasonal Surge Forecaster</h2>
          <p>
            Real-time geospatial intelligence derived from 100,000+ Brazilian customer orders, return patterns, review ratings,
            minimum customer bills, and dynamic seasonal weather alerts.
          </p>
        </div>
        <div className="regional-hero-badge">
          <Badge tone="green">Brazilian E-Commerce Live Model</Badge>
        </div>
      </div>

      {poDispatchSuccess && (
        <div className="co-dispatch-toast">
          <CheckCircle2 size={18} />
          <span>{poDispatchSuccess}</span>
        </div>
      )}

      {/* Customer Financials & Review Statistics Top Row */}
      <div className="financials-kpis-grid">
        <Card className="fin-kpi-card">
          <div className="fin-kpi-header">
            <span className="fin-kpi-title">Average Order Value (AOV)</span>
            <DollarSign size={18} className="text-purple" />
          </div>
          <div className="fin-kpi-val">R$ 154.20</div>
          <small className="fin-kpi-sub">Median cart spend: R$ 89.90</small>
        </Card>

        <Card className="fin-kpi-card">
          <div className="fin-kpi-header">
            <span className="fin-kpi-title">Minimum Customer Bill</span>
            <ShoppingBag size={18} className="text-blue" />
          </div>
          <div className="fin-kpi-val">R$ 12.99</div>
          <small className="fin-kpi-sub">Highest single bill: R$ 6,729.00</small>
        </Card>

        <Card className="fin-kpi-card">
          <div className="fin-kpi-header">
            <span className="fin-kpi-title">Average Customer Review</span>
            <Star size={18} className="text-amber" />
          </div>
          <div className="fin-kpi-val">4.15 / 5.0 ★</div>
          <small className="fin-kpi-sub">Based on 99,224 verified reviews</small>
        </Card>

        <Card className="fin-kpi-card">
          <div className="fin-kpi-header">
            <span className="fin-kpi-title">Return &amp; Refund Rate</span>
            <ShieldAlert size={18} className="text-red" />
          </div>
          <div className="fin-kpi-val">1.38%</div>
          <small className="fin-kpi-sub">1,372 returns across 99.4k shipments</small>
        </Card>
      </div>

      {/* Seasonal & Weather Surge Module (Requested by user: e.g. "Winter is coming, order more jackets warm food") */}
      <Card className="seasonal-module-card">
        <div className="seasonal-card-header">
          <div>
            <div className="weather-pill">
              <CloudSnow size={16} />
              <span>DYNAMIC SEASONAL &amp; WEATHER EVENT FORECASTER</span>
            </div>
            <h3 className="seasonal-title">Weather-Triggered Demand Prediction &amp; Pre-emptive Replenishment</h3>
            <p className="seasonal-subtitle">
              When climate patterns shift (e.g., incoming winter cold front or summer beach rush), the AI projects sudden localized consumption surges and advises immediate order quantity increases.
            </p>
          </div>

          <div className="season-selector-tabs">
            {seasonalScenarios.map((scen) => {
              const Icon = scen.icon
              return (
                <button
                  key={scen.id}
                  className={`season-tab-btn ${activeSeason === scen.id ? 'active' : ''}`}
                  onClick={() => setActiveSeason(scen.id)}
                >
                  <Icon size={16} />
                  <span>{scen.name.split(' ')[0]}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Active Scenario Banner */}
        <div className="scenario-active-banner" style={{ borderLeftColor: currentScenario.color }}>
          <div className="scenario-meta">
            <div className="scenario-name-row">
              <h4>{currentScenario.name}</h4>
              <Badge tone="purple">{currentScenario.surgeMultiplier}</Badge>
            </div>
            <p className="scenario-trigger">
              <strong>Weather Trigger:</strong> {currentScenario.triggerCondition}
            </p>
            <p className="scenario-affected">
              <strong>Impacted Corridors:</strong> {currentScenario.affectedRegions}
            </p>
            <div className="scenario-advisory">
              <AlertTriangle size={16} />
              <span>{currentScenario.advisoryNote}</span>
            </div>
          </div>
        </div>

        {/* Seasonal Action Table */}
        <div className="seasonal-table-wrapper">
          <table className="seasonal-table">
            <thead>
              <tr>
                <th>Item &amp; Category</th>
                <th>Target Storage Bin</th>
                <th>Normal Monthly Demand</th>
                <th>Surge Projected Demand</th>
                <th>Recommended PO Boost</th>
                <th>Supplier</th>
                <th>Instant Dispatch Action</th>
              </tr>
            </thead>
            <tbody>
              {currentScenario.highlightedItems.map((item) => (
                <tr key={item.sku}>
                  <td>
                    <strong>{item.name}</strong>
                    <div><code>{item.sku}</code></div>
                  </td>
                  <td>
                    <span className="rack-badge">{item.bin}</span>
                  </td>
                  <td>{item.currentDemand} units</td>
                  <td>
                    <strong className="text-purple">{item.forecastDemand} units/mo</strong>
                  </td>
                  <td>
                    <span className="po-boost-tag">+{item.suggestedPO} units</span>
                  </td>
                  <td>{item.supplier}</td>
                  <td>
                    <Button
                      variant="primary"
                      onClick={() => handleDispatchSeasonalPO(item)}
                    >
                      <PackagePlus size={14} />
                      <span>Order to Supplier (:5174)</span>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Regional Sales Analysis & Location-Based Order Adjuster */}
      <div className="regional-lower-grid">
        <Card className="regional-table-card">
          <div className="card-heading-row">
            <h3 className="section-title">
              <MapPin size={18} />
              <span>Location-Based Sales Volume &amp; SKU Reorder Quantity Advisor</span>
            </h3>
            <Badge tone="blue">Top 5 Brazilian States</Badge>
          </div>
          <p className="section-desc">
            Analyzes which items sell more by state geography and calculates if warehouse order quantity should be increased to avert stockout:
          </p>

          <div className="table-responsive">
            <table className="regional-table">
              <thead>
                <tr>
                  <th>State</th>
                  <th>Share</th>
                  <th>Top Velocity SKU</th>
                  <th>Current Stock</th>
                  <th>Run Rate</th>
                  <th>Suggested Order Qty</th>
                  <th>Stockout Risk</th>
                </tr>
              </thead>
              <tbody>
                {regionalData.map((reg) => (
                  <tr key={reg.stateCode}>
                    <td>
                      <div className="state-name-cell">
                        <strong className="state-code-pill">{reg.stateCode}</strong>
                        <span>{reg.stateName}</span>
                      </div>
                    </td>
                    <td>{reg.percentShare}%</td>
                    <td>
                      <div><strong>{reg.skuName}</strong></div>
                      <small><code>{reg.topSku}</code> &middot; {reg.topCategory}</small>
                    </td>
                    <td>
                      <span className={reg.currentStock < 30 ? 'text-red font-bold' : ''}>
                        {reg.currentStock} units
                      </span>
                    </td>
                    <td>{reg.monthlyRunRate}/mo ({reg.growthRate})</td>
                    <td>
                      <strong className="text-green">+{reg.recommendedReorderQty} units</strong>
                    </td>
                    <td>
                      <span className={`risk-badge risk-${reg.stockoutRisk.toLowerCase()}`}>
                        {reg.stockoutRisk}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Customer Reviews & Return Drivers */}
        <Card className="reviews-card">
          <h3 className="section-title">
            <Star size={18} />
            <span>Customer Review Ratings &amp; Return Breakdown</span>
          </h3>

          <div className="review-breakdown-section">
            <div className="star-meter-row">
              <span>5 Stars ★★★★★</span>
              <div className="meter-bar"><div className="meter-fill" style={{ width: '58%' }} /></div>
              <span>58.2%</span>
            </div>
            <div className="star-meter-row">
              <span>4 Stars ★★★★☆</span>
              <div className="meter-bar"><div className="meter-fill" style={{ width: '21%' }} /></div>
              <span>21.4%</span>
            </div>
            <div className="star-meter-row">
              <span>3 Stars ★★★☆☆</span>
              <div className="meter-bar"><div className="meter-fill" style={{ width: '9%' }} /></div>
              <span>9.1%</span>
            </div>
            <div className="star-meter-row">
              <span>2 Stars ★★☆☆☆</span>
              <div className="meter-bar"><div className="meter-fill" style={{ width: '4%' }} /></div>
              <span>3.7%</span>
            </div>
            <div className="star-meter-row">
              <span>1 Star ★☆☆☆☆</span>
              <div className="meter-bar"><div className="meter-fill red" style={{ width: '8%' }} /></div>
              <span>7.6%</span>
            </div>
          </div>

          <div className="returns-reasons-section">
            <h4 className="returns-title">Top Customer Return Drivers (1,372 returns total):</h4>
            <div className="return-reasons-grid">
              <div className="reason-item">
                <span className="reason-pct">42%</span>
                <span className="reason-label">Product Defect / Transit Damage</span>
              </div>
              <div className="reason-item">
                <span className="reason-pct">31%</span>
                <span className="reason-label">Size / Dimension Mismatch</span>
              </div>
              <div className="reason-item">
                <span className="reason-pct">18%</span>
                <span className="reason-label">Logistics Delivery Delay</span>
              </div>
              <div className="reason-item">
                <span className="reason-pct">9%</span>
                <span className="reason-label">Buyer Remorse / Cancellation</span>
              </div>
            </div>
          </div>

          {/* Payment Methods */}
          <div className="payments-section">
            <h4 className="returns-title">Customer Payment Methods:</h4>
            <div className="payment-tags-list">
              <span className="pay-tag"><CreditCard size={13} /> Credit Card (76.5%)</span>
              <span className="pay-tag"><DollarSign size={13} /> Boleto Bancário (19.4%)</span>
              <span className="pay-tag">Voucher (3.8%)</span>
              <span className="pay-tag">Debit (0.3%)</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
