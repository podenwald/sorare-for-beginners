import type { EvaluatedCandidate, FormationSlot } from '../api/formation'
import type { EvaluationCategory } from '../api/scoring'

interface FormationListProps {
  slots: FormationSlot[]
}

function displayCategory(candidate: EvaluatedCandidate): EvaluationCategory {
  return candidate.evaluation.scorePotential.category === 'unbekannt'
    ? 'unbekannt'
    : candidate.evaluation.overall.category
}

const CATEGORY_ICON: Record<EvaluationCategory, string> = {
  gut: '🟢',
  mittel: '🟡',
  riskant: '🔴',
  unbekannt: '⚪',
}

const SLOT_LABEL_TEXT: Record<FormationSlot['label'], string> = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
  Flex: 'Flex',
}

export function FormationList({ slots }: FormationListProps) {
  return (
    <ul className="formation-list">
      {slots.map((slot) => (
        <li key={slot.label} className="formation-slot">
          <span className="formation-slot-label">{SLOT_LABEL_TEXT[slot.label]}</span>
          {slot.candidate ? (
            <span className="formation-slot-candidate">
              {slot.candidate.player.displayName} — {slot.candidate.evaluation.overall.value ?? '–'}{' '}
              {CATEGORY_ICON[displayCategory(slot.candidate)]}
            </span>
          ) : (
            <span className="formation-slot-empty">{SLOT_LABEL_TEXT[slot.label]} hinzufügen</span>
          )}
        </li>
      ))}
    </ul>
  )
}
