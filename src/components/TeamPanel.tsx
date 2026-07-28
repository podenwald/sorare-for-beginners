import { useMemo, useState } from 'react'
import { PlayerSearch } from './PlayerSearch'
import { FormationList } from './FormationList'
import { assignFormation } from '../api/formation'
import { evaluatePlayer } from '../api/scoring'
import type { Player } from '../api/types'
import type { EvaluatedCandidate, FormationMode } from '../api/formation'

interface TeamPanelProps {
  label: string
}

export function TeamPanel({ label }: TeamPanelProps) {
  const [shortlist, setShortlist] = useState<Player[]>([])
  const [mode, setMode] = useState<FormationMode>('normal')

  function handleAdd(player: Player) {
    setShortlist((current) => {
      if (current.some((existing) => existing.slug === player.slug)) return current
      return [...current, player]
    })
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
    <div className="team-panel">
      <h2>{label}</h2>

      <div className="mode-toggle">
        <label>
          <input
            type="radio"
            name={`${label}-mode`}
            value="normal"
            checked={mode === 'normal'}
            onChange={() => setMode('normal')}
          />
          Normal
        </label>
        <label>
          <input
            type="radio"
            name={`${label}-mode`}
            value="defensiveStack"
            checked={mode === 'defensiveStack'}
            onChange={() => setMode('defensiveStack')}
          />
          Defensiv-Stack
        </label>
      </div>

      <PlayerSearch onAdd={handleAdd} />

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
    </div>
  )
}
