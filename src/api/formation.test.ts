import { describe, expect, it } from 'vitest'
import { assignFormation } from './formation'
import type { EvaluatedCandidate } from './formation'
import type { Player } from './types'
import type { PlayerEvaluation, EvaluationCategory } from './scoring'

function buildCandidate(
  slug: string,
  position: Player['position'],
  overallValue: number | null,
  scorePotentialCategory: EvaluationCategory = 'gut',
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
  }

  return {
    player: {
      slug,
      displayName: slug,
      position,
      age: 25,
      activeClub: null,
      activeInjuries: [],
      activeSuspensions: [],
      recentSo5Scores: [],
      seasonStats: null,
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
})
