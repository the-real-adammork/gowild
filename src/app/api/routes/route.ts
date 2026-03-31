import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const routes = await prisma.route.findMany({ orderBy: { createdAt: 'desc' } })
  return NextResponse.json(routes)
}

export async function POST(request: NextRequest) {
  const body = await request.json()
  const route = await prisma.route.create({
    data: {
      origin: body.origin.toUpperCase().trim(),
      destination: body.destination.toUpperCase().trim(),
      enabled: body.enabled ?? true,
      nonStopOnly: body.nonStopOnly ?? false,
      maxLayoverMinutes: body.maxLayoverMinutes ?? null,
      allowedLayoverAirports: JSON.stringify(body.allowedLayoverAirports ?? []),
      maxPrice: body.maxPrice ?? null,
    },
  })
  return NextResponse.json(route, { status: 201 })
}
