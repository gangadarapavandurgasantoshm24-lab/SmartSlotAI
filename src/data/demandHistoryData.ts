import type { SaleEvent } from '../types'

export const DEMO_SALES_DISCLAIMER =
  'SIMULATED DEMO DATASET: Historical customer sales events are deterministically generated for West Coast Fulfillment Center modeling. Excludes supplier dock receipts, internal warehouse re-slotting, and stock count adjustments.'

export interface SkuSalesVolumeSpec {
  skuId: string
  dailyMeanQty: number
  unitPrice: number
  channelWeights: { [channel in 'e-commerce' | 'retail' | 'express']: number }
}

const SKU_VOLUME_SPECS: SkuSalesVolumeSpec[] = [
  {
    skuId: 'SKU-2084', // Fast mover Class A
    dailyMeanQty: 17,
    unitPrice: 120,
    channelWeights: { 'e-commerce': 0.65, retail: 0.25, express: 0.1 },
  },
  {
    skuId: 'SKU-1102', // Fast mover Class A
    dailyMeanQty: 15,
    unitPrice: 95,
    channelWeights: { 'e-commerce': 0.7, retail: 0.2, express: 0.1 },
  },
  {
    skuId: 'SKU-3401', // Medium mover Class B
    dailyMeanQty: 8,
    unitPrice: 210,
    channelWeights: { 'e-commerce': 0.5, retail: 0.4, express: 0.1 },
  },
  {
    skuId: 'SKU-0917', // Slow mover Class C
    dailyMeanQty: 2.7,
    unitPrice: 45,
    channelWeights: { 'e-commerce': 0.8, retail: 0.1, express: 0.1 },
  },
]

// Hourly demand weight curve across a 24-hour day (peaks at 11h and 20h)
const HOURLY_WEIGHTS = [
  0.01, 0.01, 0.01, 0.01, 0.02, 0.03, // 00-05h night
  0.05, 0.07, 0.09, 0.11, 0.12, 0.11, // 06-11h morning peak
  0.08, 0.06, 0.05, 0.05, 0.06, 0.07, // 12-17h afternoon
  0.09, 0.11, 0.09, 0.06, 0.03, 0.02, // 18-23h evening peak
]

// Day of week multipliers: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
const DAY_MULTIPLIERS = [0.85, 1.05, 1.25, 1.2, 1.15, 0.95, 0.75]

/**
 * Deterministic pseudo-random number generator for reproducible sales events.
 * Seeded linear congruential generator (LCG).
 */
function createSeededRandom(seed = 4289) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

/**
 * Generates a reproducible 30-day historical customer sales order dataset.
 *
 * All generated events are clearly tagged with `isSimulated: true`.
 * Excludes supplier receipts, returns, internal moves, and count adjustments.
 */
export function generateDeterministicSalesHistory(referenceDate = new Date('2026-10-28T18:00:00Z')): SaleEvent[] {
  const rand = createSeededRandom(91823)
  const events: SaleEvent[] = []
  const totalDays = 30

  let orderSequence = 10001

  for (let dayOffset = totalDays - 1; dayOffset >= 0; dayOffset--) {
    const dayDate = new Date(referenceDate.getTime() - dayOffset * 86400000)
    const dayOfWeek = dayDate.getUTCDay()
    const dayFactor = DAY_MULTIPLIERS[dayOfWeek] ?? 1.0

    for (const spec of SKU_VOLUME_SPECS) {
      // Determine expected orders for this SKU today
      const expectedDailyQty = Math.max(1, Math.round(spec.dailyMeanQty * dayFactor))
      let allocatedQty = 0

      // Distribute into 1 to 5 individual order transactions across the day
      const orderCount = Math.max(1, Math.min(6, Math.round(expectedDailyQty / 3.5)))

      for (let o = 0; o < orderCount; o++) {
        const remainingToAllocate = expectedDailyQty - allocatedQty
        if (remainingToAllocate <= 0 && o > 0) break

        const isLastOrder = o === orderCount - 1
        const orderQty = isLastOrder
          ? Math.max(1, remainingToAllocate)
          : Math.max(1, Math.min(remainingToAllocate, Math.round(1 + rand() * 4)))

        allocatedQty += orderQty

        // Pick hour weighted by HOURLY_WEIGHTS
        const rVal = rand()
        let cum = 0
        let chosenHour = 14
        for (let h = 0; h < 24; h++) {
          cum += HOURLY_WEIGHTS[h]
          if (rVal <= cum) {
            chosenHour = h
            break
          }
        }
        const chosenMinute = Math.floor(rand() * 60)
        const chosenSecond = Math.floor(rand() * 60)

        const eventDate = new Date(dayDate)
        eventDate.setUTCHours(chosenHour, chosenMinute, chosenSecond, 0)

        // Select channel
        const cRand = rand()
        const channel: 'e-commerce' | 'retail' | 'express' =
          cRand < spec.channelWeights['e-commerce']
            ? 'e-commerce'
            : cRand < spec.channelWeights['e-commerce'] + spec.channelWeights.retail
            ? 'retail'
            : 'express'

        events.push({
          id: `ORD-HIST-${orderSequence}`,
          skuId: spec.skuId,
          quantity: orderQty,
          timestamp: eventDate.toISOString(),
          orderRef: `SO-${orderSequence}`,
          channel,
          unitPrice: spec.unitPrice,
          isSimulated: true,
        })

        orderSequence++
      }
    }
  }

  // Sort chronologically ascending
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return events
}

export const deterministicSalesHistory: SaleEvent[] = generateDeterministicSalesHistory()

