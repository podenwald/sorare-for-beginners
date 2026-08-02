import { describe, expect, it } from 'vitest'
import { assignFormation, explainCandidates } from './formation'
import type { EvaluatedCandidate } from './formation'
import type { Player } from './types'
import type { PlayerEvaluation, EvaluationCategory } from './scoring'

function buildCandidate(
  slug: string,
  position: Player['position'],
  overallValue: number | null,
  scorePotentialCategory: EvaluationCategory = 'gut',
  activeClubSlug: string | null = null,
): EvaluatedCandidate {
  const evaluation: PlayerEvaluation = {
    overall: { value: overallValue, category: 'gut' },
    scorePotential: { value: overallValue, category: scorePotentialCategory },
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
  }

  return {
    player: {
      slug,
      displayName: slug,
      position,
      age: 25,
      activeClub: activeClubSlug ? { name: activeClubSlug, slug: activeClubSlug } : null,
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
    evaluation,
  }
}

describe('assignFormation', () => {
  it('assigns the best candidate per exact position and the best remaining non-goalkeeper to Flex', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const slots = assignFormation(candidates)

    expect(slots.map((slot) => slot.candidate?.player.slug)).toEqual([
      'gk-1',
      'def-1',
      'mid-1',
      'fwd-1',
      'def-2',
    ])
  })

  it('returns null for a slot when no matching candidate exists', () => {
    const candidates = [buildCandidate('mid-1', 'Midfielder', 80)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Goalkeeper')?.candidate).toBeNull()
    expect(slots.find((slot) => slot.label === 'Midfielder')?.candidate?.player.slug).toBe('mid-1')
  })

  it('never assigns a goalkeeper to the Flex slot, even as a leftover with no alternative', () => {
    const candidates = [buildCandidate('gk-1', 'Goalkeeper', 60), buildCandidate('gk-2', 'Goalkeeper', 95)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Goalkeeper')?.candidate?.player.slug).toBe('gk-2')
    expect(slots.find((slot) => slot.label === 'Flex')?.candidate).toBeNull()
  })

  it('treats a null overall value as lowest priority when an alternative exists', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', null), buildCandidate('fwd-2', 'Forward', 40)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('fwd-2')
  })

  it('still assigns a candidate with a null overall value when no alternative exists for that position', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', null)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('fwd-1')
  })

  it('breaks ties by keeping the first candidate in input order', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', 70), buildCandidate('fwd-2', 'Forward', 70)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('fwd-1')
  })

  it('returns all-null slots for an empty candidate list', () => {
    const slots = assignFormation([])

    expect(slots.every((slot) => slot.candidate === null)).toBe(true)
    expect(slots.map((slot) => slot.label)).toEqual(['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Flex'])
  })

  it('ranks a no-data candidate (unbekannt scorePotential) below a real candidate, even with a higher overall.value', () => {
    const candidates = [
      buildCandidate('no-data', 'Forward', 100, 'unbekannt'),
      buildCandidate('real', 'Forward', 65, 'gut'),
    ]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('real')
  })

  it('still assigns a no-data candidate when it is the only one available for that position', () => {
    const candidates = [buildCandidate('no-data', 'Forward', 100, 'unbekannt')]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('no-data')
  })

  it('fills Flex with the best remaining Defender in defensiveStack mode, even when a higher-scoring non-Defender is available', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('def-3', 'Defender', 65),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('mid-2', 'Midfielder', 75),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const normalSlots = assignFormation(candidates, 'normal')
    const stackSlots = assignFormation(candidates, 'defensiveStack')

    expect(normalSlots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('mid-2')
    expect(stackSlots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('def-3')
    expect(stackSlots.slice(0, 4)).toEqual(normalSlots.slice(0, 4))
  })

  it('leaves Flex empty in defensiveStack mode when no second Defender is available', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const slots = assignFormation(candidates, 'defensiveStack')

    expect(slots.find((slot) => slot.label === 'Flex')?.candidate).toBeNull()
  })

  it('defaults to normal mode when mode is omitted', () => {
    const candidates = [
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('mid-2', 'Midfielder', 75),
    ]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('mid-2')
  })

  it('in teamStack mode, only assigns candidates from the given club, ignoring higher-scoring candidates from other clubs', () => {
    const candidates = [
      buildCandidate('gk-club-a', 'Goalkeeper', 60, 'gut', 'club-a'),
      buildCandidate('def-club-a', 'Defender', 50, 'gut', 'club-a'),
      buildCandidate('def-club-b', 'Defender', 95, 'gut', 'club-b'),
      buildCandidate('mid-club-a', 'Midfielder', 55, 'gut', 'club-a'),
      buildCandidate('fwd-club-a', 'Forward', 45, 'gut', 'club-a'),
    ]

    const slots = assignFormation(candidates, 'teamStack', 'club-a')

    expect(slots.map((slot) => slot.candidate?.player.slug)).toEqual([
      'gk-club-a',
      'def-club-a',
      'mid-club-a',
      'fwd-club-a',
      undefined,
    ])
  })

  it('in teamStack mode, never assigns a goalkeeper to Flex, even from the same club with no alternative', () => {
    const candidates = [
      buildCandidate('gk-1-club-a', 'Goalkeeper', 60, 'gut', 'club-a'),
      buildCandidate('gk-2-club-a', 'Goalkeeper', 90, 'gut', 'club-a'),
    ]

    const slots = assignFormation(candidates, 'teamStack', 'club-a')

    expect(slots.find((slot) => slot.label === 'Goalkeeper')?.candidate?.player.slug).toBe('gk-2-club-a')
    expect(slots.find((slot) => slot.label === 'Flex')?.candidate).toBeNull()
  })

  it('in teamStack mode, fills Flex with the best remaining non-goalkeeper from the same club', () => {
    const candidates = [
      buildCandidate('gk-club-a', 'Goalkeeper', 60, 'gut', 'club-a'),
      buildCandidate('def-1-club-a', 'Defender', 70, 'gut', 'club-a'),
      buildCandidate('def-2-club-a', 'Defender', 55, 'gut', 'club-a'),
      buildCandidate('mid-club-a', 'Midfielder', 80, 'gut', 'club-a'),
      buildCandidate('fwd-club-a', 'Forward', 90, 'gut', 'club-a'),
    ]

    const slots = assignFormation(candidates, 'teamStack', 'club-a')

    expect(slots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('def-2-club-a')
  })

  it('in teamStack mode, returns all-null slots when no candidate belongs to the given club', () => {
    const candidates = [
      buildCandidate('gk-club-b', 'Goalkeeper', 60, 'gut', 'club-b'),
      buildCandidate('def-club-b', 'Defender', 70, 'gut', 'club-b'),
    ]

    const slots = assignFormation(candidates, 'teamStack', 'club-a')

    expect(slots.every((slot) => slot.candidate === null)).toBe(true)
  })

  it('in teamStack mode, returns all-null slots when stackClubSlug is undefined (no club selected yet)', () => {
    const candidates = [buildCandidate('gk-club-a', 'Goalkeeper', 60, 'gut', 'club-a')]

    const slots = assignFormation(candidates, 'teamStack', undefined)

    expect(slots.every((slot) => slot.candidate === null)).toBe(true)
  })

  it('in teamStack mode, does not match a clubless candidate when stackClubSlug is undefined', () => {
    // Regression guard: `candidate.player.activeClub?.slug === stackClubSlug` would be
    // `undefined === undefined` (true) for a clubless candidate compared against an undefined
    // stackClubSlug, incorrectly including them. Uses the default `activeClubSlug: null` (no 5th
    // argument), unlike the sibling test above which gives its candidate a club.
    const candidates = [buildCandidate('unattached', 'Goalkeeper', 60)]

    const slots = assignFormation(candidates, 'teamStack', undefined)

    expect(slots.every((slot) => slot.candidate === null)).toBe(true)
  })
})

