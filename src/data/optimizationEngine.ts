import type { Bin, InventoryItem, OptimizationConfig, OptimizationMetrics, OptimizationPlacement, OptimizationRun, OptimizationViolation, SKU, SKUOptimizationProfile } from '../types'

const DEFAULT_PROFILE: SKUOptimizationProfile = { weeklyPickFrequency: 0, demandClass: 'C', dimensionsCm: [1, 1, 1], weightKg: 0, handling: 'standard', affinitySkuIds: [] }
const DEFAULT_BIN_CONSTRAINTS = { dimensionsCm: [60, 40, 40] as [number, number, number], maxWeightKg: 25, handlingCapabilities: ['standard'] as SKUOptimizationProfile['handling'][], certifiedHazards: [], goldenZone: false, source: 'demo estimate' as const }

function profileOf(sku: SKU): SKUOptimizationProfile { return sku.optimizationProfile ?? DEFAULT_PROFILE }
function constraintsOf(bin: Bin) { return bin.optimizationConstraints ?? DEFAULT_BIN_CONSTRAINTS }
function distance(bin: Bin): number { return 12 + 10 * (Math.abs((bin.aisle ?? 1) - 1) + Math.abs((bin.bay ?? 1) - 1)) }
function volumeM3(dims: [number, number, number]): number { return dims[0] * dims[1] * dims[2] / 1_000_000 }
function normalizeWeights(config: OptimizationConfig): OptimizationConfig['weights'] {
  const values = config.weights
  const total = values.travelDistance + values.cubeUtilization + values.goldenZone + values.skuAffinity
  if (total <= 0) return { travelDistance: 25, cubeUtilization: 25, goldenZone: 25, skuAffinity: 25 }
  return { travelDistance: values.travelDistance / total, cubeUtilization: values.cubeUtilization / total, goldenZone: values.goldenZone / total, skuAffinity: values.skuAffinity / total }
}

export function validatePlacement(sku: SKU, quantity: number, target: Bin, targetStock?: InventoryItem): OptimizationViolation[] {
  const profile = profileOf(sku)
  const constraints = constraintsOf(target)
  const violations: OptimizationViolation[] = []
  if (targetStock && targetStock.quantity > 0 && targetStock.skuId !== sku.id) {
    violations.push({ code: 'bin-capacity', title: 'Target bin is occupied', expected: 'Empty or same-SKU bin', actual: `${targetStock.skuId} · ${targetStock.quantity} units`, explanation: 'A proposal cannot place a different SKU into a bin that currently contains stock.' })
  }
  const existingSameSku = targetStock?.skuId === sku.id ? targetStock.quantity : 0
  const combinedQuantity = existingSameSku + quantity
  if (combinedQuantity > (targetStock?.capacity ?? target.capacity)) {
    violations.push({ code: 'bin-capacity', title: 'Bin unit capacity exceeded', expected: `≤ ${targetStock?.capacity ?? target.capacity} units`, actual: `${combinedQuantity} units assigned`, explanation: 'The proposed load exceeds the inventory record capacity for this bin.' })
  }
  const itemVolume = volumeM3(profile.dimensionsCm) * combinedQuantity
  const binVolume = volumeM3(constraints.dimensionsCm)
  if (itemVolume > binVolume) violations.push({ code: 'volume-capacity', title: 'Cube volume capacity exceeded', expected: `≤ ${binVolume.toFixed(3)} m³`, actual: `${itemVolume.toFixed(3)} m³ assigned`, explanation: 'Estimated package volume multiplied by assigned quantity exceeds the available bin volume.' })
  const dimsFit = profile.dimensionsCm.every((dimension, index) => dimension <= constraints.dimensionsCm[index])
  if (!dimsFit) violations.push({ code: 'dimensions', title: 'SKU does not fit bin dimensions', expected: `${constraints.dimensionsCm.join(' × ')} cm (no rotation)`, actual: `${profile.dimensionsCm.join(' × ')} cm SKU`, explanation: 'At least one SKU dimension exceeds the matching bin dimension; rotation is not assumed.' })
  const loadKg = existingSameSku * profile.weightKg + quantity * profile.weightKg
  if (loadKg > constraints.maxWeightKg) violations.push({ code: 'weight', title: 'Maximum weight exceeded', expected: `≤ ${constraints.maxWeightKg} kg`, actual: `${loadKg.toFixed(1)} kg load`, explanation: 'Estimated combined SKU load exceeds the demo bin weight rating.' })
  if (!constraints.handlingCapabilities.includes(profile.handling)) violations.push({ code: 'handling', title: 'Handling capability mismatch', expected: constraints.handlingCapabilities.join(', ') || 'No supported handling', actual: profile.handling, explanation: `This location does not support ${profile.handling} handling.` })
  if (profile.hazardClass && !constraints.certifiedHazards.includes(profile.hazardClass)) violations.push({ code: 'hazard', title: 'Hazard compatibility failed', expected: constraints.certifiedHazards.join(', ') || 'No certified hazard class', actual: profile.hazardClass, explanation: 'The target location has no matching hazard certification.' })
  return violations
}

