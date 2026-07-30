import { TeamPanel } from './components/TeamPanel'
import { Legend } from './components/Legend'
import './App.css'

function App() {
  return (
    <div className="page-layout">
      <Legend />
      <TeamPanel label="Mein Team" />
    </div>
  )
}

export default App
