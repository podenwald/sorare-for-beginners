import { useState } from 'react'
import { TeamPanel } from './components/TeamPanel'
import './App.css'

const TEAM_LABELS = ['Team 1', 'Team 2', 'Team 3']

function App() {
  const [activeTeams, setActiveTeams] = useState([true, false, false])

  function toggleTeam(index: number) {
    setActiveTeams((current) => current.map((active, i) => (i === index ? !active : active)))
  }

  return (
    <>
      <h1>Sorare for Beginners</h1>
      <div className="team-toggles">
        {TEAM_LABELS.map((label, index) => (
          <label key={label}>
            <input type="checkbox" checked={activeTeams[index]} onChange={() => toggleTeam(index)} />
            {label}
          </label>
        ))}
      </div>
      <div className="teams-grid">
        {TEAM_LABELS.map((label, index) => activeTeams[index] && <TeamPanel key={label} label={label} />)}
      </div>
    </>
  )
}

export default App
