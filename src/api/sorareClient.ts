import type { GraphQLError, Player, PlayerSearchHit, PlayerSearchResult, Position } from './types'
import { SorareApiError } from './types'
import { getCurrentSeasonStartYear } from './season'

export const LEAGUES = [
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  { slug: 'bundesliga-de', name: 'Bundesliga' },
  { slug: 'laliga-es', name: 'La Liga' },
  { slug: 'ligue-1-fr', name: 'Ligue 1' },
  { slug: 'mlspa', name: 'MLS' },
] as const

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
  } | null
}

export async function getPlayer(slug: string): Promise<Player> {
  const data = await callProxy<PlayerDetailRaw>('playerDetail', {
    slug,
    seasonStartYear: getCurrentSeasonStartYear(),
  })

  if (!data.anyPlayer) {
    throw new SorareApiError(`Spieler "${slug}" nicht gefunden`)
  }

  const raw = data.anyPlayer

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
      clubs: { nodes: { slug: string; name: string }[] }
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

export async function searchPlayersByLeagueAndPosition(
  leagueSlug: string,
  position: Position,
): Promise<PlayerSearchHit[]> {
  const leagueData = await callProxy<LeagueClubsRaw>('leagueClubs', { leagueSlug })
  const clubs = leagueData.football.competition?.clubs.nodes ?? []

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