function scorePlacement(sku: SKU, target: Bin, quantity: number, config: OptimizationConfig, affinityBins: Map<string, Bin>): number {
  const profile = profileOf(sku)
  const constraints = constraintsOf(target)
  const weights = normalizeWeights(config)
  const maxDistance = 112
  const travelScore = (1 - Math.min(distance(target), maxDistance) / maxDistance) * Math.min(1, profile.weeklyPickFrequency / 180)
  const utilization = Math.min(1, volumeM3(profile.dimensionsCm) * quantity / Math.max(0.001, volumeM3(constraints.dimensionsCm)))
  const cubeScore = Math.max(0, 1 - Math.abs(utilization - 0.7) / 0.7)
  const goldenScore = constraints.goldenZone ? Math.min(1, profile.weeklyPickFrequency / 180) : 0
  const affinity = profile.affinitySkuIds.map((id) => affinityBins.get(id)).filter((bin): bin is Bin => Boolean(bin))
  const affinityScore = affinity.length ? affinity.reduce((sum, bin) => sum + (bin.aisle === target.aisle ? 1 : 0), 0) / affinity.length : 0.5
  const preferenceGolden = config.preferGoldenZone ? 0.1 : 0
  return (travelScore * weights.travelDistance + cubeScore * weights.cubeUtilization + goldenScore * (weights.goldenZone + preferenceGolden) + affinityScore * weights.skuAffinity) * 100
}

function makePlacement(sku: SKU, source: Bin, target: Bin, quantity: number, score: number, violations: OptimizationViolation[], affinityBins: Map<string, Bin>): OptimizationPlacement {
  const profile = profileOf(sku)
  const reasons = target.id === source.id ? ['Retain current placement'] : []
  if (constraintsOf(target).goldenZone && profile.demandClass === 'A') reasons.push('A-class demo demand in golden zone')
  if (profile.affinitySkuIds.some((id) => affinityBins.get(id)?.aisle === target.aisle)) reasons.push('Near an affinity SKU')
  if (reasons.length === 0) reasons.push('Lower estimated picking effort and feasible capacity')
  return { skuId: sku.id, skuName: sku.name, quantity, fromBinId: source.id, toBinId: target.id, reason: reasons.join(' · '), feasible: violations.length === 0, score: Number(score.toFixed(2)), violations }
}

function metrics(placements: OptimizationPlacement[], bins: Bin[], skus: SKU[]): OptimizationMetrics {
  const byId = new Map(bins.map((bin) => [bin.id, bin]))
  const skuById = new Map(skus.map((sku) => [sku.id, sku]))
  const travelMeters = placements.reduce((sum, placement) => sum + distance(byId.get(placement.toBinId) ?? byId.get(placement.fromBinId)!), 0)
  const cubeUtilizationPercent = placements.length ? placements.reduce((sum, placement) => { const sku = skuById.get(placement.skuId); const bin = byId.get(placement.toBinId); return sum + (sku && bin ? volumeM3(profileOf(sku).dimensionsCm) * placement.quantity / Math.max(0.001, volumeM3(constraintsOf(bin).dimensionsCm)) : 0) }, 0) / placements.length * 100 : 0
  const goldenZoneCount = placements.filter((placement) => byId.get(placement.toBinId) && constraintsOf(byId.get(placement.toBinId)!).goldenZone).length
  const movementCount = placements.filter((placement) => placement.fromBinId !== placement.toBinId).length
  const hardConstraintViolations = placements.reduce((sum, placement) => sum + placement.violations.length, 0)
  const objectiveScore = placements.length ? placements.reduce((sum, placement) => sum + placement.score, 0) / placements.length : 0
  return { travelMeters: Number(travelMeters.toFixed(1)), pickTimeMinutes: Number((travelMeters / 50).toFixed(1)), cubeUtilizationPercent: Number(cubeUtilizationPercent.toFixed(1)), goldenZoneCount, movementCount, hardConstraintViolations, objectiveScore: Number(objectiveScore.toFixed(1)) }
}

