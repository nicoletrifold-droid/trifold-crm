import type { MetaRateUsage } from './types'

const THROTTLE_THRESHOLD = 75

export class RateLimiter {
  private usage: MetaRateUsage = {
    call_count: 0,
    total_cputime: 0,
    total_time: 0,
    type: '',
    estimated_time_to_regain_access: 0,
  }

  update(headers: Headers): void {
    const raw = headers.get('X-Business-Use-Case-Usage')
    if (!raw) return

    try {
      const parsed = JSON.parse(raw) as Record<string, MetaRateUsage[]>
      let maxCallCount = 0

      for (const entries of Object.values(parsed)) {
        for (const entry of entries) {
          if (entry.call_count > maxCallCount) {
            maxCallCount = entry.call_count
            this.usage = entry
          }
        }
      }
    } catch {
      // Malformed header — keep last known usage
    }
  }

  isThrottled(): boolean {
    return (
      this.usage.call_count > THROTTLE_THRESHOLD ||
      this.usage.total_cputime > THROTTLE_THRESHOLD ||
      this.usage.total_time > THROTTLE_THRESHOLD
    )
  }

  getUsage(): MetaRateUsage {
    return { ...this.usage }
  }
}

export const rateLimiter = new RateLimiter()
