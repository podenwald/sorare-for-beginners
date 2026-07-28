# Design: Drei parallele Teams & Defensiv-Stack-Modus

**Jira:** [ODI-299](https://odenwaldpatrick.atlassian.net/browse/ODI-299) + [ODI-300](https://odenwaldpatrick.atlassian.net/browse/ODI-300) (Epic [ODI-290](https://odenwaldpatrick.atlassian.net/browse/ODI-290))
**Datum:** 2026-07-28

## Kontext

Aufbauend auf ODI-294 (Formationsansicht, eine Shortlist) sollen zwei zusammenhängende
Erweiterungen umgesetzt werden: (1) drei unabhängige, gleichzeitig sichtbare Team-Shortlists
zum direkten Vergleich, und (2) ein pro Team umschaltbarer "Defensiv-Stack"-Modus, der den
Flex-Slot statt mit dem besten verbleibenden Nicht-Torwart-Kandidaten mit einem weiteren
Verteidiger besetzt.

**Wichtige Klarstellung aus der Discovery:** "Stack" bezieht sich hier **nicht** auf
Team-Zugehörigkeit der Spieler (kein klassisches Fantasy-Sports-"Stacking") — es geht
ausschließlich darum, welche Position den Flex-Slot füllt.

## Entscheidungen aus der Discovery

- **Umschalter-Ebene:** pro Team unabhängig, nicht global — jedes der 3 Teams kann eigenständig
  Normal oder Defensiv-Stack sein.
- **Layout (visuell geprüft, zwei Mockups verglichen):** responsiv — auf dem Handy sind die
  drei Teams untereinander gestapelt (führt den bisherigen mobil-first-Ansatz fort), ab einer
  Breakpoint-Breite automatisch nebeneinander. Keine horizontale Wisch-Lösung.
- **Suche:** jedes Team bekommt seine eigene, unabhängige Spielersuche (3 separate Suchfelder)
  — natürliche Konsequenz aus drei unabhängigen Shortlists, kein geteilter Suchzustand.
- **Offensiv-Stack ist ausdrücklich nicht Teil dieser Umsetzung** (eigenes, späteres Ticket).

## Architektur

### Neue Komponente: `src/components/TeamPanel.tsx`

Kapselt die komplette Logik, die aktuell in `App.tsx` steht:
- Eigener Shortlist-State (`useState<Player[]>([])`)
- Eigener Modus-State (`useState<'normal' | 'defensiveStack'>('normal')`)
- `handleAdd`/`handleRemove` (unverändert aus der bisherigen `App.tsx`-Logik übernommen)
- `evaluatePlayer`/`assignFormation`-Berechnung via `useMemo`, jetzt mit `mode` als zweitem
  Argument an `assignFormation`
- Rendert: Team-Label (Prop), Umschalter (Normal/Defensiv-Stack), `PlayerSearch`,
  Shortlist-Chips, `FormationList`

```typescript
interface TeamPanelProps {
  label: string
}

export function TeamPanel({ label }: TeamPanelProps) {
  // Shortlist-State, Modus-State, handleAdd/handleRemove wie bisher in App.tsx
  // ...
}
```

### `App.tsx` (vereinfacht)

```typescript
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
```

### `src/api/formation.ts`-Erweiterung

`assignFormation` bekommt einen neuen, optionalen zweiten Parameter:

```typescript
export type FormationMode = 'normal' | 'defensiveStack'

export function assignFormation(
  candidates: EvaluatedCandidate[],
  mode: FormationMode = 'normal',
): FormationSlot[]
```

Einzige Änderung im Funktionskörper: der Flex-Pool-Filter wechselt je nach `mode`:
- `normal`: `candidate.player.position !== 'Goalkeeper'` (unverändert, aktuelles Verhalten)
- `defensiveStack`: `candidate.player.position === 'Defender'`

Kein weiterer Unterschied — die vier exakten Positions-Slots (Torwart/Verteidiger/Mittelfeld/
Sturm) und die Rangfolge-Logik (`bestCandidate`, Null-Priorität, Tie-Breaking) bleiben exakt
wie in ODI-294 spezifiziert und bereits ausgiebig geprüft.

### Layout (`App.css`)

```css
.teams-grid {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

@media (min-width: 900px) {
  .teams-grid {
    flex-direction: row;
    align-items: flex-start;
  }

  .teams-grid > * {
    flex: 1;
    min-width: 0;
  }
}
```

## Tests

- `src/api/formation.test.ts`: neue Tests für `defensiveStack`-Modus — bester verbleibender
  Verteidiger füllt Flex; kein zweiter Verteidiger vorhanden → Flex bleibt `null`; bestehende
  Normal-Modus-Tests laufen unverändert weiter (Default-Parameter).
- Kein automatisiertes Komponenten-Testing für `TeamPanel`/`App.tsx` (konsistent mit ODI-294)
  — manuelle Verifikation im Dev-Server-Browser: drei unabhängige Teams, Umschalter-Wirkung
  pro Team, responsives Verhalten (schmal gestapelt, breit nebeneinander).

## Out of Scope

- Offensiv-Stack (eigenes, späteres Ticket).
- Persistenz der drei Shortlists über die Sitzung hinaus (ODI-295).
- Benutzerdefinierte Team-Namen (statisch "Team 1/2/3").
- Import echter Sorare-Konto-Teams (bewusst ausgeschlossen — die drei Teams werden weiterhin
  manuell im Tool zusammengestellt, kein Login/private Kontodaten nötig).
