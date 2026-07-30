import { TeamPanel } from './components/TeamPanel'
import { Legend } from './components/Legend'
import './App.css'

function App() {
  return (
    <div className="page-layout">
      <TeamPanel label="Mein Team" />
      <Legend />
    </div>
  )
}

export default App
