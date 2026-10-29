# SmartSlot AI — 3D Smart Warehouse & Inventory Intelligence System

SmartSlot AI is an advanced 3D Smart Warehouse Digital Twin and Multi-Warehouse Inventory Intelligence application. Built with React 19, TypeScript, Vite, Zustand, and React Three Fiber, it provides end-to-end inventory CRUD, Pareto velocity analysis, multi-facility network transfers, Dijkstra/A* obstacle-avoiding warehouse navigation, 2-opt multi-stop pick route optimization, demand-aware storage slotting, intelligent replenishment with safety-stock modeling, and a unified multi-warehouse analytics dashboard.

---

## 1. System Architecture & Role Portals

SmartSlot AI models four operational roles with real-time state synchronization:

```
                      ┌─────────────────────────────────────────┐
                      │    Shared Reactive State (Zustand)      │
                      │    • Inventory Items & Bin Models       │
                      │    • Catalog SKUs & Demand Profiles     │
                      │    • Inter-Warehouse Transfers          │
                      │    • Replenishment POs & Dock Receipts  │
                      └────────────────────┬────────────────────┘
                                           │
         ┌───────────────────┬─────────────┴───────┬───────────────────┐
         ▼                   ▼                     ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌───────────────────┐ ┌─────────────────┐
│ Manager Center  │ │ Picker Terminal │ │   Supplier Hub    │ │ Analyst Studio  │
│ (Port 5175)     │ │ (Port 5173)     │ │   (Port 5174)     │ │ (Port 5176)     │
│ Full 3D Twin,   │ │ Mobile scanner, │ │ PO acceptance,    │ │ Pareto ABC,     │
│ transfers, dock │ │ 2-Opt shortest  │ │ freight dispatch, │ │ heatmaps, peak  │
│ receipts, slot  │ │ path, bin issue │ │ dock tracking,    │ │ forecasting,    │
│ approvals, KPIs │ │ reports         │ │ discrepancy audit │ │ route savings   │
└─────────────────┘ └─────────────────┘ └───────────────────┘ └─────────────────┘
```

- **Single-Port Mode (`npm run dev:single`)**: Runs all portals under a single Vite server (`http://localhost:5173`), with an interactive top `RoleSwitcherBar` allowing instant switching between Manager, Picker, Supplier, and Analyst views while preserving shared state.
- **Four-Port Multi-Role Mode (`npm run dev:all`)**: Launches four concurrent Vite development servers with Server-Sent Events (SSE) bi-directional state synchronization (`/api/events` and `/api/sync`) across ports 5173, 5174, 5175, and 5176.
- **3D Digital Twin**: Interactive WebGL warehouse canvas rendered using Three.js and React Three Fiber, supporting orbit controls, dynamic bin occupancy coloring, aisle corridor obstacle visualization, and focus-zoom targeting.

---

## 2. Core Capabilities & Mathematical Engines

### A. Inventory CRUD & Storage Constraints
- **Validation**: Enforces non-negative quantities, required identifiers, unique SKUs, and positive unit dimensions.
- **Storage Constraints**: Prevents assigning incompatible SKUs to the same bin, rejects placements exceeding unit capacity or maximum bin weight ratings ($\text{kg}$), and validates special handling requirements (`standard`, `fragile`, `oversize`, `hazardous`).
- **Safe Archival**: Blocks archiving items linked to open purchase orders, in-progress pick batches, or reserved stock allocations.

### B. Demand Intelligence & Pareto Velocity Analysis
- **Filtering**: Evaluates customer sales and completed picks exclusively; ignores internal supplier receipts, adjustments, and rebalancing movements.
- **Velocity Metrics**: Computes 7-day and 30-day velocity ($\text{units/day}$) and annualized velocity growth.
- **Pareto ABC Classification**:
  - **Class A**: Top 80% cumulative demand volume (fast-movers requiring ergonomic forward-pick locations).
  - **Class B**: Next 15% cumulative volume.
  - **Class C**: Remaining 5% slow-moving inventory.
- **Stockout Forecasting**: Reservation-aware days-of-supply coverage:
  $$\text{Coverage Days} = \frac{\text{On-Hand} - \text{Reserved}}{\text{Daily Velocity}}$$
  Determines deterministic calendar stockout dates and flags Critical Stockout / Reorder Risk when coverage falls below lead time.
- **Peak Demand Detection**: Identifies peak hour of day, peak day of week, and flags demand spikes when 7-day velocity exceeds 30-day baseline by $>30\%$.

