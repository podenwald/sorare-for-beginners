import type { Player, SeasonStats } from './types'

export type EvaluationCategory = 'gut' | 'mittel' | 'riskant' | 'unbekannt'

export interface EvaluatedValue {
  value: number | null
  category: EvaluationCategory
}

export interface PlayerEvaluation {
  overall: EvaluatedValue
  scorePotential: EvaluatedValue
  consistency: EvaluatedValue & {
    factors: {
      availability: EvaluatedValue
      minutesConsistency: EvaluatedValue
      rotationRisk: EvaluatedValue
      formTrend: EvaluatedValue
    }
  }
}

export function categorize(value: number | null): EvaluationCategory {
  if (value === null) return 'unbekannt'
  if (value >= 70) return 'gut'
  if (value >= 40) return 'mittel'
  return 'riskant'
}

function toEvaluatedValue(value: number | null): EvaluatedValue {
  return { value, category: categorize(value) }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function combineWeighted(a: number | null, weightA: number, b: number | null, weightB: number): number | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return weightA * a + weightB * b
}

function calculateScorePotential(player: Player): number | null {
  const nonZeroScores = player.recentSo5Scores
    .filter((entry) => entry.score !== 0)
    .map((entry) => entry.score)
  return average(nonZeroScores)
}

function calculateAvailability(player: Player): number {
  const hasActiveIssue = player.activeInjuries.length > 0 || player.activeSuspensions.length > 0
  return hasActiveIssue ? 20 : 100
}

const INJURY_PENALTY_MAX_DAYS = 60
const INJURY_PENALTY_MILD = 0.9
const INJURY_PENALTY_SEVERE = 0.5
const INJURY_PENALTY_UNKNOWN_DURATION = 0.7

function daysUntil(dateString: string | null, now: Date): number | null {
  if (!dateString) return null
  return (new Date(dateString).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
}

function calculateInjuryPenaltyFactor(player: Player, now: Date): number {
  if (player.activeInjuries.length === 0 && player.activeSuspensions.length === 0) return 1

  const daysRemaining = [
    ...player.activeInjuries.map((injury) => daysUntil(injury.expectedEndDate, now)),
    ...player.activeSuspensions.map((suspension) => daysUntil(suspension.endDate, now)),
  ].filter((value): value is number => value !== null)

  if (daysRemaining.length === 0) return INJURY_PENALTY_UNKNOWN_DURATION

  const maxDaysRemaining = Math.max(0, Math.min(INJURY_PENALTY_MAX_DAYS, Math.max(...daysRemaining)))
  const severity = maxDaysRemaining / INJURY_PENALTY_MAX_DAYS
  return INJURY_PENALTY_MILD - severity * (INJURY_PENALTY_MILD - INJURY_PENALTY_SEVERE)
}

function calculateMinutesConsistency(seasonStats: SeasonStats | null): number | null {
  if (!seasonStats || !seasonStats.appearances) return null
  const averageMinutes = seasonStats.minutesPlayed / seasonStats.appearances
  return Math.min(100, (averageMinutes / 90) * 100)
}

function calculateRotationRisk(seasonStats: SeasonStats | null): number | null {
  if (!seasonStats || !seasonStats.appearances) return null
  const substitutionRate = (seasonStats.substituteIn + seasonStats.substituteOut) / seasonStats.appearances
  return 100 - Math.min(100, substitutionRate * 100)
}

function calculateFormTrend(player: Player): number | null {
  const nonZero = player.recentSo5Scores
    .filter((entry) => entry.score !== 0)
    .slice()
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate))

  if (nonZero.length < 2) return null

  const newerCount = Math.ceil(nonZero.length / 2)
  const newerHalf = nonZero.slice(0, newerCount).map((entry) => entry.score)
  const olderHalf = nonZero.slice(newerCount).map((entry) => entry.score)

  const newerAverage = newerHalf.reduce((sum, value) => sum + value, 0) / newerHalf.length
  const olderAverage = olderHalf.reduce((sum, value) => sum + value, 0) / olderHalf.length

  return Math.max(0, Math.min(100, 50 + (newerAverage - olderAverage)))
}

export function evaluatePlayer(player: Player, now: Date = new Date()): PlayerEvaluation {
  const scorePotential = calculateScorePotential(player)

  const availability = calculateAvailability(player)
  const minutesConsistency = calculateMinutesConsistency(player.seasonStats)
  const rotationRisk = calculateRotationRisk(player.seasonStats)
  const formTrend = calculateFormTrend(player)

  const consistencyValue = average(
    [availability, minutesConsistency, rotationRisk, formTrend].filter(
      (value): value is number => value !== null,
    ),
  )

  const rawOverallValue = combineWeighted(scorePotential, 0.6, consistencyValue, 0.4)
  const injuryPenaltyFactor = calculateInjuryPenaltyFactor(player, now)
  const overallValue = rawOverallValue === null ? null : rawOverallValue * injuryPenaltyFactor

  return {
    overall: toEvaluatedValue(overallValue),
    scorePotential: toEvaluatedValue(scorePotential),
    consistency: {
      ...toEvaluatedValue(consistencyValue),
      factors: {
        availability: toEvaluatedValue(availability),
        minutesConsistency: toEvaluatedValue(minutesConsistency),
        rotationRisk: toEvaluatedValue(rotationRisk),
        formTrend: toEvaluatedValue(formTrend),
      },
    },
  }
}
