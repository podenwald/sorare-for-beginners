import { useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, LEAGUES, searchPlayersByLeagueAndPosition } from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { Player, PlayerSearchHit, Position } from '../api/types'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'Goalkeeper', label: 'Torwart' },
  { value: 'Defender', label: 'Verteidiger' },
  { value: 'Midfielder', label: 'Mittelfeld' },
  { value: 'Forward', label: 'Sturm' },
]

interface LeaguePositionSearchProps {
  onAdd: (player: Player) => void
  label: string
}

export function LeaguePositionSearch({ onAdd, label }: LeaguePositionSearchProps) {
  const [leagueSlug, setLeagueSlug] = useState<string>(LEAGUES[0].slug)
  const [position, setPosition] = useState<Position>('Defender')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    setIsSearching(true)
    setSearchError(null)
    try {
      const hits = await searchPlayersByLeagueAndPosition(leagueSlug, position)
      setResults(hits)
    } catch (error) {
      setSearchError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler bei der Suche')
    } finally {
      setIsSearching(false)
    }
  }

  async function handleAdd(slug: string) {
    setAddingSlug(slug)
    setAddError(null)
    try {
      const player = await getPlayer(slug)
      onAdd(player)
      setResults([])
    } catch (error) {
      setAddError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Hinzufügen')
    } finally {
      setAddingSlug(null)
    }
  }

  return (
    <div className="league-position-search">
      <form onSubmit={handleSearch}>
        <select
          value={leagueSlug}
          onChange={(event) => setLeagueSlug(event.target.value)}
          aria-label={`${label} — Liga`}
        >
          {LEAGUES.map((league) => (
            <option key={league.slug} value={league.slug}>
              {league.name}
            </option>
          ))}
        </select>
        <select
          value={position}
          onChange={(event) => setPosition(event.target.value as Position)}
          aria-label={`${label} — Position`}
        >
          {POSITIONS.map((pos) => (
            <option key={pos.value} value={pos.value}>
              {pos.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={isSearching}>
          {isSearching ? 'Suche läuft...' : 'Suchen'}
        </button>
      </form>

      {searchError && (
        <p className="search-error" role="alert">
          {searchError}
        </p>
      )}
      {addError && (
        <p className="search-error" role="alert">
          {addError}
        </p>
      )}

      <ul className="search-results">
        {results.map((hit) => (
          <li key={hit.slug}>
            <span>{hit.displayName}</span>
            <span>{hit.clubName ?? 'Kein Verein'}</span>
            <button type="button" onClick={() => handleAdd(hit.slug)} disabled={addingSlug === hit.slug}>
              {addingSlug === hit.slug ? 'Wird geladen...' : 'Hinzufügen'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
