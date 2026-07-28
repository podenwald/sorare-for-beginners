import { describe, expect, it } from 'vitest'
import { getCurrentSeasonStartYear } from './season'

describe('getCurrentSeasonStartYear', () => {
  it('returns the previous year during the pre-season gap (July)', () => {
    expect(getCurrentSeasonStartYear(new Date(2026, 6, 28))).toBe(2025)
  })

  it('returns the current year once the new season is underway (September)', () => {
    expect(getCurrentSeasonStartYear(new Date(2026, 8, 1))).toBe(2026)
  })

  it('still returns the previous season year in the following January', () => {
    expect(getCurrentSeasonStartYear(new Date(2027, 0, 15))).toBe(2026)
  })

  it('defaults to deriving from the real current date when no argument is given', () => {
    const result = getCurrentSeasonStartYear()
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(2000)
  })
})
