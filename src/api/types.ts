export type Position = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Coach' | 'Unknown'

export interface Club {
  name: string
  slug: string
}

export interface Injury {
  kind: string | null
  status: string | null
  startDate: string | null
  expectedEndDate: string | null
}

export interface Suspension {
  kind: string | null
  reason: string | null
  startDate: string
  endDate: string | null
}

export interface So5ScoreEntry {
  score: number
  gameDate: string
}

export interface SeasonStats {
  appearances: number
  minutesPlayed: number
  substituteIn: number
  substituteOut: number
}

export interface SorareAverageScores {
  l5: number | null
  l10: number | null
  l40: number | null
}

export type MarketRarity = 'limited' | 'rare' | 'super_rare' | 'unique'

/**
 * A live offer's price in whatever currency it was actually listed in, for when it isn't
 * EUR — Sorare's API does not auto-convert (e.g. a Solana-priced listing has no eurCents at
 * all), so this lets the UI show the real price instead of falsely claiming there's no offer.
 */
export interface MarketOfferAmount {
  currency: 'GBP' | 'USD' | 'SOL' | 'ETH'
  value: number
}

export interface MarketPrices {
  classicEurCents: number | null
  inSeasonEurCents: number | null
  /** Set only when classicEurCents is null but a real offer exists in a different currency. */
  classicOfferAmount: MarketOfferAmount | null
  /** Set only when inSeasonEurCents is null but a real offer exists in a different currency. */
  inSeasonOfferAmount: MarketOfferAmount | null
  /** Slug of the specific card the Classic price/offer came from — null unless there's an active offer. Links to sorare.com/football/cards/{slug}. */
  classicCardSlug: string | null
  /** Slug of the specific card the In-Season price/offer came from — null unless there's an active offer. */
  inSeasonCardSlug: string | null
  /** True when the Classic price came from an open English auction rather than a fixed-price offer (only checked when there's no liveSingleSaleOffer). */
  classicIsAuction: boolean
  /** True when the In-Season price came from an open English auction rather than a fixed-price offer. */
  inSeasonIsAuction: boolean
  /** Auction end date for the Classic price, set only when classicIsAuction is true. */
  classicAuctionEndDate: string | null
  /** Auction end date for the In-Season price, set only when inSeasonIsAuction is true. */
  inSeasonAuctionEndDate: string | null
  /** Which rarity these prices were fetched for — lets consumers detect stale data after a rarity-filter change. */
  rarity: MarketRarity
}

export interface Player {
  slug: string
  displayName: string
  position: Position
  age: number
  activeClub: Club | null
  activeInjuries: Injury[]
  activeSuspensions: Suspension[]
  recentSo5Scores: So5ScoreEntry[]
  seasonStats: SeasonStats | null
  sorareAverageScores: SorareAverageScores
  marketPrices: MarketPrices
}

export interface PlayerSearchHit {
  slug: string
  displayName: string
  positions: Position[]
  clubName: string | null
}

export interface PlayerSearchResult {
  totalHits: number
  page: number
  totalPages: number
  hits: PlayerSearchHit[]
}

export interface GraphQLError {
  message: string
}

export class SorareApiError extends Error {
  graphQLErrors?: GraphQLError[]

  constructor(message: string, graphQLErrors?: GraphQLError[]) {
    super(message)
    this.name = 'SorareApiError'
    this.graphQLErrors = graphQLErrors
  }
}
