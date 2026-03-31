// Raw Frontier API response structure (embedded in HTML as FlightData = '...')
export interface FrontierFlightResponse {
  journeys: FrontierJourney[]
}

export interface FrontierJourney {
  flights: FrontierFlight[] | null
}

export interface FrontierFlight {
  // Fare prices (-1 means unavailable)
  goWildFare: number
  discountDenFare: number
  standardFare: number
  milesFare: number

  // Availability flags
  isGoWildFareEnabled: boolean

  // Seats remaining (null if unavailable)
  goWildFareSeatsRemaining: number | null
  discountDenFareSeatsRemaining: number | null
  standardFareSeatsRemaining: number | null

  stopsText: string // e.g., "1 Stop DEN", "Nonstop"
  duration: string  // e.g., "5 hrs 22 min"
  stopCount: number
  legs: FrontierLeg[]
}

export interface FrontierLeg {
  departureStation: string         // IATA code (e.g., "SFO")
  arrivalStation: string           // IATA code (e.g., "DEN")
  departureDate: string            // ISO datetime (e.g., "2026-04-01T06:00:00")
  arrivalDate: string              // ISO datetime
  departureDateFormatted: string   // e.g., "6:00 AM"
  arrivalDateFormatted: string     // e.g., "9:42 AM"
  flightNumber: number             // e.g., 1230
  carrierCode: string              // e.g., "F9"
  durationFormatted: string        // e.g., "2 hrs 42 min"
}

// Parsed flight ready for database storage
export interface ParsedFlight {
  departureDate: string       // YYYY-MM-DD
  departureTime: string       // e.g., "6:00 AM"
  arrivalTime: string         // e.g., "9:42 AM"
  totalDuration: string       // e.g., "5 hrs 22 min"
  stops: number
  stopsText: string
  segments: ParsedSegment[]
  layoverAirports: string[]
  layoverDurations: number[]  // minutes
  fareTab: string             // "GoWild", "Dollars", "Miles"
  price: number
  priceUnit: string           // "USD" or "miles"
}

export interface ParsedSegment {
  from: string
  to: string
  departTime: string
  arriveTime: string
  flightNo: string
}
