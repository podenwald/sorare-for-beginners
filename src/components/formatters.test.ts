import { describe, expect, it } from 'vitest'
import { formatSorareAverages } from './formatters'

describe('formatSorareAverages', () => {
  it('formats all three values when present', () => {
    expect(formatSorareAverages({ l5: 74, l10: 70.6, l40: 64 })).toBe('L5 74 · L10 71 · L40 64')
  })

  it('shows a dash for any value that is null', () => {
    expect(formatSorareAverages({ l5: null, l10: 70, l40: null })).toBe('L5 – · L10 70 · L40 –')
  })

  it('shows a dash for all three values when all are null', () => {
    expect(formatSorareAverages({ l5: null, l10: null, l40: null })).toBe('L5 – · L10 – · L40 –')
  })

  it('shows a dash for a value that is exactly 0 (no scoring history, not an averaged zero)', () => {
    expect(formatSorareAverages({ l5: 0, l10: 70, l40: 0 })).toBe('L5 – · L10 70 · L40 –')
  })
})
