import { describe, expect, it } from 'vitest'
import {
  formatMarketPrice,
  formatMarketRarity,
  getAvailabilityWarning,
  getMarketOfferUrl,
  getScoreExplanation,
} from './formatters'
import type { AvailabilityIssue, PlayerEvaluation } from '../api/scoring'

const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

describe('formatMarketPrice', () => {
  it('formats eurCents as a German-formatted euro amount with 2 decimal places', () => {
    expect(formatMarketPrice(5498)).toBe(eur.format(54.98))
  })

  it('formats a price under 1 euro correctly', () => {
    expect(formatMarketPrice(49)).toBe(eur.format(0.49))
  })

  it('formats a zero-cent price as 0,00 €, not as "no offer"', () => {
    // Sorare has never been observed returning 0 for "no listing" (it consistently uses null,
    // unlike the l5/l10/l40 averageScore fields — see ODI-301). If this ever changes, this test
    // will fail and surface the mismatch rather than silently misreporting a real free listing.
    expect(formatMarketPrice(0)).toBe(eur.format(0))
  })

  it('shows "kein Angebot" when there is no active offer', () => {
    expect(formatMarketPrice(null)).toBe('kein Angebot')
  })
})

describe('getMarketOfferUrl', () => {
  it('builds the sorare.com card page URL for a given card slug', () => {
    expect(getMarketOfferUrl('harry-kane-2024-limited-694')).toBe(
      'https://sorare.com/football/cards/harry-kane-2024-limited-694',
    )
  })
})

describe('formatMarketRarity', () => {
  it('maps each known rarity value to its display label', () => {
    expect(formatMarketRarity('limited')).toBe('Limited')
    expect(formatMarketRarity('rare')).toBe('Rare')
    expect(formatMarketRarity('super_rare')).toBe('Super Rare')
    expect(formatMarketRarity('unique')).toBe('Unique')
  })
})

function buildIssue(overrides: Partial<AvailabilityIssue> = {}): AvailabilityIssue {
  return {
    kind: 'Ankle Injury',
    expectedReturn: '2026-09-20',
    isOverdue: false,
    penaltyFactor: 0.9,
    ...overrides,
  }
}

describe('getAvailabilityWarning', () => {
  it('returns null when there is no active injury or suspension', () => {
    expect(getAvailabilityWarning(null)).toBeNull()
  })

  it('describes an active injury with its expected return date', () => {
    const issue = buildIssue({ kind: 'Ankle Injury', expectedReturn: '2026-09-20' })

    expect(getAvailabilityWarning(issue)).toBe('Ankle Injury — voraussichtlich zurück am 20.9.2026')
  })

  it('falls back to a generic label when the kind is null', () => {
    const issue = buildIssue({ kind: null, expectedReturn: '2026-09-20' })

    expect(getAvailabilityWarning(issue)).toBe('Verletzung/Sperre — voraussichtlich zurück am 20.9.2026')
  })

  it('shows an unknown-return message when expectedReturn is null', () => {
    const issue = buildIssue({ kind: 'Ankle Injury', expectedReturn: null })

    expect(getAvailabilityWarning(issue)).toBe('Ankle Injury — Rückkehr unbekannt')
  })

  it('describes an active suspension the same way as an injury', () => {
    const issue = buildIssue({ kind: 'Red Card', expectedReturn: '2026-08-01' })

    expect(getAvailabilityWarning(issue)).toBe('Red Card — voraussichtlich zurück am 1.8.2026')
  })

  it('falls back to the suspension reason when kind is null', () => {
    const issue = buildIssue({ kind: 'Accumulated yellow cards', expectedReturn: '2026-08-01' })

    expect(getAvailabilityWarning(issue)).toBe('Accumulated yellow cards — voraussichtlich zurück am 1.8.2026')
  })

  it('shows an overdue message when the expected return date has already passed', () => {
    const issue: AvailabilityIssue = {
      kind: 'Ankle Injury',
      expectedReturn: '2026-06-01',
      isOverdue: true,
      penaltyFactor: 0.9,
    }

    expect(getAvailabilityWarning(issue)).toBe('Ankle Injury — Rückkehr überfällig (erwartet war 1.6.2026)')
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
    availabilityIssue: null,
    ...overrides,
  }
}

describe('getScoreExplanation', () => {
  it('explains the score composition without an availability note when there is no issue', () => {
    expect(getScoreExplanation(buildEvaluation())).toBe('Score: 60% Potenzial (70) + 40% Beständigkeit (78)')
  })

  it('appends the penalty factor and final score when there is an active issue', () => {
    // overall.value is set to the already-penalized figure (73 * 0.55 rounded) so the fixture
    // stays internally consistent with the penaltyFactor below.
    expect(
      getScoreExplanation(
        buildEvaluation({
          overall: { value: 40, category: 'mittel' },
          availabilityIssue: { kind: 'Ankle Injury', expectedReturn: null, isOverdue: false, penaltyFactor: 0.55 },
        }),
      ),
    ).toBe('Score: 60% Potenzial (70) + 40% Beständigkeit (78), ×55% wegen Verletzung/Sperre → 40')
  })

  it('shows a dash for a null scorePotential or consistency value', () => {
    const evaluation = buildEvaluation({
      scorePotential: { value: null, category: 'unbekannt' },
      consistency: { value: null, category: 'unbekannt', factors: buildEvaluation().consistency.factors },
    })

    expect(getScoreExplanation(evaluation)).toBe('Score: 60% Potenzial (–) + 40% Beständigkeit (–)')
  })
})
