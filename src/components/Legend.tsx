export function Legend() {
  return (
    <details className="legend" open>
      <summary>Legende</summary>
      <p>
        Score = 60&nbsp;% Punktzahl-Potenzial + 40&nbsp;% Beständigkeit. Bei aktiver Verletzung oder Sperre wird der
        Score zusätzlich abgewertet (bis zu ca. 50&nbsp;%).
        <br />
        🟢 gut — Score 70 oder höher
        <br />
        🟡 mittel — Score 40 bis 69
        <br />
        🔴 riskant — Score unter 40
        <br />
        ⚪ unbekannt — nicht genug Daten für eine Bewertung
        <br />
        💉 Verletzung/Sperre aktiv — Score zusätzlich abgewertet, Details im Tooltip beim jeweiligen Spieler
      </p>
    </details>
  )
}
