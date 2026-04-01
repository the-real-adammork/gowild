const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:134.0) Gecko/20100101 Firefox/134.0',
]

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
  blocked?: boolean // true = 403, caller should abort the entire run
  sessionCookie?: string // reuse across requests
}

/**
 * Creates a session by making an initial request and capturing the ASP.NET_SessionId cookie.
 * Call once at the start of a scrape run, then pass the cookie to all subsequent fetches.
 */
export async function initSession(userAgent: string): Promise<{ cookie: string } | null> {
  try {
    const res = await fetch('https://booking.flyfrontier.com/', {
      headers: {
        'User-Agent': userAgent,
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    })
    const setCookie = res.headers.get('set-cookie')
    if (setCookie) {
      const sessionCookie = setCookie.split(',')
        .map((c) => c.split(';')[0].trim())
        .filter((c) => c.includes('='))
        .join('; ')
      return { cookie: sessionCookie }
    }
  } catch {
    // Fall through
  }
  return null
}

export function pickUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]
}

export async function fetchFlightPage(
  origin: string,
  destination: string,
  date: Date,
  sessionCookie: string,
  userAgent: string,
): Promise<FetchResult> {
  const url = buildSearchUrl(origin, destination, date)

  const headers: Record<string, string> = {
    'User-Agent': userAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cookie': sessionCookie,
  }

  try {
    const response = await fetch(url, {
      headers,
      redirect: 'manual',
    })

    // 403 = blocked by bot detection. Abort immediately.
    if (response.status === 403) {
      return { ok: false, error: 'Blocked (403) — aborting to protect IP', statusCode: 403, blocked: true }
    }

    // 302 redirect: follow it to /Flight/Select to get the actual data
    if (response.status === 302 || response.status === 301) {
      const setCookie = response.headers.get('set-cookie')
      let cookies = sessionCookie
      if (setCookie) {
        const newCookies = setCookie.split(',')
          .map((c) => c.split(';')[0].trim())
          .filter((c) => c.includes('='))
        cookies = [sessionCookie, ...newCookies].filter(Boolean).join('; ')
      }

      const location = response.headers.get('location')
      if (location) {
        const redirectUrl = location.startsWith('http') ? location : `https://booking.flyfrontier.com${location}`
        const redirectRes = await fetch(redirectUrl, {
          headers: { ...headers, Cookie: cookies },
          redirect: 'follow',
        })

        if (redirectRes.status === 403) {
          return { ok: false, error: 'Blocked (403) on redirect — aborting', statusCode: 403, blocked: true }
        }

        if (redirectRes.status === 200) {
          const html = await redirectRes.text()
          if (html.includes('cf-challenge') || html.includes('Just a moment')) {
            return { ok: false, error: 'Cloudflare challenge detected', statusCode: 200, blocked: true }
          }
          return { ok: true, html, sessionCookie: cookies }
        }
      }
      return { ok: false, error: `Redirect failed`, statusCode: response.status }
    }

    if (response.status === 200) {
      const html = await response.text()
      if (html.includes('cf-challenge') || html.includes('Just a moment')) {
        return { ok: false, error: 'Cloudflare challenge detected', statusCode: 200, blocked: true }
      }
      return { ok: true, html, sessionCookie }
    }

    if (response.status === 429) {
      return { ok: false, error: 'Rate limited (429) — aborting', statusCode: 429, blocked: true }
    }

    return { ok: false, error: `HTTP ${response.status}`, statusCode: response.status }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// No-op — kept for runner.ts compatibility (was used by Playwright)
export async function closeBrowser(): Promise<void> {}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomDelay(): Promise<void> {
  const ms = 5000 + Math.random() * 5000 // 5-10 seconds
  return sleep(ms)
}
