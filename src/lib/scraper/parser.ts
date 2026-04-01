import type {
  FrontierFlightResponse,
  FrontierFlight,
  ParsedFlight,
  ParsedSegment,
} from './types'

/**
 * Extracts the Frontier flight data from CrawlByte's JSON response.
 */
function extractFlightData(data: string): FrontierFlightResponse {
  const parsed = JSON.parse(data)

  if (parsed.results?.journeys) {
    return { journeys: parsed.results.journeys }
  }

  if (parsed.journeys && Array.isArray(parsed.journeys)) {
    return parsed as FrontierFlightResponse
  }

  throw new Error('No flight data found in response')
}

/**
 * Parses Frontier Airlines flight data and returns ParsedFlight objects.
 */
export function parseFlightData(
  data: string,
  departureDate: string,
  fareTabs: string[] = ['GoWild'],
): ParsedFlight[] {
  const flightData = extractFlightData(data)
  const results: ParsedFlight[] = []

  for (const journey of flightData.journeys) {
    if (!journey.flights) continue

    for (const flight of journey.flights) {
      if (fareTabs.includes('GoWild') && flight.isGoWildFareEnabled && flight.goWildFare > 0) {
        results.push(mapFlight(flight, departureDate, 'GoWild', flight.goWildFare, 'USD'))
      }

      if (fareTabs.includes('Dollars') && flight.discountDenFare > 0) {
        results.push(mapFlight(flight, departureDate, 'Dollars', flight.discountDenFare, 'USD'))
      }

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
  const stops = Math.max(0, legs.length - 1)

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
    stops,
    stopsText: flight.stopsText ?? (stops === 0 ? 'Nonstop' : `${stops} Stop`),
    segments,
    layoverAirports,
    layoverDurations,
    fareTab,
    price,
    priceUnit,
  }
}

export function flightDedupKey(flight: ParsedFlight): string {
  const flightNos = flight.segments.map((s) => s.flightNo).sort().join('|')
  return `${flight.departureDate}:${flight.fareTab}:${flightNos}`
}
