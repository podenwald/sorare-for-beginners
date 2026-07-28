import { describe, expect, it } from 'vitest'
import { categorize, evaluatePlayer } from './scoring'
import type { Player } from './types'

function buildPlayer(overrides: Partial<Player> = {}): Player {
  return {
    slug: 'test-player',
    displayName: 'Test Player',
    position: 'Forward',
    age: 25,
    activeClub: { name: 'Test FC', slug: 'test-fc' },
    activeInjuries: [],
    activeSuspensions: [],
    recentSo5Scores: [
      { score: 60, gameDate: '2026-02-01T00:00:00Z' },
      { score: 40, gameDate: '2026-01-01T00:00:00Z' },
      { score: 100, gameDate: '2026-04-01T00:00:00Z' },
      { score: 80, gameDate: '2026-03-01T00:00:00Z' },
    ],
    seasonStats: { appearances: 30, minutesPlayed: 2700, substituteIn: 0, substituteOut: 0 },
    ...overrides,
  }
}

describe('categorize', () => {
  it('categorizes exactly 70 as gut', () => {
    expect(categorize(70)).toBe('gut')
  })

  it('categorizes exactly 40 as mittel', () => {
    expect(categorize(40)).toBe('mittel')
  })

  it('categorizes just below 40 as riskant', () => {
    expect(categorize(39.9)).toBe('riskant')
  })

  it('categorizes null as unbekannt', () => {
    expect(categorize(null)).toBe('unbekannt')
  })
})

describe('evaluatePlayer', () => {
  it('computes a complete evaluation from full data, sorting scores by date itself', () => {
    const evaluation = evaluatePlayer(buildPlayer())

    expect(evaluation.scorePotential).toEqual({ value: 70, category: 'gut' })
    expect(evaluation.consistency.factors.availability).toEqual({ value: 100, category: 'gut' })
    expect(evaluation.consistency.factors.minutesConsistency).toEqual({ value: 100, category: 'gut' })
    expect(evaluation.consistency.factors.rotationRisk).toEqual({ value: 100, category: 'gut' })
    expect(evaluation.consistency.factors.formTrend).toEqual({ value: 90, category: 'gut' })
    expect(evaluation.consistency.value).toEqual(97.5)
    expect(evaluation.consistency.category).toBe('gut')
    expect(evaluation.overall).toEqual({ value: 81, category: 'gut' })
  })

  it('drops availability to riskant when an active injury is present', () => {
    const evaluation = evaluatePlayer(
      buildPlayer({
        activeInjuries: [{ kind: 'Muscle', status: 'active', startDate: '2026-04-01', expectedEndDate: null }],
      }),
    )

    expect(evaluation.consistency.factors.availability).toEqual({ value: 20, category: 'riskant' })
  })

  it('returns unbekannt for minutesConsistency and rotationRisk when seasonStats is null', () => {
    const evaluation = evaluatePlayer(buildPlayer({ seasonStats: null }))

    expect(evaluation.consistency.factors.minutesConsistency).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.factors.rotationRisk).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.value).toEqual(95)
    expect(evaluation.overall).toEqual({ value: 80, category: 'gut' })
  })

  it('returns unbekannt for scorePotential and formTrend when all recent scores are zero', () => {
    const evaluation = evaluatePlayer(
      buildPlayer({
        recentSo5Scores: [
          { score: 0, gameDate: '2026-02-01T00:00:00Z' },
          { score: 0, gameDate: '2026-01-01T00:00:00Z' },
        ],
      }),
    )

    expect(evaluation.scorePotential).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.factors.formTrend).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.value).toEqual(100)
    expect(evaluation.overall).toEqual({ value: 100, category: 'gut' })
  })
})
