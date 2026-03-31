"use client"

import { useEffect, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface ScrapeRun {
  id: number
  startedAt: string
  completedAt: string | null
  status: string
  routesSearched: number
  flightsFound: number
  matchesFound: number
  error: string | null
}

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case "success":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
    case "warning":
      return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400"
    case "partial":
      return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400"
    case "failed":
      return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
    case "running":
      return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
    default:
      return "bg-secondary text-secondary-foreground"
  }
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString()
}

export function ScrapeHistory() {
  const [runs, setRuns] = useState<ScrapeRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/scrape")
      .then((res) => res.json())
      .then((data) => {
        setRuns(data?.recentRuns ?? [])
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Scrape History</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : runs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No scrape runs yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Routes</TableHead>
                <TableHead>Flights</TableHead>
                <TableHead>Matches</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>{formatTime(run.startedAt)}</TableCell>
                  <TableCell>
                    <Badge
                      className={getStatusBadgeClass(run.status)}
                      variant="outline"
                    >
                      {run.status}
                    </Badge>
                  </TableCell>
                  <TableCell>{run.routesSearched}</TableCell>
                  <TableCell>{run.flightsFound}</TableCell>
                  <TableCell>{run.matchesFound}</TableCell>
                  <TableCell className="max-w-xs">
                    {run.error ? (
                      <span
                        className="block truncate text-muted-foreground"
                        title={run.error}
                      >
                        {run.error}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
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