export function buildOptimizationRun(input: { bins: Bin[]; inventory: InventoryItem[]; skus: SKU[]; config: OptimizationConfig }): Omit<OptimizationRun, 'id' | 'revision' | 'createdAt' | 'approvedAt' | 'approvedBy'> {
  const { bins, inventory, skus, config } = input
  const binById = new Map(bins.map((bin) => [bin.id, bin]))
  const stockByBin = new Map(inventory.map((item) => [item.binId, item]))
  const assumptions: string[] = ['SKU demand, package dimensions and unit weights are labeled demo estimates, not measured WMS data.', 'Bins without measured constraints use a documented 60 × 40 × 40 cm, 25 kg, standard-handling demo fallback; SKUs without a profile use a 1 × 1 × 1 cm, 0 kg, zero-demand fallback.', 'Pick travel uses Manhattan aisle and bay distance from the demo dispatch point at aisle 1 / bay 1; estimated walking speed is 50 m/min.', 'Only the highest-on-hand available primary pick-face record per SKU with a feasible candidate is planned; remaining stock locations are left unchanged.', 'Cube utilization is the average estimated package-volume-to-bin-volume ratio across selected primary pick faces; the score prefers 70% fill.', 'Targets must be empty or already contain the same SKU; proposed plans do not update physical inventory.']
  const selected = skus.map((sku) => {
    const candidates = inventory.filter((item) => item.skuId === sku.id && item.available).sort((a, b) => b.quantity - a.quantity || a.binId.localeCompare(b.binId))
    const eligible = candidates.find((current) => {
      const source = binById.get(current.binId)
      return source && bins.some((target) => {
        const targetStock = stockByBin.get(target.id)
        return validatePlacement(sku, current.quantity, target, target.id === source.id ? undefined : targetStock).length === 0
      })
    })
    const current = eligible ?? candidates[0]
    return current && binById.get(current.binId) ? { sku, stock: current, source: binById.get(current.binId)! } : null
  }).filter((entry): entry is { sku: SKU; stock: InventoryItem; source: Bin } => Boolean(entry))
  const placements: OptimizationPlacement[] = []
  const rejectedCandidates: OptimizationPlacement[] = []
  const usedTargets = new Set<string>()
  const affinityBins = new Map<string, Bin>()
  for (const { sku } of selected) affinityBins.set(sku.id, selected.find((entry) => entry.sku.id === sku.id)!.source)
  const sorted = [...selected].sort((a, b) => profileOf(b.sku).weeklyPickFrequency - profileOf(a.sku).weeklyPickFrequency || a.sku.id.localeCompare(b.sku.id))
  for (const { sku, stock, source } of sorted) {
    const evaluated = bins.map((target) => {
      const targetStock = stockByBin.get(target.id)
      const violations = validatePlacement(sku, stock.quantity, target, target.id === source.id ? undefined : targetStock)
      const occupiedByOther = targetStock && targetStock.quantity > 0 && targetStock.skuId !== sku.id
      const score = scorePlacement(sku, target, stock.quantity, config, affinityBins)
      return { target, targetStock, violations, occupiedByOther, score }
    }).sort((a, b) => b.score - a.score || a.target.id.localeCompare(b.target.id))
    const feasible = evaluated.find((candidate) => candidate.violations.length === 0 && !candidate.occupiedByOther && (!usedTargets.has(candidate.target.id) || candidate.target.id === source.id))
    const invalidAlternative = evaluated.find((candidate) => candidate.violations.length > 0)
    if (invalidAlternative) rejectedCandidates.push(makePlacement(sku, source, invalidAlternative.target, stock.quantity, invalidAlternative.score, invalidAlternative.violations, affinityBins))
    if (!feasible) {
      const fallback = invalidAlternative ?? evaluated[0]
      const why = fallback?.violations ?? [{ code: 'bin-capacity' as const, title: 'No feasible target available', expected: 'At least one compatible bin', actual: 'No candidate bin', explanation: 'All candidate locations are occupied or violate a hard constraint.' }]
      placements.push(makePlacement(sku, source, fallback?.target ?? source, stock.quantity, 0, why, affinityBins))
    } else {
      usedTargets.add(feasible.target.id)
      placements.push(makePlacement(sku, source, feasible.target, stock.quantity, feasible.score, [], affinityBins))
      affinityBins.set(sku.id, feasible.target)
    }
  }
  const baselinePlacements = selected.map(({ sku, stock, source }) => {
    const violations = validatePlacement(sku, stock.quantity, source)
    return makePlacement(sku, source, source, stock.quantity, scorePlacement(sku, source, stock.quantity, config, affinityBins), violations, affinityBins)
  })
  return { config, placements, rejectedCandidates, assumptions, baseline: metrics(baselinePlacements, bins, skus), proposed: metrics(placements, bins, skus) }
}

export function validateOptimizationApproval(run: OptimizationRun | null): string | null {
  if (!run) return 'Run the optimizer before approval.'
  if (run.approvedAt) return 'This revision has already been approved.'
  const violations = run.placements.flatMap((placement) => placement.violations)
  if (violations.length || run.proposed.hardConstraintViolations > 0 || run.placements.some((placement) => !placement.feasible)) return 'Approval is blocked while selected placements violate hard constraints. Revise and rerun the proposal.'
  return null
}
