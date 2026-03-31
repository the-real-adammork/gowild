import { prisma } from '@/lib/db'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentMatches } from '@/components/dashboard/recent-matches'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const [lastRun, totalRoutes, matchesToday, cheapestFlights] = await Promise.all([
    prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } }),
    prisma.route.count({ where: { enabled: true } }),
    prisma.flight.count({
      where: {
        matchesFilters: true,
        scrapedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    }),
    prisma.flight.findMany({
      where: { matchesFilters: true },
      include: { route: true },
      orderBy: { price: 'asc' },
      take: 10,
    }),
  ])

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Dashboard</h2>
      <StatsCards
        lastRun={lastRun ? {
          status: lastRun.status,
          completedAt: lastRun.completedAt?.toISOString() ?? null,
          matchesFound: lastRun.matchesFound,
          flightsFound: lastRun.flightsFound,
        } : null}
        totalRoutes={totalRoutes}
        matchesToday={matchesToday}
      />
      <RecentMatches flights={cheapestFlights.map((f) => ({
        ...f,
        route: { origin: f.route.origin, destination: f.route.destination },
      }))} />
    </div>
  )
}
