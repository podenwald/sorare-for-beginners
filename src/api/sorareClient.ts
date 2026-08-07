import type {
  GraphQLError,
  MarketOfferAmount,
  MarketRarity,
  Player,
  PlayerSearchHit,
  PlayerSearchResult,
  Position,
} from './types'
import { SorareApiError } from './types'
import { getCurrentSeasonStartYear } from './season'

export const LEAGUES = [
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  { slug: 'bundesliga-de', name: 'Bundesliga' },
  { slug: 'laliga-es', name: 'LALIGA EA SPORTS' },
  { slug: 'ligue-1-fr', name: 'Ligue 1' },
  { slug: 'mlspa', name: 'MLS' },
  { slug: 'jupiler-pro-league', name: 'Jupiler Pro League' },
  { slug: 'eredivisie', name: 'Eredivisie' },
  { slug: 'j1-league', name: 'J1 League' },
  { slug: 'k-league-1', name: 'K League 1' },
  { slug: 'serie-a-it', name: 'Italian League' },
  { slug: 'primeira-liga-pt', name: 'Liga Portugal' },
  { slug: 'spor-toto-super-lig', name: 'Turkish League' },
  { slug: 'football-league-championship', name: 'EFL Championship' },
  { slug: 'premiership-gb-sct', name: 'SPFL' },
  { slug: 'eliteserien', name: 'Eliteserien (Norwegen)' },
  { slug: '1-hnl', name: 'HNL (Kroatien)' },
  { slug: 'superliga-argentina-de-futbol', name: 'Liga Profesional Argentina (Argentinien)' },
  { slug: '2-bundesliga', name: '2. Bundesliga (Deutschland)' },
  { slug: 'ligue-2-fr', name: 'Ligue 2 (Frankreich)' },
  { slug: 'campeonato-brasileiro-serie-a', name: 'Serie A (Brasilien)' },
  { slug: 'liga-mx', name: 'Liga MX (Mexiko)' },
  { slug: 'russian-premier-league', name: 'Premier League (Russland)' },
  { slug: 'super-league-ch', name: 'Super League (Schweiz)' },
  { slug: 'segunda-division-es', name: 'Segunda División (Spanien)' },
  { slug: 'serie-b-it', name: 'Serie B (Italien)' },
  { slug: 'primera-division-cl', name: 'Primera División (Chile)' },
  { slug: 'liga-pro', name: 'Liga Pro (Ecuador)' },
  { slug: 'primera-division-pe', name: 'Liga 1 (Peru)' },
  { slug: 'chinese-super-league', name: 'Chinese Super League (China)' },
  { slug: 'primera-a', name: 'Primera A (Kolumbien)' },
  { slug: 'austrian-bundesliga', name: 'Bundesliga (Österreich)' },
  { slug: 'superliga-dk', name: 'Superliga (Dänemark)' },
] as const

export const ALL_LEAGUE_SLUGS: string[] = LEAGUES.map((league) => league.slug)

export const CHAMPION_LEAGUE_SLUGS: string[] = [
  'premier-league-gb-eng',
  'bundesliga-de',
  'laliga-es',
  'ligue-1-fr',
  'serie-a-it',
]

export const CONTENDER_LEAGUE_SLUGS: string[] = [
  'eliteserien',
  '1-hnl',
  'superliga-argentina-de-futbol',
  '2-bundesliga',
  'ligue-2-fr',
  'campeonato-brasileiro-serie-a',
  'liga-mx',
  'russian-premier-league',
  'super-league-ch',
  'segunda-division-es',
  'serie-a-it',
  'serie-b-it',
  'primera-division-cl',
  'liga-pro',
  'primera-division-pe',
  'chinese-super-league',
  'primera-a',
  'austrian-bundesliga',
  'spor-toto-super-lig',
  'superliga-dk',
]

