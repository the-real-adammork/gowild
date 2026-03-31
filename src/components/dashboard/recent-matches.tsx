import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface MatchFlight {
  id: number
  departureDate: string
  departureTime: string
  arrivalTime: string
  totalDuration: string
  stops: number
  stopsText: string
  fareTab: string
  price: number
  route: {
    origin: string
    destination: string
  }
}

interface RecentMatchesProps {
  flights: MatchFlight[]
}

export function RecentMatches({ flights }: RecentMatchesProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cheapest Matching Flights</CardTitle>
      </CardHeader>
      <CardContent>
        {flights.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No matches found yet. Configure your routes and run your first scrape from Settings.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Route</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Departure</TableHead>
                <TableHead>Arrival</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Stops</TableHead>
                <TableHead>Fare</TableHead>
                <TableHead className="text-right">Price</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {flights.map((flight) => (
                <TableRow key={flight.id}>
                  <TableCell className="font-medium">
                    {flight.route.origin} → {flight.route.destination}
                  </TableCell>
                  <TableCell>{flight.departureDate}</TableCell>
                  <TableCell>{flight.departureTime}</TableCell>
                  <TableCell>{flight.arrivalTime}</TableCell>
                  <TableCell>{flight.totalDuration}</TableCell>
                  <TableCell>{flight.stopsText}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{flight.fareTab}</Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    ${flight.price.toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}
