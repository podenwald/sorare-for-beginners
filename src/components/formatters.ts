import type { AvailabilityIssue, PlayerEvaluation } from '../api/scoring'
import { MARKET_RARITIES } from '../api/sorareClient'
import type { MarketOfferAmount, MarketRarity } from '../api/types'

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

export function formatMarketRarity(rarity: MarketRarity): string {
  return MARKET_RARITIES.find((entry) => entry.value === rarity)?.label ?? rarity
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
