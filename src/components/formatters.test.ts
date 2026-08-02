import { describe, expect, it } from 'vitest'
import {
  formatMarketOfferAmount,
  formatMarketPrice,
  formatMarketRarity,
  formatSlotOutcome,
  getAvailabilityWarning,
  getMarketOfferUrl,
  getScoreExplanation,
} from './formatters'
import type { AvailabilityIssue, PlayerEvaluation } from '../api/scoring'
import type { CandidateExplanation, EvaluatedCandidate } from '../api/formation'

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

describe('formatMarketOfferAmount', () => {
  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
  const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

  it('formats a SOL amount to 4 decimal places with a unit suffix', () => {
    expect(formatMarketOfferAmount({ currency: 'SOL', value: 1.32 })).toBe('1.3200 SOL')
  })

  it('formats an ETH amount to 4 decimal places with a unit suffix', () => {
    expect(formatMarketOfferAmount({ currency: 'ETH', value: 0.054 })).toBe('0.0540 ETH')
  })

  it('formats a GBP amount using British currency formatting', () => {
    expect(formatMarketOfferAmount({ currency: 'GBP', value: 45 })).toBe(gbp.format(45))
  })

  it('formats a USD amount using US currency formatting', () => {
    expect(formatMarketOfferAmount({ currency: 'USD', value: 50 })).toBe(usd.format(50))
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

function buildRankedCandidate(slug: string, overallValue: number): EvaluatedCandidate {
  return {
    player: {
      slug,
      displayName: slug,
      position: 'Forward',
      age: 25,
      activeClub: null,
      activeInjuries: [],
      activeSuspensions: [],
      recentSo5Scores: [],
      seasonStats: null,
      sorareAverageScores: { l5: null, l10: null, l40: null },
      marketPrices: {
        classicEurCents: null,
        inSeasonEurCents: null,
        classicOfferAmount: null,
        inSeasonOfferAmount: null,
        classicCardSlug: null,
        inSeasonCardSlug: null,
        rarity: 'limited',
      },
    },
    evaluation: {
      overall: { value: overallValue, category: 'gut' },
      scorePotential: { value: overallValue, category: 'gut' },
      consistency: {
        value: overallValue,
        category: 'gut',
        factors: {
          availability: { value: 100, category: 'gut' },
          minutesConsistency: { value: 100, category: 'gut' },
          rotationRisk: { value: 100, category: 'gut' },
          formTrend: { value: 100, category: 'gut' },
        },
      },
      availabilityIssue: null,
    },
  }
}

describe('formatSlotOutcome', () => {
  it('describes an assigned slot with a runner-up', () => {
    const explanation: CandidateExplanation = {
      assignedSlot: 'Defender',
      runnerUp: buildRankedCandidate('def-2', 65),
      beatenBy: null,
      ineligibleReason: null,
    }

    expect(formatSlotOutcome(explanation)).toBe('Ausgewählt für Verteidiger — vor def-2 (Score 65)')
  })

  it('describes an assigned slot with no competition', () => {
    const explanation: CandidateExplanation = {
      assignedSlot: 'Forward',
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: null,
    }

    expect(formatSlotOutcome(explanation)).toBe('Ausgewählt für Sturm (einzige Option)')
  })

  it('describes a Flex assignment using the Flex label', () => {
    const explanation: CandidateExplanation = {
      assignedSlot: 'Flex',
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: null,
    }

    expect(formatSlotOutcome(explanation)).toBe('Ausgewählt für Flex (einzige Option)')
  })

  it('describes being beaten by a specific candidate', () => {
    const explanation: CandidateExplanation = {
      assignedSlot: null,
      runnerUp: null,
      beatenBy: buildRankedCandidate('def-1', 78),
      ineligibleReason: null,
    }

    expect(formatSlotOutcome(explanation)).toBe('Nicht ausgewählt: def-1 hat den Slot mit Score 78 belegt')
  })

  it('describes an ineligible candidate using the reason text as-is', () => {
    const explanation: CandidateExplanation = {
      assignedSlot: null,
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: 'Torhüter sind für die Flex-Position nicht wählbar',
    }

    expect(formatSlotOutcome(explanation)).toBe('Nicht ausgewählt: Torhüter sind für die Flex-Position nicht wählbar')
  })
})
