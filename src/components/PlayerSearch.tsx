import { useEffect, useState } from 'react'
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
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)
  const [priceRefreshError, setPriceRefreshError] = useState<string | null>(null)
  const [now] = useState(() => new Date())

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

  // Self-healing price refresh: re-fetches any already-loaded result whose prices were fetched
  // under a different rarity than the one currently selected, merging fixed entries back in
  // rather than replacing the whole map — a failed refetch must not make an already-loaded
  // result disappear. Because `resultDetails` is a dependency, this also catches a `handleSearch`
  // that resolved with a since-superseded rarity (its own fetch has no cancellation guard).
  useEffect(() => {
    const stale = results
      .map((hit) => resultDetails[hit.slug])
      .filter((player): player is Player => player !== undefined && player.marketPrices.rarity !== marketRarity)
    if (stale.length === 0) return
    let cancelled = false
    setIsRefreshingPrices(true)
    setPriceRefreshError(null)
    Promise.allSettled(stale.map((player) => getPlayer(player.slug, marketRarity)))
      .then((settled) => {
        if (cancelled) return
        const refreshed = new Map(
          settled.flatMap((outcome, index) =>
            outcome.status === 'fulfilled' ? [[stale[index].slug, outcome.value] as const] : [],
          ),
        )
        if (refreshed.size > 0) {
          setResultDetails((prev) => ({ ...prev, ...Object.fromEntries(refreshed) }))
        }
        if (settled.some((outcome) => outcome.status === 'rejected')) {
          setPriceRefreshError('Einige Preise konnten nicht aktualisiert werden')
        }
      })
      .finally(() => {
        if (!cancelled) setIsRefreshingPrices(false)
      })
    return () => {
      cancelled = true
    }
  }, [marketRarity, results, resultDetails])

  async function handleAdd(slug: string) {
    setAddingSlug(slug)
    setAddError(null)
    try {
      const cached = resultDetails[slug]
      const player = cached && cached.marketPrices.rarity === marketRarity ? cached : await getPlayer(slug, marketRarity)
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
      {isRefreshingPrices && <p className="price-refresh-status">Preise werden aktualisiert…</p>}
      {priceRefreshError && (
        <p className="search-error" role="alert">
          {priceRefreshError}
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
