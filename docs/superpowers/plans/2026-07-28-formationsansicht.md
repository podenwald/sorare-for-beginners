# Formationsansicht (ODI-294) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erste echte Seite der App — Spieler suchen, zu einer Shortlist hinzufügen, live einen Formationsvorschlag für alle 5 In-Season-Plätze sehen.

**Architecture:** Eine reine, testbare Zuteilungsfunktion `assignFormation()` (analog zu `scoring.ts`) verteilt bewertete Kandidaten auf 5 Slots. Zwei neue Präsentationskomponenten (`PlayerSearch`, `FormationList`) und ein komplett ersetztes `App.tsx` verkabeln bestehende API-Funktionen (`searchPlayers`, `getPlayer`, `evaluatePlayer`) zu einer funktionierenden Seite. Shortlist lebt nur im React-State (keine Persistenz in diesem Ticket).

**Tech Stack:** React 19 + TypeScript + Vite 8, Vitest 4 (bereits eingerichtet).

## Global Constraints

- Kandidaten kommen ausschließlich über manuelle Namenssuche (`searchPlayers`) — kein automatisches Marktsuchen (ODI-297, zurückgestellt).
- Zuteilung: bester Kandidat pro exakter Position (Goalkeeper/Defender/Midfielder/Forward in dieser Reihenfolge), bester verbleibender Nicht-Torwart-Kandidat für Flex. Keine global-optimale Kombinationssuche.
- Ein `overall.value` von `null` gilt als niedrigster möglicher Wert — wird aber trotzdem gewählt, wenn kein Kandidat mit numerischem Wert für den Slot verfügbar ist (nicht einfach übersprungen). Bei exakt gleichem Wert gewinnt der zuerst in der Eingabe-Reihenfolge auftauchende Kandidat.
- Kein passender Kandidat für einen Slot → `candidate: null`, UI zeigt einen "hinzufügen"-Platzhalter.
- Shortlist nur im React-State — kein `localStorage`/IndexedDB (das ist ODI-295).
- Formation wird live neu berechnet bei jeder Shortlist-Änderung — kein expliziter "Berechnen"-Button.
- "Unbekannt"-Anzeige: `scorePotential.category === 'unbekannt'` überschreibt die angezeigte Kategorie auf `'unbekannt'`, unabhängig von `overall.category` — **ohne** `src/api/scoring.ts` zu verändern.
- Kein automatisiertes Komponenten-Testing (React Testing Library o.ä.) in diesem Ticket — UI-Verkabelung wird manuell im Dev-Server-Browser verifiziert.
- `tsconfig.app.json`: `verbatimModuleSyntax` (type-only Imports separat), `erasableSyntaxOnly` (keine Enums, keine Parameter-Properties), `noUnusedLocals`/`noUnusedParameters`.

---

## Task 1: Zuteilungslogik (`assignFormation`)

**Files:**
- Create: `src/api/formation.ts`
- Create: `src/api/formation.test.ts`

**Interfaces:**
- Consumes: `Player` (aus `src/api/types.ts`), `PlayerEvaluation` (aus `src/api/scoring.ts`).
- Produces: `EvaluatedCandidate { player: Player; evaluation: PlayerEvaluation }`, `FormationSlotLabel = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Flex'`, `FormationSlot { label: FormationSlotLabel; candidate: EvaluatedCandidate | null }`, `assignFormation(candidates: EvaluatedCandidate[]): FormationSlot[]` — wird von `App.tsx` (Task 2) konsumiert.

- [ ] **Step 1: Failing Tests schreiben**