export const MARKET_RARITIES: { value: MarketRarity; label: string }[] = [
  { value: 'limited', label: 'Limited' },
  { value: 'rare', label: 'Rare' },
  { value: 'super_rare', label: 'Super Rare' },
  { value: 'unique', label: 'Unique' },
]

interface ProxyResponse<T> {
  data?: T
  errors?: GraphQLError[]
}

async function callProxy<T>(operation: string, variables: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, variables }),
    })
  } catch {
    throw new SorareApiError('Netzwerkfehler beim Aufruf der Sorare-API')
  }

  let body: ProxyResponse<T>
  try {
    body = (await response.json()) as ProxyResponse<T>
  } catch {
    throw new SorareApiError('Ungültige Antwort der Sorare-API')
  }

  if (body.errors && body.errors.length > 0) {
    throw new SorareApiError(body.errors[0].message, body.errors)
  }

  if (!body.data) {
    throw new SorareApiError('Keine Daten in der Antwort')
  }

  return body.data
}

interface PlayerDetailRaw {
  anyPlayer: {
    slug: string
    displayName: string
    position: Player['position']
    age: number
    activeClub: { name: string; slug: string } | null
    activeInjuries: Player['activeInjuries']
    activeSuspensions: Player['activeSuspensions']
    allSo5Scores: {
      nodes: { score: number; game: { date: string } }[]
    }
    l5: number | null
    l10: number | null
    l40: number | null
    stats: { appearances: number; minutesPlayed: number; substituteIn: number; substituteOut: number } | null
    classicPrice: MarketOfferCardRaw | null
    inSeasonPrice: MarketOfferCardRaw | null
  } | null
}

type SorareOfferCurrency = 'EUR' | 'GBP' | 'USD' | 'LAMPORT' | 'WEI'

interface MarketAmountsRaw {
  eurCents: number | null
  gbpCents: number | null
  usdCents: number | null
  lamport: string | null
  wei: string | null
  referenceCurrency: SorareOfferCurrency
}

interface EnglishAuctionRaw {
  open: boolean
  endDate: string
  currentPrice: string
  currency: SorareOfferCurrency
  bestBid: { amounts: MarketAmountsRaw } | null
}

interface MarketOfferCardRaw {
  slug: string
  liveSingleSaleOffer: { receiverSide: { amounts: MarketAmountsRaw } } | null
  latestEnglishAuction: EnglishAuctionRaw | null
}

interface MarketOffer {
  eurCents: number | null
  offerAmount: MarketOfferAmount | null
  cardSlug: string
  isAuction: boolean
  auctionEndDate: string | null
}

// An offer's `amounts` only has the ONE field populated that matches its own referenceCurrency —
// Sorare doesn't auto-convert (e.g. a Solana-priced listing has lamport set, everything else
// null). Switching on `referenceCurrency` itself (rather than just checking which field happens
// to be non-null) is deliberate: it's the authoritative signal for which field to trust, so a
// listing that ever carries more than one populated field can't pick the wrong one.
function deriveOfferAmount(amounts: MarketAmountsRaw): MarketOfferAmount | null {
  switch (amounts.referenceCurrency) {
    case 'LAMPORT':
      return amounts.lamport == null ? null : { currency: 'SOL', value: Number(amounts.lamport) / 1_000_000_000 }
    case 'WEI':
      return amounts.wei == null ? null : { currency: 'ETH', value: Number(amounts.wei) / 1e18 }
    case 'GBP':
      return amounts.gbpCents == null ? null : { currency: 'GBP', value: amounts.gbpCents / 100 }
    case 'USD':
      return amounts.usdCents == null ? null : { currency: 'USD', value: amounts.usdCents / 100 }
    case 'EUR':
      return null
  }
}

