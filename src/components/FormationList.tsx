import type { CandidateExplanation, FormationSlot } from '../api/formation'
import { formatScore, formatSlotLabel, formatSlotOutcome } from './formatters'
import { PlayerScoreSummary } from './PlayerScoreSummary'

interface FormationListProps {
  slots: FormationSlot[]
  explanations: Map<string, CandidateExplanation>
}

export function FormationList({ slots, explanations }: FormationListProps) {
  const l10Sum = slots.reduce((sum, slot) => sum + (slot.candidate?.player.sorareAverageScores.l10 ?? 0), 0)

  return (
    <ul className="formation-list">
      {slots.map((slot) => {
        const explanation = slot.candidate ? explanations.get(slot.candidate.player.slug) : undefined
        return (
          <li key={slot.label} className="formation-slot">
            <span className="formation-slot-label">{formatSlotLabel(slot.label)}</span>
            {slot.candidate ? (
              <span className="formation-slot-candidate">
                <PlayerScoreSummary player={slot.candidate.player} evaluation={slot.candidate.evaluation} />
                {explanation && (
                  <span className="icon-tooltip" data-tooltip={formatSlotOutcome(explanation)}>
                    ℹ️
                  </span>
                )}
              </span>
            ) : (
              <span className="formation-slot-empty">{formatSlotLabel(slot.label)} hinzufügen</span>
            )}
          </li>
        )
      })}
      <li className="formation-total">
        <span className="formation-slot-label">Team L10-Summe</span>
        <strong>{formatScore(l10Sum)}</strong>
      </li>
    </ul>
  )
}
