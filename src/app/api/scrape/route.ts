import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { runScraper } from '@/lib/scraper/runner'

export async function POST() {
  const running = await prisma.scrapeRun.findFirst({ where: { status: 'running' } })
  if (running) {
    return NextResponse.json({ error: 'Scrape already in progress' }, { status: 409 })
  }
  runScraper().catch((err: Error) => console.error('Manual scrape failed:', err))
  return NextResponse.json({ status: 'started' })
}

export async function GET() {
  const latestRun = await prisma.scrapeRun.findFirst({ orderBy: { startedAt: 'desc' } })
  const recentRuns = await prisma.scrapeRun.findMany({ orderBy: { startedAt: 'desc' }, take: 20 })
  return NextResponse.json({ latestRun, recentRuns })
}
