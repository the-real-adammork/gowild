import { prisma } from '@/lib/db'
import { StatsCards } from '@/components/dashboard/stats-cards'
import { RecentMatches } from '@/components/dashboard/recent-matches'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const lastRun = await prisma.scrapeRun.findFirst({
    where: { status: { in: ['success', 'partial'] } },
    orderBy: { startedAt: 'desc' },
  })

  const latestRunFilter = lastRun ? { scrapeRunId: lastRun.id } : { id: -1 }

  const [totalRoutes, matchesToday, cheapestFlights] = await Promise.all([
    prisma.route.count({ where: { enabled: true } }),
    prisma.flight.count({
      where: { ...latestRunFilter, matchesFilters: true },
    }),
    prisma.flight.findMany({
      where: { ...latestRunFilter, matchesFilters: true },
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
