# Drei parallele Teams & Defensiv-Stack-Modus (ODI-299/ODI-300) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drei unabhängige, gleichzeitig sichtbare Team-Shortlists zum Vergleich, jede mit einem eigenen Umschalter zwischen Normal- und Defensiv-Stack-Modus für den Flex-Slot.

**Architecture:** `assignFormation` bekommt einen `mode`-Parameter, der nur den Flex-Pool-Filter ändert. Die komplette bisherige `App.tsx`-Logik (Shortlist, Suche, Formationsliste) wandert in eine neue, wiederverwendbare `TeamPanel`-Komponente; `App.tsx` rendert drei Instanzen in einem responsiven Flexbox-Container.

**Tech Stack:** React 19 + TypeScript + Vite 8, Vitest 4.

## Global Constraints

- `assignFormation(candidates, mode: 'normal' | 'defensiveStack' = 'normal')` — im `defensiveStack`-Modus wählt Flex ausschließlich aus verbleibenden `Defender`-Kandidaten; in `normal` (Default) bleibt das bisherige Verhalten (bester verbleibender Nicht-Torwart) exakt erhalten.
- Kein neues Bewertungskriterium — nutzt ausschließlich den bestehenden `evaluatePlayer`-Score.
- Umschalter sitzt pro Team unabhängig, nicht global.
- Layout: responsiv — `flex-direction: column` unter 900px Breite (Teams untereinander), `row` ab 900px (Teams nebeneinander).
- Jedes Team hat seine eigene, unabhängige Spielersuche (kein geteilter Suchzustand).
- Kein automatisiertes Komponenten-Testing für `TeamPanel`/`App.tsx` — manuelle Browser-Verifikation.
- `tsconfig.app.json`: `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`/`noUnusedParameters`.

---

## Task 1: `assignFormation`-Modus-Parameter

**Files:**
- Modify: `src/api/formation.ts`
- Modify: `src/api/formation.test.ts`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `FormationMode = 'normal' | 'defensiveStack'` (neuer Export), `assignFormation(candidates: EvaluatedCandidate[], mode: FormationMode = 'normal'): FormationSlot[]` — wird von `TeamPanel` (Task 2) konsumiert.

- [ ] **Step 1: Failing Tests schreiben**

Füge in `src/api/formation.test.ts` am Ende des `describe('assignFormation', ...)`-Blocks (vor der schließenden Klammer) diese drei Tests hinzu:

```typescript
  it('fills Flex with the best remaining Defender in defensiveStack mode, even when a higher-scoring non-Defender is available', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('def-2', 'Defender', 50),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('mid-2', 'Midfielder', 75),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const normalSlots = assignFormation(candidates, 'normal')
    const stackSlots = assignFormation(candidates, 'defensiveStack')

    expect(normalSlots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('mid-2')
    expect(stackSlots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('def-2')
  })

  it('leaves Flex empty in defensiveStack mode when no second Defender is available', () => {
    const candidates = [
      buildCandidate('gk-1', 'Goalkeeper', 60),
      buildCandidate('def-1', 'Defender', 70),
      buildCandidate('mid-1', 'Midfielder', 80),
      buildCandidate('fwd-1', 'Forward', 90),
    ]

    const slots = assignFormation(candidates, 'defensiveStack')

    expect(slots.find((slot) => slot.label === 'Flex')?.candidate).toBeNull()
  })

  it('defaults to normal mode when mode is omitted', () => {
    const candidates = [buildCandidate('def-1', 'Defender', 70), buildCandidate('mid-1', 'Midfielder', 80)]

    const slots = assignFormation(candidates)

    expect(slots.find((slot) => slot.label === 'Flex')?.candidate?.player.slug).toBe('mid-1')
  })
```

- [ ] **Step 2: Test laufen lassen, sicherstellen dass er fehlschlägt**

Run: `npm run test -- formation`
Expected: FAIL — die ersten beiden neuen Tests scheitern (Flex-Ergebnis stimmt nicht überein, weil `assignFormation` den zweiten Parameter noch nicht kennt/nutzt). Der dritte Test ("defaults to normal") besteht bereits zufällig, da sich am Normalverhalten nichts ändert — das ist erwartet, kein Problem.

- [ ] **Step 3: `assignFormation` erweitern**

In `src/api/formation.ts`, direkt nach der bestehenden `FormationSlot`-Interface-Definition, den neuen Typ hinzufügen:

```typescript
export type FormationMode = 'normal' | 'defensiveStack'
```

Dann die Funktionssignatur und den Flex-Block ändern von:

```typescript
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

zu:

```typescript
export function assignFormation(
  candidates: EvaluatedCandidate[],
  mode: FormationMode = 'normal',
): FormationSlot[] {
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

  const flexPool = remaining.filter((candidate) =>
    mode === 'defensiveStack'
      ? candidate.player.position === 'Defender'
      : candidate.player.position !== 'Goalkeeper',
  )
  slots.push({ label: 'Flex', candidate: bestCandidate(flexPool) })

  return slots
}
```

- [ ] **Step 4: Test laufen lassen, sicherstellen dass er besteht**

Run: `npm run test -- formation`
Expected: PASS — 12/12 Tests in `formation.test.ts` grün.

- [ ] **Step 5: Gesamter Testlauf und Typecheck**

Run: `npm run test`
Expected: PASS — alle Tests grün (season 4 + sorareClient 6 + scoring 9 + formation 12 = 31 Tests).

Run: `npx tsc -b`
Expected: Keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/api/formation.ts src/api/formation.test.ts
git commit -m "feat: add defensiveStack mode to assignFormation"
```

---

## Task 2: `TeamPanel`-Komponente, `App.tsx` und Layout

**Files:**
- Create: `src/components/TeamPanel.tsx`
- Modify: `src/App.tsx` (komplett ersetzt)
- Modify: `src/App.css`

**Interfaces:**
- Consumes: `assignFormation`, `FormationMode` (Task 1), `evaluatePlayer` (`src/api/scoring.ts`), `PlayerSearch`, `FormationList` (bestehend, unverändert), `Player` (`src/api/types.ts`).
- Produces: `TeamPanel({ label: string })` — von `App.tsx` dreifach instanziiert.

- [ ] **Step 1: `TeamPanel`-Komponente schreiben**

Erstelle `src/components/TeamPanel.tsx`:

```typescript
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
```

- [ ] **Step 2: `App.tsx` ersetzen**

Ersetze den kompletten Inhalt von `src/App.tsx`:

```typescript
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
```

- [ ] **Step 3: `App.css` um Layout- und Umschalter-Stile ergänzen**

Füge am Ende von `src/App.css` hinzu:

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

.team-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
}

.mode-toggle {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.mode-toggle label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
```

- [ ] **Step 4: Typecheck und Lint**

Run: `npx tsc -b`
Expected: Keine Fehler.

Run: `npm run lint`
Expected: Keine Fehler.

- [ ] **Step 5: Manuell im Browser verifizieren**

Run: `npm run dev` (Terminal offen lassen)

Im Browser `http://localhost:5173` öffnen (Fenster mindestens 900px breit):
1. Erwartet: drei Team-Panels ("Team 1", "Team 2", "Team 3") nebeneinander, jedes mit eigenem Umschalter (Normal/Defensiv-Stack), eigenem Suchfeld, eigener Shortlist und eigener Formationsliste.
2. In Team 1 einen bekannten Spielernamen suchen (z.B. "Mbappe") und zwei verschiedene Verteidiger hinzufügen (z.B. über eine zweite Suche nach einem anderen Verteidiger-Namen). Erwartet: mit "Normal" ausgewählt zeigt Flex den besten verbleibenden Nicht-Torwart; nach Umschalten auf "Defensiv-Stack" zeigt Flex stattdessen den zweiten Verteidiger.
3. In Team 2 unabhängig einen anderen Spieler suchen und hinzufügen. Erwartet: Team 1 und Team 3 bleiben davon komplett unberührt (unabhängige Shortlists).
4. Browserfenster auf unter 900px Breite verkleinern. Erwartet: die drei Team-Panels stehen jetzt untereinander statt nebeneinander.

Dev-Server danach mit Strg+C stoppen.

- [ ] **Step 6: Commit**

```bash
git add src/components/TeamPanel.tsx src/App.tsx src/App.css
git commit -m "feat: support three independent teams with per-team defensive-stack toggle"
```

---

## Task 3: Deploy und End-to-End-Abnahme

**Files:** keine (nur Deploy + Verifikation)

**Interfaces:**
- Consumes: alles aus Task 1–2.
- Produces: Bestätigung, dass ODI-299/ODI-300 in Produktion mit echten Live-Daten funktionieren.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy abwarten**

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓ (inkl. Lint- und Test-Schritt).

- [ ] **Step 3: Live im Browser verifizieren**

`https://sorare-for-beginners.de/` öffnen und denselben Ablauf wie in Task 2, Step 5 durchgehen (drei unabhängige Teams, Defensiv-Stack-Umschalter-Wirkung, responsives Verhalten schmal/breit) — jetzt gegen die echte Produktions-URL.

- [ ] **Step 4: Jira-Tickets kommentieren**

Kommentar zu [ODI-299](https://odenwaldpatrick.atlassian.net/browse/ODI-299) und [ODI-300](https://odenwaldpatrick.atlassian.net/browse/ODI-300) hinzufügen, dass beide implementiert, getestet und live verifiziert wurden (Commit-SHA referenzieren).