// `bestBid` only exists once someone has actually bid — before that, `currentPrice` is the
// auction's starting price, given as a raw string in whatever unit `currency` natively uses
// (verified live against api.sorare.com: a WEI-currency auction's currentPrice is byte-for-byte
// identical to its bestBid.amounts.wei, e.g. both "29000000000000000" — not a decimal display
// value). By the same pattern EUR/GBP/USD are presumed to be raw *Cents integers as a string;
// no open fiat-denominated auction was available to confirm directly, so verify against a live
// EUR/GBP/USD auction via curl if one turns up and this looks off. Wrapping it into the same
// MarketAmountsRaw shape lets it flow through deriveOfferAmount/eurCents unchanged either way.
function startingPriceAmounts(currentPrice: string, currency: SorareOfferCurrency): MarketAmountsRaw {
  const amounts: MarketAmountsRaw = {
    eurCents: null,
    gbpCents: null,
    usdCents: null,
    lamport: null,
    wei: null,
    referenceCurrency: currency,
  }
  switch (currency) {
    case 'EUR':
      amounts.eurCents = Number(currentPrice)
      break
    case 'GBP':
      amounts.gbpCents = Number(currentPrice)
      break
    case 'USD':
      amounts.usdCents = Number(currentPrice)
      break
    case 'LAMPORT':
      amounts.lamport = currentPrice
      break
    case 'WEI':
      amounts.wei = currentPrice
      break
  }
  return amounts
}

function extractAuctionAmounts(auction: EnglishAuctionRaw | null): { amounts: MarketAmountsRaw; endDate: string } | null {
  if (!auction || !auction.open) return null
  const amounts = auction.bestBid ? auction.bestBid.amounts : startingPriceAmounts(auction.currentPrice, auction.currency)
  return { amounts, endDate: auction.endDate }
}

// ODI-315: a card with no fixed-price offer can still be for sale via an open English auction —
// only fall back to the auction when there's no liveSingleSaleOffer at all, matching Sorare's
// own exclusivity (a listed card is either a fixed-price sale or an auction, never both).
function extractMarketOffer(card: MarketOfferCardRaw | null): MarketOffer | null {
  if (!card) return null

  const auction = card.liveSingleSaleOffer ? null : extractAuctionAmounts(card.latestEnglishAuction ?? null)
  const amounts = card.liveSingleSaleOffer?.receiverSide?.amounts ?? auction?.amounts
  if (!amounts) return null

  const eurCents = amounts.eurCents ?? null
  const offerAmount = eurCents === null ? deriveOfferAmount(amounts) : null
  if (eurCents === null && offerAmount === null) return null

  return { eurCents, offerAmount, cardSlug: card.slug, isAuction: auction !== null, auctionEndDate: auction?.endDate ?? null }
}

interface AuctionCandidateRaw {
  slug: string
  latestEnglishAuction: EnglishAuctionRaw | null
}

interface AuctionFallbackCandidatesRaw {
  anyPlayer: {
    classicCandidates: { nodes: AuctionCandidateRaw[] }
    inSeasonCandidates: { nodes: AuctionCandidateRaw[] }
  } | null
}

// ODI-320: lowestPriceAnyCard returns null for a rarity/season combo whenever none of that combo's
// cards has an active fixed-price offer — even if a different card instance of the same edition is
// for sale via an open English auction. Picks whichever open auction in the sample ends soonest
// (not cheapest — explicit product decision), so it can't guarantee finding the true soonest-ending
// auction across large editions (up to ~1000 copies), only the soonest within the sampled batch.
function soonestOpenAuctionOffer(candidates: AuctionCandidateRaw[]): MarketOffer | null {
  let best: { slug: string; auction: { amounts: MarketAmountsRaw; endDate: string } } | null = null

  for (const candidate of candidates) {
    const auction = extractAuctionAmounts(candidate.latestEnglishAuction)
    if (!auction) continue
    if (!best || auction.endDate < best.auction.endDate) {
      best = { slug: candidate.slug, auction }
    }
  }
  if (!best) return null

  const eurCents = best.auction.amounts.eurCents ?? null
  const offerAmount = eurCents === null ? deriveOfferAmount(best.auction.amounts) : null
  if (eurCents === null && offerAmount === null) return null

  return { eurCents, offerAmount, cardSlug: best.slug, isAuction: true, auctionEndDate: best.auction.endDate }
}

