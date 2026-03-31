import { format, parse } from 'date-fns'

interface EmailFlight {
  origin: string
  destination: string
  departureDate: string
  departureTime: string
  arrivalTime: string
  totalDuration: string
  stops: number
  stopsText: string
  segments: Array<{ from: string; to: string; departTime: string; arriveTime: string; flightNo: string }>
  fareTab: string
  price: number
}

interface FormatEmailInput {
  flights: EmailFlight[]
  routesSearched: number
  datesSearched: number
  baseUrl: string
}

interface FormatEmailOutput {
  subject: string
  body: string
}

export function formatEmail(input: FormatEmailInput): FormatEmailOutput {
  const sorted = [...input.flights].sort((a, b) => a.price - b.price)
  const cheapest = sorted[0]
  const subject = `GoWild Alert: ${sorted.length} flight${sorted.length === 1 ? '' : 's'} found — ${cheapest.origin}->${cheapest.destination} from $${cheapest.price}`
  const today = format(new Date(), 'MMM d, yyyy')
  const lines: string[] = []
  lines.push('==================================')
  lines.push(` GoWild Flight Tracker — ${today}`)
  lines.push('==================================')
  lines.push('')
  for (const flight of sorted) {
    const dateObj = parse(flight.departureDate, 'yyyy-MM-dd', new Date())
    const dateStr = format(dateObj, 'MMM d')
    lines.push(`${flight.origin} -> ${flight.destination}  |  ${dateStr}  |  $${flight.price} ${flight.fareTab}`)
    if (flight.stops === 0) {
      lines.push(`  Nonstop  |  ${flight.segments[0].flightNo}`)
      lines.push(`  Departs ${flight.departureTime} -> Arrives ${flight.arrivalTime} (${flight.totalDuration})`)
    } else {
      lines.push(`  ${flight.stopsText}`)
      for (const seg of flight.segments) {
        lines.push(`  ${seg.flightNo}: ${seg.from} ${seg.departTime} -> ${seg.to} ${seg.arriveTime}`)
      }
      lines.push(`  Total: ${flight.totalDuration}`)
    }
    lines.push('')
  }
  lines.push('==================================')
  lines.push(`${input.routesSearched} routes searched | ${input.datesSearched} searches`)
  lines.push(`View all results: ${input.baseUrl}/results`)
  return { subject, body: lines.join('\n') }
}
