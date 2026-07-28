import type { GraphQLError, Player, PlayerSearchResult } from './types'
import { SorareApiError } from './types'
import { getCurrentSeasonStartYear } from './season'

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
