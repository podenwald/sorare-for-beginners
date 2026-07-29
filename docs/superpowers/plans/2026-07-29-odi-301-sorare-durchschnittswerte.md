# ODI-301: Sorare L5/L10/L40-Durchschnittswerte anzeigen — Härtungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sorares eigene L5-, L10- und L40-Durchschnittswerte (SO5-Score) werden für jeden Spieler in der Formationsliste zusätzlich zum bestehenden Tool-Score angezeigt, mit Test-Abdeckung für das neue Daten-Mapping und die neue Formatierungslogik.

**Architecture:** Die Werte kommen direkt aus Sorares `averageScore(type: ...)`-Feld (drei Aufrufe mit unterschiedlichem `type`-Enum, per GraphQL-Alias `l5`/`l10`/`l40` in einer einzigen `playerDetail`-Query gebündelt), fließen unverändert durch den bestehenden PHP-Whitelist-Proxy, werden im TS-Client in ein neues `SorareAverageScores`-Objekt auf `Player` gemappt, und in `FormationList` unterhalb des bestehenden Scores als zusätzliche Textzeile angezeigt.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, PHP 7.4.33 (Netcup shared hosting, kein PHP-Testframework).

**Ausgangslage:** Die funktionale Richtung wurde bereits per schnellem, ungetestetem Spike direkt gegen die echte Sorare-API bestätigt (User: "Passt so, jetzt hart machen"). Der Spike-Code ist bereits unverändert im Arbeitsverzeichnis vorhanden (uncommitted) und wird in diesem Plan nicht neu geschrieben, sondern gehärtet: bestehende Tests, die durch die neue Pflichteigenschaft `sorareAverageScores` auf `Player` kaputtgegangen sind, werden repariert, und neue Tests für das Mapping und die Formatierung werden ergänzt. Das visuelle Styling ist explizit auf einen späteren Schritt verschoben (User-Entscheidung) — diese Runde ändert an der Darstellung nichts außer dem, was zum Funktionieren/Testen nötig ist.

## Global Constraints

- Kein automatisiertes Komponenten-/Rendering-Testing für React-Komponenten — Konsistenz mit ODI-294/ODI-299/ODI-300 (nur pure Funktionen werden unit-getestet, nicht das JSX-Rendering selbst).
- PHP-Proxy-Änderungen werden ausschließlich manuell per `curl` gegen die echte Sorare-API verifiziert — es existiert kein PHP-Testframework im Projekt (Konsistenz mit ODI-291/293/294/296/299/300).
- Design/Styling der neuen Anzeige (Platzierung, Schriftgröße, Trennzeichen) bleibt exakt wie im Spike — NICHT in dieser Runde verändern oder verbessern. Das ist eine explizite User-Entscheidung ("Das Design machen wir in einem späteren Schritt").
- `tsconfig.app.json` erzwingt `verbatimModuleSyntax` (Typ-only-Imports müssen `import type` verwenden, getrennt von Werte-Imports), `erasableSyntaxOnly` (keine Enums), `noUnusedLocals`/`noUnusedParameters`.
- Sorares `averageScore`-Feld kann laut Schema `null` liefern, wenn für den Zeitraum keine Daten vorliegen (nicht empirisch mit einem echten Null-Fall verifiziert) — überall defensiv als `number | null` behandeln, niemals auf einen non-null-Wert vertrauen.
- Commit-Messages sollen den Jira-Key referenzieren (`ODI-301: ...`), Konsistenz mit dem Projekt-Standard.
- Bei jedem Task: nach Codeänderungen `npm test` und (wo zutreffend) `npx tsc -b --noEmit` bzw. `npm run lint` grün, bevor committet wird.

---

### Task 1: PHP-Proxy, Typen und Sorare-Client erweitern (mit Tests)

