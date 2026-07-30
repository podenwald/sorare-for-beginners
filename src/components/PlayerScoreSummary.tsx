import type { Player } from '../api/types'
import type { EvaluationCategory, PlayerEvaluation } from '../api/scoring'
import { formatScore, formatSorareAverage, getAvailabilityWarning, getScoreExplanation } from './formatters'

const CATEGORY_ICON: Record<EvaluationCategory, string> = {
  gut: '🟢',
  mittel: '🟡',
  riskant: '🔴',
  unbekannt: '⚪',
}

function displayCategory(evaluation: PlayerEvaluation): EvaluationCategory {
  return evaluation.scorePotential.category === 'unbekannt' ? 'unbekannt' : evaluation.overall.category
}

interface PlayerScoreSummaryProps {
  player: Player
  evaluation: PlayerEvaluation
}

export function PlayerScoreSummary({ player, evaluation }: PlayerScoreSummaryProps) {
  const category = displayCategory(evaluation)
  const availabilityWarning = getAvailabilityWarning(evaluation.availabilityIssue)
  const scoreExplanation = getScoreExplanation(evaluation)

  return (
    <span className="player-score-summary">
      {availabilityWarning && (
        <span className="icon-tooltip" data-tooltip={availabilityWarning}>
          💉
        </span>
      )}
      <span className="player-score-summary-text">
        {player.displayName}
        {player.activeClub && ` (${player.activeClub.name})`} — {formatScore(evaluation.overall.value)}{' '}
        <span className="icon-tooltip" data-tooltip={scoreExplanation}>
          {CATEGORY_ICON[category]}
        </span>{' '}
        {category}
        <br />
        <small>
          L5 {formatSorareAverage(player.sorareAverageScores.l5)} ·{' '}
          <strong>L10 {formatSorareAverage(player.sorareAverageScores.l10)}</strong> · L40{' '}
          {formatSorareAverage(player.sorareAverageScores.l40)}
        </small>
      </span>
    </span>
  )
}
