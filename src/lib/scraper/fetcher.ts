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
  html?: string
  error?: string
  statusCode?: number
  blocked?: boolean
  sessionCookie?: string
}

export async function initSession(_userAgent?: string): Promise<{ cookie: string } | null> {
  // No session needed — CrawlByte handles everything
  return { cookie: 'crawlbyte' }
}

export function pickUserAgent(): string {
  return 'crawlbyte'
}

/**
 * Fetch flight data via CrawlByte API.
 * Returns the raw Frontier JSON as the `html` field for parser compatibility.
 */
export async function fetchFlightPage(
  origin: string,
  destination: string,
  date: Date,
  _sessionCookie: string,
  _userAgent: string,
): Promise<FetchResult> {
  const apiKey = process.env.CRAWLBYTE_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'CRAWLBYTE_API_KEY not set' }
  }

  const url = buildSearchUrl(origin, destination, date)

  try {
    // Create task
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
      return { ok: false, error: `CrawlByte API error: HTTP ${createRes.status}`, statusCode: createRes.status }
    }

    const task = await createRes.json() as { id: string; status: string; result?: string[] }

    // If already completed (fast response)
    if (task.status === 'completed' && task.result?.[0]) {
      return { ok: true, html: task.result[0] }
    }

    if (task.status === 'failed') {
      return { ok: false, error: 'CrawlByte task failed immediately' }
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
        return { ok: true, html: result.result[0] }
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

export async function closeBrowser(): Promise<void> {}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomDelay(): Promise<void> {
  // CrawlByte handles rate limiting, but add a small delay between requests
  const ms = 1000 + Math.random() * 2000
  return sleep(ms)
}