**Files:**
- Modify: `public/api/sorare-proxy.php` (Query-Erweiterung — bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/api/types.ts` (neues Interface + Feld — bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/api/sorareClient.ts` (Raw-Typ + Mapping — bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/api/formation.test.ts:38` (bestehende Fixture reparieren)
- Modify: `src/api/scoring.test.ts:20` (bestehende Fixture reparieren)
- Test: `src/api/sorareClient.test.ts` (neue Tests ergänzen)

**Interfaces:**
- Produces: `SorareAverageScores` (in `src/api/types.ts`): `{ l5: number | null; l10: number | null; l40: number | null }`. `Player.sorareAverageScores: SorareAverageScores` (Pflichtfeld, kein Optional).
- Produces: `getPlayer(slug: string): Promise<Player>` (unverändert exportiert aus `src/api/sorareClient.ts`) liefert jetzt zusätzlich `sorareAverageScores` befüllt.

Der folgende Code ist bereits im Arbeitsverzeichnis vorhanden (uncommitted) und wurde bereits einmalig per `curl` direkt gegen `https://api.sorare.com/graphql` empirisch verifiziert (Beispiel: Spieler `kylian-mbappe-lottin` lieferte `l5: 74.0, l10: 70.0, l40: 64.0`). Wenn eine der folgenden Dateien beim Start dieses Tasks bereits exakt so aussieht, überspringe den jeweiligen Schreibschritt und fahre mit dem nächsten fort — verifiziere aber trotzdem mit den angegebenen Kommandos.

- [ ] **Step 1: Bestätigen, dass die PHP-Proxy-Query bereits erweitert ist**

Prüfe, dass `public/api/sorare-proxy.php` in der `playerDetail`-Query (zwischen `allSo5Scores(...)` und `stats(...)`) exakt diese drei Zeilen enthält:

```graphql
      l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
      l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
      l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
```

Falls nicht vorhanden, füge sie exakt an dieser Stelle ein.

- [ ] **Step 2: Proxy-Query manuell gegen die echte Sorare-API verifizieren**

Run:
```bash
curl -s -X POST https://api.sorare.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { anyPlayer(slug: \"kylian-mbappe-lottin\") { ... on Player { slug l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE) l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE) l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE) } } }"}'
```
Expected: JSON mit `"l5"`, `"l10"`, `"l40"` als Zahlen (keine GraphQL-`errors`). Werte können sich seit der letzten Verifikation geändert haben (Sorare-Daten sind live) — wichtig ist nur, dass alle drei Felder als Zahl zurückkommen, nicht dass sie exakt `74.0/70.0/64.0` sind.

- [ ] **Step 3: Bestätigen, dass `SorareAverageScores` bereits in `src/api/types.ts` existiert**

Prüfe, dass die Datei dieses Interface und Feld enthält:

```typescript
export interface SorareAverageScores {
  l5: number | null
  l10: number | null
  l40: number | null
}
```

und dass `Player` (im selben File) um folgendes Feld erweitert ist:

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
  sorareAverageScores: SorareAverageScores
}
```

Falls nicht vorhanden, ergänze beides exakt so (Reihenfolge: `SorareAverageScores`-Interface vor `Player`, `sorareAverageScores`-Feld als letztes Feld in `Player`).

- [ ] **Step 4: Build-Fehler durch die neue Pflichteigenschaft sichtbar machen**

Run: `npx tsc -b --noEmit`

Expected: FAIL mit Fehlern wie `Property 'sorareAverageScores' is missing in type '...'` für die Test-Fixtures in `src/api/formation.test.ts` und `src/api/scoring.test.ts` (diese Dateien wurden noch nicht angepasst).

- [ ] **Step 5: Fixture in `src/api/formation.test.ts` reparieren**

Die Funktion `buildCandidate` (Zeile 7-42) konstruiert aktuell ein `Player`-Objekt ohne `sorareAverageScores`. Ändere den `return`-Block so, dass er nach `seasonStats: null,` (Zeile 38) folgende Zeile ergänzt:

```typescript
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
      sorareAverageScores: { l5: null, l10: null, l40: null },
    },
    evaluation,
  }
