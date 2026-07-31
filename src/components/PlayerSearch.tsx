import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, searchPlayers } from '../api/sorareClient'
import { evaluatePlayer } from '../api/scoring'
import { SorareApiError } from '../api/types'
import type { MarketRarity, Player, PlayerSearchHit } from '../api/types'
import { PlayerScoreSummary } from './PlayerScoreSummary'

interface PlayerSearchProps {
  onAdd: (player: Player) => void
  label: string
  marketRarity: MarketRarity
}

export function PlayerSearch({ onAdd, label, marketRarity }: PlayerSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [resultDetails, setResultDetails] = useState<Record<string, Player>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const resultsRef = useRef(results)
  resultsRef.current = results

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setSearchError(null)
    setResultDetails({})
    try {
      const result = await searchPlayers({ query, pageSize: 10 })
      setResults(result.hits)
      const settled = await Promise.allSettled(result.hits.map((hit) => getPlayer(hit.slug, marketRarity)))
      const details = Object.fromEntries(
        settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [[outcome.value.slug, outcome.value]] : [])),
      )
      setResultDetails(details)
    } catch (error) {
      setSearchError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler bei der Suche')
    } finally {
      setIsSearching(false)
    }
  }

  // Re-fetches already-shown results so their Classic/In-Season prices reflect the newly picked rarity.
  useEffect(() => {
    const currentResults = resultsRef.current
    if (currentResults.length === 0) return
    let cancelled = false
    Promise.allSettled(currentResults.map((hit) => getPlayer(hit.slug, marketRarity))).then((settled) => {
      if (cancelled) return
      const details = Object.fromEntries(
        settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [[outcome.value.slug, outcome.value]] : [])),
      )
      setResultDetails(details)
    })
    return () => {
      cancelled = true
    }
  }, [marketRarity])

  async function handleAdd(slug: string) {
    setAddingSlug(slug)
    setAddError(null)
    try {
      const player = resultDetails[slug] ?? (await getPlayer(slug, marketRarity))
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
          aria-label={`Spieler suchen (${label})`}
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
        {results.map((hit) => {
          const player = resultDetails[hit.slug]
          return (
            <li key={hit.slug}>
              {player ? (
                <span>
                  <PlayerScoreSummary player={player} evaluation={evaluatePlayer(player, now)} />
                </span>
              ) : (
                <span className="result-name">
                  {hit.displayName}
                  {hit.clubName ? ` — ${hit.clubName}` : ''}
                </span>
              )}
              <button type="button" onClick={() => handleAdd(hit.slug)} disabled={addingSlug === hit.slug}>
                {addingSlug === hit.slug ? 'Wird geladen...' : 'Hinzufügen'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
