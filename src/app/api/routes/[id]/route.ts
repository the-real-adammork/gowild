import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await request.json()
  const route = await prisma.route.update({
    where: { id: parseInt(id) },
    data: {
      origin: body.origin?.toUpperCase().trim(),
      destination: body.destination?.toUpperCase().trim(),
      enabled: body.enabled,
      nonStopOnly: body.nonStopOnly,
      maxLayoverMinutes: body.maxLayoverMinutes,
      allowedLayoverAirports: body.allowedLayoverAirports !== undefined
        ? JSON.stringify(body.allowedLayoverAirports)
        : undefined,
      maxPrice: body.maxPrice,
    },
  })
  return NextResponse.json(route)
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await prisma.route.delete({ where: { id: parseInt(id) } })
  return NextResponse.json({ ok: true })
}
