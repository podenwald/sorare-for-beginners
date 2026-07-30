import type { FormationSlot } from '../api/formation'
import { formatScore } from './formatters'
import { PlayerScoreSummary } from './PlayerScoreSummary'

interface FormationListProps {
  slots: FormationSlot[]
}

const SLOT_LABEL_TEXT: Record<FormationSlot['label'], string> = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
  Flex: 'Flex',
}

export function FormationList({ slots }: FormationListProps) {
  const l10Sum = slots.reduce((sum, slot) => sum + (slot.candidate?.player.sorareAverageScores.l10 ?? 0), 0)

  return (
    <ul className="formation-list">
      {slots.map((slot) => (
        <li key={slot.label} className="formation-slot">
          <span className="formation-slot-label">{SLOT_LABEL_TEXT[slot.label]}</span>
          {slot.candidate ? (
            <span className="formation-slot-candidate">
              <PlayerScoreSummary player={slot.candidate.player} evaluation={slot.candidate.evaluation} />
            </span>
          ) : (
            <span className="formation-slot-empty">{SLOT_LABEL_TEXT[slot.label]} hinzufügen</span>
          )}
        </li>
      ))}
      <li className="formation-total">
        <span className="formation-slot-label">Team L10-Summe</span>
        <strong>{formatScore(l10Sum)}</strong>
      </li>
    </ul>
  )
}
