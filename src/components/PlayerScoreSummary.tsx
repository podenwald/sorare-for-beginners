import type { MarketOfferAmount, Player } from '../api/types'
import type { EvaluationCategory, PlayerEvaluation } from '../api/scoring'
import {
  formatAuctionRemaining,
  formatMarketOfferAmount,
  formatMarketPrice,
  formatMarketRarity,
  formatScore,
  formatSorareAverage,
  getAvailabilityWarning,
  getMarketOfferUrl,
  getScoreExplanation,
} from './formatters'

const CATEGORY_ICON: Record<EvaluationCategory, string> = {
  gut: '🟢',
  mittel: '🟡',
  riskant: '🔴',
  unbekannt: '⚪',
}

function displayCategory(evaluation: PlayerEvaluation): EvaluationCategory {
  return evaluation.scorePotential.category === 'unbekannt' ? 'unbekannt' : evaluation.overall.category
}

interface MarketPriceProps {
  eurCents: number | null
  offerAmount: MarketOfferAmount | null
  cardSlug: string | null
  isAuction: boolean
  auctionEndDate: string | null
}

function MarketPrice({ eurCents, offerAmount, cardSlug, isAuction, auctionEndDate }: MarketPriceProps) {
  let formatted: string
  if (eurCents !== null) {
    formatted = formatMarketPrice(eurCents)
  } else if (offerAmount) {
    formatted = formatMarketOfferAmount(offerAmount)
  } else {
    formatted = formatMarketPrice(null)
  }

  const price = !cardSlug ? (
    <>{formatted}</>
  ) : (
    <a href={getMarketOfferUrl(cardSlug)} target="_blank" rel="noopener noreferrer">
      {formatted}
    </a>
  )

  if (!isAuction) return price
  return (
    <>
      {price} <span className="auction-badge">(Auktion{auctionEndDate ? `, ${formatAuctionRemaining(auctionEndDate)}` : ''})</span>
    </>
  )
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
        <br />
        <small>
          {formatMarketRarity(player.marketPrices.rarity)} · Classic{' '}
          <MarketPrice
            eurCents={player.marketPrices.classicEurCents}
            offerAmount={player.marketPrices.classicOfferAmount}
            cardSlug={player.marketPrices.classicCardSlug}
            isAuction={player.marketPrices.classicIsAuction}
            auctionEndDate={player.marketPrices.classicAuctionEndDate}
          />{' '}
          · In-Season{' '}
          <MarketPrice
            eurCents={player.marketPrices.inSeasonEurCents}
            offerAmount={player.marketPrices.inSeasonOfferAmount}
            cardSlug={player.marketPrices.inSeasonCardSlug}
            isAuction={player.marketPrices.inSeasonIsAuction}
            auctionEndDate={player.marketPrices.inSeasonAuctionEndDate}
          />
        </small>
      </span>
    </span>
  )
}
