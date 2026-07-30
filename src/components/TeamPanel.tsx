import { useEffect, useId, useMemo, useState } from 'react'
import { PlayerSearch } from './PlayerSearch'
import { LeaguePositionSearch } from './LeaguePositionSearch'
import { FormationList } from './FormationList'
import { assignFormation } from '../api/formation'
import { evaluatePlayer } from '../api/scoring'
import {
  CANDIDATES_PER_POSITION,
  FORMATION_POSITIONS,
  LEAGUES,
  getClubRoster,
  getLeagueClubs,
  getPlayer,
  searchPlayersByLeagueAndPosition,
} from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { Player } from '../api/types'
import type { EvaluatedCandidate, FormationMode } from '../api/formation'

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
  const [stackLeague, setStackLeague] = useState<string>(LEAGUES[0].slug)
  const [stackClubs, setStackClubs] = useState<{ slug: string; name: string }[]>([])
  const [stackClubSlug, setStackClubSlug] = useState<string>('')
  const [isLoadingClubs, setIsLoadingClubs] = useState(false)
  const [isStackFilling, setIsStackFilling] = useState(false)
  const [stackError, setStackError] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  useEffect(() => {
    if (mode !== 'teamStack') return
    let cancelled = false
    setIsLoadingClubs(true)
    setStackError(null)
    getLeagueClubs(stackLeague)
      .then((clubs) => {
        if (cancelled) return
        setStackClubs(clubs)
        setStackClubSlug(clubs[0]?.slug ?? '')
      })
      .catch(() => {
        if (!cancelled) setStackError('Clubs konnten nicht geladen werden')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClubs(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, stackLeague])

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
        FORMATION_POSITIONS.map((position) => searchPlayersByLeagueAndPosition(autoFillLeague, position)),
      )
      const topSlugs = picksPerPosition.flatMap((hits) => hits.slice(0, CANDIDATES_PER_POSITION).map((hit) => hit.slug))
      const settled = await Promise.allSettled(topSlugs.map((slug) => getPlayer(slug)))
      const players = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      players.forEach((player) => handleAdd(player))
    } catch (error) {
      setAutoFillError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler bei der KI-Auswahl')
    } finally {
      setIsAutoFilling(false)
    }
  }

  async function handleLoadClubRoster() {
    if (!stackClubSlug) return
    setIsStackFilling(true)
    setStackError(null)
    try {
      const hits = await getClubRoster(stackClubSlug)
      const settled = await Promise.allSettled(hits.map((hit) => getPlayer(hit.slug)))
      const players = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      players.forEach((player) => handleAdd(player))
    } catch (error) {
      setStackError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Laden des Teams')
    } finally {
      setIsStackFilling(false)
    }
  }

  function handleRemove(slug: string) {
    setShortlist((current) => current.filter((player) => player.slug !== slug))
  }

  const candidates: EvaluatedCandidate[] = useMemo(
    () => shortlist.map((player) => ({ player, evaluation: evaluatePlayer(player, now) })),
    [shortlist, now],
  )

  const slots = useMemo(
    () => assignFormation(candidates, mode, mode === 'teamStack' ? stackClubSlug : undefined),
    [candidates, mode, stackClubSlug],
  )

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
        <label>
          <input
            type="radio"
            name={groupName}
            value="teamStack"
            checked={mode === 'teamStack'}
            onChange={() => setMode('teamStack')}
          />
          Team-Stack
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

      {mode === 'teamStack' && (
        <div className="team-stack">
          <select
            value={stackLeague}
            onChange={(event) => setStackLeague(event.target.value)}
            aria-label={`${label} — Team-Stack Liga`}
          >
            {LEAGUES.map((league) => (
              <option key={league.slug} value={league.slug}>
                {league.name}
              </option>
            ))}
          </select>
          <select
            value={stackClubSlug}
            onChange={(event) => setStackClubSlug(event.target.value)}
            aria-label={`${label} — Team-Stack Club`}
            disabled={isLoadingClubs || stackClubs.length === 0}
          >
            {stackClubs.map((club) => (
              <option key={club.slug} value={club.slug}>
                {club.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleLoadClubRoster} disabled={isStackFilling || !stackClubSlug}>
            {isStackFilling ? 'Team wird geladen...' : 'Team laden'}
          </button>
          {stackError && (
            <p className="search-error" role="alert">
              {stackError}
            </p>
          )}
        </div>
      )}

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
