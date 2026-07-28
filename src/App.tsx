import { TeamPanel } from './components/TeamPanel'
import './App.css'

function App() {
  return (
    <>
      <h1>Sorare for Beginners</h1>
      <div className="teams-grid">
        <TeamPanel label="Team 1" />
        <TeamPanel label="Team 2" />
        <TeamPanel label="Team 3" />
      </div>
    </>
  )
}

export default App