export async function getPlayer(slug: string, marketRarity: MarketRarity = 'limited'): Promise<Player> {
  const data = await callProxy<PlayerDetailRaw>('playerDetail', {
    slug,
    seasonStartYear: getCurrentSeasonStartYear(),
    rarity: marketRarity,
  })

  if (!data.anyPlayer) {
    throw new SorareApiError(`Spieler "${slug}" nicht gefunden`)
  }

  const raw = data.anyPlayer

  let classicOffer = extractMarketOffer(raw.classicPrice)
  let inSeasonOffer = extractMarketOffer(raw.inSeasonPrice)

  if (!classicOffer || !inSeasonOffer) {
    const fallback = await callProxy<AuctionFallbackCandidatesRaw>('auctionFallbackCandidates', {
      slug,
      rarity: marketRarity,
    })
    if (!classicOffer) classicOffer = soonestOpenAuctionOffer(fallback.anyPlayer?.classicCandidates.nodes ?? [])
    if (!inSeasonOffer) inSeasonOffer = soonestOpenAuctionOffer(fallback.anyPlayer?.inSeasonCandidates.nodes ?? [])
  }

  return {
    slug: raw.slug,
    displayName: raw.displayName,
    position: raw.position,
    age: raw.age,
    activeClub: raw.activeClub,
    activeInjuries: raw.activeInjuries,
    activeSuspensions: raw.activeSuspensions,
    recentSo5Scores: raw.allSo5Scores.nodes.map((node) => ({
      score: node.score,
      gameDate: node.game.date,
    })),
    seasonStats: raw.stats
      ? {
          appearances: raw.stats.appearances,
          minutesPlayed: raw.stats.minutesPlayed,
          substituteIn: raw.stats.substituteIn,
          substituteOut: raw.stats.substituteOut,
        }
      : null,
    sorareAverageScores: {
      l5: raw.l5,
      l10: raw.l10,
      l40: raw.l40,
    },
    marketPrices: {
      classicEurCents: classicOffer?.eurCents ?? null,
      inSeasonEurCents: inSeasonOffer?.eurCents ?? null,
      classicOfferAmount: classicOffer?.offerAmount ?? null,
      inSeasonOfferAmount: inSeasonOffer?.offerAmount ?? null,
      classicCardSlug: classicOffer?.cardSlug ?? null,
      inSeasonCardSlug: inSeasonOffer?.cardSlug ?? null,
      classicIsAuction: classicOffer?.isAuction ?? false,
      inSeasonIsAuction: inSeasonOffer?.isAuction ?? false,
      classicAuctionEndDate: classicOffer?.auctionEndDate ?? null,
      inSeasonAuctionEndDate: inSeasonOffer?.auctionEndDate ?? null,
      rarity: marketRarity,
    },
  }
}

interface PlayerSearchRaw {
  searchPlayers: {
    nbHits: number
    nbPages: number
    page: number
    commonPlayerHits: {
      positions: Player['position'][]
      anyPlayer: { slug: string; displayName: string; activeClub: { name: string } | null } | null
    }[]
  }
}

export async function searchPlayers(params: {
  query: string
  page?: number
  pageSize?: number
}): Promise<PlayerSearchResult> {
  const data = await callProxy<PlayerSearchRaw>('playerSearch', params)
  const result = data.searchPlayers

  return {
    totalHits: result.nbHits,
    page: result.page,
    totalPages: result.nbPages,
    hits: result.commonPlayerHits.flatMap((hit) => {
      if (!hit.anyPlayer) return []
      return [
        {
          slug: hit.anyPlayer.slug,
          displayName: hit.anyPlayer.displayName,
          positions: hit.positions,
          clubName: hit.anyPlayer.activeClub?.name ?? null,
        },
      ]
    }),
  }
}

