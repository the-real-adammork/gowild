import { describe, it, expect } from 'vitest'
import { applyFilters } from '@/lib/scraper/filters'
import type { ParsedFlight } from '@/lib/scraper/types'

function makeFlight(overrides: Partial<ParsedFlight> = {}): ParsedFlight {
  return {
    departureDate: '2026-04-02', departureTime: '6:15 AM', arrivalTime: '9:45 AM',
    totalDuration: '2 hrs 30 min', stops: 0, stopsText: 'Nonstop',
    segments: [{ from: 'SFO', to: 'SLC', departTime: '6:15 AM', arriveTime: '9:45 AM', flightNo: 'F9 1234' }],
    layoverAirports: [], layoverDurations: [],
    fareTab: 'GoWild', price: 31, priceUnit: 'USD',
    ...overrides,
  }
}

const defaultFilters = {
  nonStopOnly: false,
  maxLayoverMinutes: null as number | null,
  allowedLayoverAirports: [] as string[],
  maxPrice: null as number | null,
}

describe('applyFilters', () => {
  it('passes a nonstop flight with no filters', () => {
    expect(applyFilters(makeFlight(), defaultFilters)).toBe(true)
  })
  it('filters out connecting flights when nonStopOnly is true', () => {
    expect(applyFilters(makeFlight({ stops: 1, layoverAirports: ['DEN'] }), { ...defaultFilters, nonStopOnly: true })).toBe(false)
  })
  it('passes nonstop flights when nonStopOnly is true', () => {
    expect(applyFilters(makeFlight({ stops: 0 }), { ...defaultFilters, nonStopOnly: true })).toBe(true)
  })
  it('filters out flights above maxPrice', () => {
    expect(applyFilters(makeFlight({ price: 50 }), { ...defaultFilters, maxPrice: 40 })).toBe(false)
  })
  it('passes flights at exactly maxPrice', () => {
    expect(applyFilters(makeFlight({ price: 40 }), { ...defaultFilters, maxPrice: 40 })).toBe(true)
  })
  it('filters out flights with disallowed layover airports', () => {
    expect(applyFilters(makeFlight({ stops: 1, layoverAirports: ['MCO'], layoverDurations: [60] }), { ...defaultFilters, allowedLayoverAirports: ['DEN', 'LAS'] })).toBe(false)
  })
  it('passes flights with allowed layover airports', () => {
    expect(applyFilters(makeFlight({ stops: 1, layoverAirports: ['DEN'], layoverDurations: [60] }), { ...defaultFilters, allowedLayoverAirports: ['DEN', 'LAS'] })).toBe(true)
  })
  it('treats empty allowedLayoverAirports as "any airport OK"', () => {
    expect(applyFilters(makeFlight({ stops: 1, layoverAirports: ['MCO'], layoverDurations: [60] }), { ...defaultFilters, allowedLayoverAirports: [] })).toBe(true)
  })
  it('filters out flights exceeding maxLayoverMinutes', () => {
    expect(applyFilters(makeFlight({ stops: 1, layoverAirports: ['DEN'], layoverDurations: [180] }), { ...defaultFilters, maxLayoverMinutes: 120 })).toBe(false)
  })
  it('passes flights at exactly maxLayoverMinutes', () => {
    expect(applyFilters(makeFlight({ stops: 1, layoverAirports: ['DEN'], layoverDurations: [120] }), { ...defaultFilters, maxLayoverMinutes: 120 })).toBe(true)
  })
  it('checks ALL layovers against max duration', () => {
    expect(applyFilters(makeFlight({ stops: 2, layoverAirports: ['DEN', 'LAS'], layoverDurations: [60, 180] }), { ...defaultFilters, maxLayoverMinutes: 120 })).toBe(false)
  })
})
