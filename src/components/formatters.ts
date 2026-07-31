import type { AvailabilityIssue, PlayerEvaluation } from '../api/scoring'

export function formatScore(value: number | null): string {
  return value == null || Number.isNaN(value) ? '–' : String(Math.round(value))
}

export function formatSorareAverage(value: number | null): string {
  return value === null || value === 0 ? '–' : formatScore(value)
}

export function formatMarketPrice(eurCents: number | null): string {
  return eurCents === null ? 'kein Angebot' : `${(eurCents / 100).toFixed(2)} €`
}

function formatExpectedReturn(expectedReturn: string | null, isOverdue: boolean): string {
  if (!expectedReturn) return 'Rückkehr unbekannt'
  const formatted = new Date(expectedReturn).toLocaleDateString('de-DE')
  return isOverdue ? `Rückkehr überfällig (erwartet war ${formatted})` : `voraussichtlich zurück am ${formatted}`
}

export function getAvailabilityWarning(issue: AvailabilityIssue | null): string | null {
  if (!issue) return null
  return `${issue.kind ?? 'Verletzung/Sperre'} — ${formatExpectedReturn(issue.expectedReturn, issue.isOverdue)}`
}

export function getScoreExplanation(evaluation: PlayerEvaluation): string {
  const potential = formatScore(evaluation.scorePotential.value)
  const consistency = formatScore(evaluation.consistency.value)
  const base = `Score: 60% Potenzial (${potential}) + 40% Beständigkeit (${consistency})`

  if (!evaluation.availabilityIssue) return base

  const factorPercent = Math.round(evaluation.availabilityIssue.penaltyFactor * 100)
  return `${base}, ×${factorPercent}% wegen Verletzung/Sperre → ${formatScore(evaluation.overall.value)}`
}
