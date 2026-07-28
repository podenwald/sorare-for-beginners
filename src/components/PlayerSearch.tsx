import { useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, searchPlayers } from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { Player, PlayerSearchHit } from '../api/types'

interface PlayerSearchProps {
  onAdd: (player: Player) => void
}

export function PlayerSearch({ onAdd }: PlayerSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setSearchError(null)
    try {
      const result = await searchPlayers({ query, pageSize: 10 })
      setResults(result.hits)
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
    } catch (error) {
      setAddError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Hinzufügen')
    } finally {
      setAddingSlug(null)
    }
  }

  return (
    <div className="player-search">
      <form onSubmit={handleSearch}>
        <input
          className="mock-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Spieler suchen..."
          aria-label="Spieler suchen"
        />
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
