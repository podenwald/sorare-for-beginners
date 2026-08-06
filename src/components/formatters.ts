import type { AvailabilityIssue, PlayerEvaluation } from '../api/scoring'
import { MARKET_RARITIES } from '../api/sorareClient'
import type { MarketOfferAmount, MarketRarity } from '../api/types'
import type { CandidateExplanation, FormationSlotLabel } from '../api/formation'

export function formatScore(value: number | null): string {
  return value == null || Number.isNaN(value) ? '–' : String(Math.round(value))
}

export function formatSorareAverage(value: number | null): string {
  return value === null || value === 0 ? '–' : formatScore(value)
}

const EUR_FORMATTER = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function formatMarketPrice(eurCents: number | null): string {
  return eurCents === null ? 'kein Angebot' : EUR_FORMATTER.format(eurCents / 100)
}

const GBP_FORMATTER = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' })
const USD_FORMATTER = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })

// SOL/ETH have no ISO currency code for Intl.NumberFormat's `currency` option, so they're
// formatted as plain numbers with a unit suffix instead of going through a currency formatter.
export function formatMarketOfferAmount(amount: MarketOfferAmount): string {
  switch (amount.currency) {
    case 'GBP':
      return GBP_FORMATTER.format(amount.value)
    case 'USD':
      return USD_FORMATTER.format(amount.value)
    case 'SOL':
      return `${amount.value.toFixed(4)} SOL`
    case 'ETH':
      return `${amount.value.toFixed(4)} ETH`
  }
}

export function formatAuctionRemaining(endDate: string): string {
  const remainingMs = new Date(endDate).getTime() - Date.now()
  if (remainingMs <= 0) return 'beendet'
  const hours = Math.floor(remainingMs / (60 * 60 * 1000))
  if (hours >= 24) return `noch ${Math.floor(hours / 24)} Tag(e)`
  if (hours >= 1) return `noch ${hours} Std.`
  return `noch ${Math.max(1, Math.floor(remainingMs / (60 * 1000)))} Min.`
}

export function formatMarketRarity(rarity: MarketRarity): string {
  return MARKET_RARITIES.find((entry) => entry.value === rarity)?.label ?? rarity
}

export const SLOT_LABEL_TEXT: Record<FormationSlotLabel, string> = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
  Flex: 'Flex',
}

export function formatSlotLabel(label: FormationSlotLabel): string {
  return SLOT_LABEL_TEXT[label]
}

export function formatSlotOutcome(explanation: CandidateExplanation): string {
  if (explanation.assignedSlot) {
    const label = formatSlotLabel(explanation.assignedSlot)
    if (!explanation.runnerUp) return `Ausgewählt für ${label} (einzige Option)`
    return `Ausgewählt für ${label} — vor ${explanation.runnerUp.player.displayName} (Score ${formatScore(explanation.runnerUp.evaluation.overall.value)})`
  }
  if (explanation.beatenBy) {
    const forSlot = explanation.beatenForSlot ? ` die ${formatSlotLabel(explanation.beatenForSlot)}-Position` : ' den Slot'
    return `Nicht ausgewählt: ${explanation.beatenBy.player.displayName} hat${forSlot} mit Score ${formatScore(explanation.beatenBy.evaluation.overall.value)} belegt`
  }
  return `Nicht ausgewählt: ${explanation.ineligibleReason}`
}

export function getMarketOfferUrl(cardSlug: string): string {
  return `https://sorare.com/football/cards/${cardSlug}`
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
