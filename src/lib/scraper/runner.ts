import fs from 'fs/promises'
import path from 'path'
import { prisma } from '../db'
import { fetchFlightPage, initSession, pickUserAgent, randomDelay, closeBrowser } from './fetcher'
import { parseFlightHtml, flightDedupKey } from './parser'
import { applyFilters } from './filters'
import type { RouteFilters } from './filters'
import type { ParsedFlight } from './types'
import { formatEmail } from '../email/formatter'
import { sendEmail } from '../email/sender'
import { vpnUp, vpnDown } from './vpn'

let isRunning = false

interface FlightWithRoute extends ParsedFlight {
  origin: string
  destination: string
}

export async function runScraper(): Promise<void> {
  if (isRunning) {
    console.log('[runner] Already running (module guard), skipping.')
    return
  }

  const existingRun = await prisma.scrapeRun.findFirst({
    where: { status: 'running' },
  })
  if (existingRun) {
    console.log(`[runner] Already running (DB guard, run #${existingRun.id}), skipping.`)
    return
  }

  isRunning = true

  const scrapeRun = await prisma.scrapeRun.create({
    data: { status: 'running' },
  })
  const runId = scrapeRun.id
  console.log(`[runner] Started scrape run #${runId}`)

  let totalFetches = 0
  let failedFetches = 0
  let sampleHtml: string | null = null
  const allMatchingFlights: FlightWithRoute[] = []

  try {
    const config = await prisma.searchConfig.findUnique({ where: { id: 1 } })
    if (!config) throw new Error('SearchConfig not found (id=1)')

    const routes = await prisma.route.findMany({ where: { enabled: true } })
    console.log(`[runner] ${routes.length} enabled route(s) found`)

    if (routes.length === 0) {
      await prisma.scrapeRun.update({
        where: { id: runId },
        data: { status: 'success', completedAt: new Date(), routesSearched: 0, datesSearched: 0 },
      })
      return
    }

    // Spin up VPN for a fresh IP
    const vpnSessionId = await vpnUp()
    if (!vpnSessionId) {
      console.warn('[runner] VPN failed to start — proceeding without VPN')
    }

    let fareTabs: string[]
    try {
      fareTabs = JSON.parse(config.fareTabs)
      if (!Array.isArray(fareTabs)) fareTabs = ['GoWild']
    } catch {
      fareTabs = ['GoWild']
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const searchDates: Date[] = []
    const startOffset = config.searchIncludeToday ? 0 : 1
    for (let i = startOffset; i <= config.searchDaysOut; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      searchDates.push(d)
    }
    console.log(`[runner] Searching ${searchDates.length} date(s), fareTabs: ${fareTabs.join(', ')}`)

    // Use consistent UA and session cookie for the entire run
    const userAgent = pickUserAgent()
    const session = await initSession(userAgent)
    let sessionCookie = session?.cookie || ''
    console.log(`[runner] Session initialized: ${sessionCookie ? 'got cookie' : 'no cookie (proceeding anyway)'}`)

    const seenKeys = new Set<string>()
    let blocked = false

    for (const route of routes) {
      if (blocked) break

      const filters: RouteFilters = {
        nonStopOnly: route.nonStopOnly,
        maxLayoverMinutes: route.maxLayoverMinutes ?? null,
        allowedLayoverAirports: (() => {
          try {
            const parsed = JSON.parse(route.allowedLayoverAirports)
            return Array.isArray(parsed) ? parsed : []
          } catch {
            return []
          }
        })(),
        maxPrice: route.maxPrice ?? null,
      }

      for (const date of searchDates) {
        if (blocked) break

        const departureDateStr = date.toISOString().slice(0, 10)
        totalFetches++

        const result = await fetchFlightPage(route.origin, route.destination, date, sessionCookie, userAgent)

        // Abort entire run on block
        if (result.blocked) {
          console.error(`[runner] BLOCKED: ${result.error} — aborting run to protect IP`)
          blocked = true
          failedFetches++
          break
        }

        if (!result.ok || !result.html) {
          console.warn(`[runner] Fetch failed for ${route.origin}->${route.destination} on ${departureDateStr}: ${result.error ?? 'no HTML'}`)
          failedFetches++
          await randomDelay()
          continue
        }

        // Update session cookie if a new one was returned
        if (result.sessionCookie) {
          sessionCookie = result.sessionCookie
        }

        const html = result.html
        if (sampleHtml === null) sampleHtml = html

        let parsedFlights: ParsedFlight[]
        try {
          parsedFlights = parseFlightHtml(html, departureDateStr, fareTabs)
        } catch (err) {
          console.warn(`[runner] Parse failed for ${route.origin}->${route.destination} on ${departureDateStr}:`, err)
          failedFetches++
          await randomDelay()
          continue
        }

        for (const flight of parsedFlights) {
          const matchesFilters = applyFilters(flight, filters)
          const dedupKey = `${route.origin}|${route.destination}|${flightDedupKey(flight)}`
          const isNew = !seenKeys.has(dedupKey)
          if (isNew) seenKeys.add(dedupKey)

          await prisma.flight.create({
            data: {
              routeId: route.id,
              scrapeRunId: runId,
              departureDate: flight.departureDate,
              departureTime: flight.departureTime,
              arrivalTime: flight.arrivalTime,
              totalDuration: flight.totalDuration,
              stops: flight.stops,
              stopsText: flight.stopsText,
              segments: JSON.stringify(flight.segments),
              layoverAirports: JSON.stringify(flight.layoverAirports),
              layoverDurations: JSON.stringify(flight.layoverDurations),
              fareTab: flight.fareTab,
              price: flight.price,
              priceUnit: flight.priceUnit,
              matchesFilters,
            },
          })

          if (matchesFilters && isNew) {
            allMatchingFlights.push({ ...flight, origin: route.origin, destination: route.destination })
          }
        }

        console.log(`[runner] ${route.origin}->${route.destination} ${departureDateStr}: ${parsedFlights.length} flights`)
        await randomDelay()
      }
    }

    // Save sample HTML
    if (sampleHtml !== null) {
      const rawResponsesDir = path.join(process.cwd(), 'data', 'raw-responses')
      await fs.mkdir(rawResponsesDir, { recursive: true })
      await fs.writeFile(path.join(rawResponsesDir, `run-${runId}.html`), sampleHtml, 'utf-8')
      console.log(`[runner] Saved sample HTML to data/raw-responses/run-${runId}.html`)
    }

    // Send email
    if (config.emailEnabled && allMatchingFlights.length > 0 && config.emailTo) {
      try {
        const baseUrl = process.env.BASE_URL ?? 'http://localhost:3000'
        const { subject, body } = formatEmail({
          flights: allMatchingFlights,
          routesSearched: routes.length,
          datesSearched: totalFetches,
          baseUrl,
        })
        await sendEmail(config.emailTo, subject, body)
        console.log(`[runner] Email sent to ${config.emailTo} with ${allMatchingFlights.length} match(es)`)
      } catch (err) {
        console.error('[runner] Email send failed:', err)
      }
    }

    // Final status
    const flightsFoundTotal = await prisma.flight.count({ where: { scrapeRunId: runId } })
    const matchesFound = allMatchingFlights.length

    let status: string
    if (blocked) {
      status = 'failed'
    } else if (failedFetches === totalFetches && totalFetches > 0) {
      status = 'failed'
    } else if (failedFetches > 0) {
      status = 'partial'
    } else if (flightsFoundTotal === 0) {
      status = 'warning'
    } else {
      status = 'success'
    }

    await prisma.scrapeRun.update({
      where: { id: runId },
      data: {
        status,
        completedAt: new Date(),
        routesSearched: routes.length,
        datesSearched: totalFetches,
        flightsFound: flightsFoundTotal,
        matchesFound,
        error: blocked ? 'Blocked by bot detection (403) — run aborted' : null,
      },
    })

    console.log(`[runner] Run #${runId} complete. Status: ${status}. Flights: ${flightsFoundTotal}, Matches: ${matchesFound}, Failed: ${failedFetches}/${totalFetches}`)
  } catch (err) {
    console.error(`[runner] Run #${runId} fatal error:`, err)
    await prisma.scrapeRun.update({
      where: { id: runId },
      data: { status: 'failed', completedAt: new Date(), error: err instanceof Error ? err.message : String(err) },
    })
  } finally {
    // Close the browser to free resources
    await closeBrowser()

    // Tear down VPN
    await vpnDown()

    isRunning = false

    // Cleanup old data (90 days)
    try {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - 90)
      const oldRuns = await prisma.scrapeRun.findMany({ where: { startedAt: { lt: cutoff } }, select: { id: true } })
      if (oldRuns.length > 0) {
        const oldRunIds = oldRuns.map((r) => r.id)
        await prisma.flight.deleteMany({ where: { scrapeRunId: { in: oldRunIds } } })
        await prisma.scrapeRun.deleteMany({ where: { id: { in: oldRunIds } } })
        console.log(`[runner] Cleanup: deleted ${oldRuns.length} run(s) older than 90 days`)
      }
    } catch (err) {
      console.error('[runner] Cleanup error:', err)
    }
  }
}
