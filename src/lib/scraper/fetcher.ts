import { chromium, type Browser, type BrowserContext } from 'rebrowser-playwright'

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

let browser: Browser | null = null
let browserContext: BrowserContext | null = null

const STEALTH_SCRIPTS = `
  Object.defineProperty(navigator, 'webdriver', { get: () => false });
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5].map(() => ({
      name: 'Chrome PDF Plugin',
      description: 'Portable Document Format',
      filename: 'internal-pdf-viewer',
      length: 1,
    })),
  });
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  window.chrome = { runtime: {}, loadTimes: function() {}, csi: function() {}, app: { isInstalled: false } };
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) =>
    parameters.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : originalQuery(parameters);
`

/**
 * Check if the page is showing a PerimeterX or Cloudflare challenge.
 * If so, wait for it to auto-resolve (up to ~15s).
 * Returns the final HTML if resolved, or null if still blocked.
 */
async function waitForChallenge(page: { content: () => Promise<string>; waitForTimeout: (ms: number) => Promise<void> }): Promise<string | null> {
  let html = await page.content()

  const isChallenge = (h: string) =>
    h.includes('px-captcha') ||
    h.includes('perimeterx') ||
    h.includes('cf-challenge') ||
    h.includes('Just a moment')

  if (!isChallenge(html)) return html

  console.log('[fetcher] Challenge page detected, waiting for auto-resolve...')

  // PerimeterX sometimes auto-resolves after running its JS
  for (let i = 0; i < 3; i++) {
    await page.waitForTimeout(5000)
    html = await page.content()
    if (!isChallenge(html)) {
      console.log('[fetcher] Challenge resolved!')
      return html
    }
  }

  return null // Still blocked after waiting
}

export async function initSession(_userAgent?: string): Promise<{ cookie: string } | null> {
  try {
    if (browser) {
      await browser.close().catch(() => {})
      browser = null
      browserContext = null
    }

    // Use system Chrome for authentic TLS fingerprint
    browser = await chromium.launch({
      channel: 'chrome',
      headless: false, // non-headless to avoid headless detection
      args: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--window-position=-9999,-9999', // offscreen so it doesn't interfere
      ],
    })

    browserContext = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
      locale: 'en-US',
      timezoneId: 'America/Los_Angeles',
      extraHTTPHeaders: {
        'sec-ch-ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"macOS"',
      },
    })

    await browserContext.addInitScript(STEALTH_SCRIPTS)

    // Visit homepage — may hit PerimeterX, wait for it
    const page = await browserContext.newPage()
    await page.goto('https://booking.flyfrontier.com/', { waitUntil: 'domcontentloaded', timeout: 45000 })

    const resolved = await waitForChallenge(page)
    if (!resolved) {
      console.error('[fetcher] Could not pass PerimeterX challenge on init')
    }

    await page.waitForTimeout(1000 + Math.random() * 2000)
    await page.close()

    return { cookie: 'playwright-session' }
  } catch (err) {
    console.error('[fetcher] Browser init failed:', err)
    return null
  }
}

export function pickUserAgent(): string {
  return 'playwright'
}

export async function fetchFlightPage(
  origin: string,
  destination: string,
  date: Date,
  _sessionCookie: string,
  _userAgent: string,
): Promise<FetchResult> {
  if (!browserContext) {
    return { ok: false, error: 'Browser not initialized — call initSession first', blocked: false }
  }

  const url = buildSearchUrl(origin, destination, date)
  const page = await browserContext.newPage()

  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 })

    if (!response) {
      return { ok: false, error: 'No response from page', blocked: false }
    }

    if (response.status() === 429) {
      return { ok: false, error: 'Rate limited (429) — aborting', statusCode: 429, blocked: true }
    }

    // Wait for JS to execute
    await page.waitForTimeout(3000 + Math.random() * 2000)

    // Try to resolve any challenge page (403 or otherwise)
    const html = await waitForChallenge(page)

    if (!html) {
      return { ok: false, error: 'Blocked by bot detection (PerimeterX) — could not auto-resolve', statusCode: 403, blocked: true }
    }

    return { ok: true, html }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  } finally {
    await page.close()
  }
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {})
    browser = null
    browserContext = null
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function randomDelay(): Promise<void> {
  const ms = 5000 + Math.random() * 5000
  return sleep(ms)
}
