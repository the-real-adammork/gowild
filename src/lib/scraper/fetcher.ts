const CRAWLBYTE_API = 'https://api.crawlbyte.ai/api'

function formatDateParam(date: Date): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mon = months[date.getMonth()]
  const day = String(date.getDate()).padStart(2, '0')
  const year = date.getFullYear()
  return `${mon}%20${day},%20${year}`
}

export function buildSearchUrl(origin: string, destination: string, date: Date): string {
  const dateStr = formatDateParam(date)
  return `https://booking.flyfrontier.com/Flight/InternalSelect?o1=${origin}&d1=${destination}&dd1=${dateStr}&ADT=1&mon=true&promo=`
}

export interface FetchResult {
  ok: boolean
  data?: string
  error?: string
}

/**
 * Fetch flight data via CrawlByte API.
 * Returns the raw Frontier JSON string on success.
 */
export async function fetchFlightPage(
  origin: string,
  destination: string,
  date: Date,
): Promise<FetchResult> {
  const apiKey = process.env.CRAWLBYTE_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'CRAWLBYTE_API_KEY not set' }
  }

  const url = buildSearchUrl(origin, destination, date)

  try {
    const createRes = await fetch(`${CRAWLBYTE_API}/tasks`, {
      method: 'POST',
      headers: {
        'Authorization': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'flyfrontier',
        input: [url],
        multithread: false,
      }),
    })

    if (!createRes.ok) {
      return { ok: false, error: `CrawlByte API error: HTTP ${createRes.status}` }
    }

    const task = await createRes.json() as { id: string; status: string; result?: string[] }

    if (task.status === 'completed' && task.result?.[0]) {
      return { ok: true, data: task.result[0] }
    }

    if (task.status === 'failed') {
      return { ok: false, error: 'CrawlByte task failed' }
    }

    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000))

      const pollRes = await fetch(`${CRAWLBYTE_API}/tasks/${task.id}`, {
        headers: { 'Authorization': apiKey },
      })

      if (!pollRes.ok) continue

      const result = await pollRes.json() as { status: string; result?: string[] }

      if (result.status === 'completed' && result.result?.[0]) {
        return { ok: true, data: result.result[0] }
      }

      if (result.status === 'failed') {
        return { ok: false, error: 'CrawlByte task failed' }
      }
    }

    return { ok: false, error: 'CrawlByte task timed out' }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomDelay(): Promise<void> {
  const ms = 1000 + Math.random() * 2000
  return sleep(ms)
}
