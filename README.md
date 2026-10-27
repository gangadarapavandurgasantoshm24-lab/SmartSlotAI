# SmartSlot AI

SmartSlot AI is a local, front-end warehouse intelligence demo built with React, TypeScript, Vite, Zustand, and React Three Fiber. It uses seeded demo data; there is no backend or authentication.

## Prerequisites and start

- Node.js 20.19+ (or 22.12+) and npm
- From the project directory:

```powershell
npm install
npm run dev
```

Open the local URL printed by Vite. Dependencies are already declared in `package.json`; `npm install` is only needed for a fresh checkout or missing `node_modules`.

## Screens and demo flow

Use the left navigation to open Dashboard, 3D Warehouse, Picker Workspace, Suppliers & Replenishment, Optimization Lab, Analytics, and Analyst Studio.

Suggested demo: confirm the active picker stop for bin `C-06-02` (SKU-2084, 5 units; stock goes from 12 to 7), create a replenishment request for 20 units, switch to Supplier workspace to confirm and dispatch it, then switch back to Manager workspace to receive and accept 20 units (stock becomes 27). Verify the shared level in Dashboard and the Digital Twin. Run the optimization proposal, review its warnings and movement plan, then approve it; approval records a recommendation and does not move inventory.

## Validation

```powershell
npm run test
npm run build
npm run lint
```

## Demo limitations

- All data and workflow state are local in-memory demo state and reset on reload.
- Analytics and Analyst Studio contain illustrative sample values; they are not measured operational results or connected custom reports.
- Optimization is a deterministic greedy heuristic over modeled demo constraints. It does not claim a globally optimal plan, and approval does not execute physical moves.
- The warehouse 3D scene is interactive, but its geometry and inventory are a modeled demo, not a live WMS feed.