Erstelle `src/api/formation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { assignFormation } from './formation'
import type { EvaluatedCandidate } from './formation'
import type { Player } from './types'
import type { PlayerEvaluation } from './scoring'

function buildCandidate(
  slug: string,
  position: Player['position'],
  overallValue: number | null,
): EvaluatedCandidate {
  const evaluation: PlayerEvaluation = {
    overall: { value: overallValue, category: 'gut' },
    scorePotential: { value: overallValue, category: 'gut' },
    consistency: {
      value: overallValue,
      category: 'gut',
      factors: {
        availability: { value: 100, category: 'gut' },
        minutesConsistency: { value: 100, category: 'gut' },
        rotationRisk: { value: 100, category: 'gut' },
        formTrend: { value: 100, category: 'gut' },
      },
    },
  }

  return {
    player: {
      slug,
      displayName: slug,
      position,
      age: 25,
      activeClub: null,
      activeInjuries: [],
      activeSuspensions: [],
      recentSo5Scores: [],
      seasonStats: null,
    },
    evaluation,
  }
}

describe('assignFormation', () => {
  it('assigns the best candidate per exact position and the best remaining non-goalkeeper to Flex', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const slots = assignFormation(candidates)

    expect(slots.map((slot) => slot.candidate?.player.slug)).toEqual([
      'gk-1',
      'def-1',
      'mid-1',
      'fwd-1',
      'def-2',
    ])
  })

  it('returns null for a slot when no matching candidate exists', () => {
    const candidates = [buildCandidate('mid-1', 'Midfielder', 80)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Goalkeeper')?.candidate).toBeNull()
    expect(slots.find((slot) => slot.label === 'Midfielder')?.candidate?.player.slug).toBe('mid-1')
  })

  it('never assigns a goalkeeper to the Flex slot, even as a leftover with no alternative', () => {
    const candidates = [buildCandidate('gk-1', 'Goalkeeper', 60), buildCandidate('gk-2', 'Goalkeeper', 95)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Goalkeeper')?.candidate?.player.slug).toBe('gk-2')
    expect(slots.find((slot) => slot.label === 'Flex')?.candidate).toBeNull()
  })

  it('treats a null overall value as lowest priority when an alternative exists', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', null), buildCandidate('fwd-2', 'Forward', 40)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('fwd-2')
  })

  it('still assigns a candidate with a null overall value when no alternative exists for that position', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', null)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('fwd-1')
  })

  it('breaks ties by keeping the first candidate in input order', () => {
    const candidates = [buildCandidate('fwd-1', 'Forward', 70), buildCandidate('fwd-2', 'Forward', 70)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Forward')?.candidate?.player.slug).toBe('fwd-1')
  })

  it('returns all-null slots for an empty candidate list', () => {
    const slots = assignFormation([])

    expect(slots.every((slot) => slot.candidate === null)).toBe(true)
    expect(slots.map((slot) => slot.label)).toEqual(['Goalkeeper', 'Defender', 'Midfielder', 'Forward', 'Flex'])
  })
})
```

- [ ] **Step 2: Test laufen lassen, sicherstellen dass er fehlschlägt**

Run: `npm run test -- formation`
Expected: FAIL — `Cannot find module './formation'`.

- [ ] **Step 3: `formation.ts` implementieren**

Erstelle `src/api/formation.ts`:

```typescript
import type { Player } from './types'
import type { PlayerEvaluation } from './scoring'

export interface EvaluatedCandidate {
  player: Player
  evaluation: PlayerEvaluation
}

export type FormationSlotLabel = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Flex'

export interface FormationSlot {
  label: FormationSlotLabel
  candidate: EvaluatedCandidate | null
}

const EXACT_POSITION_SLOTS: { label: FormationSlotLabel; position: Player['position'] }[] = [
  { label: 'Goalkeeper', position: 'Goalkeeper' },
  { label: 'Defender', position: 'Defender' },
  { label: 'Midfielder', position: 'Midfielder' },
  { label: 'Forward', position: 'Forward' },
]

function bestCandidate(pool: EvaluatedCandidate[]): EvaluatedCandidate | null {
  if (pool.length === 0) return null

  let best = pool[0]
  let bestValue = best.evaluation.overall.value ?? -Infinity

  for (let i = 1; i < pool.length; i++) {
    const candidate = pool[i]
    const value = candidate.evaluation.overall.value ?? -Infinity
    if (value > bestValue) {
      best = candidate
      bestValue = value
    }
  }

  return best
}

export function assignFormation(candidates: EvaluatedCandidate[]): FormationSlot[] {
  let remaining = candidates.slice()
  const slots: FormationSlot[] = []

  for (const { label, position } of EXACT_POSITION_SLOTS) {
    const pool = remaining.filter((candidate) => candidate.player.position === position)
    const chosen = bestCandidate(pool)
    slots.push({ label, candidate: chosen })
    if (chosen) {
      remaining = remaining.filter((candidate) => candidate !== chosen)
    }
  }

  const flexPool = remaining.filter((candidate) => candidate.player.position !== 'Goalkeeper')
  slots.push({ label: 'Flex', candidate: bestCandidate(flexPool) })

  return slots
}
```

- [ ] **Step 4: Test laufen lassen, sicherstellen dass er besteht**

