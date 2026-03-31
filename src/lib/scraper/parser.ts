import * as cheerio from 'cheerio'
import { decode } from 'html-entities'
import type {
  FrontierFlightResponse,
  FrontierFlight,
  ParsedFlight,
  ParsedSegment,
} from './types'

/**
 * Extracts the FlightData JSON from Frontier's HTML response.
 * The data is embedded as: FlightData = '{...HTML-encoded JSON...}';
 */
function extractFlightData(html: string): FrontierFlightResponse {
  const $ = cheerio.load(html)
  const scriptTags = $('script[type="text/javascript"]')

  // Strategy 1: Look for FlightData = '...' pattern
  for (let i = 0; i < scriptTags.length; i++) {
    const raw = $(scriptTags[i]).html() ?? ''
    const match = raw.match(/FlightData\s*=\s*'([^']+)'/)
    if (match) {
      const decoded = decode(match[1])
      const parsed = JSON.parse(decoded)
      if (parsed.journeys && Array.isArray(parsed.journeys)) {
        return parsed as FrontierFlightResponse
      }
    }
  }

  // Strategy 2: Fallback — try first { to last } in each script tag
  for (let i = 0; i < scriptTags.length; i++) {
    const raw = $(scriptTags[i]).html() ?? ''
    const decoded = decode(raw)
    const startIdx = decoded.indexOf('{')
    const endIdx = decoded.lastIndexOf('}')
    if (startIdx === -1 || endIdx === -1 || endIdx <= startIdx) continue
    try {
      const parsed = JSON.parse(decoded.substring(startIdx, endIdx + 1))
      if (parsed.journeys && Array.isArray(parsed.journeys)) {
        return parsed as FrontierFlightResponse
      }
    } catch {
      continue
    }
  }

  throw new Error('No flight data found in HTML')
}

/**
 * Parses Frontier Airlines flight HTML and returns ParsedFlight objects.
 */
export function parseFlightHtml(
  html: string,
  departureDate: string,
  fareTabs: string[] = ['GoWild'],
): ParsedFlight[] {
  const data = extractFlightData(html)
  const results: ParsedFlight[] = []

  for (const journey of data.journeys) {
    if (!journey.flights) continue

    for (const flight of journey.flights) {
      // GoWild fares
      if (fareTabs.includes('GoWild') && flight.isGoWildFareEnabled && flight.goWildFare > 0) {
        results.push(mapFlight(flight, departureDate, 'GoWild', flight.goWildFare, 'USD'))
      }

      // Discount Den fares
      if (fareTabs.includes('Dollars') && flight.discountDenFare > 0) {
        results.push(mapFlight(flight, departureDate, 'Dollars', flight.discountDenFare, 'USD'))
      }

      // Miles fares
      if (fareTabs.includes('Miles') && flight.milesFare > 0) {
        results.push(mapFlight(flight, departureDate, 'Miles', flight.milesFare, 'miles'))
      }
    }
  }

  return results
}

function mapFlight(
  flight: FrontierFlight,
  departureDate: string,
  fareTab: string,
  price: number,
  priceUnit: string,
): ParsedFlight {
  const legs = flight.legs
  const firstLeg = legs[0]
  const lastLeg = legs[legs.length - 1]

  const segments: ParsedSegment[] = legs.map((leg) => ({
    from: leg.departureStation,
    to: leg.arrivalStation,
    departTime: leg.departureDateFormatted,
    arriveTime: leg.arrivalDateFormatted,
    flightNo: `${leg.carrierCode} ${leg.flightNumber}`,
  }))

  const layoverAirports: string[] = []
  const layoverDurations: number[] = []

  for (let i = 0; i < legs.length - 1; i++) {
    const arriveTime = new Date(legs[i].arrivalDate).getTime()
    const departTime = new Date(legs[i + 1].departureDate).getTime()
    layoverAirports.push(legs[i].arrivalStation)
    layoverDurations.push(Math.round((departTime - arriveTime) / 60000))
  }

  return {
    departureDate,
    departureTime: firstLeg.departureDateFormatted,
    arrivalTime: lastLeg.arrivalDateFormatted,
    totalDuration: flight.duration,
    stops: Math.max(0, legs.length - 1),
    stopsText: flight.stopsText,
    segments,
    layoverAirports,
    layoverDurations,
    fareTab,
    price,
    priceUnit,
  }
}

/**
 * Dedup key for within-run deduplication.
 */
export function flightDedupKey(flight: ParsedFlight): string {
  const flightNos = flight.segments.map((s) => s.flightNo).sort().join('|')
  return `${flight.departureDate}:${flight.fareTab}:${flightNos}`
}
