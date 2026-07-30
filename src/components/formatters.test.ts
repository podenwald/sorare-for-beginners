import { describe, expect, it } from 'vitest'
import { formatSorareAverages, getAvailabilityWarning, getScoreExplanation } from './formatters'
import type { Player } from '../api/types'
import type { PlayerEvaluation } from '../api/scoring'

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

function buildPlayer(overrides: Partial<Player> = {}): Player {
  return {
    slug: 'test-player',
    displayName: 'Test Player',
    position: 'Forward',
    age: 25,
    activeClub: null,
    activeInjuries: [],
    activeSuspensions: [],
    recentSo5Scores: [],
    seasonStats: null,
    sorareAverageScores: { l5: null, l10: null, l40: null },
    ...overrides,
  }
}

describe('getAvailabilityWarning', () => {
  it('returns null when there is no active injury or suspension', () => {
    expect(getAvailabilityWarning(buildPlayer())).toBeNull()
  })

  it('describes an active injury with its expected return date', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-20' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Ankle Injury — voraussichtlich zurück am 20.9.2026')
  })

  it('falls back to a generic label when the injury kind is null', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: null, status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-20' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Verletzung — voraussichtlich zurück am 20.9.2026')
  })

  it('shows an unknown-return message when expectedEndDate is null', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: null }],
    })

    expect(getAvailabilityWarning(player)).toBe('Ankle Injury — Rückkehr unbekannt')
  })

  it('describes an active suspension when there is no injury', () => {
    const player = buildPlayer({
      activeSuspensions: [{ kind: 'Red Card', reason: null, startDate: '2026-07-25', endDate: '2026-08-01' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Red Card — voraussichtlich zurück am 1.8.2026')
  })

  it('falls back to the suspension reason when kind is null', () => {
    const player = buildPlayer({
      activeSuspensions: [{ kind: null, reason: 'Accumulated yellow cards', startDate: '2026-07-25', endDate: '2026-08-01' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Accumulated yellow cards — voraussichtlich zurück am 1.8.2026')
  })

  it('prioritizes an injury over a suspension when both are present', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-20' }],
      activeSuspensions: [{ kind: 'Red Card', reason: null, startDate: '2026-07-25', endDate: '2026-08-01' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Ankle Injury — voraussichtlich zurück am 20.9.2026')
  })
})

function buildEvaluation(overrides: Partial<PlayerEvaluation> = {}): PlayerEvaluation {
  return {
    overall: { value: 73, category: 'gut' },
    scorePotential: { value: 70, category: 'gut' },
    consistency: {
      value: 77.5,
      category: 'gut',
      factors: {
        availability: { value: 20, category: 'riskant' },
        minutesConsistency: { value: 100, category: 'gut' },
        rotationRisk: { value: 100, category: 'gut' },
        formTrend: { value: 90, category: 'gut' },
      },
    },
    ...overrides,
  }
}

describe('getScoreExplanation', () => {
  it('explains the score composition without an availability note when there is no issue', () => {
    expect(getScoreExplanation(buildEvaluation(), false)).toBe('Score: 60% Potenzial (70) + 40% Beständigkeit (78)')
  })

  it('appends an availability note when there is an active issue', () => {
    expect(getScoreExplanation(buildEvaluation(), true)).toBe(
      'Score: 60% Potenzial (70) + 40% Beständigkeit (78), zusätzlich abgewertet wegen Verletzung/Sperre',
    )
  })

  it('shows a dash for a null scorePotential or consistency value', () => {
    const evaluation = buildEvaluation({
      scorePotential: { value: null, category: 'unbekannt' },
      consistency: { value: null, category: 'unbekannt', factors: buildEvaluation().consistency.factors },
    })

    expect(getScoreExplanation(evaluation, false)).toBe('Score: 60% Potenzial (–) + 40% Beständigkeit (–)')
  })
})
