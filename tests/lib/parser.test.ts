import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { parseFlightHtml } from '@/lib/scraper/parser'

const fixturesDir = join(__dirname, '..', 'fixtures')
function loadFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), 'utf-8')
}

describe('parseFlightHtml', () => {
  it('parses nonstop GoWild flights', () => {
    const html = loadFixture('frontier-response-nonstop.html')
    const flights = parseFlightHtml(html, '2026-04-02')
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
    const html = loadFixture('frontier-response-connecting.html')
    const flights = parseFlightHtml(html, '2026-04-03')
    expect(flights).toHaveLength(2)
    expect(flights[0].stops).toBe(1)
    expect(flights[0].layoverAirports).toEqual(['DEN'])
    expect(flights[0].segments).toHaveLength(2)
    expect(flights[0].segments[0]).toMatchObject({ from: 'SFO', to: 'DEN', flightNo: 'F9 2001' })
    expect(flights[0].segments[1]).toMatchObject({ from: 'DEN', to: 'SLC', flightNo: 'F9 2002' })
    // Layover: 1:52AM - 12:37AM = 75 minutes
    expect(flights[0].layoverDurations[0]).toBe(75)
    expect(flights[1].layoverAirports).toEqual(['LAS'])
  })

  it('returns empty array when no GoWild fares available', () => {
    const html = loadFixture('frontier-response-no-gowild.html')
    expect(parseFlightHtml(html, '2026-04-02')).toHaveLength(0)
  })

  it('throws on invalid HTML with no script tag', () => {
    expect(() => parseFlightHtml('<html><body></body></html>', '2026-04-02')).toThrow()
  })

  it('handles null flights array in journey', () => {
    const html = `<!DOCTYPE html><html><body><script type="text/javascript">
    FlightData = '{"journeys":[{"flights":null}]}';
    </script></body></html>`
    expect(parseFlightHtml(html, '2026-04-02')).toHaveLength(0)
  })

  it('falls back to var = {...} format if FlightData not found', () => {
    const html = `<!DOCTYPE html><html><body>
      <script type="text/javascript">var analytics = {"page":"flight"};</script>
      <script type="text/javascript">var defined = {"journeys":[{"flights":[{"isGoWildFareEnabled":true,"goWildFare":31.00,"discountDenFare":89,"standardFare":109,"milesFare":0,"goWildFareSeatsRemaining":5,"discountDenFareSeatsRemaining":null,"standardFareSeatsRemaining":null,"stopCount":0,"stopsText":"Nonstop","duration":"2 hrs 30 min","legs":[{"departureStation":"SFO","arrivalStation":"SLC","departureDate":"2026-04-02T06:15:00","arrivalDate":"2026-04-02T08:45:00","departureDateFormatted":"6:15 AM","arrivalDateFormatted":"9:45 AM","flightNumber":1234,"carrierCode":"F9","durationFormatted":"2 hrs 30 min"}]}]}]};</script>
      </body></html>`
    const flights = parseFlightHtml(html, '2026-04-02')
    expect(flights).toHaveLength(1)
    expect(flights[0].price).toBe(31)
  })
})