describe('explainCandidates', () => {
  it('gives the winner of an exact position their slot label and the runner-up', () => {
    const candidates = [
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('def-3', 'Defender', 30),
    ]

    const explanations = explainCandidates(candidates)

    expect(explanations.get('def-1')).toEqual({
      assignedSlot: 'Defender',
      runnerUp: candidates[1],
      beatenBy: null,
      ineligibleReason: null,
    })
  })

  it('gives every entry exactly one explanation for every candidate passed in', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const explanations = explainCandidates(candidates)

    expect(explanations.size).toBe(4)
    for (const candidate of candidates) {
      expect(explanations.has(candidate.player.slug)).toBe(true)
    }
  })

  it('explains a leftover same-position candidate who goes on to win Flex as assigned to Flex, not beaten', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const explanations = explainCandidates(candidates)

    expect(explanations.get('def-2')).toEqual({
      assignedSlot: 'Flex',
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: null,
    })
  })

  it('attributes beatenBy to the own-position winner, not the Flex winner, even when the candidate also lost Flex', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('mid-2', 'Midfielder', 75),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const explanations = explainCandidates(candidates)

    // def-2 loses Defender to def-1, then ALSO loses Flex to mid-2 (75 beats 50 among the
    // leftover non-GKs). Per the documented precedence (own-position loss is the more
    // specific/useful reason), beatenBy stays def-1 — it is never overwritten by the Flex result.
    expect(explanations.get('def-2')).toEqual({
      assignedSlot: null,
      runnerUp: null,
      beatenBy: candidates.find((c) => c.player.slug === 'def-1'),
      ineligibleReason: null,
    })
  })

  it('explains a losing exact-position candidate as beaten by that position\'s winner when they are also Flex-ineligible', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('gk-2', 'Goalkeeper', 40),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const explanations = explainCandidates(candidates)

    // Goalkeepers are never Flex-eligible in any mode, so gk-2's only relevant reason is losing
    // Goalkeeper to gk-1 — not a generic "goalkeepers can't play Flex" (which would be true of
    // gk-1 too, and isn't the reason gk-2 specifically didn't make the team).
    expect(explanations.get('gk-2')).toEqual({
      assignedSlot: null,
      runnerUp: null,
      beatenBy: candidates.find((c) => c.player.slug === 'gk-1'),
      ineligibleReason: null,
    })
  })

  it('explains a Flex-ineligible candidate with no own exact-position slot to compete for via ineligibleReason', () => {
    // 'Unknown' is a valid Player['position'] (see src/api/types.ts) that has no corresponding
    // entry in EXACT_POSITION_SLOTS, so such a candidate never wins or loses an exact-position
    // slot at all — there's no positionLoss to attribute a beatenBy to, only Flex eligibility.
    // A real Goalkeeper/Defender/Midfielder/Forward candidate can't exercise this branch: they
    // always either win their own exact slot outright or lose it to a specific rival (beatenBy),
    // per the precedence in computeFormation's final-resolution loop.
    const candidates = [buildCandidate('def-1', 'Defender', 70), buildCandidate('unknown-1', 'Unknown', 50)]

    // defensiveStack mode: Flex is Defender-only, so unknown-1 (not a Defender, and with no exact
    // position slot to lose) ends up ineligible rather than beaten.
    const explanations = explainCandidates(candidates, 'defensiveStack')

    expect(explanations.get('def-1')?.assignedSlot).toBe('Defender')
    expect(explanations.get('unknown-1')).toEqual({
      assignedSlot: null,
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: 'Im Defensiv-Stack-Modus ist die Flex-Position nur für Verteidiger wählbar',
    })
  })

  it('explains a candidate outside the selected Team-Stack club as ineligible', () => {
    const candidates = [
      buildCandidate('gk-club-a', 'Goalkeeper', 60, 'gut', 'club-a'),
      buildCandidate('def-club-b', 'Defender', 90, 'gut', 'club-b'),
    ]

    const explanations = explainCandidates(candidates, 'teamStack', 'club-a')

    expect(explanations.get('def-club-b')).toEqual({
      assignedSlot: null,
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: 'Nicht im ausgewählten Team-Stack-Verein',
    })
  })

  it('explains every candidate as ineligible when no Team-Stack club is selected yet', () => {
    const candidates = [buildCandidate('gk-1', 'Goalkeeper', 60, 'gut', 'club-a')]

    const explanations = explainCandidates(candidates, 'teamStack', undefined)

    expect(explanations.get('gk-1')).toEqual({
      assignedSlot: null,
      runnerUp: null,
      beatenBy: null,
      ineligibleReason: 'Noch kein Team-Stack-Verein ausgewählt',
    })
  })

  it('sets runnerUp to null for a slot winner with no competition', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', 90)]

    const explanations = explainCandidates(candidates)

    expect(explanations.get('fwd-1')?.runnerUp).toBeNull()
  })
})
