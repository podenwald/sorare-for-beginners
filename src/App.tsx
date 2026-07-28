import { useMemo, useState } from 'react'
import { PlayerSearch } from './components/PlayerSearch'
import { FormationList } from './components/FormationList'
import { assignFormation } from './api/formation'
import { evaluatePlayer } from './api/scoring'
import type { Player } from './api/types'
import type { EvaluatedCandidate } from './api/formation'
import './App.css'

function App() {
  const [shortlist, setShortlist] = useState<Player[]>([])

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

  const slots = useMemo(() => assignFormation(candidates), [candidates])

  return (
    <>
      <h1>Sorare for Beginners</h1>
      <PlayerSearch onAdd={handleAdd} />

      <div className="shortlist">
        {shortlist.map((player) => (
          <span key={player.slug} className="shortlist-chip">
            {player.displayName}
            <button type="button" onClick={() => handleRemove(player.slug)}>
              ✕
            </button>
          </span>
        ))}
      </div>

      <FormationList slots={slots} />
    </>
  )
}

export default App
