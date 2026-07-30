export function Legend() {
  return (
    <details className="legend" open>
      <summary>Legende</summary>
      <p>
        Score = 60&nbsp;% Punktzahl-Potenzial + 40&nbsp;% Beständigkeit. Bei aktiver Verletzung oder Sperre wird der
        Score zusätzlich abgewertet (bis zu ca. 50&nbsp;%).
      </p>
      <ul>
        <li>🟢 gut — Score 70 oder höher</li>
        <li>🟡 mittel — Score 40 bis 69</li>
        <li>🔴 riskant — Score unter 40</li>
        <li>⚪ unbekannt — nicht genug Daten für eine Bewertung</li>
        <li>💉 Verletzung/Sperre aktiv — Score zusätzlich abgewertet, Details im Tooltip beim jeweiligen Spieler</li>
      </ul>
    </details>
  )
}
