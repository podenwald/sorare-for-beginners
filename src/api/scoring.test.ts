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
    sorareAverageScores: { l5: null, l10: null, l40: null },
    marketPrices: { classicEurCents: null, inSeasonEurCents: null },
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

  it('returns unbekannt for minutesConsistency and rotationRisk when seasonStats is all zeros (the real pre-season API shape)', () => {
    const evaluation = evaluatePlayer(
      buildPlayer({ seasonStats: { appearances: 0, minutesPlayed: 0, substituteIn: 0, substituteOut: 0 } }),
    )

    expect(evaluation.consistency.factors.minutesConsistency).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.factors.rotationRisk).toEqual({ value: null, category: 'unbekannt' })
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

  describe('injury/suspension penalty', () => {
    const now = new Date('2026-07-30T00:00:00Z')

    it('applies no penalty when there is no active injury or suspension', () => {
      const evaluation = evaluatePlayer(buildPlayer(), now)

      expect(evaluation.overall.value).toBeCloseTo(81, 5)
    })

    it('applies the severe penalty when the injury has 60+ days remaining', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-30' },
          ],
        }),
        now,
      )

      // raw overall (availability drops to 20): 0.6*70 + 0.4*avg(20,100,100,90) = 0.6*70 + 0.4*77.5 = 73
      // severe factor at 60+ days remaining: 0.5 -> 73 * 0.5 = 36.5
      expect(evaluation.overall.value).toBeCloseTo(36.5, 1)
      expect(evaluation.overall.category).toBe('riskant')
    })

    it('applies only the mild penalty when the injury ends today', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-07-30' },
          ],
        }),
        now,
      )

      // mild factor at 0 days remaining: 0.9 -> 73 * 0.9 = 65.7
      expect(evaluation.overall.value).toBeCloseTo(65.7, 1)
      expect(evaluation.overall.category).toBe('mittel')
    })

    it('applies the flat unknown-duration penalty when expectedEndDate is null', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: null }],
        }),
        now,
      )

      // unknown-duration factor: 0.7 -> 73 * 0.7 = 51.1
      expect(evaluation.overall.value).toBeCloseTo(51.1, 1)
      expect(evaluation.overall.category).toBe('mittel')
    })

    it('treats an active suspension the same as an injury for the penalty', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeSuspensions: [{ kind: 'Red Card', reason: null, startDate: '2026-07-25', endDate: '2026-09-30' }],
        }),
        now,
      )

      expect(evaluation.overall.value).toBeCloseTo(36.5, 1)
    })

    it('uses the longest remaining duration when multiple issues are active', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-07-30' },
            { kind: 'Hamstring', status: 'active', startDate: '2026-07-01', expectedEndDate: '2026-09-30' },
          ],
        }),
        now,
      )

      // longer of the two (60+ days) wins -> severe factor 0.5, same as the single-severe-injury test
      expect(evaluation.overall.value).toBeCloseTo(36.5, 1)
    })

    it('exposes the driving issue (the one with the longest remaining duration) on the evaluation', () => {
      const result = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-07-30' },
            { kind: 'Hamstring', status: 'active', startDate: '2026-07-01', expectedEndDate: '2026-09-30' },
          ],
        }),
        now,
      )

      expect(result.availabilityIssue).toEqual({
        kind: 'Hamstring',
        expectedReturn: '2026-09-30',
        isOverdue: false,
        penaltyFactor: 0.5,
      })
    })

    it('falls back to the suspension reason when kind is null', () => {
      const result = evaluatePlayer(
        buildPlayer({
          activeSuspensions: [
            { kind: null, reason: 'Accumulated yellow cards', startDate: '2026-07-01', endDate: '2026-08-15' },
          ],
        }),
        now,
      )

      expect(result.availabilityIssue?.kind).toBe('Accumulated yellow cards')
    })

    it('documents the combined effect of both availability mechanisms for a strong, long-injured player', () => {
      const strongPlayer = buildPlayer({
        recentSo5Scores: [
          { score: 88, gameDate: '2026-04-01T00:00:00Z' },
          { score: 88, gameDate: '2026-03-01T00:00:00Z' },
          { score: 88, gameDate: '2026-02-01T00:00:00Z' },
          { score: 88, gameDate: '2026-01-01T00:00:00Z' },
        ],
      })

      const healthy = evaluatePlayer(strongPlayer, now)
      const injured = evaluatePlayer(
        { ...strongPlayer, activeInjuries: [{ kind: 'ACL Tear', status: 'active', startDate: '2026-06-01', expectedEndDate: '2026-12-01' }] },
        now,
      )

      expect(healthy.overall.value).toBeGreaterThan(85)
      expect(injured.overall.value).toBeLessThan(healthy.overall.value! * 0.6)
    })
  })
})
