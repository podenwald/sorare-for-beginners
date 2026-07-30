import type { PlayerEvaluation } from '../api/scoring'
import type { Player, SorareAverageScores } from '../api/types'

export function formatScore(value: number | null): string {
  return value == null || Number.isNaN(value) ? '–' : String(Math.round(value))
}

export function formatSorareAverage(value: number | null): string {
  return value === null || value === 0 ? '–' : formatScore(value)
}

export function formatSorareAverages(scores: SorareAverageScores): string {
  const { l5, l10, l40 } = scores
  return `L5 ${formatSorareAverage(l5)} · L10 ${formatSorareAverage(l10)} · L40 ${formatSorareAverage(l40)}`
}

function formatExpectedReturn(dateString: string | null): string {
  if (!dateString) return 'Rückkehr unbekannt'
  return `voraussichtlich zurück am ${new Date(dateString).toLocaleDateString('de-DE')}`
}

export function getAvailabilityWarning(player: Player): string | null {
  const injury = player.activeInjuries[0]
  if (injury) return `${injury.kind ?? 'Verletzung'} — ${formatExpectedReturn(injury.expectedEndDate)}`

  const suspension = player.activeSuspensions[0]
  if (suspension) return `${suspension.kind ?? suspension.reason ?? 'Sperre'} — ${formatExpectedReturn(suspension.endDate)}`

  return null
}

export function getScoreExplanation(evaluation: PlayerEvaluation, hasAvailabilityIssue: boolean): string {
  const potential = formatScore(evaluation.scorePotential.value)
  const consistency = formatScore(evaluation.consistency.value)
  const base = `Score: 60% Potenzial (${potential}) + 40% Beständigkeit (${consistency})`
  return hasAvailabilityIssue ? `${base}, zusätzlich abgewertet wegen Verletzung/Sperre` : base
}
