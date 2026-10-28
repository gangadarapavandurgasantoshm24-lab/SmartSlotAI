import fs from 'node:fs'
import readline from 'node:readline'

async function analyze() {
  const translations = {}
  const tLines = fs.readFileSync('D:/Drive D/scm/data/Brazilian E-Commerce/product_category_name_translation.csv', 'utf8').split('\n')
  for (const line of tLines) {
    const [pt, en] = line.trim().split(',')
    if (pt && en) translations[pt.trim()] = en.trim()
  }

  // Count item order frequencies and co-occurrences
  const itemCounts = {}
  const orderBaskets = {}
  const orderItemsRl = readline.createInterface({ input: fs.createReadStream('D:/Drive D/scm/data/Brazilian E-Commerce/olist_order_items_dataset.csv') })
  let isFirst = true
  for await (const line of orderItemsRl) {
    if (isFirst) { isFirst = false; continue; }
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
  const prodRl = readline.createInterface({ input: fs.createReadStream('D:/Drive D/scm/data/Brazilian E-Commerce/olist_products_dataset.csv') })
  isFirst = true
  for await (const line of prodRl) {
    if (isFirst) { isFirst = false; continue; }
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
      volume_cm3: length * height * width
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
    if (pct <= 0.80) {
      classACount++
    } else if (pct <= 0.95) {
      classBCount++
    } else {
      classCCount++
    }
  }

  console.log('\n--- Pareto Demand Velocity Profiling ---')
  console.log(`Class A (Fast Moving - 80% volume): ${classACount} SKUs (${((classACount/uniqueProducts)*100).toFixed(1)}% of SKUs)`)
  console.log(`Class B (Medium Moving - 15% volume): ${classBCount} SKUs (${((classBCount/uniqueProducts)*100).toFixed(1)}% of SKUs)`)
  console.log(`Class C (Slow Moving - 5% volume): ${classCCount} SKUs (${((classCCount/uniqueProducts)*100).toFixed(1)}% of SKUs)`)

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
      volume_cm3: meta.volume_cm3
    }
    console.log(info)
    return info
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
    console.log(`${i + 1}. Count: ${count} | ${products[p1]?.category || p1} (${p1.slice(0,8)}) <-> ${products[p2]?.category || p2} (${p2.slice(0,8)})`)
  })
}

analyze()
