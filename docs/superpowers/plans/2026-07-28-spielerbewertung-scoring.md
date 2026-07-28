# Spielerbewertung (ODI-293) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine reine, testbare Bewertungsfunktion, die Spieler anhand von Punktzahl-Potenzial und Beständigkeit (Verfügbarkeit, Einsatzminuten-Konstanz, Rotationsrisiko, Formkurve) einstuft — aufbauend auf den bereits live verfügbaren Sorare-Daten aus ODI-291.

**Architecture:** `Player` (ODI-291) wird um `seasonStats` erweitert (neues Feld `stats(seasonStartYear)` in der bestehenden `playerDetail`-Whitelist-Query). Eine neue, reine Funktion `evaluatePlayer(player: Player): PlayerEvaluation` in `src/api/scoring.ts` berechnet Gesamt-Score und Einzelfaktoren — keine Netzwerkaufrufe, komplett unit-testbar mit festen Beispieldaten. Eine kleine Hilfsfunktion `getCurrentSeasonStartYear` bestimmt das Saison-Jahr deterministisch aus einem übergebenen Datum.

**Tech Stack:** React 19 + TypeScript + Vite 8, Vitest 4 (bereits eingerichtet), PHP-Proxy auf Netcup (PHP 7.4.33, bereits live).

## Global Constraints

- Punktzahl-Potenzial: Durchschnitt der `recentSo5Scores`, Einträge mit `score === 0` werden ausgeschlossen (deuten auf "nicht gespielt"). `null`, wenn keine verwertbaren Einträge übrig bleiben.
- Beständigkeits-Unterfaktoren (je 0–100, 100 = am verlässlichsten): Verfügbarkeitsrisiko (100 ohne aktive Verletzung/Sperre, sonst 20), Einsatzminuten-Konstanz (`min(100, minutesPlayed/appearances/90*100)`), Rotationsrisiko (`100 - min(100, (substituteIn+substituteOut)/appearances*100)`), Formkurve (neuere vs. ältere Hälfte der nicht-0.0-Scores, `50 + Differenz`, gedeckelt 0–100).
- Beständigkeit gesamt = Durchschnitt der verfügbaren (nicht-`null`) Unterfaktoren.
- Gesamt-Score = `0.6 × Punktzahl-Potenzial + 0.4 × Beständigkeit gesamt`; ist einer der beiden `null`, zählt nur der andere; nur wenn beide `null` sind, ist der Gesamt-Score `null`.
- Kategorien (Gesamt-Score und jeder Einzelfaktor): `≥ 70` → `"gut"`, `40–69` → `"mittel"`, `< 40` → `"riskant"`, `null` → `"unbekannt"`.
- Saison-Bestimmung: Monat ≥ September (Index 8, 0-basiert) → aktuelles Kalenderjahr; sonst Vorjahr. Kein manueller Parameter am öffentlichen `getPlayer()`.
- Keine externen Datenquellen (ODI-292 zurückgestellt) — ausschließlich Sorare-eigene Felder.
- Keine UI/Farbdarstellung in diesem Ticket (ODI-294).
- `tsconfig.app.json`: `verbatimModuleSyntax` (type-only Imports separat), `erasableSyntaxOnly` (keine Enums, keine Parameter-Properties), `noUnusedLocals`/`noUnusedParameters`.

---

## Task 1: PHP-Proxy — `playerDetail`-Query um `stats(seasonStartYear)` erweitern

**Files:**
- Modify: `public/api/sorare-proxy.php`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `playerDetail`-Antwort enthält jetzt zusätzlich `anyPlayer.stats { appearances minutesPlayed substituteIn substituteOut }`; erfordert eine neue GraphQL-Variable `seasonStartYear` (Int, required) neben dem bisherigen `slug`.

- [ ] **Step 1: Whitelist-Query erweitern**

In `public/api/sorare-proxy.php` die `playerDetail`-Query (aktuell beginnend mit `query PlayerDetail($slug: String!) {`) durch folgende Version ersetzen:

```php
    'playerDetail' => <<<'GRAPHQL'
query PlayerDetail($slug: String!, $seasonStartYear: Int!) {
  anyPlayer(slug: $slug) {
    ... on Player {
      slug
      displayName
      position
      age
      activeClub {
        name
        slug
      }
      activeInjuries {
        kind
        status
        startDate
        expectedEndDate
      }
      activeSuspensions {
        kind
        reason
        startDate
        endDate
      }
      allSo5Scores(first: 15) {
        nodes {
          score
          game {
            date
          }
        }
      }
      stats(seasonStartYear: $seasonStartYear) {
        appearances
        minutesPlayed
        substituteIn
        substituteOut
      }
    }
  }
}
GRAPHQL,
```

Nur dieser eine Whitelist-Eintrag ändert sich — der Rest der Datei (`playerSearch`-Eintrag, Fehlerbehandlung, Weiterleitungslogik) bleibt unverändert.

- [ ] **Step 2: Lokal testen**

Falls `php` nicht installiert ist: `brew install php`. Dann:

Run: `php -S localhost:8090 -t public/api` (separates Terminal offen lassen)

```bash
curl -s -X POST http://localhost:8090/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin","seasonStartYear":2025}}'
```

Expected: JSON mit `"displayName":"Kylian Mbappé"` und zusätzlich `"stats":{"appearances":31,"minutesPlayed":2606,"substituteIn":2,"substituteOut":9}` (Werte können sich seither leicht geändert haben, entscheidend ist: `stats` ist vorhanden und `appearances`/`minutesPlayed` sind plausible, nicht-negative Zahlen).

- [ ] **Step 3: Commit**

```bash
git add public/api/sorare-proxy.php
git commit -m "feat: extend playerDetail proxy query with season stats"
```

- [ ] **Step 4: Push und Deploy abwarten**

```bash
git push origin main
```

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓.

- [ ] **Step 5: Gegen Produktion verifizieren**

```bash
curl -s -X POST https://sorare-for-beginners.de/api/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin","seasonStartYear":2025}}'
```

Expected: Gleiche Art von Antwort wie in Step 2, live von der Produktions-URL, inklusive `stats`-Feld.

---

## Task 2: Saison-Hilfsfunktion, Typen und Client-Erweiterung

**Files:**
- Create: `src/api/season.ts`
- Create: `src/api/season.test.ts`
- Modify: `src/api/types.ts`
- Modify: `src/api/sorareClient.ts`
- Modify: `src/api/sorareClient.test.ts`

**Interfaces:**
- Consumes: `public/api/sorare-proxy.php` liefert jetzt `stats` im `playerDetail`-Ergebnis (Task 1, bereits deployed).
- Produces: `getCurrentSeasonStartYear(now?: Date): number`; `SeasonStats { appearances, minutesPlayed, substituteIn, substituteOut }`; `Player.seasonStats: SeasonStats | null` — wird von `evaluatePlayer` (Task 3) konsumiert.

- [ ] **Step 1: Failing Test für die Saison-Hilfsfunktion schreiben**

Erstelle `src/api/season.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { getCurrentSeasonStartYear } from './season'

describe('getCurrentSeasonStartYear', () => {
  it('returns the previous year during the pre-season gap (July)', () => {
    expect(getCurrentSeasonStartYear(new Date(2026, 6, 28))).toBe(2025)
  })

  it('returns the current year once the new season is underway (September)', () => {
    expect(getCurrentSeasonStartYear(new Date(2026, 8, 1))).toBe(2026)
  })

  it('still returns the previous season year in the following January', () => {
    expect(getCurrentSeasonStartYear(new Date(2027, 0, 15))).toBe(2026)
  })

  it('defaults to deriving from the real current date when no argument is given', () => {
    const result = getCurrentSeasonStartYear()
    expect(typeof result).toBe('number')
    expect(result).toBeGreaterThan(2000)
  })
})
```

- [ ] **Step 2: Test laufen lassen, sicherstellen dass er fehlschlägt**

Run: `npm run test -- season`
Expected: FAIL — `Cannot find module './season'`.

- [ ] **Step 3: `season.ts` implementieren**

Erstelle `src/api/season.ts`:

```typescript
export function getCurrentSeasonStartYear(now: Date = new Date()): number {
  const month = now.getMonth()
  const year = now.getFullYear()
  return month >= 8 ? year : year - 1
}
```

- [ ] **Step 4: Test laufen lassen, sicherstellen dass er besteht**

Run: `npm run test -- season`
Expected: PASS — 4/4 Tests grün.

- [ ] **Step 5: `types.ts` um `SeasonStats` und `Player.seasonStats` erweitern**