interface LeagueClubsRaw {
  football: {
    competition: {
      name: string
      teams: { nodes: { slug: string; name: string }[] }
    } | null
  }
}

type SorarePlayingStatus = 'NOT_PLAYING' | 'REGULAR' | 'RETIRED' | 'STARTER' | 'SUBSTITUTE' | 'SUPER_SUBSTITUTE'

interface ClubPlayersRaw {
  football: {
    club: {
      name: string
      activePlayers: {
        nodes: {
          slug: string
          displayName: string
          position: Player['position']
          playingStatus: SorarePlayingStatus | null
          l10: number | null
          l40: number | null
        }[]
      }
    } | null
  }
}

function isRegularStarter(playingStatus: SorarePlayingStatus | null): boolean {
  return playingStatus === 'STARTER' || playingStatus === 'REGULAR'
}

function performanceRank(l10: number | null, l40: number | null): number {
  return (l10 ?? 0) + (l40 ?? 0)
}

export const FORMATION_POSITIONS: Position[] = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']
export const CANDIDATES_PER_POSITION = 2

export async function getLeagueClubs(leagueSlugs: string[]): Promise<{ slug: string; name: string }[]> {
  const settled = await Promise.allSettled(
    leagueSlugs.map((leagueSlug) => callProxy<LeagueClubsRaw>('leagueClubs', { leagueSlug })),
  )
  const clubs = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.football.competition?.teams.nodes ?? [] : [],
  )
  // Dedupe defensiv nach Slug — die Mehrfachauswahl erlaubt beliebige Liga-Kombinationen; ein Klub,
  // der in zwei ausgewählten Ligen auftaucht, ist zumindest theoretisch nicht ausgeschlossen.
  return Array.from(new Map(clubs.map((club) => [club.slug, club])).values())
}

export async function getClubRoster(clubSlug: string): Promise<PlayerSearchHit[]> {
  const clubData = await callProxy<ClubPlayersRaw>('clubPlayers', { clubSlug })
  const club = clubData.football.club
  if (!club) return []

  return FORMATION_POSITIONS.flatMap((position) => {
    const topPlayers = club.activePlayers.nodes
      .filter((player) => player.position === position && isRegularStarter(player.playingStatus))
      .sort((a, b) => performanceRank(b.l10, b.l40) - performanceRank(a.l10, a.l40))
      .slice(0, CANDIDATES_PER_POSITION)

    return topPlayers.map((player) => ({
      slug: player.slug,
      displayName: player.displayName,
      positions: [player.position],
      clubName: club.name,
    }))
  })
}

export async function searchPlayersByLeagueAndPosition(
  leagueSlugs: string[],
  position: Position,
): Promise<PlayerSearchHit[]> {
  const clubs = await getLeagueClubs(leagueSlugs)

  const settled = await Promise.allSettled(
    clubs.map((club) => callProxy<ClubPlayersRaw>('clubPlayers', { clubSlug: club.slug })),
  )
  const clubResults = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

  const hits = clubResults.flatMap((clubData) => {
    const club = clubData.football.club
    if (!club) return []
    return club.activePlayers.nodes
      .filter((player) => player.position === position)
      .map((player) => ({
        slug: player.slug,
        displayName: player.displayName,
        positions: [player.position],
        clubName: club.name,
        l10: player.l10,
        l40: player.l40,
        isRegularStarter: isRegularStarter(player.playingStatus),
      }))
  })

  hits.sort((a, b) => {
    if (a.isRegularStarter !== b.isRegularStarter) return a.isRegularStarter ? -1 : 1
    return performanceRank(b.l10, b.l40) - performanceRank(a.l10, a.l40)
  })

  return hits.map(({ slug, displayName, positions, clubName }) => ({ slug, displayName, positions, clubName }))
}
