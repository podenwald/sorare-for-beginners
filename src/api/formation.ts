import type { Player } from './types'
import type { PlayerEvaluation } from './scoring'

export interface EvaluatedCandidate {
  player: Player
  evaluation: PlayerEvaluation
}

export type FormationSlotLabel = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Flex'

export interface FormationSlot {
  label: FormationSlotLabel
  candidate: EvaluatedCandidate | null
}

export type FormationMode = 'normal' | 'defensiveStack'

const EXACT_POSITION_SLOTS: { label: FormationSlotLabel; position: Player['position'] }[] = [
  { label: 'Goalkeeper', position: 'Goalkeeper' },
  { label: 'Defender', position: 'Defender' },
  { label: 'Midfielder', position: 'Midfielder' },
  { label: 'Forward', position: 'Forward' },
]

function rankValue(candidate: EvaluatedCandidate): number {
  if (candidate.evaluation.scorePotential.category === 'unbekannt') return -Infinity
  return candidate.evaluation.overall.value ?? -Infinity
}

function bestCandidate(pool: EvaluatedCandidate[]): EvaluatedCandidate | null {
  if (pool.length === 0) return null

  let best = pool[0]
  let bestValue = rankValue(best)

  for (let i = 1; i < pool.length; i++) {
    const candidate = pool[i]
    const value = rankValue(candidate)
    if (value > bestValue) {
      best = candidate
      bestValue = value
    }
  }

  return best
}

export function assignFormation(
  candidates: EvaluatedCandidate[],
  mode: FormationMode = 'normal',
): FormationSlot[] {
  let remaining = candidates.slice()
  const slots: FormationSlot[] = []

  for (const { label, position } of EXACT_POSITION_SLOTS) {
    const pool = remaining.filter((candidate) => candidate.player.position === position)
    const chosen = bestCandidate(pool)
    slots.push({ label, candidate: chosen })
    if (chosen) {
      remaining = remaining.filter((candidate) => candidate !== chosen)
    }
  }

  const flexPool = remaining.filter((candidate) =>
    mode === 'defensiveStack'
      ? candidate.player.position === 'Defender'
      : candidate.player.position !== 'Goalkeeper',
  )
  slots.push({ label: 'Flex', candidate: bestCandidate(flexPool) })

  return slots
}