Run: `npm run test -- formation`
Expected: PASS — 7/7 Tests grün.

- [ ] **Step 5: Gesamter Testlauf und Typecheck**

Run: `npm run test`
Expected: PASS — alle Tests grün (season 4 + sorareClient 6 + scoring 9 + formation 7 = 26 Tests).

Run: `npx tsc -b`
Expected: Keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/api/formation.ts src/api/formation.test.ts
git commit -m "feat: add formation slot assignment logic"
```

---

## Task 2: UI — Spielersuche, Formationsliste, App-Verkabelung

**Files:**
- Create: `src/components/PlayerSearch.tsx`
- Create: `src/components/FormationList.tsx`
- Modify: `src/App.tsx` (komplett ersetzt)
- Modify: `src/App.css` (komplett ersetzt)

**Interfaces:**
- Consumes: `searchPlayers`, `getPlayer` (`src/api/sorareClient.ts`), `SorareApiError` (`src/api/types.ts`), `evaluatePlayer` (`src/api/scoring.ts`), `assignFormation`, `EvaluatedCandidate`, `FormationSlot` (`src/api/formation.ts`, Task 1).
- Produces: eine funktionierende Seite — kein weiterer Konsument in diesem Projekt bisher.

- [ ] **Step 1: `PlayerSearch`-Komponente schreiben**

Erstelle `src/components/PlayerSearch.tsx`:

```typescript
import { useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, searchPlayers } from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { Player, PlayerSearchHit } from '../api/types'

interface PlayerSearchProps {
  onAdd: (player: Player) => void
}

