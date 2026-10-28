import { useState } from 'react'
import { ArrowRight, Boxes, CheckCircle2, ChevronRight, Compass, RefreshCw, Send, Sparkles } from 'lucide-react'
import type { FC } from 'react'
import { useAppStore } from '../../store/useAppStore'
import { Badge, Button, Card } from '../ui'

interface CandidatePair {
  id: string
  title: string
  category: string
  skuA: { id: string; name: string; currentBin: string; currentBoxId: string; targetBin: string; targetBoxId: string }
  skuB: { id: string; name: string; currentBin: string; currentBoxId: string; targetBin: string; targetBoxId: string }
  initialDistanceMeters: number
  targetDistanceMeters: number
  predictedSalesLiftPercent: number
  predictedMonthlyRevenue: number
  confidenceScore: number
  pickerTimeSavedSeconds: number
  support: number
  confidence: number
  lift: number
  rationale: string
}

const candidatePairs: CandidatePair[] = [
  {
    id: 'PAIR-1',
    title: 'AuraGlow Smart Luminary & Nordic Duvet Cover Queen',
    category: 'Home & Bedding Cross-Selling',
    skuA: {
      id: 'SKU-2084',
      name: 'AuraGlow Smart Luminary',
      currentBin: 'C-06-02',
      currentBoxId: 'BOX-C0602-L2F',
      targetBin: 'A-01-01',
      targetBoxId: 'BOX-A0101-L1F',
    },
    skuB: {
      id: 'SKU-1102',
      name: 'Nordic Duvet Cover Queen',
      currentBin: 'A-01-02',
      currentBoxId: 'BOX-A0102-L1F',
      targetBin: 'A-01-02',
      targetBoxId: 'BOX-A0102-L1F',
    },
    initialDistanceMeters: 28.5,
    targetDistanceMeters: 1.2,
    predictedSalesLiftPercent: 24.8,
    predictedMonthlyRevenue: 18450,
    confidenceScore: 94.6,
    pickerTimeSavedSeconds: 32,
    support: 0.048,
    confidence: 0.724,
    lift: 3.42,
    rationale: 'Market basket mining shows 72.4% confidence that customers buying smart ambient lamps also order luxury bedding within 48 hours. Storing them in adjacent front-pick bins A-01-01 and A-01-02 cuts order travel by 27.3m and yields +24.8% sales lift on checkout bundle offers.',
  },
  {
    id: 'PAIR-2',
    title: 'HyperDrive USB-C Hub & LogiType Wireless Mechanical Keyboard',
    category: 'Computers & Peripherals',
    skuA: {
      id: 'SKU-0914',
      name: 'HyperDrive USB-C Hub 8-in-1',
      currentBin: 'B-04-03',
      currentBoxId: 'BOX-B0403-L3F',
      targetBin: 'B-02-01',
      targetBoxId: 'BOX-B0201-L1F',
    },
    skuB: {
      id: 'SKU-3120',
      name: 'LogiType Wireless Mechanical Keyboard',
      currentBin: 'B-02-02',
      currentBoxId: 'BOX-B0202-L1F',
      targetBin: 'B-02-02',
      targetBoxId: 'BOX-B0202-L1F',
    },
    initialDistanceMeters: 18.2,
    targetDistanceMeters: 0.9,
    predictedSalesLiftPercent: 31.2,
    predictedMonthlyRevenue: 24600,
    confidenceScore: 97.1,
    pickerTimeSavedSeconds: 26,
    support: 0.062,
    confidence: 0.819,
    lift: 3.84,
    rationale: 'Extremely high association rule affinity. Co-locating both items on Bay B-02 Level 1 creates a natural desktop bundle consolidation station, reducing picker cart backtracking.',
  },
  {
    id: 'PAIR-3',
    title: 'Winter Thermal Fleece Jacket & Thermos Vacuum Food Flask',
    category: 'Winter Weather & Outdoor',
    skuA: {
      id: 'SKU-4412',
      name: 'Cold Weather Thermal Fleece Jacket',
      currentBin: 'D-08-01',
      currentBoxId: 'BOX-D0801-L1F',
      targetBin: 'C-01-01',
      targetBoxId: 'BOX-C0101-L1F',
    },
    skuB: {
      id: 'SKU-5890',
      name: 'Thermos Vacuum Food Flask 750ml',
      currentBin: 'C-01-02',
      currentBoxId: 'BOX-C0102-L1F',
      targetBin: 'C-01-02',
      targetBoxId: 'BOX-C0102-L1F',
    },
    initialDistanceMeters: 34.0,
    targetDistanceMeters: 1.0,
    predictedSalesLiftPercent: 38.5,
    predictedMonthlyRevenue: 31200,
    confidenceScore: 96.3,
    pickerTimeSavedSeconds: 44,
    support: 0.055,
    confidence: 0.788,
    lift: 4.15,
    rationale: 'Seasonal temperature drop in southern states drives rapid co-purchasing of cold-weather apparel and insulated food containers. Placing them together in Front Zone C speeds high-priority multi-line packing.',
  },
  {
    id: 'PAIR-4',
    title: 'Espresso Ceramic Mug Set & Stainless Pour-Over Dripper',
    category: 'Kitchen & Gourmet Coffee',
    skuA: {
      id: 'SKU-5100',
      name: 'Espresso Artisan Ceramic Mug Set (4pc)',
      currentBin: 'A-05-03',
      currentBoxId: 'BOX-A0503-L3F',
      targetBin: 'A-03-01',
      targetBoxId: 'BOX-A0301-L1F',
    },
    skuB: {
      id: 'SKU-1080',
      name: 'Stainless Steel Pour-Over Coffee Dripper',
      currentBin: 'A-03-02',
      currentBoxId: 'BOX-A0302-L1F',
      targetBin: 'A-03-02',
      targetBoxId: 'BOX-A0302-L1F',
    },
    initialDistanceMeters: 22.4,
    targetDistanceMeters: 1.1,
    predictedSalesLiftPercent: 19.7,
    predictedMonthlyRevenue: 12800,
    confidenceScore: 92.4,
    pickerTimeSavedSeconds: 21,
    support: 0.039,
    confidence: 0.684,
    lift: 2.95,
    rationale: 'Complementary kitchen artisan products. Relocating mug sets from Level 3 to Ground Level 1 adjacent to drippers prevents fragile handling risks and accelerates order fulfillment.',
  },
]

