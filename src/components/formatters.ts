import type { SorareAverageScores } from '../api/types'

export function formatScore(value: number | null): string {
  return value == null || Number.isNaN(value) ? '–' : String(Math.round(value))
}

function formatSorareAverage(value: number | null): string {
  return value === null || value === 0 ? '–' : formatScore(value)
}

export function formatSorareAverages(scores: SorareAverageScores): string {
  const { l5, l10, l40 } = scores
  return `L5 ${formatSorareAverage(l5)} · L10 ${formatSorareAverage(l10)} · L40 ${formatSorareAverage(l40)}`
}
