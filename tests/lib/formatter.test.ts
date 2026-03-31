import { describe, it, expect } from 'vitest'
import { formatEmail } from '@/lib/email/formatter'

describe('formatEmail', () => {
  it('formats a nonstop flight correctly', () => {
    const result = formatEmail({
      flights: [
        {
          origin: 'SFO', destination: 'SLC', departureDate: '2026-04-02',
          departureTime: '6:15 AM', arrivalTime: '9:45 AM', totalDuration: '2 hrs 30 min',
          stops: 0, stopsText: 'Nonstop',
          segments: [{ from: 'SFO', to: 'SLC', departTime: '6:15 AM', arriveTime: '9:45 AM', flightNo: 'F9 1234' }],
          fareTab: 'GoWild', price: 31,
        },
      ],
      routesSearched: 2, datesSearched: 14, baseUrl: 'http://localhost:3000',
    })
    expect(result.subject).toContain('1 flight found')
    expect(result.subject).toContain('$31')
    expect(result.body).toContain('SFO -> SLC')
    expect(result.body).toContain('$31 GoWild')
    expect(result.body).toContain('Nonstop')
    expect(result.body).toContain('F9 1234')
    expect(result.body).toContain('6:15 AM')
    expect(result.body).toContain('2 routes searched')
  })

  it('formats connecting flights with layover details', () => {
    const result = formatEmail({
      flights: [
        {
          origin: 'SFO', destination: 'SLC', departureDate: '2026-04-03',
          departureTime: '9:04 PM', arrivalTime: '3:20 AM', totalDuration: '6 hrs 16 min',
          stops: 1, stopsText: '1 Stop DEN',
          segments: [
            { from: 'SFO', to: 'DEN', departTime: '9:04 PM', arriveTime: '12:37 AM', flightNo: 'F9 5678' },
            { from: 'DEN', to: 'SLC', departTime: '1:52 AM', arriveTime: '3:20 AM', flightNo: 'F9 9012' },
          ],
          fareTab: 'GoWild', price: 31,
        },
      ],
      routesSearched: 1, datesSearched: 7, baseUrl: 'http://localhost:3000',
    })
    expect(result.body).toContain('1 Stop')
    expect(result.body).toContain('F9 5678')
    expect(result.body).toContain('F9 9012')
  })

  it('sorts flights by price ascending', () => {
    const result = formatEmail({
      flights: [
        { origin: 'SLC', destination: 'SFO', departureDate: '2026-04-01',
          departureTime: '2:10 PM', arrivalTime: '3:45 PM', totalDuration: '2 hrs 35 min',
          stops: 0, stopsText: 'Nonstop',
          segments: [{ from: 'SLC', to: 'SFO', departTime: '2:10 PM', arriveTime: '3:45 PM', flightNo: 'F9 3456' }],
          fareTab: 'Dollars', price: 49 },
        { origin: 'SFO', destination: 'SLC', departureDate: '2026-04-02',
          departureTime: '6:15 AM', arrivalTime: '9:45 AM', totalDuration: '2 hrs 30 min',
          stops: 0, stopsText: 'Nonstop',
          segments: [{ from: 'SFO', to: 'SLC', departTime: '6:15 AM', arriveTime: '9:45 AM', flightNo: 'F9 1234' }],
          fareTab: 'GoWild', price: 31 },
      ],
      routesSearched: 2, datesSearched: 14, baseUrl: 'http://localhost:3000',
    })
    const lines = result.body.split('\n')
    const firstPrice = lines.findIndex((l) => l.includes('$31'))
    const secondPrice = lines.findIndex((l) => l.includes('$49'))
    expect(firstPrice).toBeLessThan(secondPrice)
  })
})
