"use client"

import { useCallback, useEffect, useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ResultsFilters } from "./results-filters"

interface Route {
  id: number
  origin: string
  destination: string
}

interface FlightSegment {
  flightNumber: string
  origin: string
  destination: string
  departureTime: string
  arrivalTime: string
}

interface Flight {
  id: number
  routeId: number
  departureDate: string
  departureTime: string
  arrivalTime: string
  totalDuration: string
  stops: number
  stopsText: string
  fareTab: string
  price: number
  segments: string
  route: Route
}

interface ResultsResponse {
  flights: Flight[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

interface Filters {
  routeId: string
  fareTab: string
  nonStopOnly: boolean
  matchesOnly: boolean
}

function getFareTabBadgeClass(fareTab: string): string {
  switch (fareTab) {
    case "GoWild":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    case "Dollars":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
    case "Miles":
      return "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400"
    default:
      return ""
  }
}

function formatPrice(fareTab: string, price: number): string {
  if (fareTab === "Miles") return `${price.toLocaleString()} mi`
  return `$${price.toFixed(2)}`
}

export function ResultsTable() {
  const [routes, setRoutes] = useState<Route[]>([])
  const [data, setData] = useState<ResultsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set())
  const [filters, setFilters] = useState<Filters>({
    routeId: "",
    fareTab: "",
    nonStopOnly: false,
    matchesOnly: true,
  })

  useEffect(() => {
    fetch("/api/routes")
      .then((res) => res.json())
      .then((data: Route[]) => setRoutes(data))
      .catch(console.error)
  }, [])

  const fetchResults = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams()
    params.set("page", String(page))
    params.set("matchesOnly", String(filters.matchesOnly))
    if (filters.routeId) params.set("routeId", filters.routeId)
    if (filters.fareTab) params.set("fareTab", filters.fareTab)
    if (filters.nonStopOnly) params.set("nonStopOnly", "true")

    fetch(`/api/results?${params.toString()}`)
      .then((res) => res.json())
      .then((json: ResultsResponse) => {
        setData(json)
        setLoading(false)
      })
      .catch((err) => {
        console.error(err)
        setLoading(false)
      })
  }, [page, filters])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  function handleFiltersChange(newFilters: Filters) {
    setFilters(newFilters)
    setPage(1)
    setExpandedRows(new Set())
  }

  function toggleRow(flightId: number) {
    setExpandedRows((prev) => {
      const next = new Set(prev)
      if (next.has(flightId)) {
        next.delete(flightId)
      } else {
        next.add(flightId)
      }
      return next
    })
  }

  function parseSegments(segmentsJson: string): FlightSegment[] {
    try {
      return JSON.parse(segmentsJson) as FlightSegment[]
    } catch {
      return []
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Flight Results</CardTitle>
        <div className="mt-2">
          <ResultsFilters
            routes={routes}
            filters={filters}
            onChange={handleFiltersChange}
          />
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Loading...</p>
        ) : !data || data.flights.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No flights found. Try adjusting your filters.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
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
                {data.flights.map((flight) => {
                  const isExpanded = expandedRows.has(flight.id)
                  const segments = parseSegments(flight.segments)
                  const hasSegments = flight.stops > 0 && segments.length > 0

                  return (
                    <>
                      <TableRow key={`flight-${flight.id}`}>
                        <TableCell>
                          {hasSegments ? (
                            <button
                              onClick={() => toggleRow(flight.id)}
                              className="flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                              aria-label={isExpanded ? "Collapse segments" : "Expand segments"}
                            >
                              {isExpanded ? (
                                <ChevronDown className="size-4" />
                              ) : (
                                <ChevronRight className="size-4" />
                              )}
                            </button>
                          ) : null}
                        </TableCell>
                        <TableCell className="font-medium">
                          {flight.route.origin} → {flight.route.destination}
                        </TableCell>
                        <TableCell>{flight.departureDate}</TableCell>
                        <TableCell>{flight.departureTime}</TableCell>
                        <TableCell>{flight.arrivalTime}</TableCell>
                        <TableCell>{flight.totalDuration}</TableCell>
                        <TableCell>{flight.stopsText}</TableCell>
                        <TableCell>
                          <Badge
                            variant="secondary"
                            className={getFareTabBadgeClass(flight.fareTab)}
                          >
                            {flight.fareTab}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatPrice(flight.fareTab, flight.price)}
                        </TableCell>
                      </TableRow>
                      {isExpanded && hasSegments && (
                        <TableRow key={`segments-${flight.id}`} className="bg-muted/30 hover:bg-muted/30">
                          <TableCell />
                          <TableCell colSpan={8} className="py-2">
                            <div className="flex flex-col gap-1 pl-2">
                              <p className="text-xs font-medium text-muted-foreground mb-1">
                                Connecting flights
                              </p>
                              {segments.map((segment, index) => (
                                <div
                                  key={`${flight.id}-segment-${index}`}
                                  className="flex items-center gap-3 text-xs text-muted-foreground"
                                >
                                  <span className="font-mono font-medium text-foreground">
                                    {segment.flightNumber}
                                  </span>
                                  <span>
                                    {segment.origin} → {segment.destination}
                                  </span>
                                  <span>
                                    {segment.departureTime} – {segment.arrivalTime}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  )
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
              <span>
                {data.total} flight{data.total !== 1 ? "s" : ""} found
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Prev
                </Button>
                <span>
                  Page {data.page} of {data.totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  disabled={page >= data.totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
