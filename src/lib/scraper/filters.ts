import type { ParsedFlight } from './types'

export interface RouteFilters {
  nonStopOnly: boolean
  maxLayoverMinutes: number | null
  allowedLayoverAirports: string[]
  maxPrice: number | null
}

export function applyFilters(flight: ParsedFlight, filters: RouteFilters): boolean {
  if (filters.nonStopOnly && flight.stops > 0) return false
  if (filters.maxPrice !== null && flight.price > filters.maxPrice) return false
  if (filters.allowedLayoverAirports.length > 0 && flight.stops > 0) {
    const allowed = new Set(filters.allowedLayoverAirports)
    for (const airport of flight.layoverAirports) {
      if (!allowed.has(airport)) return false
    }
  }
  if (filters.maxLayoverMinutes !== null && flight.stops > 0) {
    for (const duration of flight.layoverDurations) {
      if (duration > filters.maxLayoverMinutes) return false
    }
  }
  return true
}
