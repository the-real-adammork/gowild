import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const page = parseInt(searchParams.get('page') || '1')
  const pageSize = 50
  const matchesOnly = searchParams.get('matchesOnly') !== 'false'
  const routeId = searchParams.get('routeId')
  const fareTab = searchParams.get('fareTab')
  const nonStopOnly = searchParams.get('nonStopOnly') === 'true'
  const sortBy = searchParams.get('sortBy') || 'price'
  const sortOrder = (searchParams.get('sortOrder') || 'asc') as 'asc' | 'desc'

  // Only show flights from the latest successful/partial run
  const latestRun = await prisma.scrapeRun.findFirst({
    where: { status: { in: ['success', 'partial'] } },
    orderBy: { startedAt: 'desc' },
    select: { id: true },
  })

  if (!latestRun) {
    return NextResponse.json({ flights: [], total: 0, page, pageSize, totalPages: 0 })
  }

  const where: Record<string, unknown> = { scrapeRunId: latestRun.id }
  if (matchesOnly) where.matchesFilters = true
  if (routeId) where.routeId = parseInt(routeId)
  if (fareTab) where.fareTab = fareTab
  if (nonStopOnly) where.stops = 0

  const [flights, total] = await Promise.all([
    prisma.flight.findMany({
      where,
      include: { route: true },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.flight.count({ where }),
  ])

  return NextResponse.json({
    flights, total, page, pageSize,
    totalPages: Math.ceil(total / pageSize),
  })
}