export function PlayerSearch({ onAdd }: PlayerSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setSearchError(null)
    try {
      const result = await searchPlayers({ query, pageSize: 10 })
      setResults(result.hits)
    } catch (error) {
      setSearchError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler bei der Suche')
    } finally {
      setIsSearching(false)
    }
  }

  async function handleAdd(slug: string) {
    setAddingSlug(slug)
    setAddError(null)
    try {
      const player = await getPlayer(slug)
      onAdd(player)
    } catch (error) {
      setAddError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Hinzufügen')
    } finally {
      setAddingSlug(null)
    }
  }

  return (
    <div className="player-search">
      <form onSubmit={handleSearch}>
        <input
          className="mock-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Spieler suchen..."
        />
        <button type="submit" disabled={isSearching}>
          {isSearching ? 'Suche läuft...' : 'Suchen'}
        </button>
      </form>

      {searchError && <p className="search-error">{searchError}</p>}
      {addError && <p className="search-error">{addError}</p>}

      <ul className="search-results">
        {results.map((hit) => (
          <li key={hit.slug}>
            <span>{hit.displayName}</span>
            <span>{hit.clubName ?? 'Kein Verein'}</span>
            <button type="button" onClick={() => handleAdd(hit.slug)} disabled={addingSlug === hit.slug}>
              {addingSlug === hit.slug ? 'Wird geladen...' : 'Hinzufügen'}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
```

- [ ] **Step 2: `FormationList`-Komponente schreiben**

Erstelle `src/components/FormationList.tsx`:

```typescript
import type { EvaluatedCandidate, FormationSlot } from '../api/formation'
import type { EvaluationCategory } from '../api/scoring'

interface FormationListProps {
  slots: FormationSlot[]
}

function displayCategory(candidate: EvaluatedCandidate): EvaluationCategory {
  return candidate.evaluation.scorePotential.category === 'unbekannt'
    ? 'unbekannt'
    : candidate.evaluation.overall.category
}

const CATEGORY_ICON: Record<EvaluationCategory, string> = {
  gut: '🟢',
  mittel: '🟡',
  riskant: '🔴',
  unbekannt: '⚪',
}

const SLOT_LABEL_TEXT: Record<FormationSlot['label'], string> = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
  Flex: 'Flex',
}

export function FormationList({ slots }: FormationListProps) {
  return (
    <ul className="formation-list">
      {slots.map((slot) => (
        <li key={slot.label} className="formation-slot">
          <span className="formation-slot-label">{SLOT_LABEL_TEXT[slot.label]}</span>
          {slot.candidate ? (
            <span className="formation-slot-candidate">
              {slot.candidate.player.displayName} — {slot.candidate.evaluation.overall.value ?? '–'}{' '}
              {CATEGORY_ICON[displayCategory(slot.candidate)]}
            </span>
          ) : (
            <span className="formation-slot-empty">{SLOT_LABEL_TEXT[slot.label]} hinzufügen</span>
          )}
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 3: `App.tsx` ersetzen**

Ersetze den kompletten Inhalt von `src/App.tsx`:

```typescript
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
```

- [ ] **Step 4: `App.css` ersetzen**

Der bisherige Inhalt von `src/App.css` gehört zum entfernten Vite-Demo-Content (Hero-Grafik, Doku-/Social-Links) und wird komplett durch Folgendes ersetzt (nutzt die bestehenden Theme-Variablen aus `src/index.css`):

```css
.player-search form {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.player-search input {
  flex: 1;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text-h);
}

.player-search button {
  padding: 8px 14px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--accent-bg);
  color: var(--accent);
  cursor: pointer;
}

.player-search button:disabled {
  opacity: 0.6;
  cursor: default;
}

.search-error {
  color: #d33;
}

.search-results {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
}

.search-results li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px solid var(--border);
}

.search-results li > span:first-child {
  font-weight: 600;
  color: var(--text-h);
}

.shortlist {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 24px;
}

.shortlist-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--accent-bg);
  color: var(--accent);
  font-size: 14px;
}

.shortlist-chip button {
  border: none;
  background: none;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}

.formation-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.formation-slot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--code-bg);
  margin-bottom: 6px;
}

.formation-slot-label {
  font-weight: 600;
  color: var(--text-h);
}

.formation-slot-empty {
  color: var(--text);
  font-style: italic;
}
```

- [ ] **Step 5: Nicht mehr benötigte Vite-Demo-Assets entfernen**

```bash
rm src/assets/react.svg src/assets/vite.svg src/assets/hero.png
```

- [ ] **Step 6: Typecheck und Lint**

Run: `npx tsc -b`
Expected: Keine Fehler.

Run: `npm run lint`
Expected: Keine Fehler.

- [ ] **Step 7: Manuell im Browser verifizieren**

Run: `npm run dev` (Terminal offen lassen)

Im Browser `http://localhost:5173` öffnen (der Vite-Dev-Proxy aus ODI-291 leitet `/api/*` an die deployte PHP-Datei weiter):
1. Im Suchfeld einen bekannten Spielernamen eingeben (z.B. "Mbappe"), "Suchen" klicken.
2. Erwartet: Trefferliste erscheint mit Name, Verein und "Hinzufügen"-Button.
3. Einen Treffer hinzufügen. Erwartet: Chip erscheint in der Shortlist, in der Formationsliste erscheint der Spieler beim passenden Slot (Score + Kategorie-Icon), alle anderen Slots zeigen "hinzufügen"-Platzhalter.
4. Chip per "✕" entfernen. Erwartet: Formationsliste aktualisiert sich sofort, der Slot zeigt wieder den Platzhalter.
5. Einen zweiten Spieler derselben Position hinzufügen, die einen erkennbar niedrigeren `evaluation.overall.value` haben sollte (z.B. einen weniger bekannten Spieler) — erwartet: nur der bessere von beiden erscheint im entsprechenden Slot.

Dev-Server danach mit Strg+C stoppen.

- [ ] **Step 8: Commit**

```bash
git add src/components/PlayerSearch.tsx src/components/FormationList.tsx src/App.tsx src/App.css
git rm src/assets/react.svg src/assets/vite.svg src/assets/hero.png
git commit -m "feat: add player search and formation list UI"
```

---

## Task 3: Deploy und End-to-End-Abnahme

**Files:** keine (nur Deploy + Verifikation)

**Interfaces:**
- Consumes: alles aus Task 1–2.
- Produces: Bestätigung, dass ODI-294 in Produktion mit echten Live-Daten funktioniert.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy abwarten**

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓ (inkl. Lint- und Test-Schritt).

- [ ] **Step 3: Live im Browser verifizieren**

`https://sorare-for-beginners.de/` öffnen und denselben Ablauf wie in Task 2, Step 7 durchgehen (Suchen, Hinzufügen, Entfernen, Formationsliste live) — jetzt gegen die echte Produktions-URL statt `localhost`.

- [ ] **Step 4: Jira-Ticket kommentieren**

Kommentar zu [ODI-294](https://odenwaldpatrick.atlassian.net/browse/ODI-294) hinzufügen, dass die Formationsansicht implementiert, getestet und live verifiziert wurde (Commit-SHA referenzieren).
