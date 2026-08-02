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

export type FormationMode = 'normal' | 'defensiveStack' | 'teamStack'

const EXACT_POSITION_SLOTS: { label: FormationSlotLabel; position: Player['position'] }[] = [
  { label: 'Goalkeeper', position: 'Goalkeeper' },
  { label: 'Defender', position: 'Defender' },
  { label: 'Midfielder', position: 'Midfielder' },
  { label: 'Forward', position: 'Forward' },
]

const FLEX_ELIGIBLE: Record<FormationMode, (candidate: EvaluatedCandidate) => boolean> = {
  normal: (candidate) => candidate.player.position !== 'Goalkeeper',
  defensiveStack: (candidate) => candidate.player.position === 'Defender',
  teamStack: (candidate) => candidate.player.position !== 'Goalkeeper',
}

const FLEX_INELIGIBLE_REASON: Record<FormationMode, string> = {
  normal: 'Torhüter sind für die Flex-Position nicht wählbar',
  defensiveStack: 'Im Defensiv-Stack-Modus ist die Flex-Position nur für Verteidiger wählbar',
  teamStack: 'Torhüter sind für die Flex-Position nicht wählbar',
}

function rankValue(candidate: EvaluatedCandidate): number {
  if (candidate.evaluation.scorePotential.category === 'unbekannt') return -Infinity
  return candidate.evaluation.overall.value ?? -Infinity
}

// Descending by rankValue; ties keep original input order (explicit index tiebreak, not just
// relying on sort stability) — this is the exact tie-break `assignFormation` has always had.
function rankPool(pool: EvaluatedCandidate[]): EvaluatedCandidate[] {
  return pool
    .map((candidate, index) => ({ candidate, index }))
    .sort((a, b) => rankValue(b.candidate) - rankValue(a.candidate) || a.index - b.index)
    .map((entry) => entry.candidate)
}

export interface CandidateExplanation {
  assignedSlot: FormationSlotLabel | null
  runnerUp: EvaluatedCandidate | null
  beatenBy: EvaluatedCandidate | null
  ineligibleReason: string | null
}

interface FormationComputation {
  slots: FormationSlot[]
  explanations: Map<string, CandidateExplanation>
}

function computeFormation(
  candidates: EvaluatedCandidate[],
  mode: FormationMode,
  stackClubSlug: string | undefined,
): FormationComputation {
  const explanations = new Map<string, CandidateExplanation>()
  const positionLoss = new Map<string, EvaluatedCandidate>()

  if (mode === 'teamStack') {
    for (const candidate of candidates) {
      if (!stackClubSlug || candidate.player.activeClub?.slug !== stackClubSlug) {
        explanations.set(candidate.player.slug, {
          assignedSlot: null,
          runnerUp: null,
          beatenBy: null,
          ineligibleReason: stackClubSlug
            ? 'Nicht im ausgewählten Team-Stack-Verein'
            : 'Noch kein Team-Stack-Verein ausgewählt',
        })
      }
    }
  }

  let remaining =
    mode === 'teamStack'
      ? stackClubSlug
        ? candidates.filter((candidate) => candidate.player.activeClub?.slug === stackClubSlug)
        : []
      : candidates.slice()

  const slots: FormationSlot[] = []

  for (const { label, position } of EXACT_POSITION_SLOTS) {
    const pool = remaining.filter((candidate) => candidate.player.position === position)
    const ranked = rankPool(pool)
    const winner = ranked[0] ?? null
    const runnerUp = ranked[1] ?? null
    slots.push({ label, candidate: winner })
    if (winner) {
      explanations.set(winner.player.slug, { assignedSlot: label, runnerUp, beatenBy: null, ineligibleReason: null })
      for (const loser of ranked.slice(1)) {
        positionLoss.set(loser.player.slug, winner)
      }
      remaining = remaining.filter((candidate) => candidate !== winner)
    }
  }

  const flexEligible = remaining.filter(FLEX_ELIGIBLE[mode])
  const rankedFlex = rankPool(flexEligible)
  const flexWinner = rankedFlex[0] ?? null
  const flexRunnerUp = rankedFlex[1] ?? null
  slots.push({ label: 'Flex', candidate: flexWinner })
  if (flexWinner) {
    explanations.set(flexWinner.player.slug, {
      assignedSlot: 'Flex',
      runnerUp: flexRunnerUp,
      beatenBy: null,
      ineligibleReason: null,
    })
  }

  // Final resolution: anyone not yet assigned a slot. Prefer the Flex outcome over an own-position
  // loss when the candidate actually got a Flex chance — that's the FINAL reason they didn't make
  // the team (a second chance they also lost), more relevant than the earlier, first loss (their
  // own position) that the Flex chance already superseded. Own-position loss is only the answer
  // for someone who was never Flex-eligible in the first place (no second chance to lose).
  for (const candidate of remaining) {
    if (explanations.has(candidate.player.slug)) continue // already the Flex winner
    if (FLEX_ELIGIBLE[mode](candidate)) {
      explanations.set(candidate.player.slug, {
        assignedSlot: null,
        runnerUp: null,
        beatenBy: flexWinner,
        ineligibleReason: null,
      })
      continue
    }
    const lostPosition = positionLoss.get(candidate.player.slug)
    if (lostPosition) {
      explanations.set(candidate.player.slug, {
        assignedSlot: null,
        runnerUp: null,
        beatenBy: lostPosition,
        ineligibleReason: null,
      })
    } else {
      explanations.set(candidate.player.slug, {
        assignedSlot: null,
        runnerUp: null,
        beatenBy: null,
        ineligibleReason: FLEX_INELIGIBLE_REASON[mode],
      })
    }
  }

  return { slots, explanations }
}

export function assignFormation(
  candidates: EvaluatedCandidate[],
  mode: FormationMode = 'normal',
  stackClubSlug?: string,
): FormationSlot[] {
  return computeFormation(candidates, mode, stackClubSlug).slots
}

export function explainCandidates(
  candidates: EvaluatedCandidate[],
  mode: FormationMode = 'normal',
  stackClubSlug?: string,
): Map<string, CandidateExplanation> {
  return computeFormation(candidates, mode, stackClubSlug).explanations
}