### C. Multi-Warehouse Inventory Network
- **Topology**: Four deterministic simulated regional facilities:
  - `WH-HYD-01`: Hyderabad Central Warehouse (Primary Hub — 4 Zones, 18,400 units capacity)
  - `WH-VJA-02`: Vijayawada Distribution Center (Tier-2 Hub — 3 Zones, 12,000 units capacity)
  - `WH-CHN-03`: Chennai Regional Warehouse (Coastal DC — 4 Zones, 16,000 units capacity)
  - `WH-BLR-04`: Bengaluru Fulfillment Center (Metro Tech Hub — 3 Zones, 14,000 units capacity)
- **Global SKU Search**: Calculates real-time network stock using $\text{Available} = \text{On-Hand} - \text{Reserved}$.
- **Alternative Warehouse Discovery**: When a target warehouse is depleted, sister warehouses with available surplus are ranked by highway road transit distance ($\text{km}$) and driving duration ($@50\text{ km/h}$).
- **Transfer Workflow**: Stages transfers through `REQUESTED` $\to$ `APPROVED` $\to$ `DISPATCHED` $\to$ `IN TRANSIT` $\to$ `RECEIVED`.
- **In-Transit Isolation**: Dispatched stock is decremented from source on-hand but **never added** to destination on-hand until dock arrival.
- **Discrepancy Auditing**: Partial receipts log rejected/damaged quantities without inventory bleeding.

### D. Graph Pathfinding & 2-Opt Route Optimization
- **Orthogonal Navigation Graph**: Constructs walkable aisle nodes, cross-aisle intersections, and depot staging coordinates. Prevents horizontal rack penetration through shelves.
- **Shortest Path**: Computes paths using Dijkstra's algorithm and A* search with an admissible Euclidean distance heuristic.
- **Obstacle Avoidance**: Supports dynamically blocked aisle corridors, automatically rerouting around obstacles or flagging unreachable bins.
- **Multi-Stop TSP**: Orders order pick lines via Nearest Neighbor heuristic, followed by 2-Opt local search improvement:
  $$\text{Optimized Distance} \le \text{Nearest-Neighbor Distance}$$
  Calculates distance saved ($\text{m}$), percentage reduction ($\%$), and walking time savings ($@1.2\text{ m/s}$).

### E. Demand-Aware Storage Slotting & Rebalancing
- **Ergonomic Golden Zones**: Lower shelf tiers (Levels 1–2 in Zones A/B) minimize picker bending and stretching.
- **Slotting Recommendations**: Recommends moving Class A fast-movers from distant bays to golden zones while validating weight, cube, and SKU mixing rules.
- **Non-Destructive Invariance**: Generating and previewing recommendations never modifies physical inventory automatically. Approving a proposal stages a relocation transfer task that reserves source stock until confirmed.

### F. Intelligent Replenishment & Safety Stock
- **Shortage Scope Detection**: Distinguishes local shortages (addressable via inter-warehouse transfer from sister surplus) from network-wide shortages (triggering supplier POs).
- **Safety Stock Modeling**: Configurable safety stock days ($SS = Z \times \sigma_L$) and review cycle allowances.
- **Deduplication Invariant**: In-flight purchase orders and in-transit transfers are tracked as pipeline stock; duplicate PO creation for outstanding deficits is blocked.
- **Dock Receiving**: Idempotent receipt processing rejects damaged units and logs audit discrepancy reasons.

### G. Unified Multi-Warehouse Analytics Dashboard
- **Stock Accounting Matrix Invariant**:
  $$\text{Total Physical On-Hand} = \text{Available} + \text{Reserved}$$
  Pipeline stock (in-transit transfers and open POs) is strictly separated and never double-counted into physical inventory.
- **Granular Zone Occupancy**: Tracks bin capacity and unit density across Zones A–E with golden zone indicators.
- **Cross-Warehouse Availability**: Identifies facilities with local shortages and matches them to sister facilities with surplus.
- **Discrepancy Audit Ledger**: Aggregates carrier damages, transit losses, and dock bay rejections in a tamper-evident audit view.

---

## 3. Quick Start & Execution

### Prerequisites
- Node.js 20.19+ or 22.12+
- npm 10+

### Installation
```bash
git clone <repo-url>
cd SmartSlotAI
npm install
```

### Running the Application

1. **Single-Port Mode (Recommended for quick testing)**:
   ```bash
   npm run dev:single
   ```
   Open `http://localhost:5173`. Use the top role switcher bar to toggle between Manager, Picker, Supplier, and Analyst.