In `src/api/types.ts`, direkt nach dem `So5ScoreEntry`-Interface einfügen:

```typescript
export interface SeasonStats {
  appearances: number
  minutesPlayed: number
  substituteIn: number
  substituteOut: number
}
```

Im `Player`-Interface das Feld `seasonStats: SeasonStats | null` ergänzen (nach `recentSo5Scores`):

```typescript
export interface Player {
  slug: string
  displayName: string
  position: Position
  age: number
  activeClub: Club | null
  activeInjuries: Injury[]
  activeSuspensions: Suspension[]
  recentSo5Scores: So5ScoreEntry[]
  seasonStats: SeasonStats | null
}
```

- [ ] **Step 6: Bestehenden `sorareClient.test.ts`-Erfolgsfall um `stats` erweitern und Season-Assertion ergänzen**

In `src/api/sorareClient.test.ts` den Import um `getCurrentSeasonStartYear` ergänzen:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayer, searchPlayers } from './sorareClient'
import { getCurrentSeasonStartYear } from './season'
import { SorareApiError } from './types'
```

Den ersten Test (`'maps a successful response to a Player'`) komplett ersetzen durch:

```typescript
  it('maps a successful response to a Player', async () => {
    mockFetchOnce({
      data: {
        anyPlayer: {
          slug: 'kylian-mbappe-lottin',
          displayName: 'Kylian Mbappé',
          position: 'Forward',
          age: 27,
          activeClub: { name: 'Real Madrid', slug: 'real-madrid-madrid' },
          activeInjuries: [],
          activeSuspensions: [],
          allSo5Scores: {
            nodes: [{ score: 87.7, game: { date: '2026-07-18T21:00:00Z' } }],
          },
          stats: { appearances: 31, minutesPlayed: 2606, substituteIn: 2, substituteOut: 9 },
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')
    const expectedSeasonStartYear = getCurrentSeasonStartYear()

    expect(fetch).toHaveBeenCalledWith('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'playerDetail',
        variables: { slug: 'kylian-mbappe-lottin', seasonStartYear: expectedSeasonStartYear },
      }),
    })
    expect(player.displayName).toBe('Kylian Mbappé')
    expect(player.recentSo5Scores).toEqual([{ score: 87.7, gameDate: '2026-07-18T21:00:00Z' }])
    expect(player.seasonStats).toEqual({ appearances: 31, minutesPlayed: 2606, substituteIn: 2, substituteOut: 9 })
  })
```

Direkt danach (innerhalb desselben `describe('getPlayer', ...)`-Blocks) einen neuen Test ergänzen:

```typescript
  it('maps a null stats field to seasonStats: null', async () => {
    mockFetchOnce({
      data: {
        anyPlayer: {
          slug: 'kylian-mbappe-lottin',
          displayName: 'Kylian Mbappé',
          position: 'Forward',
          age: 27,
          activeClub: { name: 'Real Madrid', slug: 'real-madrid-madrid' },
          activeInjuries: [],
          activeSuspensions: [],
          allSo5Scores: { nodes: [] },
          stats: null,
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.seasonStats).toBeNull()
  })
```

- [ ] **Step 7: Tests laufen lassen, sicherstellen dass sie fehlschlagen**

Run: `npm run test -- sorareClient`
Expected: FAIL — `player.seasonStats` ist `undefined` statt der erwarteten Werte (bzw. TypeScript-Fehler, da `PlayerDetailRaw` noch kein `stats`-Feld kennt).

- [ ] **Step 8: `sorareClient.ts` anpassen**

In `src/api/sorareClient.ts` den Import um `getCurrentSeasonStartYear` ergänzen:

```typescript
import type { GraphQLError, Player, PlayerSearchResult } from './types'
import { SorareApiError } from './types'
import { getCurrentSeasonStartYear } from './season'
```

`PlayerDetailRaw` um das `stats`-Feld erweitern:

```typescript
interface PlayerDetailRaw {
  anyPlayer: {
    slug: string
    displayName: string
    position: Player['position']
    age: number
    activeClub: { name: string; slug: string } | null
    activeInjuries: Player['activeInjuries']
    activeSuspensions: Player['activeSuspensions']
    allSo5Scores: {
      nodes: { score: number; game: { date: string } }[]
    }
    stats: { appearances: number; minutesPlayed: number; substituteIn: number; substituteOut: number } | null
  } | null
}
```

`getPlayer` anpassen (neue Variable mitschicken, `seasonStats` mappen):

```typescript
export async function getPlayer(slug: string): Promise<Player> {
  const data = await callProxy<PlayerDetailRaw>('playerDetail', {
    slug,
    seasonStartYear: getCurrentSeasonStartYear(),
  })

  if (!data.anyPlayer) {
    throw new SorareApiError(`Spieler "${slug}" nicht gefunden`)
  }

  const raw = data.anyPlayer

  return {
    slug: raw.slug,
    displayName: raw.displayName,
    position: raw.position,
    age: raw.age,
    activeClub: raw.activeClub,
    activeInjuries: raw.activeInjuries,
    activeSuspensions: raw.activeSuspensions,
    recentSo5Scores: raw.allSo5Scores.nodes.map((node) => ({
      score: node.score,
      gameDate: node.game.date,
    })),
    seasonStats: raw.stats
      ? {
          appearances: raw.stats.appearances,
          minutesPlayed: raw.stats.minutesPlayed,
          substituteIn: raw.stats.substituteIn,
          substituteOut: raw.stats.substituteOut,
        }
      : null,
  }
}
```

- [ ] **Step 9: Tests laufen lassen, sicherstellen dass sie bestehen**

Run: `npm run test`
Expected: PASS — alle Tests grün (season.test.ts + sorareClient.test.ts, insgesamt 10 Tests: 4 season + 6 sorareClient).

- [ ] **Step 10: Typecheck**

Run: `npx tsc -b`
Expected: Keine Fehler.

- [ ] **Step 11: Commit**

```bash
git add src/api/season.ts src/api/season.test.ts src/api/types.ts src/api/sorareClient.ts src/api/sorareClient.test.ts
git commit -m "feat: add season-year helper and extend Player with seasonStats"
```

---

## Task 3: Bewertungslogik (`evaluatePlayer`)

**Files:**
- Create: `src/api/scoring.ts`
- Create: `src/api/scoring.test.ts`

**Interfaces:**
- Consumes: `Player` (inkl. `seasonStats`) aus `src/api/types.ts` (Task 2).
- Produces: `evaluatePlayer(player: Player): PlayerEvaluation`, `categorize(value: number | null): EvaluationCategory`, Typen `EvaluationCategory`, `EvaluatedValue`, `PlayerEvaluation` — Basis für die spätere Formationsansicht (ODI-294).

- [ ] **Step 1: Failing Tests schreiben**

Erstelle `src/api/scoring.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { categorize, evaluatePlayer } from './scoring'
import type { Player } from './types'

function buildPlayer(overrides: Partial<Player> = {}): Player {
  return {
    slug: 'test-player',
    displayName: 'Test Player',
    position: 'Forward',
    age: 25,
    activeClub: { name: 'Test FC', slug: 'test-fc' },
    activeInjuries: [],
    activeSuspensions: [],
    recentSo5Scores: [
      { score: 60, gameDate: '2026-02-01T00:00:00Z' },
      { score: 40, gameDate: '2026-01-01T00:00:00Z' },
      { score: 100, gameDate: '2026-04-01T00:00:00Z' },
      { score: 80, gameDate: '2026-03-01T00:00:00Z' },
    ],
    seasonStats: { appearances: 30, minutesPlayed: 2700, substituteIn: 0, substituteOut: 0 },
    ...overrides,
  }
}

describe('categorize', () => {
  it('categorizes exactly 70 as gut', () => {
    expect(categorize(70)).toBe('gut')
  })

  it('categorizes exactly 40 as mittel', () => {
    expect(categorize(40)).toBe('mittel')
  })

  it('categorizes just below 40 as riskant', () => {
    expect(categorize(39.9)).toBe('riskant')
  })

  it('categorizes null as unbekannt', () => {
    expect(categorize(null)).toBe('unbekannt')
  })
})

describe('evaluatePlayer', () => {
  it('computes a complete evaluation from full data, sorting scores by date itself', () => {
    const evaluation = evaluatePlayer(buildPlayer())

    expect(evaluation.scorePotential).toEqual({ value: 70, category: 'gut' })
    expect(evaluation.consistency.factors.availability).toEqual({ value: 100, category: 'gut' })
    expect(evaluation.consistency.factors.minutesConsistency).toEqual({ value: 100, category: 'gut' })
    expect(evaluation.consistency.factors.rotationRisk).toEqual({ value: 100, category: 'gut' })
    expect(evaluation.consistency.factors.formTrend).toEqual({ value: 90, category: 'gut' })
    expect(evaluation.consistency.value).toEqual(97.5)
    expect(evaluation.consistency.category).toBe('gut')
    expect(evaluation.overall).toEqual({ value: 81, category: 'gut' })
  })

  it('drops availability to riskant when an active injury is present', () => {
    const evaluation = evaluatePlayer(
      buildPlayer({
        activeInjuries: [{ kind: 'Muscle', status: 'active', startDate: '2026-04-01', expectedEndDate: null }],
      }),
    )

    expect(evaluation.consistency.factors.availability).toEqual({ value: 20, category: 'riskant' })
  })

  it('returns unbekannt for minutesConsistency and rotationRisk when seasonStats is null', () => {
    const evaluation = evaluatePlayer(buildPlayer({ seasonStats: null }))

    expect(evaluation.consistency.factors.minutesConsistency).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.factors.rotationRisk).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.value).toEqual(95)
    expect(evaluation.overall).toEqual({ value: 80, category: 'gut' })
  })

  it('returns unbekannt for scorePotential and formTrend when all recent scores are zero', () => {
    const evaluation = evaluatePlayer(
      buildPlayer({
        recentSo5Scores: [
          { score: 0, gameDate: '2026-02-01T00:00:00Z' },
          { score: 0, gameDate: '2026-01-01T00:00:00Z' },
        ],
      }),
    )

    expect(evaluation.scorePotential).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.factors.formTrend).toEqual({ value: null, category: 'unbekannt' })
    expect(evaluation.consistency.value).toEqual(100)
    expect(evaluation.overall).toEqual({ value: 100, category: 'gut' })
  })
})
```

- [ ] **Step 2: Test laufen lassen, sicherstellen dass er fehlschlägt**

Run: `npm run test -- scoring`
Expected: FAIL — `Cannot find module './scoring'`.

- [ ] **Step 3: `scoring.ts` implementieren**

Erstelle `src/api/scoring.ts`:

```typescript
import type { Player, SeasonStats } from './types'

export type EvaluationCategory = 'gut' | 'mittel' | 'riskant' | 'unbekannt'

export interface EvaluatedValue {
  value: number | null
  category: EvaluationCategory
}

export interface PlayerEvaluation {
  overall: EvaluatedValue
  scorePotential: EvaluatedValue
  consistency: EvaluatedValue & {
    factors: {
      availability: EvaluatedValue
      minutesConsistency: EvaluatedValue
      rotationRisk: EvaluatedValue
      formTrend: EvaluatedValue
    }
  }
}

export function categorize(value: number | null): EvaluationCategory {
  if (value === null) return 'unbekannt'
  if (value >= 70) return 'gut'
  if (value >= 40) return 'mittel'
  return 'riskant'
}

function toEvaluatedValue(value: number | null): EvaluatedValue {
  return { value, category: categorize(value) }
}

function average(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function combineWeighted(a: number | null, weightA: number, b: number | null, weightB: number): number | null {
  if (a === null && b === null) return null
  if (a === null) return b
  if (b === null) return a
  return weightA * a + weightB * b
}

function calculateScorePotential(player: Player): number | null {
  const nonZeroScores = player.recentSo5Scores
    .filter((entry) => entry.score !== 0)
    .map((entry) => entry.score)
  return average(nonZeroScores)
}

function calculateAvailability(player: Player): number {
  const hasActiveIssue = player.activeInjuries.length > 0 || player.activeSuspensions.length > 0
  return hasActiveIssue ? 20 : 100
}

function calculateMinutesConsistency(seasonStats: SeasonStats | null): number | null {
  if (!seasonStats || seasonStats.appearances === 0) return null
  const averageMinutes = seasonStats.minutesPlayed / seasonStats.appearances
  return Math.min(100, (averageMinutes / 90) * 100)
}

function calculateRotationRisk(seasonStats: SeasonStats | null): number | null {
  if (!seasonStats || seasonStats.appearances === 0) return null
  const substitutionRate = (seasonStats.substituteIn + seasonStats.substituteOut) / seasonStats.appearances
  return 100 - Math.min(100, substitutionRate * 100)
}

function calculateFormTrend(player: Player): number | null {
  const nonZero = player.recentSo5Scores
    .filter((entry) => entry.score !== 0)
    .slice()
    .sort((a, b) => b.gameDate.localeCompare(a.gameDate))

  if (nonZero.length < 2) return null

  const newerCount = Math.ceil(nonZero.length / 2)
  const newerHalf = nonZero.slice(0, newerCount).map((entry) => entry.score)
  const olderHalf = nonZero.slice(newerCount).map((entry) => entry.score)

  const newerAverage = newerHalf.reduce((sum, value) => sum + value, 0) / newerHalf.length
  const olderAverage = olderHalf.reduce((sum, value) => sum + value, 0) / olderHalf.length

  return Math.max(0, Math.min(100, 50 + (newerAverage - olderAverage)))
}

export function evaluatePlayer(player: Player): PlayerEvaluation {
  const scorePotential = calculateScorePotential(player)

  const availability = calculateAvailability(player)
  const minutesConsistency = calculateMinutesConsistency(player.seasonStats)
  const rotationRisk = calculateRotationRisk(player.seasonStats)
  const formTrend = calculateFormTrend(player)

  const consistencyValue = average(
    [availability, minutesConsistency, rotationRisk, formTrend].filter(
      (value): value is number => value !== null,
    ),
  )

  const overallValue = combineWeighted(scorePotential, 0.6, consistencyValue, 0.4)

  return {
    overall: toEvaluatedValue(overallValue),
    scorePotential: toEvaluatedValue(scorePotential),
    consistency: {
      ...toEvaluatedValue(consistencyValue),
      factors: {
        availability: toEvaluatedValue(availability),
        minutesConsistency: toEvaluatedValue(minutesConsistency),
        rotationRisk: toEvaluatedValue(rotationRisk),
        formTrend: toEvaluatedValue(formTrend),
      },
    },
  }
}
```

- [ ] **Step 4: Tests laufen lassen, sicherstellen dass sie bestehen**

Run: `npm run test -- scoring`
Expected: PASS — 8/8 Tests grün (4 `categorize` + 4 `evaluatePlayer`).

- [ ] **Step 5: Gesamten Testlauf und Typecheck**

Run: `npm run test`
Expected: PASS — alle Tests grün (season 4 + sorareClient 6 + scoring 8 = 18 Tests).

Run: `npx tsc -b`
Expected: Keine Fehler.

Run: `npm run lint`
Expected: Keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/api/scoring.ts src/api/scoring.test.ts
git commit -m "feat: add player evaluation scoring logic"
```

---

## Task 4: Deploy und End-to-End-Abnahme

**Files:** keine (nur Deploy + Verifikation)

**Interfaces:**
- Consumes: alles aus Task 1–3.
- Produces: Bestätigung, dass ODI-293 in Produktion mit echten Live-Daten funktioniert.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy abwarten**

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓ (inkl. Lint- und Test-Schritt aus der ODI-291-CI-Erweiterung).

- [ ] **Step 3: Mit echten Live-Daten verifizieren**

Über den bereits konfigurierten Vite-Dev-Proxy (ODI-291, Task 4) direkt gegen die deployte, um `stats` erweiterte `playerDetail`-Query prüfen — das deckt den vollen HTTP-Pfad Frontend-Client → PHP-Proxy → Sorare-API ab; `evaluatePlayer` selbst ist bereits vollständig durch die Unit-Tests aus Task 3 abgedeckt (reine Funktion, kein Netzwerkzugriff nötig):

```bash
npm run dev &
sleep 2
curl -s -X POST http://localhost:5173/api/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin","seasonStartYear":2025}}'
kill %1
```

Expected: JSON mit echten Spielerdaten inklusive `stats` (analog zu Task 1, Step 5, jetzt über den Dev-Proxy statt direkt).

- [ ] **Step 4: Jira-Ticket kommentieren**

Kommentar zu [ODI-293](https://odenwaldpatrick.atlassian.net/browse/ODI-293) hinzufügen, dass die Bewertungslogik implementiert, getestet und die erweiterte Datenanbindung live verifiziert wurde (Commit-SHA referenzieren).
