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
