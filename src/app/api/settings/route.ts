import { prisma } from '@/lib/db'
import { NextRequest, NextResponse } from 'next/server'
import { initScheduler } from '@/lib/scheduler'

export async function GET() {
  const config = await prisma.searchConfig.findUnique({ where: { id: 1 } })
  return NextResponse.json(config)
}

export async function PUT(request: NextRequest) {
  const body = await request.json()
  const config = await prisma.searchConfig.update({
    where: { id: 1 },
    data: {
      searchDaysOut: body.searchDaysOut,
      searchIncludeToday: body.searchIncludeToday,
      fareTabs: body.fareTabs !== undefined ? JSON.stringify(body.fareTabs) : undefined,
      emailTo: body.emailTo,
      emailEnabled: body.emailEnabled,
      cronBaseHours: body.cronBaseHours !== undefined ? JSON.stringify(body.cronBaseHours) : undefined,
      cronJitterMinutes: body.cronJitterMinutes,
    },
  })
  await initScheduler()
  return NextResponse.json(config)
}
