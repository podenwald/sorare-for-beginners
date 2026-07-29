import { describe, expect, it } from 'vitest'
import { formatSorareAverages } from './FormationList'
import type { EvaluatedCandidate } from '../api/formation'
import type { PlayerEvaluation } from '../api/scoring'
import type { Player } from '../api/types'

function buildCandidate(sorareAverageScores: Player['sorareAverageScores']): EvaluatedCandidate {
  const evaluation: PlayerEvaluation = {
    overall: { value: 70, category: 'gut' },
    scorePotential: { value: 70, category: 'gut' },
    consistency: {
      value: 70,
      category: 'gut',
      factors: {
        availability: { value: 100, category: 'gut' },
        minutesConsistency: { value: 100, category: 'gut' },
        rotationRisk: { value: 100, category: 'gut' },
        formTrend: { value: 100, category: 'gut' },
      },
    },
  }

  return {
    player: {
      slug: 'test-player',
      displayName: 'Test Player',
      position: 'Forward',
      age: 25,
      activeClub: null,
      activeInjuries: [],
      activeSuspensions: [],
      recentSo5Scores: [],
      seasonStats: null,
      sorareAverageScores,
    },
    evaluation,
  }
}

describe('formatSorareAverages', () => {
  it('formats all three values when present', () => {
    const candidate = buildCandidate({ l5: 74, l10: 70.4, l40: 64 })
    expect(formatSorareAverages(candidate)).toBe('L5 74 · L10 70 · L40 64')
  })

  it('shows a dash for any value that is null', () => {
    const candidate = buildCandidate({ l5: null, l10: 70, l40: null })
    expect(formatSorareAverages(candidate)).toBe('L5 – · L10 70 · L40 –')
  })

  it('shows a dash for all three values when all are null', () => {
    const candidate = buildCandidate({ l5: null, l10: null, l40: null })
    expect(formatSorareAverages(candidate)).toBe('L5 – · L10 – · L40 –')
  })
})
