import { explainCandidates } from '../api/formation'
import type { EvaluatedCandidate, FormationMode, FormationSlot } from '../api/formation'
import { formatScore, formatSlotOutcome } from './formatters'
import { PlayerScoreSummary } from './PlayerScoreSummary'

interface FormationListProps {
  slots: FormationSlot[]
  candidates: EvaluatedCandidate[]
  mode: FormationMode
  stackClubSlug?: string
}

const SLOT_LABEL_TEXT: Record<FormationSlot['label'], string> = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
  Flex: 'Flex',
}

export function FormationList({ slots, candidates, mode, stackClubSlug }: FormationListProps) {
  const l10Sum = slots.reduce((sum, slot) => sum + (slot.candidate?.player.sorareAverageScores.l10 ?? 0), 0)
  const explanations = explainCandidates(candidates, mode, stackClubSlug)

  return (
    <ul className="formation-list">
      {slots.map((slot) => {
        const explanation = slot.candidate ? explanations.get(slot.candidate.player.slug) : undefined
        return (
          <li key={slot.label} className="formation-slot">
            <span className="formation-slot-label">{SLOT_LABEL_TEXT[slot.label]}</span>
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
              <span className="formation-slot-empty">{SLOT_LABEL_TEXT[slot.label]} hinzufügen</span>
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
