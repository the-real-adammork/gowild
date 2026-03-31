import { describe, it, expect } from 'vitest'
import { calculateJitteredHours } from '@/lib/scheduler'

describe('calculateJitteredHours', () => {
  it('returns the correct number of scheduled times', () => {
    const times = calculateJitteredHours([7, 11, 15, 21], 30)
    expect(times).toHaveLength(4)
  })

  it('keeps times within jitter bounds', () => {
    for (let i = 0; i < 100; i++) {
      const times = calculateJitteredHours([7, 11, 15, 21], 30)
      for (let j = 0; j < times.length; j++) {
        const base = [7, 11, 15, 21][j]
        const baseMinutes = base * 60
        const { hour, minute } = times[j]
        const totalMinutes = hour * 60 + minute
        expect(totalMinutes).toBeGreaterThanOrEqual(baseMinutes - 30)
        expect(totalMinutes).toBeLessThanOrEqual(baseMinutes + 30)
      }
    }
  })

  it('clamps times to stay within 0:00-23:59', () => {
    for (let i = 0; i < 100; i++) {
      const times = calculateJitteredHours([0], 30)
      expect(times[0].hour).toBeGreaterThanOrEqual(0)
      expect(times[0].minute).toBeGreaterThanOrEqual(0)
    }
    for (let i = 0; i < 100; i++) {
      const times = calculateJitteredHours([23], 60)
      expect(times[0].hour).toBeLessThanOrEqual(23)
      expect(times[0].minute).toBeLessThanOrEqual(59)
    }
  })
})