export const CoPlacementSalesLift: FC = () => {
  const [selectedPairIndex, setSelectedPairIndex] = useState(0)
  const [spacingSlider, setSpacingSlider] = useState(1.2)
  const [discountBoost, setDiscountBoost] = useState(10)
  const [dispatchSuccessMsg, setDispatchSuccessMsg] = useState('')

  const coPlacementOrders = useAppStore((state) => state.coPlacementOrders)
  const proposeCoPlacementOrder = useAppStore((state) => state.proposeCoPlacementOrder)

  const activePair = candidatePairs[selectedPairIndex]

  // Dynamic formula calculation based on user spacing & discount tuning
  const distanceDelta = activePair.initialDistanceMeters - spacingSlider
  const distanceFactor = Math.max(0.1, distanceDelta / activePair.initialDistanceMeters)
  const adjustedSalesLift = Number((activePair.predictedSalesLiftPercent * (0.8 + distanceFactor * 0.4) * (1 + discountBoost * 0.015)).toFixed(1))
  const adjustedRevenue = Math.round(activePair.predictedMonthlyRevenue * (adjustedSalesLift / activePair.predictedSalesLiftPercent))

  const isAlreadyDispatched = coPlacementOrders.some(
    (order) => order.skuA.id === activePair.skuA.id && order.skuB.id === activePair.skuB.id && order.status !== 'Completed by Picker'
  )

  function handleDispatchToManager() {
    proposeCoPlacementOrder({
      title: activePair.title,
      category: activePair.category,
      skuA: activePair.skuA,
      skuB: activePair.skuB,
      initialDistanceMeters: activePair.initialDistanceMeters,
      targetDistanceMeters: spacingSlider,
      predictedSalesLiftPercent: adjustedSalesLift,
      predictedMonthlyRevenue: adjustedRevenue,
      confidenceScore: activePair.confidenceScore,
      pickerTimeSavedSeconds: activePair.pickerTimeSavedSeconds,
      rationale: activePair.rationale,
    })
    setDispatchSuccessMsg(`Work order sent to Warehouse Manager! Jordan Mitchell (:5175) will review spacing and assign Order Picker Alex Morgan (:5173).`)
    setTimeout(() => setDispatchSuccessMsg(''), 6000)
  }

  return (
    <div className="co-placement-container">
      {/* Top Banner */}
      <div className="co-placement-hero">
        <div className="co-hero-icon">
          <Sparkles size={28} />
        </div>
        <div className="co-hero-text">
          <h2>Product Co-Placement Sales Lift & Spacing Optimizer</h2>
          <p>
            Predict cross-selling revenue increase when frequently co-purchased products are slotted into adjacent rack boxes.
            Closed-loop dispatch connects <strong>Data Analyst (:5176)</strong> &rarr; <strong>Warehouse Manager (:5175)</strong> &rarr; <strong>Order Picker (:5173)</strong>.
          </p>
        </div>
        <div className="co-hero-badge">
          <Badge tone="purple">Apriori + Spacing Graph v3.1</Badge>
        </div>
      </div>

      {dispatchSuccessMsg && (
        <div className="co-dispatch-toast">
          <CheckCircle2 size={18} />
          <span>{dispatchSuccessMsg}</span>
        </div>
      )}

      {/* Main Grid */}
      <div className="co-grid">
        {/* Left Column: Pair Selector & Spacing Simulator */}
        <div className="co-left-col">
          <Card className="co-pair-selector-card">
            <h3 className="section-title">
              <Boxes size={18} />
              <span>High-Affinity Product Pairs Identified by ML</span>
            </h3>
            <p className="section-desc">Select a candidate SKU pair to analyze spatial distance vs. predicted sales lift:</p>

            <div className="pairs-list">
              {candidatePairs.map((pair, idx) => (
                <button
                  key={pair.id}
                  className={`pair-card-btn ${selectedPairIndex === idx ? 'selected' : ''}`}
                  onClick={() => setSelectedPairIndex(idx)}
                >
                  <div className="pair-card-header">
                    <span className="pair-cat">{pair.category}</span>
                    <span className="pair-lift">+{pair.predictedSalesLiftPercent}% Lift</span>
                  </div>
                  <div className="pair-skus-row">
                    <span className="sku-tag">{pair.skuA.name}</span>
                    <span className="pair-amp">&amp;</span>
                    <span className="sku-tag">{pair.skuB.name}</span>
                  </div>
                  <div className="pair-meta-footer">
                    <span>Spacing: <strong>{pair.initialDistanceMeters}m &rarr; {pair.targetDistanceMeters}m</strong></span>
                    <span>Confidence: <strong>{pair.confidenceScore}%</strong></span>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* Interactive Spacing & Bundle Tuning */}
          <Card className="spacing-tuning-card">
            <h3 className="section-title">
              <Compass size={18} />
              <span>Spacing &amp; Commercial Bundle Parameter Tuning</span>
            </h3>

            <div className="slider-control-group">
              <div className="slider-header">
                <label>Target Box-to-Box Spacing:</label>
                <span className="slider-value"><strong>{spacingSlider.toFixed(1)} meters</strong> (Adjacent Pick Face)</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="10.0"
                step="0.1"
                value={spacingSlider}
                onChange={(e) => setSpacingSlider(parseFloat(e.target.value))}
                className="custom-range-slider"
              />
              <div className="slider-ticks">
                <span>0.5m (Same Bin)</span>
                <span>3.0m (Same Bay)</span>
                <span>6.0m (Same Aisle)</span>
                <span>10.0m (Cross-Aisle)</span>
              </div>
            </div>

            <div className="slider-control-group" style={{ marginTop: '1.25rem' }}>
              <div className="slider-header">
                <label>Co-Purchase Checkout Promotion Boost:</label>
                <span className="slider-value"><strong>+{discountBoost}%</strong> Bundle Incentive</span>
              </div>
              <input
                type="range"
                min="0"
                max="25"
                step="1"
                value={discountBoost}
                onChange={(e) => setDiscountBoost(parseInt(e.target.value, 10))}
                className="custom-range-slider"
              />
              <div className="slider-ticks">
                <span>0% (Organic)</span>
                <span>10% (Recommended)</span>
                <span>25% (Aggressive Promotion)</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column: Spacing Analysis & Predictive Lift Engine */}
        <div className="co-right-col">
          <Card className="prediction-results-card">
            <div className="pred-header">
              <div>
                <span className="pred-tag">PREDICTIVE CROSS-SELLING MODEL</span>
                <h3 className="pred-title">{activePair.title}</h3>
              </div>
              <div className="pred-confidence">
                <span>ML Confidence</span>
                <strong>{activePair.confidenceScore}%</strong>
              </div>
            </div>

            {/* Visual Spacing Diagram */}
            <div className="spatial-comparison-box">
              <div className="spatial-state before">
                <div className="spatial-label">
                  <span className="status-badge red">CURRENT AS-IS SPACING</span>
                  <span className="meters-badge">{activePair.initialDistanceMeters}m APART</span>
                </div>
                <div className="spatial-racks">
                  <div className="rack-node">
                    <span className="node-box">{activePair.skuA.currentBoxId}</span>
                    <span className="node-bin">{activePair.skuA.currentBin}</span>
                    <span className="node-item">{activePair.skuA.name}</span>
                  </div>
                  <div className="distance-line separated">
                    <span>{activePair.initialDistanceMeters}m separation</span>
                  </div>
                  <div className="rack-node">
                    <span className="node-box">{activePair.skuB.currentBoxId}</span>
                    <span className="node-bin">{activePair.skuB.currentBin}</span>
                    <span className="node-item">{activePair.skuB.name}</span>
                  </div>
                </div>
                <small className="spatial-note">Excessive travel between Aisle C and Aisle A causes picking delays and limits natural order bundling.</small>
              </div>

              <div className="spatial-arrow">
                <ArrowRight size={24} />
              </div>

              <div className="spatial-state after">
                <div className="spatial-label">
                  <span className="status-badge green">RECOMMENDED ADJACENT CO-PLACEMENT</span>
                  <span className="meters-badge green">{spacingSlider.toFixed(1)}m ADJACENT</span>
                </div>
                <div className="spatial-racks">
                  <div className="rack-node target">
                    <span className="node-box">{activePair.skuA.targetBoxId}</span>
                    <span className="node-bin">{activePair.skuA.targetBin}</span>
                    <span className="node-item">{activePair.skuA.name}</span>
                  </div>
                  <div className="distance-line adjacent">
                    <span>{spacingSlider.toFixed(1)}m pick-face</span>
                  </div>
                  <div className="rack-node target">
                    <span className="node-box">{activePair.skuB.targetBoxId}</span>
                    <span className="node-bin">{activePair.skuB.targetBin}</span>
                    <span className="node-item">{activePair.skuB.name}</span>
                  </div>
                </div>
                <small className="spatial-note green-note">Items stored side-by-side in Bay A-01 Level 1. Pickers consolidate both items in one step.</small>
              </div>
            </div>

            {/* Impact Metric Cards */}
            <div className="pred-kpis-grid">
              <div className="kpi-block green">
                <span className="kpi-label">Predicted Sales Lift</span>
                <span className="kpi-value">+{adjustedSalesLift}%</span>
                <small>Driven by adjacent cart bundling</small>
              </div>
              <div className="kpi-block purple">
                <span className="kpi-label">Monthly Gross Revenue Gain</span>
                <span className="kpi-value">+R$ {adjustedRevenue.toLocaleString()}</span>
                <small>Calculated on Brazilian order velocity</small>
              </div>
              <div className="kpi-block blue">
                <span className="kpi-label">Picker Route Travel Saved</span>
                <span className="kpi-value">-{activePair.pickerTimeSavedSeconds}s</span>
                <small>Per multi-line pick order</small>
              </div>
              <div className="kpi-block orange">
                <span className="kpi-label">Market Basket Lift Ratio</span>
                <span className="kpi-value">{activePair.lift.toFixed(2)}x</span>
                <small>Confidence { (activePair.confidence * 100).toFixed(1) }%</small>
              </div>
            </div>

            {/* Model Rationale */}
            <div className="pred-rationale">
              <strong>Optimization Rationale:</strong>
              <p>{activePair.rationale}</p>
            </div>

            {/* Action Bar */}
            <div className="pred-action-bar">
              <div className="workflow-sequence">
                <span>Workflow Path:</span>
                <span className="seq-step active">1. Analyst (:5176)</span>
                <ChevronRight size={14} />
                <span className="seq-step">2. Manager (:5175)</span>
                <ChevronRight size={14} />
                <span className="seq-step">3. Picker (:5173)</span>
              </div>

              <Button
                variant="primary"
                onClick={handleDispatchToManager}
                disabled={isAlreadyDispatched}
              >
                <Send size={15} />
                <span>
                  {isAlreadyDispatched
                    ? 'Work Order Already Dispatched'
                    : 'Dispatch Co-Placement Recommendation to Warehouse Manager'}
                </span>
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Closed-Loop Status Tracker */}
      <Card className="co-orders-tracker-card" style={{ marginTop: '1.5rem' }}>
        <div className="tracker-header">
          <h3 className="section-title">
            <RefreshCw size={18} />
            <span>Closed-Loop Co-Placement Work Orders Status Across Workspaces</span>
          </h3>
          <Badge tone="blue">{coPlacementOrders.length} Work Orders Active</Badge>
        </div>

        <div className="co-orders-table-wrapper">
          <table className="co-orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Product Pair</th>
                <th>Source &rarr; Target Rack &amp; Box</th>
                <th>Predicted Sales Lift</th>
                <th>Revenue Gain</th>
                <th>Status</th>
                <th>Assigned Role / Action</th>
              </tr>
            </thead>
            <tbody>
              {coPlacementOrders.map((ord) => {
                const isCompleted = ord.status === 'Completed by Picker'
                const isAssigned = ord.status === 'Assigned to Picker'
                const isManager = ord.status === 'Approved by Manager'
                const isProposed = ord.status === 'Proposed by Analyst'

                return (
                  <tr key={ord.id}>
                    <td>
                      <code className="order-id-code">{ord.id}</code>
                    </td>
                    <td>
                      <div className="table-pair-info">
                        <strong>{ord.title}</strong>
                        <small>{ord.skuA.name} + {ord.skuB.name}</small>
                      </div>
                    </td>
                    <td>
                      <div className="table-reloc-info">
                        <span>From: <code>{ord.skuA.currentBin}</code> ({ord.skuA.currentBoxId})</span>
                        <ArrowRight size={12} className="inline-arrow" />
                        <span>To: <strong className="highlight-rack">{ord.skuA.targetBin}</strong> ({ord.skuA.targetBoxId})</span>
                      </div>
                    </td>
                    <td>
                      <strong className="text-green">+{ord.predictedSalesLiftPercent}%</strong>
                    </td>
                    <td>
                      <span>+R$ {ord.predictedMonthlyRevenue.toLocaleString()}</span>
                    </td>
                    <td>
                      <span className={`status-pill ${
                        isCompleted ? 'pill-completed' :
                        isAssigned ? 'pill-assigned' :
                        isManager ? 'pill-approved' : 'pill-proposed'
                      }`}>
                        {ord.status}
                      </span>
                    </td>
                    <td>
                      {isProposed && (
                        <span className="role-note text-amber">Awaiting Manager Jordan Mitchell (:5175) review</span>
                      )}
                      {isAssigned && (
                        <span className="role-note text-blue">Active on Order Picker Alex Morgan (:5173) terminal</span>
                      )}
                      {isCompleted && (
                        <span className="role-note text-green">
                          <CheckCircle2 size={13} className="inline-check" />
                          Verified slotted &amp; live sales lift active
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
