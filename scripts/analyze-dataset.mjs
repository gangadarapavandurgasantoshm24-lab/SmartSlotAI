import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'

async function analyze() {
  const possiblePaths = [
    process.argv[2],
    process.env.DATASET_DIR,
    'D:/Drive D/scm/data/Brazilian E-Commerce',
    './data/Brazilian E-Commerce',
    './Reference/dataset',
  ].filter(Boolean)

  let datasetDir = possiblePaths.find((p) => {
    try {
      return (
        fs.existsSync(path.join(p, 'product_category_name_translation.csv')) &&
        fs.existsSync(path.join(p, 'olist_order_items_dataset.csv')) &&
        fs.existsSync(path.join(p, 'olist_products_dataset.csv'))
      )
    } catch {
      return false
    }
  })

  if (datasetDir) {
    console.log(`[SmartSlot AI] Processing raw CSV dataset from: ${datasetDir}`)
    const translations = {}
    const tLines = fs
      .readFileSync(path.join(datasetDir, 'product_category_name_translation.csv'), 'utf8')
      .split('\n')
    for (const line of tLines) {
      const [pt, en] = line.trim().split(',')
      if (pt && en) translations[pt.trim()] = en.trim()
    }

    // Count item order frequencies and co-occurrences
    const itemCounts = {}
    const orderBaskets = {}
    const orderItemsRl = readline.createInterface({
      input: fs.createReadStream(path.join(datasetDir, 'olist_order_items_dataset.csv')),
    })
    let isFirst = true
    for await (const line of orderItemsRl) {
      if (isFirst) {
        isFirst = false
        continue
      }
      const parts = line.split(',')
      const orderId = (parts[0] || '').replace(/"/g, '').trim()
      const prodId = (parts[2] || '').replace(/"/g, '').trim()
      if (!prodId) continue
      itemCounts[prodId] = (itemCounts[prodId] || 0) + 1
      if (!orderBaskets[orderId]) orderBaskets[orderId] = []
      if (!orderBaskets[orderId].includes(prodId)) orderBaskets[orderId].push(prodId)
    }

    const totalOrders = Object.keys(orderBaskets).length
    const totalItemLines = Object.values(itemCounts).reduce((a, b) => a + b, 0)
    const uniqueProducts = Object.keys(itemCounts).length

    console.log('Total Orders:', totalOrders)
    console.log('Total Item Lines:', totalItemLines)
    console.log('Unique Products:', uniqueProducts)

    // Read products metadata
    const products = {}
    const prodRl = readline.createInterface({
      input: fs.createReadStream(path.join(datasetDir, 'olist_products_dataset.csv')),
    })
    isFirst = true
    for await (const line of prodRl) {
      if (isFirst) {
        isFirst = false
        continue
      }
      const parts = line.split(',')
      const prodId = (parts[0] || '').replace(/"/g, '').trim()
      const catPt = (parts[1] || '').replace(/"/g, '').trim()
      const weight = parseFloat(parts[5]) || 500
      const length = parseFloat(parts[6]) || 20
      const height = parseFloat(parts[7]) || 15
      const width = parseFloat(parts[8]) || 15
      products[prodId] = {
        id: prodId,
        category: translations[catPt] || catPt || 'general_merchandise',
        weight_g: weight,
        length_cm: length,
        height_cm: height,
        width_cm: width,
        volume_cm3: length * height * width,
      }
    }

    // Sort by order count
    const sorted = Object.entries(itemCounts).sort((a, b) => b[1] - a[1])

    // Calculate Pareto (80/20)
    let cumulative = 0
    let classACount = 0
    let classBCount = 0
    let classCCount = 0
    for (const [, count] of sorted) {
      cumulative += count
      const pct = cumulative / totalItemLines
      if (pct <= 0.8) {
        classACount++
      } else if (pct <= 0.95) {
        classBCount++
      } else {
        classCCount++
      }
    }

    console.log('\n--- Pareto Demand Velocity Profiling ---')
    console.log(
      `Class A (Fast Moving - 80% volume): ${classACount} SKUs (${((classACount / uniqueProducts) * 100).toFixed(1)}% of SKUs)`
    )
    console.log(
      `Class B (Medium Moving - 15% volume): ${classBCount} SKUs (${((classBCount / uniqueProducts) * 100).toFixed(1)}% of SKUs)`
    )
    console.log(
      `Class C (Slow Moving - 5% volume): ${classCCount} SKUs (${((classCCount / uniqueProducts) * 100).toFixed(1)}% of SKUs)`
    )

    console.log('\nTop 15 Products by Order Count:')
    sorted.slice(0, 15).forEach(([id, count], i) => {
      const meta = products[id] || {}
      const info = {
        rank: i + 1,
        id,
        orders: count,
        category: meta.category,
        weight_kg: Number(((meta.weight_g || 0) / 1000).toFixed(2)),
        length_cm: meta.length_cm,
        width_cm: meta.width_cm,
        height_cm: meta.height_cm,
        volume_cm3: meta.volume_cm3,
      }
      console.log(info)
    })

    // Market basket analysis / co-occurrences
    const pairCounts = {}
    for (const basket of Object.values(orderBaskets)) {
      if (basket.length > 1) {
        for (let i = 0; i < basket.length; i++) {
          for (let j = i + 1; j < basket.length; j++) {
            const pair = [basket[i], basket[j]].sort().join('___')
            pairCounts[pair] = (pairCounts[pair] || 0) + 1
          }
        }
      }
    }

    const sortedPairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1])
    console.log('\nTop 10 Affinity / Co-occurrence Pairs:')
    sortedPairs.slice(0, 10).forEach(([pair, count], i) => {
      const [p1, p2] = pair.split('___')
      console.log(
        `${i + 1}. Count: ${count} | ${products[p1]?.category || p1} (${p1.slice(0, 8)}) <-> ${products[p2]?.category || p2} (${p2.slice(0, 8)})`
      )
    })
  } else {
    // Fallback: analyze pre-mined dataset telemetry from src/data/brazilianEcommerceData.ts
    const dataFilePath = path.resolve('src/data/brazilianEcommerceData.ts')
    if (!fs.existsSync(dataFilePath)) {
      console.error(
        `Error: Raw CSV dataset not found at '${possiblePaths[0]}' and pre-mined telemetry not found at '${dataFilePath}'.`
      )
      return
    }

    console.log('========================================================================')
    console.log('   SMARTSLOT AI — OLIST LOGISTICS & DEMAND INTELLIGENCE ANALYZER')
    console.log('========================================================================')
    console.log(`[Info] Raw CSV directory not attached: '${possiblePaths[0]}'`)
    console.log(`[Info] Analyzing verified mined logistics telemetry from: src/data/brazilianEcommerceData.ts\n`)

    const content = fs.readFileSync(dataFilePath, 'utf8')
    const jsonText = content
      .substring(
        content.indexOf('export const brazilianEcommerceData') +
          'export const brazilianEcommerceData: OlistDatasetSummary = '.length
      )
      .trim()
    const dataset = new Function('return ' + jsonText)()

    console.log(`Dataset Name:        ${dataset.datasetName}`)
    console.log(`Source Path:         ${dataset.sourcePath}`)
    console.log(`Date Range:          ${dataset.dateRange}`)
    console.log(`Total Orders:        ${dataset.totalOrders.toLocaleString()}`)
    console.log(`Total Item Lines:    ${dataset.totalItemTransactions.toLocaleString()}`)
    console.log(`Unique Products:     ${dataset.uniqueProducts.toLocaleString()}`)
    console.log(`Total Categories:    ${dataset.totalCategories}`)

    console.log('\n--- Pareto Demand Velocity Profiling ---')
    const { classA, classB, classC } = dataset.pareto
    console.log(
      `Class A (Fast Moving - 80% volume): ${classA.count.toLocaleString()} SKUs (${classA.pctSkus}% of SKUs) -> ${classA.description}`
    )
    console.log(
      `Class B (Medium Moving - 15% volume): ${classB.count.toLocaleString()} SKUs (${classB.pctSkus}% of SKUs) -> ${classB.description}`
    )
    console.log(
      `Class C (Slow Moving - 5% volume):  ${classC.count.toLocaleString()} SKUs (${classC.pctSkus}% of SKUs) -> ${classC.description}`
    )

    console.log('\nTop 15 Products by Order Count:')
    dataset.catalog.slice(0, 15).forEach((item, i) => {
      console.log({
        rank: i + 1,
        skuId: item.skuId,
        olistId: item.olistProductId,
        name: item.name,
        orders: item.orderCount,
        category: item.category,
        demandClass: item.demandClass,
        weight_kg: item.weightKg,
        dimensions_cm: item.dimensionsCm.join('x'),
        volume_cm3: item.volumeCm3,
        suggestedZone: `${item.suggestedZone}-L${item.suggestedLevel}`,
        goldenZone: item.goldenZone,
      })
    })

    console.log('\nTop 10 Affinity / Co-occurrence Pairs:')
    dataset.affinityPairs.slice(0, 10).forEach((pair, i) => {
      console.log(
        `${String(i + 1).padStart(2, ' ')}. Co-orders: ${String(pair.coOccurrenceCount).padStart(3, ' ')} | ${pair.product1.category} (${pair.product1.shortId}) <-> ${pair.product2.category} (${pair.product2.shortId}) | ${pair.recommendation} | Saves ~${pair.pickPathSavingsMeters}m`
      )
    })

    console.log('\nVolumetric Bin Utilization Analysis:')
    for (const [binSize, summary] of Object.entries(dataset.volumetricSummary)) {
      console.log(
        ` - ${binSize.padEnd(14, ' ')} (${summary.range.padEnd(20, ' ')}): ${String(summary.count).padStart(6, ' ')} items | Baseline Fill: ${summary.fillRateBaseline}% -> Optimized Fill: ${summary.fillRateOptimized}%`
      )
    }

    console.log('\nSimulated Warehouse Impact Summary:')
    const sim = dataset.simulationImpact
    console.log(` - Travel Distance:       ${sim.travelDistanceMeters.baseline}m -> ${sim.travelDistanceMeters.optimized}m (${sim.travelDistanceMeters.reductionPct}% reduction)`)
    console.log(` - Route Time:            ${sim.routeTimeMinutes.baseline} min -> ${sim.routeTimeMinutes.optimized} min (${sim.routeTimeMinutes.reductionPct}% reduction)`)
    console.log(` - Cube Utilization:      ${sim.cubeUtilizationPct.baseline}% -> ${sim.cubeUtilizationPct.optimized}% (+${sim.cubeUtilizationPct.improvementPct}% improvement)`)
    console.log(` - Golden Zone Picks:     ${sim.goldenZonePickPct.baseline}% -> ${sim.goldenZonePickPct.optimized}% (+${sim.goldenZonePickPct.improvementPct}% improvement)`)
    console.log(` - Safety Violations:     ${sim.safetyConstraintViolations.baseline} -> ${sim.safetyConstraintViolations.optimized} (Zero violations)`)
    console.log('========================================================================\n')
  }
}

analyze()
