import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

interface StatsCardsProps {
  lastRun: { status: string; completedAt: string | null; matchesFound: number; flightsFound: number } | null
  totalRoutes: number
  matchesToday: number
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

function formatCompletedAt(completedAt: string | null): string {
  if (!completedAt) return "In progress"
  const date = new Date(completedAt)
  return date.toLocaleString()
}

export function StatsCards({ lastRun, totalRoutes, matchesToday }: StatsCardsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader>
          <CardTitle>Last Scrape Status</CardTitle>
        </CardHeader>
        <CardContent>
          {lastRun ? (
            <div className="flex flex-col gap-2">
              <Badge
                className={getStatusBadgeClass(lastRun.status)}
                variant="outline"
              >
                {lastRun.status}
              </Badge>
              <p className="text-xs text-muted-foreground">
                {formatCompletedAt(lastRun.completedAt)}
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No runs yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Routes Monitored</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{totalRoutes}</p>
          <p className="text-xs text-muted-foreground">Active routes</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Matches Today</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{matchesToday}</p>
          <p className="text-xs text-muted-foreground">Flights matching filters</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Last Run Results</CardTitle>
        </CardHeader>
        <CardContent>
          {lastRun ? (
            <div className="flex flex-col gap-1">
              <p className="text-3xl font-bold">{lastRun.matchesFound}</p>
              <p className="text-xs text-muted-foreground">
                Matches from {lastRun.flightsFound} flights found
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No data yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
