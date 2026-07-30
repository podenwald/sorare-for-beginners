import { useId, useMemo, useState } from 'react'
import { PlayerSearch } from './PlayerSearch'
import { LeaguePositionSearch } from './LeaguePositionSearch'
import { FormationList } from './FormationList'
import { assignFormation } from '../api/formation'
import { evaluatePlayer } from '../api/scoring'
import { LEAGUES, getPlayer, searchPlayersByLeagueAndPosition } from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { Player, Position } from '../api/types'
import type { EvaluatedCandidate, FormationMode } from '../api/formation'

const AUTO_FILL_POSITIONS: Position[] = ['Goalkeeper', 'Defender', 'Midfielder', 'Forward']
const CANDIDATES_PER_POSITION = 2

interface TeamPanelProps {
  label: string
}

export function TeamPanel({ label }: TeamPanelProps) {
  const headingId = useId()
  const groupName = useId()
  const [shortlist, setShortlist] = useState<Player[]>([])
  const [mode, setMode] = useState<FormationMode>('normal')
  const [autoFillLeague, setAutoFillLeague] = useState<string>(LEAGUES[0].slug)
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [autoFillError, setAutoFillError] = useState<string | null>(null)

  function handleAdd(player: Player): boolean {
    let added = false
    setShortlist((current) => {
      if (current.some((existing) => existing.slug === player.slug)) return current
      added = true
      return [...current, player]
    })
    return added
  }

  async function handleAutoFill() {
    setIsAutoFilling(true)
    setAutoFillError(null)
    try {
      const picksPerPosition = await Promise.all(
        AUTO_FILL_POSITIONS.map((position) => searchPlayersByLeagueAndPosition(autoFillLeague, position)),
      )
      const topSlugs = picksPerPosition.flatMap((hits) => hits.slice(0, CANDIDATES_PER_POSITION).map((hit) => hit.slug))
      const players = await Promise.all(topSlugs.map((slug) => getPlayer(slug)))
      const availablePlayers = players.filter(
        (player) => player.activeInjuries.length === 0 && player.activeSuspensions.length === 0,
      )
      availablePlayers.forEach((player) => handleAdd(player))
    } catch (error) {
      setAutoFillError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler bei der KI-Auswahl')
    } finally {
      setIsAutoFilling(false)
    }
  }

  function handleRemove(slug: string) {
    setShortlist((current) => current.filter((player) => player.slug !== slug))
  }

  const candidates: EvaluatedCandidate[] = useMemo(
    () => shortlist.map((player) => ({ player, evaluation: evaluatePlayer(player) })),
    [shortlist],
  )

  const slots = useMemo(() => assignFormation(candidates, mode), [candidates, mode])

  return (
    <section className="team-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{label}</h2>

      <div className="mode-toggle" role="radiogroup" aria-label={`${label} — Flex-Modus`}>
        <label>
          <input
            type="radio"
            name={groupName}
            value="normal"
            checked={mode === 'normal'}
            onChange={() => setMode('normal')}
          />
          Normal
        </label>
        <label>
          <input
            type="radio"
            name={groupName}
            value="defensiveStack"
            checked={mode === 'defensiveStack'}
            onChange={() => setMode('defensiveStack')}
          />
          Defensiv-Stack
        </label>
      </div>

      <PlayerSearch onAdd={handleAdd} label={label} />

      <LeaguePositionSearch onAdd={handleAdd} label={label} />

      <div className="auto-fill">
        <select
          value={autoFillLeague}
          onChange={(event) => setAutoFillLeague(event.target.value)}
          aria-label={`${label} — KI-Team Liga`}
        >
          {LEAGUES.map((league) => (
            <option key={league.slug} value={league.slug}>
              {league.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={handleAutoFill} disabled={isAutoFilling}>
          {isAutoFilling ? 'KI wählt aus...' : 'KI-Team erstellen'}
        </button>
        {autoFillError && (
          <p className="search-error" role="alert">
            {autoFillError}
          </p>
        )}
      </div>

      <div className="shortlist">
        {shortlist.map((player) => (
          <span key={player.slug} className="shortlist-chip">
            {player.displayName}
            <button
              type="button"
              onClick={() => handleRemove(player.slug)}
              aria-label={`${player.displayName} von der Shortlist entfernen`}
            >
              ✕
            </button>
          </span>
        ))}
      </div>

      <FormationList slots={slots} />
    </section>
  )
}
