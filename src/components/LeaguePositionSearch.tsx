import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, LEAGUES, searchPlayersByLeagueAndPosition } from '../api/sorareClient'
import { evaluatePlayer } from '../api/scoring'
import { SorareApiError } from '../api/types'
import type { MarketRarity, Player, PlayerSearchHit, Position } from '../api/types'
import { PlayerScoreSummary } from './PlayerScoreSummary'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'Goalkeeper', label: 'Torwart' },
  { value: 'Defender', label: 'Verteidiger' },
  { value: 'Midfielder', label: 'Mittelfeld' },
  { value: 'Forward', label: 'Sturm' },
]

// This search can return 100+ hits (a whole league/position); fetching full player detail for
// every one would mean 100+ proxy calls per search. Only the first N — already sorted by
// starter-status and form — get full score/injury/price data. The rest stay name-only until added.
const DETAILED_RESULTS_LIMIT = 20

interface LeaguePositionSearchProps {
  onAdd: (player: Player) => boolean
  label: string
  marketRarity: MarketRarity
}

export function LeaguePositionSearch({ onAdd, label, marketRarity }: LeaguePositionSearchProps) {
  const [leagueSlug, setLeagueSlug] = useState<string>(LEAGUES[0].slug)
  const [position, setPosition] = useState<Position>('Defender')
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
    setIsSearching(true)
    setSearchError(null)
    setResultDetails({})
    try {
      const hits = await searchPlayersByLeagueAndPosition(leagueSlug, position)
      setResults(hits)
      const detailed = hits.slice(0, DETAILED_RESULTS_LIMIT)
      const settled = await Promise.allSettled(detailed.map((hit) => getPlayer(hit.slug, marketRarity)))
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

  // Self-healing price refresh, scoped to the same first-N results that got full details in the
  // first place — mirrors PlayerSearch's reconciliation effect (see there for the full rationale).
  useEffect(() => {
    const stale = results
      .slice(0, DETAILED_RESULTS_LIMIT)
      .map((hit) => resultDetails[hit.slug])
      .filter((player): player is Player => player !== undefined && player.marketPrices.rarity !== marketRarity)
    if (stale.length === 0) {
      setIsRefreshingPrices(false)
      setPriceRefreshError(null)
      return
    }
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
      const added = onAdd(player)
      // Deliberately collapses the list after a successful add — unlike PlayerSearch, whose
      // result sets are small enough to stay useful; this one can return 100+ hits.
      if (added) setResults([])
    } catch (error) {
      setAddError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Hinzufügen')
    } finally {
      setAddingSlug(null)
    }
  }

  function handleFilterChange() {
    setResults([])
    setResultDetails({})
    setAddError(null)
  }

  return (
    <div className="league-position-search">
      <form onSubmit={handleSearch}>
        <select
          value={leagueSlug}
          onChange={(event) => {
            setLeagueSlug(event.target.value)
            handleFilterChange()
          }}
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
          onChange={(event) => {
            setPosition(event.target.value as Position)
            handleFilterChange()
          }}
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
