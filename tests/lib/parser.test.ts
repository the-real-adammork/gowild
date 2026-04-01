import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseFlightData } from '@/lib/scraper/parser'

const fixturesDir = join(__dirname, '..', 'fixtures')
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8')
}

describe('parseFlightData', () => {
  it('parses nonstop GoWild flights', () => {
    const data = loadFixture('frontier-response-nonstop.json')
    const flights = parseFlightData(data, '2026-04-02')
    expect(flights).toHaveLength(2)
    expect(flights[0]).toMatchObject({
      departureDate: '2026-04-02',
      departureTime: '6:15 AM',
      arrivalTime: '9:45 AM',
      totalDuration: '2 hrs 30 min',
      stops: 0, stopsText: 'Nonstop',
      fareTab: 'GoWild', price: 31.00, priceUnit: 'USD',
      layoverAirports: [], layoverDurations: [],
    })
    expect(flights[0].segments).toHaveLength(1)
    expect(flights[0].segments[0]).toMatchObject({ from: 'SFO', to: 'SLC', flightNo: 'F9 1234' })
  })

  it('parses connecting flights with layover details', () => {
    const data = loadFixture('frontier-response-connecting.json')
    const flights = parseFlightData(data, '2026-04-03')
    expect(flights).toHaveLength(2)
    expect(flights[0].stops).toBe(1)
    expect(flights[0].layoverAirports).toEqual(['DEN'])
    expect(flights[0].segments).toHaveLength(2)
    expect(flights[0].segments[0]).toMatchObject({ from: 'SFO', to: 'DEN', flightNo: 'F9 2001' })
    expect(flights[0].segments[1]).toMatchObject({ from: 'DEN', to: 'SLC', flightNo: 'F9 2002' })
    expect(flights[0].layoverDurations[0]).toBe(75)
    expect(flights[1].layoverAirports).toEqual(['LAS'])
  })

  it('returns empty array when no GoWild fares available', () => {
    const data = loadFixture('frontier-response-no-gowild.json')
    expect(parseFlightData(data, '2026-04-02')).toHaveLength(0)
  })

  it('throws on invalid JSON', () => {
    expect(() => parseFlightData('not json', '2026-04-02')).toThrow()
  })

  it('handles null flights array in journey', () => {
    const data = JSON.stringify({ results: { journeys: [{ flights: null }] } })
    expect(parseFlightData(data, '2026-04-02')).toHaveLength(0)
  })
})