```

- [ ] **Step 6: Fixture in `src/api/scoring.test.ts` reparieren**

Die Funktion `buildPlayer` (Zeile 5-23) konstruiert aktuell ein `Player`-Objekt ohne `sorareAverageScores`. Ändere den `return`-Block so, dass er nach `seasonStats: { appearances: 30, minutesPlayed: 2700, substituteIn: 0, substituteOut: 0 },` (Zeile 20) folgende Zeile ergänzt, vor dem `...overrides,`-Spread:

```typescript
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
    sorareAverageScores: { l5: null, l10: null, l40: null },
    ...overrides,
  }
}
```

- [ ] **Step 7: Build-Fehler behoben bestätigen**

Run: `npx tsc -b --noEmit`

Expected: PASS (keine Ausgabe, Exit-Code 0).

- [ ] **Step 8: Bestätigen, dass `sorareClient.ts` bereits das Mapping enthält**

Prüfe, dass `src/api/sorareClient.ts` in `PlayerDetailRaw['anyPlayer']` (zwischen `allSo5Scores` und `stats`) diese drei Felder enthält:

```typescript
    l5: number | null
    l10: number | null
    l40: number | null
```

und dass `getPlayer()` im `return`-Objekt (nach dem `seasonStats: raw.stats ? {...} : null,`-Block) folgendes ergänzt:

```typescript
    sorareAverageScores: {
      l5: raw.l5,
      l10: raw.l10,
      l40: raw.l40,
    },
```

Falls nicht vorhanden, ergänze beides exakt so.

- [ ] **Step 9: Neuen Test für das l5/l10/l40-Mapping schreiben (Werte vorhanden)**

Füge in `src/api/sorareClient.test.ts` nach dem bestehenden Test `'maps a null stats field to seasonStats: null'` (endet bei Zeile 75) folgenden neuen Test ein:

```typescript
  it('maps l5/l10/l40 averageScore fields to sorareAverageScores', async () => {
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
          l5: 74,
          l10: 70,
          l40: 64,
          stats: null,
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.sorareAverageScores).toEqual({ l5: 74, l10: 70, l40: 64 })
  })

  it('maps missing averageScore data to null fields in sorareAverageScores', async () => {
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
          l5: null,
          l10: null,
          l40: null,
          stats: null,
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.sorareAverageScores).toEqual({ l5: null, l10: null, l40: null })
  })
```

- [ ] **Step 10: Tests ausführen**

Run: `npm test -- sorareClient`

Expected: PASS, alle Tests in `sorareClient.test.ts` grün (7 Tests: 5 bestehende + 2 neue).

- [ ] **Step 11: Vollständige Test-Suite und Typecheck ausführen**

Run: `npm test && npx tsc -b --noEmit`

Expected: PASS, keine Regressionen in `formation.test.ts`/`scoring.test.ts`/anderen Suiten.

- [ ] **Step 12: Commit**

```bash
git add public/api/sorare-proxy.php src/api/types.ts src/api/sorareClient.ts src/api/sorareClient.test.ts src/api/formation.test.ts src/api/scoring.test.ts
git commit -m "ODI-301: fetch and map Sorare L5/L10/L40 average scores"
```

---

### Task 2: L5/L10/L40 in der Formationsliste anzeigen (mit Tests)

**Files:**
- Modify: `src/components/FormationList.tsx` (Formatierungsfunktion exportieren — bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Test: `src/components/FormationList.test.ts` (neu)

**Interfaces:**
- Consumes: `EvaluatedCandidate` (aus `src/api/formation.ts`), `Player.sorareAverageScores` (aus Task 1).
- Produces: `formatSorareAverages(candidate: EvaluatedCandidate): string`, exportiert aus `src/components/FormationList.tsx`.

- [ ] **Step 1: Bestätigen, dass `FormationList.tsx` die Formatierungsfunktion und das Rendering bereits enthält**

Prüfe, dass `src/components/FormationList.tsx` diese Funktion enthält (aktuell nicht exportiert):

```typescript
function formatSorareAverages(candidate: EvaluatedCandidate): string {
  const { l5, l10, l40 } = candidate.player.sorareAverageScores
  return `L5 ${formatScore(l5)} · L10 ${formatScore(l10)} · L40 ${formatScore(l40)}`
}
```

und dass im JSX (innerhalb des `<span className="formation-slot-candidate">`-Blocks, nach der Score/Kategorie-Zeile) folgendes ergänzt ist:

```tsx
                <br />
                <small>{formatSorareAverages(slot.candidate)}</small>
