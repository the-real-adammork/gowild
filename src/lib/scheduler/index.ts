import * as cron from 'node-cron'
import { prisma } from '@/lib/db'
import { runScraper } from '@/lib/scraper/runner'

export interface ScheduledTime {
  hour: number
  minute: number
}

let scheduledJobs: ReturnType<typeof cron.schedule>[] = []
let currentScheduledTimes: ScheduledTime[] = []

export function calculateJitteredHours(baseHours: number[], jitterMinutes: number): ScheduledTime[] {
  return baseHours.map((baseHour) => {
    const baseMinutes = baseHour * 60
    const jitter = Math.floor(Math.random() * (jitterMinutes * 2 + 1)) - jitterMinutes
    const totalMinutes = Math.max(0, Math.min(23 * 60 + 59, baseMinutes + jitter))
    return {
      hour: Math.floor(totalMinutes / 60),
      minute: totalMinutes % 60,
    }
  })
}

export async function initScheduler(): Promise<void> {
  for (const job of scheduledJobs) { job.stop() }
  scheduledJobs = []

  const config = await prisma.searchConfig.findUnique({ where: { id: 1 } })
  if (!config) { console.log('No SearchConfig found, scheduler not started'); return }

  const baseHours = JSON.parse(config.cronBaseHours) as number[]
  const times = calculateJitteredHours(baseHours, config.cronJitterMinutes)
  currentScheduledTimes = times

  for (const time of times) {
    const cronExpr = `${time.minute} ${time.hour} * * *`
    const job = cron.schedule(cronExpr, () => {
      console.log(`Scheduled scrape triggered at ${time.hour}:${String(time.minute).padStart(2, '0')}`)
      runScraper().catch((err) => console.error('Scheduled scrape failed:', err))
    }, { timezone: 'America/Los_Angeles' })
    scheduledJobs.push(job)
  }

  const rescheduleJob = cron.schedule('0 0 * * *', () => {
    console.log('Rescheduling with new jitter values')
    initScheduler().catch((err) => console.error('Reschedule failed:', err))
  }, { timezone: 'America/Los_Angeles' })
  scheduledJobs.push(rescheduleJob)

  const timeStrs = times.map((t) => `${t.hour}:${String(t.minute).padStart(2, '0')}`).join(', ')
  console.log(`Scheduler initialized: scrapes at ${timeStrs} PT`)
}

export function getScheduledTimes(): ScheduledTime[] {
  return currentScheduledTimes
}

export function getNextScheduledTime(): string | null {
  if (currentScheduledTimes.length === 0) return null
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const upcoming = currentScheduledTimes
    .map((t) => t.hour * 60 + t.minute)
    .filter((m) => m > nowMinutes)
    .sort((a, b) => a - b)
  if (upcoming.length > 0) {
    const next = upcoming[0]
    return `${Math.floor(next / 60)}:${String(next % 60).padStart(2, '0')} PT (today)`
  }
  const sorted = [...currentScheduledTimes].sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute))
  const first = sorted[0]
  return `${first.hour}:${String(first.minute).padStart(2, '0')} PT (tomorrow)`
}