2. **Four-Port Multi-Role Mode (Simulating 4 distinct workstations)**:
   ```bash
   npm run dev:all
   ```
   Launches four synchronized role interfaces:
   - Order Picker: `http://localhost:5173`
   - Supplier Hub: `http://localhost:5174`
   - Manager Center: `http://localhost:5175`
   - Analyst Studio: `http://localhost:5176`

3. **Running the Full Test Suite**:
   ```bash
   npm test
   ```
   Executes 145 unit and integration tests across 11 test suites.

4. **Linting & Code Quality**:
   ```bash
   npm run lint
   ```
   Runs `oxlint` across all source files (0 errors, 0 warnings).

5. **Production Build**:
   ```bash
   npm run build
   ```
   Executes `tsc -b && vite build` for production distribution.

---

## 4. End-to-End Verification Workflows

The test suite validates 20 operational workflows:

| # | Verified Workflow | Test Suite / Verification File |
| :--- | :--- | :--- |
| **1** | Create, edit, inspect, archive, and restore inventory | [`tests/inventory-crud.test.mjs`](file:///D:/SmartSlotAI/tests/inventory-crud.test.mjs), [`tests/integration-audit.test.mjs`](file:///D:/SmartSlotAI/tests/integration-audit.test.mjs) |
| **2** | Enforce bin assignment, capacity, weight, and SKU mixing constraints | [`tests/inventory-crud.test.mjs`](file:///D:/SmartSlotAI/tests/inventory-crud.test.mjs) |
| **3** | Search SKUs across all 4 regional warehouses | [`tests/multi-warehouse.test.mjs`](file:///D:/SmartSlotAI/tests/multi-warehouse.test.mjs) |
| **4** | Surface sister warehouse availability and freight transit distance | [`tests/multi-warehouse.test.mjs`](file:///D:/SmartSlotAI/tests/multi-warehouse.test.mjs) |
| **5** | Reserve stock safely without allowing over-allocation | [`tests/multi-warehouse.test.mjs`](file:///D:/SmartSlotAI/tests/multi-warehouse.test.mjs) |
| **6** | Create, approve, dispatch, and receive inter-warehouse transfers | [`tests/multi-warehouse.test.mjs`](file:///D:/SmartSlotAI/tests/multi-warehouse.test.mjs) |
| **7** | Ensure in-transit stock is strictly excluded from destination on-hand | [`tests/multi-warehouse.test.mjs`](file:///D:/SmartSlotAI/tests/multi-warehouse.test.mjs), [`tests/integration-audit.test.mjs`](file:///D:/SmartSlotAI/tests/integration-audit.test.mjs) |
| **8** | Prevent duplicate and partial-receipt accounting errors | [`tests/multi-warehouse.test.mjs`](file:///D:/SmartSlotAI/tests/multi-warehouse.test.mjs) |
| **9** | Calculate velocity, ABC classification, peak demand, and stockout risk | [`tests/demand-intelligence.test.mjs`](file:///D:/SmartSlotAI/tests/demand-intelligence.test.mjs) |
| **10** | Recommend demand-aware slotting without premature stock movement | [`tests/slotting-rebalancing.test.mjs`](file:///D:/SmartSlotAI/tests/slotting-rebalancing.test.mjs) |
| **11** | Calculate Dijkstra/A* paths avoiding blocked warehouse geometry | [`tests/route-optimization.test.mjs`](file:///D:/SmartSlotAI/tests/route-optimization.test.mjs) |
| **12** | Optimize multi-stop picking via 2-opt without skipping required stops | [`tests/route-optimization.test.mjs`](file:///D:/SmartSlotAI/tests/route-optimization.test.mjs) |
| **13** | Complete local bin relocations and network rebalancing safely | [`tests/slotting-rebalancing.test.mjs`](file:///D:/SmartSlotAI/tests/slotting-rebalancing.test.mjs) |
| **14** | Generate replenishment recommendations suppressing duplicate POs | [`tests/replenishment-intelligence.test.mjs`](file:///D:/SmartSlotAI/tests/replenishment-intelligence.test.mjs) |
| **15** | Verify supplier receipts increment only the destination warehouse | [`tests/replenishment-intelligence.test.mjs`](file:///D:/SmartSlotAI/tests/replenishment-intelligence.test.mjs) |
| **16** | Ensure Manager, Picker, Supplier, and Analyst portals remain consistent | [`tests/integration-audit.test.mjs`](file:///D:/SmartSlotAI/tests/integration-audit.test.mjs) |
| **17** | Verify 3D digital twin displays only selected warehouse's bins | [`tests/integration-audit.test.mjs`](file:///D:/SmartSlotAI/tests/integration-audit.test.mjs) |
| **18** | Verify responsive layouts, empty states, and error handling | Screen components & visual inspection |
| **19** | Verify single-port and four-port modes and role detection | [`tests/regression-fixes.test.mjs`](file:///D:/SmartSlotAI/tests/regression-fixes.test.mjs), [`tests/integration-audit.test.mjs`](file:///D:/SmartSlotAI/tests/integration-audit.test.mjs) |
| **20** | Confirm existing baseline stock and picker/supplier invariants pass | [`tests/picker-transaction.test.mjs`](file:///D:/SmartSlotAI/tests/picker-transaction.test.mjs) |

---

## 5. Manual Demonstration Walkthrough

To showcase the full workflow in a live demo:

### Step 1: Picker Pick & Threshold Depletion
1. Start single-port mode (`npm run dev:single`) and select **Picker** in the top bar.
2. In the active pick order (`PK-3922`), confirm picking 5 units of `SKU-2084` from bin `C-06-02`.
3. Notice that physical stock drops from 12 to 7 units, triggering a **Low Stock Alert**.

### Step 2: Intelligent Replenishment & Supplier Dispatch
1. Switch role to **Manager** $\to$ open **Replenishment & Suppliers**.
2. Notice the intelligent replenishment recommendation: `SKU-2084` is flagged due to safety-stock breach.
3. Click **Approve Supplier Order** for 20 units.
4. Switch role to **Supplier** $\to$ observe the incoming purchase order in the Supplier Hub.
5. Click **Confirm Full** $\to$ click **Dispatch Freight** (status transitions to `In transit`).

### Step 3: Dock Receiving & Stock Accounting
1. Switch back to **Manager** $\to$ open the **Dock Receiving** tab.
2. Click **Process Dock Receipt** for the arrived shipment. Accept 18 units and reject 2 damaged units.
3. Observe:
   - On-hand stock in bin `C-06-02` increases by exactly the 18 accepted units (from 7 to 25).
   - The 2 rejected units are logged in the **Discrepancy Audit Ledger**.

### Step 4: Multi-Warehouse Search & Transfer
1. Navigate to **Network & Multi-Warehouse** in Manager or Analyst view.
2. Search for `SKU-2084`. Observe stock levels across Hyderabad, Vijayawada, and Chennai.
3. Simulate a deficit at Bengaluru: stage an inter-warehouse transfer of 15 units from Hyderabad to Chennai.
4. Verify:
   - Hyderabad stock is reserved upon approval.
   - Upon dispatch, Hyderabad stock decrements, but Chennai stock does not increase prematurely while `IN TRANSIT`.
   - Upon dock arrival at Chennai, stock increments atomically.

### Step 5: 3D Warehouse Navigation & Shortest Path Optimization
1. Switch to **Picker** or open **3D Warehouse** in Manager view.
2. Click **Optimize Pick Path**.
3. Observe:
   - 2-Opt local search computes the shortest traversal across aisle racks.
   - Avoids shelf penetration and obstacle aisles.
   - Displays meters saved, walking seconds saved, and visualizes the route polyline in 3D.

### Step 6: Multi-Warehouse Analytics Dashboard
1. Open the **Analytics** screen.
2. Inspect the **Stock Accounting Matrix**: verify $\text{Total On-Hand} = \text{Available} + \text{Reserved}$, and in-transit freight is listed separately in Pipeline.
3. Click on the **Low Stock Alerts** KPI card to drill down into the filtered inventory ledger.
4. Open the **Cross-Warehouse Availability** tab to view sister surplus recommendations and road transit hours.

---

## 6. Assumptions & Limitations

- **In-Memory Demo State**: Unless MongoDB Atlas audit logging is configured, application state resides in memory via Zustand and resets upon process restart.
- **Simulated Highway Telemetry**: Regional warehouse locations (`WH-HYD-01`, `WH-VJA-02`, `WH-CHN-03`, `WH-BLR-04`), transit hours, and road distances ($\text{km}$) are deterministic models designed for hackathon demonstration.
- **Production Safeguards**: This application is a hackathon-grade digital twin demonstration. It is not intended for direct production deployment without persistent database integration (e.g. MongoDB/PostgreSQL), enterprise authentication (OAuth/SSO), role-based access control (RBAC), and SSL network infrastructure.