```

Falls nicht vorhanden, ergänze beides exakt so — Platzierung/Styling NICHT verändern (siehe Global Constraints).

- [ ] **Step 2: Fehlschlagenden Test für die Formatierungsfunktion schreiben**

Erstelle `src/components/FormationList.test.ts`:

```typescript
import { describe, expect, it } from 'vitest'
import { formatSorareAverages } from './FormationList'
import type { EvaluatedCandidate } from '../api/formation'
import type { PlayerEvaluation } from '../api/scoring'
import type { Player } from '../api/types'

function buildCandidate(sorareAverageScores: Player['sorareAverageScores']): EvaluatedCandidate {
  const evaluation: PlayerEvaluation = {
    overall: { value: 70, category: 'gut' },
    scorePotential: { value: 70, category: 'gut' },
    consistency: {
      value: 70,
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
      slug: 'test-player',
      displayName: 'Test Player',
      position: 'Forward',
      age: 25,
      activeClub: null,
      activeInjuries: [],
      activeSuspensions: [],
      recentSo5Scores: [],
      seasonStats: null,
      sorareAverageScores,
    },
    evaluation,
  }
}

describe('formatSorareAverages', () => {
  it('formats all three values when present', () => {
    const candidate = buildCandidate({ l5: 74, l10: 70.4, l40: 64 })
    expect(formatSorareAverages(candidate)).toBe('L5 74 · L10 70 · L40 64')
  })

  it('shows a dash for any value that is null', () => {
    const candidate = buildCandidate({ l5: null, l10: 70, l40: null })
    expect(formatSorareAverages(candidate)).toBe('L5 – · L10 70 · L40 –')
  })

  it('shows a dash for all three values when all are null', () => {
    const candidate = buildCandidate({ l5: null, l10: null, l40: null })
    expect(formatSorareAverages(candidate)).toBe('L5 – · L10 – · L40 –')
  })
})
```

- [ ] **Step 3: Test ausführen, Fehlschlag bestätigen**

Run: `npm test -- FormationList`

Expected: FAIL mit einem Import-/Typfehler, da `formatSorareAverages` noch nicht exportiert ist (`SyntaxError` oder `does not provide an export named 'formatSorareAverages'`).

- [ ] **Step 4: Funktion exportieren**

In `src/components/FormationList.tsx`, ändere die Funktionsdeklaration von

```typescript
function formatSorareAverages(candidate: EvaluatedCandidate): string {
```

zu

```typescript
export function formatSorareAverages(candidate: EvaluatedCandidate): string {
```

Keine weitere Änderung an der Funktion, ihrer Platzierung oder dem JSX.

- [ ] **Step 5: Test ausführen, Erfolg bestätigen**

Run: `npm test -- FormationList`

Expected: PASS, alle 3 Tests grün.

- [ ] **Step 6: Vollständige Test-Suite und Typecheck ausführen**

Run: `npm test && npx tsc -b --noEmit`

Expected: PASS, keine Regressionen.

- [ ] **Step 7: Commit**

```bash
git add src/components/FormationList.tsx src/components/FormationList.test.ts
git commit -m "ODI-301: display Sorare L5/L10/L40 averages in the formation list"
```

---

### Task 3: Deploy und End-to-End-Abnahme

**Files:** keine Code-Änderungen — nur Push, Deploy-Verifikation, manuelle Live-Prüfung, Jira-Kommentar.

**Interfaces:**
- Consumes: den vollständigen, committeten Diff aus Task 1 + Task 2.

- [ ] **Step 1: Push**

```bash
git push origin main
```

Expected: Erfolgreicher Push, keine Konflikte.

- [ ] **Step 2: GitHub-Actions-Deploy beobachten**

```bash
gh run watch --exit-status
```

(Falls kein Run automatisch startet oder die ID unklar ist: `gh run list --branch main --limit 3` zur ID-Ermittlung.)

Expected: Alle Schritte grün, insbesondere `Lint`, `Run tests`, `Build for production`, `Sync files`.

- [ ] **Step 3: Live-Verifikation gegen die echte Produktions-URL**

Öffne `https://sorare-for-beginners.de/`, füge in einem der drei Teams einen bekannten Spieler mit Spielpraxis hinzu (z.B. Suche nach "Mbappe", füge "Kylian Mbappé" hinzu). Bestätige:
- Unter dem bestehenden Tool-Score erscheint eine zusätzliche Zeile im Format `L5 <Zahl> · L10 <Zahl> · L40 <Zahl>`.
- Die Werte sind plausible SO5-Scores (üblicherweise zwischen 0 und 100).
- Die Browser-Konsole zeigt keine neuen Fehler.

Falls möglich, versuche zusätzlich einen Spieler mit sehr wenig aktueller Spielpraxis zu finden, um den bisher nicht empirisch verifizierten `null`-Fall (Anzeige `–`) auch live zu beobachten — falls kein solcher Spieler gefunden wird, ist das kein Blocker (der `null`-Fall ist bereits durch die Unit-Tests aus Task 1 und Task 2 abgedeckt), aber im Report vermerken.

- [ ] **Step 4: Jira-Kommentar auf ODI-301**

Kommentiere auf ODI-301 (odenwaldpatrick.atlassian.net), dass die Umsetzung live verifiziert wurde, mit Commit-SHA und einem Hinweis, dass das visuelle Design/Styling bewusst für einen späteren Schritt zurückgestellt wurde.

- [ ] **Step 5: Report**

Fasse zusammen: Push-Status, Deploy-Status, Live-Verifikationsergebnis (inkl. ob ein echter `null`-Fall beobachtet wurde), Jira-Kommentar-Bestätigung.

---

## Self-Review-Notizen (bereits durchgeführt)

- **Spec-Abdeckung:** Beide Akzeptanzkriterien aus ODI-301 sind abgedeckt — Task 1+2 liefern L5/L10/L40 aus Sorares API (nicht selbst berechnet), Task 2 zeigt sie neben dem bestehenden Tool-Score an, Task 3 verifiziert live.
- **Platzhalter-Scan:** Keine TBD/TODO-Stellen; jeder Step enthält vollständigen, copy-paste-fähigen Code oder ein exaktes Kommando.
- **Typkonsistenz:** `SorareAverageScores` (types.ts) → `PlayerDetailRaw.anyPlayer.{l5,l10,l40}` (sorareClient.ts) → `Player.sorareAverageScores` → `formatSorareAverages(candidate: EvaluatedCandidate)` (FormationList.tsx) — Feldnamen und Typen (`number | null`) sind über alle drei Dateien identisch.
- **Bereits vorhandener Spike-Code:** Task 1/2 sind so formuliert, dass ein frischer Implementer zuerst den IST-Zustand prüft (Steps 1/3/8 in Task 1, Step 1 in Task 2) statt blind zu überschreiben — falls der Spike-Code zwischenzeitlich verändert/verworfen wurde, geben die Code-Blöcke trotzdem die exakte Zielimplementierung vor.
