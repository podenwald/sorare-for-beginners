# ODI-306: Verletzungs-/Sperr-Status anzeigen (Warnsymbol + Tooltip) + Score-Abwertung — Härtungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spieler mit einer aktiven Verletzung/Sperre werden an jeder Spieleranzeige (Formationsliste, Namenssuche) mit einem Spritzen-Symbol samt Tooltip (Verletzungsart + voraussichtliche Rückkehr) markiert, und ihr Tool-Score wird dauerbasiert abgewertet (nicht hart ausgeschlossen). Zusätzlich zeigt jede Score-Kategorie (🟢/🟡/🔴/⚪) einen Tooltip mit der Score-Zusammensetzung.

**Architecture:** `evaluatePlayer()` erhält einen neuen, optionalen `now`-Parameter (Standard `new Date()`, gleiches Muster wie `getCurrentSeasonStartYear`) und multipliziert den bereits berechneten Gesamt-Score mit einem dauerbasierten Verletzungs-Abwertungsfaktor (0,9 bei sofortiger Rückkehr bis 0,5 bei 60+ Tagen Restdauer, 0,7 bei unbekannter Dauer) — die bestehende 4-Faktoren-Konsistenzberechnung bleibt unverändert, der neue Faktor wirkt zusätzlich auf das Endergebnis. Eine neue, gemeinsam genutzte Komponente `PlayerScoreSummary` bündelt die Anzeige (Name, Score, Kategorie-Icon mit Tooltip, Verletzungs-Icon mit Tooltip, L5/L10/L40-Zeile) und wird sowohl in der Formationsliste als auch in der Namenssuche verwendet — inklusive der dort schon während der Suche (nicht erst nach dem Hinzufügen) abgerufenen vollen Spielerdaten.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4.

**Ausgangslage:** Die funktionale Richtung wurde per rudimentärem Spike direkt gegen echte Produktionsdaten iterativ bestätigt (Nico Schlotterbeck, real verletzt — Ankle Injury, erwartete Rückkehr 20.9.2026 — als durchgängiges Testbeispiel verwendet). Mehrere Iterationen auf Nutzer-Feedback: (1) ein einzelnes Warnsymbol statt zwei sich überlagernder roter Kreise, (2) CSS-Tooltip statt unzuverlässigem nativen `title`-Attribut, (3) Werte bereits in der Suchergebnisliste statt erst nach dem Hinzufügen, (4) eigenes Symbol (💉) für Verletzung/Sperre statt Wiederverwendung der Kategorie-Farbe, (5) Tooltip auch für die Score-Kategorie selbst (nimmt einen Teil von ODI-307 direkt mit), (6) Symbol vor statt nach dem Spielernamen, (7) zweite Zeile (L5/L10/L40) links bündig mit der ersten Zeile, nicht mit dem Symbol. Nutzer hat die finale Version ausdrücklich bestätigt ("ja"). Der Spike-Code ist bereits im Arbeitsverzeichnis vorhanden (uncommitted) und wird in diesem Plan gehärtet, nicht neu geschrieben.

**Wichtiger Kontext — zwei unabhängige Spikes wurden bereits vorab committet (Commit `c5adf16`), damit dieser Plan sauber nur seinen eigenen Scope beschreibt:** ein Team-Aktivieren/Deaktivieren-Toggle (`App.tsx`, ohne Jira-Ticket, "vorerst") und der ODI-305-KI-Team-Auto-Fill (`TeamPanel.tsx`). Beide sind NICHT Teil dieses Plans — nicht anfassen.

## Global Constraints

- Kein automatisiertes Komponenten-/Rendering-Testing für React-Komponenten — Konsistenz mit ODI-294/ODI-299/ODI-300/ODI-301/ODI-297 (nur pure Funktionen/Module werden unit-getestet).
- Reine, testbare Formatierungs-/Erklärungslogik gehört nach `src/components/formatters.ts` (bereits etablierter Ort für `formatScore`, `formatSorareAverage(s)`, `getAvailabilityWarning`), nicht in Komponenten-Dateien.
- `tsconfig.app.json` erzwingt `verbatimModuleSyntax` (Typ-only-Imports müssen `import type` verwenden, getrennt von Werte-Imports), `erasableSyntaxOnly`, `noUnusedLocals`/`noUnusedParameters`.
- `evaluatePlayer(player, now = new Date())` — der optionale `now`-Parameter folgt exakt dem bereits etablierten Muster von `getCurrentSeasonStartYear(now: Date = new Date())` (`src/api/season.ts`), damit Tests deterministisch bleiben.
- Kein harter Ausschluss verletzter/gesperrter Spieler aus Anzeige oder Auswahl — nur Score-Abwertung + visuelles Symbol. Das ist eine explizite User-Entscheidung, keine Interpretation.
- Design/Styling ist NICHT pauschal deferred für dieses Ticket (anders als ODI-301) — die konkrete visuelle Umsetzung wurde aber bereits im Spike mit dem Nutzer iterativ abgestimmt und bestätigt; nicht eigenständig weiter „verbessern".
- Commit-Messages sollen den Jira-Key referenzieren (`ODI-306: ...`).
- Bei jedem Task: nach Codeänderungen `npm test`, `npx tsc -b --noEmit` und `npm run lint` grün, bevor committet wird.
- Aktueller HEAD vor Task 1 ist `c5adf16`.

---

### Task 1: Dauerbasierte Score-Abwertung bei Verletzung/Sperre (`src/api/scoring.ts`) mit Tests

**Files:**
- Modify: `src/api/scoring.ts` (bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Test: `src/api/scoring.test.ts` (neue Tests ergänzen)

**Interfaces:**
- Produces: `evaluatePlayer(player: Player, now: Date = new Date()): PlayerEvaluation` — bestehende Signatur um optionalen `now`-Parameter erweitert, `overall.value` ist jetzt zusätzlich mit einem dauerbasierten Faktor multipliziert, wenn `player.activeInjuries`/`activeSuspensions` nicht leer sind.

Der folgende Code ist bereits im Arbeitsverzeichnis vorhanden (uncommitted). Wenn die Datei beim Start dieses Tasks bereits exakt so aussieht, überspringe den Schreibschritt und fahre mit den Tests fort — verifiziere aber trotzdem mit `npx tsc -b --noEmit`.

- [ ] **Step 1: Bestätigen, dass `calculateInjuryPenaltyFactor` bereits in `src/api/scoring.ts` vorhanden ist**

Prüfe, dass die Datei direkt nach `calculateAvailability` (vor `calculateMinutesConsistency`) folgenden Block enthält:

```typescript
const INJURY_PENALTY_MAX_DAYS = 60
const INJURY_PENALTY_MILD = 0.9
const INJURY_PENALTY_SEVERE = 0.5
const INJURY_PENALTY_UNKNOWN_DURATION = 0.7

function daysUntil(dateString: string | null, now: Date): number | null {
  if (!dateString) return null
  return (new Date(dateString).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
}

function calculateInjuryPenaltyFactor(player: Player, now: Date): number {
  if (player.activeInjuries.length === 0 && player.activeSuspensions.length === 0) return 1

  const daysRemaining = [
    ...player.activeInjuries.map((injury) => daysUntil(injury.expectedEndDate, now)),
    ...player.activeSuspensions.map((suspension) => daysUntil(suspension.endDate, now)),
  ].filter((value): value is number => value !== null)

  if (daysRemaining.length === 0) return INJURY_PENALTY_UNKNOWN_DURATION

  const maxDaysRemaining = Math.max(0, Math.min(INJURY_PENALTY_MAX_DAYS, Math.max(...daysRemaining)))
  const severity = maxDaysRemaining / INJURY_PENALTY_MAX_DAYS
  return INJURY_PENALTY_MILD - severity * (INJURY_PENALTY_MILD - INJURY_PENALTY_SEVERE)
}
```

und dass `evaluatePlayer` folgendermaßen aussieht (Signatur + die letzten drei Zeilen vor dem `return`):

```typescript
export function evaluatePlayer(player: Player, now: Date = new Date()): PlayerEvaluation {
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

  const rawOverallValue = combineWeighted(scorePotential, 0.6, consistencyValue, 0.4)
  const injuryPenaltyFactor = calculateInjuryPenaltyFactor(player, now)
  const overallValue = rawOverallValue === null ? null : rawOverallValue * injuryPenaltyFactor

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

Falls nicht vorhanden, ergänze es exakt so.

- [ ] **Step 2: Bestehende Tests laufen lassen (Regressionscheck)**

Run: `npm test -- scoring`

Expected: PASS, alle 8 bestehenden Tests grün (der neue `now`-Parameter mit Default `new Date()` ändert nichts an bestehenden Tests, da keiner davon `activeInjuries`/`activeSuspensions` UND `overall` gleichzeitig prüft — außer dem Test, der bereits nur `availability` prüft).

- [ ] **Step 3: Neue Tests für die dauerbasierte Abwertung schreiben**

Füge in `src/api/scoring.test.ts` am Ende des bestehenden `describe('evaluatePlayer', ...)`-Blocks (nach dem letzten `it(...)`, vor der schließenden `})`) folgende Tests ein. Alle nutzen ein festes `now`, damit die Tests deterministisch bleiben:

```typescript
  describe('injury/suspension penalty', () => {
    const now = new Date('2026-07-30T00:00:00Z')

    it('applies no penalty when there is no active injury or suspension', () => {
      const evaluation = evaluatePlayer(buildPlayer(), now)

      expect(evaluation.overall.value).toBeCloseTo(81, 5)
    })

    it('applies the severe penalty when the injury has 60+ days remaining', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-30' },
          ],
        }),
        now,
      )

      // raw overall (availability drops to 20): 0.6*70 + 0.4*avg(20,100,100,90) = 0.6*70 + 0.4*77.5 = 73
      // severe factor at 60+ days remaining: 0.5 -> 73 * 0.5 = 36.5
      expect(evaluation.overall.value).toBeCloseTo(36.5, 1)
      expect(evaluation.overall.category).toBe('riskant')
    })

    it('applies only the mild penalty when the injury ends today', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-07-30' },
          ],
        }),
        now,
      )

      // mild factor at 0 days remaining: 0.9 -> 73 * 0.9 = 65.7
      expect(evaluation.overall.value).toBeCloseTo(65.7, 1)
      expect(evaluation.overall.category).toBe('mittel')
    })

    it('applies the flat unknown-duration penalty when expectedEndDate is null', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: null }],
        }),
        now,
      )

      // unknown-duration factor: 0.7 -> 73 * 0.7 = 51.1
      expect(evaluation.overall.value).toBeCloseTo(51.1, 1)
      expect(evaluation.overall.category).toBe('mittel')
    })

    it('treats an active suspension the same as an injury for the penalty', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeSuspensions: [{ kind: 'Red Card', reason: null, startDate: '2026-07-25', endDate: '2026-09-30' }],
        }),
        now,
      )

      expect(evaluation.overall.value).toBeCloseTo(36.5, 1)
    })

    it('uses the longest remaining duration when multiple issues are active', () => {
      const evaluation = evaluatePlayer(
        buildPlayer({
          activeInjuries: [
            { kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-07-30' },
            { kind: 'Hamstring', status: 'active', startDate: '2026-07-01', expectedEndDate: '2026-09-30' },
          ],
        }),
        now,
      )

      // longer of the two (60+ days) wins -> severe factor 0.5, same as the single-severe-injury test
      expect(evaluation.overall.value).toBeCloseTo(36.5, 1)
    })
  })
```

- [ ] **Step 4: Tests ausführen**

Run: `npm test -- scoring`

Expected: PASS, alle Tests grün (8 bestehende + 6 neue = 14 Tests in dieser Datei).

- [ ] **Step 5: Vollständige Test-Suite und Typecheck ausführen**

Run: `npm test && npx tsc -b --noEmit`

Expected: PASS, keine Regressionen in anderen Suiten (insbesondere `formation.test.ts`, das `evaluatePlayer`-Ergebnisse über Fixtures konsumiert, nicht direkt aufruft — sollte unberührt bleiben, da Fixtures dort keine `activeInjuries`/`activeSuspensions` setzen).

- [ ] **Step 6: Commit**

```bash
git add src/api/scoring.ts src/api/scoring.test.ts
git commit -m "ODI-306: apply duration-based score penalty for active injuries/suspensions"
```

---

### Task 2: Testbare Verfügbarkeits- und Score-Erklärungs-Hilfsfunktionen (`src/components/formatters.ts`) mit Tests

**Files:**
- Modify: `src/components/formatters.ts` (bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Test: `src/components/formatters.test.ts` (neue Tests ergänzen)

**Interfaces:**
- Consumes: `PlayerEvaluation` (aus Task 1 unverändert), `Player.activeInjuries`/`activeSuspensions` (aus `src/api/types.ts`, unverändert seit ODI-291).
- Produces: `getAvailabilityWarning(player: Player): string | null`, `getScoreExplanation(evaluation: PlayerEvaluation, hasAvailabilityIssue: boolean): string` — beide exportiert aus `src/components/formatters.ts`.

Der folgende Code ist bereits im Arbeitsverzeichnis vorhanden (uncommitted).

- [ ] **Step 1: Bestätigen, dass `formatters.ts` bereits `getAvailabilityWarning` und `getScoreExplanation` enthält**

Prüfe, dass die Datei diese Funktionen enthält (nach `formatSorareAverages`):

```typescript
function formatExpectedReturn(dateString: string | null): string {
  if (!dateString) return 'Rückkehr unbekannt'
  return `voraussichtlich zurück am ${new Date(dateString).toLocaleDateString('de-DE')}`
}

export function getAvailabilityWarning(player: Player): string | null {
  const injury = player.activeInjuries[0]
  if (injury) return `${injury.kind ?? 'Verletzung'} — ${formatExpectedReturn(injury.expectedEndDate)}`

  const suspension = player.activeSuspensions[0]
  if (suspension) return `${suspension.kind ?? suspension.reason ?? 'Sperre'} — ${formatExpectedReturn(suspension.endDate)}`

  return null
}

export function getScoreExplanation(evaluation: PlayerEvaluation, hasAvailabilityIssue: boolean): string {
  const potential = formatScore(evaluation.scorePotential.value)
  const consistency = formatScore(evaluation.consistency.value)
  const base = `Score: 60% Potenzial (${potential}) + 40% Beständigkeit (${consistency})`
  return hasAvailabilityIssue ? `${base}, zusätzlich abgewertet wegen Verletzung/Sperre` : base
}
```

und dass der Import-Block am Dateianfang `import type { PlayerEvaluation } from '../api/scoring'` sowie `import type { Player, SorareAverageScores } from '../api/types'` enthält. Falls nicht vorhanden, ergänze es exakt so.

- [ ] **Step 2: Neue Tests für `getAvailabilityWarning` schreiben**

Füge in `src/components/formatters.test.ts` einen neuen `describe`-Block hinzu. Zuerst einen kleinen lokalen Test-Helper direkt im Test-File (kein Export nötig, nur für diese Tests):

```typescript
import { getAvailabilityWarning, getScoreExplanation } from './formatters'
import type { Player } from '../api/types'
import type { PlayerEvaluation } from '../api/scoring'

function buildPlayer(overrides: Partial<Player> = {}): Player {
  return {
    slug: 'test-player',
    displayName: 'Test Player',
    position: 'Forward',
    age: 25,
    activeClub: null,
    activeInjuries: [],
    activeSuspensions: [],
    recentSo5Scores: [],
    seasonStats: null,
    sorareAverageScores: { l5: null, l10: null, l40: null },
    ...overrides,
  }
}

describe('getAvailabilityWarning', () => {
  it('returns null when there is no active injury or suspension', () => {
    expect(getAvailabilityWarning(buildPlayer())).toBeNull()
  })

  it('describes an active injury with its expected return date', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-20' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Ankle Injury — voraussichtlich zurück am 20.9.2026')
  })

  it('falls back to a generic label when the injury kind is null', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: null, status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-20' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Verletzung — voraussichtlich zurück am 20.9.2026')
  })

  it('shows an unknown-return message when expectedEndDate is null', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: null }],
    })

    expect(getAvailabilityWarning(player)).toBe('Ankle Injury — Rückkehr unbekannt')
  })

  it('describes an active suspension when there is no injury', () => {
    const player = buildPlayer({
      activeSuspensions: [{ kind: 'Red Card', reason: null, startDate: '2026-07-25', endDate: '2026-08-01' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Red Card — voraussichtlich zurück am 1.8.2026')
  })

  it('falls back to the suspension reason when kind is null', () => {
    const player = buildPlayer({
      activeSuspensions: [{ kind: null, reason: 'Accumulated yellow cards', startDate: '2026-07-25', endDate: '2026-08-01' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Accumulated yellow cards — voraussichtlich zurück am 1.8.2026')
  })

  it('prioritizes an injury over a suspension when both are present', () => {
    const player = buildPlayer({
      activeInjuries: [{ kind: 'Ankle Injury', status: 'active', startDate: '2026-06-21', expectedEndDate: '2026-09-20' }],
      activeSuspensions: [{ kind: 'Red Card', reason: null, startDate: '2026-07-25', endDate: '2026-08-01' }],
    })

    expect(getAvailabilityWarning(player)).toBe('Ankle Injury — voraussichtlich zurück am 20.9.2026')
  })
})
```

- [ ] **Step 3: Neue Tests für `getScoreExplanation` schreiben**

Füge im selben File einen weiteren `describe`-Block hinzu:

```typescript
function buildEvaluation(overrides: Partial<PlayerEvaluation> = {}): PlayerEvaluation {
  return {
    overall: { value: 73, category: 'gut' },
    scorePotential: { value: 70, category: 'gut' },
    consistency: {
      value: 77.5,
      category: 'gut',
      factors: {
        availability: { value: 20, category: 'riskant' },
        minutesConsistency: { value: 100, category: 'gut' },
        rotationRisk: { value: 100, category: 'gut' },
        formTrend: { value: 90, category: 'gut' },
      },
    },
    ...overrides,
  }
}

describe('getScoreExplanation', () => {
  it('explains the score composition without an availability note when there is no issue', () => {
    expect(getScoreExplanation(buildEvaluation(), false)).toBe('Score: 60% Potenzial (70) + 40% Beständigkeit (78)')
  })

  it('appends an availability note when there is an active issue', () => {
    expect(getScoreExplanation(buildEvaluation(), true)).toBe(
      'Score: 60% Potenzial (70) + 40% Beständigkeit (78), zusätzlich abgewertet wegen Verletzung/Sperre',
    )
  })

  it('shows a dash for a null scorePotential or consistency value', () => {
    const evaluation = buildEvaluation({
      scorePotential: { value: null, category: 'unbekannt' },
      consistency: { value: null, category: 'unbekannt', factors: buildEvaluation().consistency.factors },
    })

    expect(getScoreExplanation(evaluation, false)).toBe('Score: 60% Potenzial (–) + 40% Beständigkeit (–)')
  })
})
```

Hinweis: `formatScore` rundet — `77.5` rundet mit `Math.round` auf `78` (JavaScript rundet `.5` aufwärts), daher `Beständigkeit (78)` im erwarteten Text, nicht `77` oder `77.5`.

- [ ] **Step 4: Tests ausführen**

Run: `npm test -- formatters`

Expected: PASS, alle Tests grün (4 bestehende `formatSorareAverages`-Tests + 7 neue `getAvailabilityWarning`-Tests + 3 neue `getScoreExplanation`-Tests = 14 Tests in dieser Datei).

- [ ] **Step 5: Vollständige Test-Suite und Typecheck ausführen**

Run: `npm test && npx tsc -b --noEmit`

Expected: PASS, keine Regressionen.

- [ ] **Step 6: Commit**

```bash
git add src/components/formatters.ts src/components/formatters.test.ts
git commit -m "ODI-306: add testable availability-warning and score-explanation helpers"
```

---

### Task 3: UI-Verdrahtung — gemeinsame `PlayerScoreSummary`-Komponente, Formationsliste, Namenssuche

**Files:**
- Create: `src/components/PlayerScoreSummary.tsx` (bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/components/FormationList.tsx` (bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/components/PlayerSearch.tsx` (bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/App.css` (bereits im Arbeitsverzeichnis vorhanden, siehe unten)

**Interfaces:**
- Consumes: `getAvailabilityWarning`, `getScoreExplanation`, `formatScore`, `formatSorareAverage` (aus Task 1+2), `evaluatePlayer` (aus `src/api/scoring.ts`).
- Produces: `export function PlayerScoreSummary({ player: Player, evaluation: PlayerEvaluation }): JSX.Element` — wiederverwendbare Anzeige-Komponente.

Kein automatisiertes Komponenten-Testing (Global Constraints) — dieser Task wird nur manuell im Dev-Server verifiziert (Step 5).

- [ ] **Step 1: Bestätigen, dass `src/components/PlayerScoreSummary.tsx` bereits existiert**

Der aktuelle Stand der Datei (bereits im Arbeitsverzeichnis vorhanden):

```typescript
import type { Player } from '../api/types'
import type { EvaluationCategory, PlayerEvaluation } from '../api/scoring'
import { formatScore, formatSorareAverage, getAvailabilityWarning, getScoreExplanation } from './formatters'

const CATEGORY_ICON: Record<EvaluationCategory, string> = {
  gut: '🟢',
  mittel: '🟡',
  riskant: '🔴',
  unbekannt: '⚪',
}

function displayCategory(evaluation: PlayerEvaluation): EvaluationCategory {
  return evaluation.scorePotential.category === 'unbekannt' ? 'unbekannt' : evaluation.overall.category
}

interface PlayerScoreSummaryProps {
  player: Player
  evaluation: PlayerEvaluation
}

export function PlayerScoreSummary({ player, evaluation }: PlayerScoreSummaryProps) {
  const category = displayCategory(evaluation)
  const availabilityWarning = getAvailabilityWarning(player)
  const scoreExplanation = getScoreExplanation(evaluation, availabilityWarning !== null)

  return (
    <span className="player-score-summary">
      {availabilityWarning && (
        <span className="icon-tooltip" data-tooltip={availabilityWarning}>
          💉
        </span>
      )}
      <span className="player-score-summary-text">
        {player.displayName} — {formatScore(evaluation.overall.value)}{' '}
        <span className="icon-tooltip" data-tooltip={scoreExplanation}>
          {CATEGORY_ICON[category]}
        </span>{' '}
        {category}
        <br />
        <small>
          L5 {formatSorareAverage(player.sorareAverageScores.l5)} ·{' '}
          <strong>L10 {formatSorareAverage(player.sorareAverageScores.l10)}</strong> · L40{' '}
          {formatSorareAverage(player.sorareAverageScores.l40)}
        </small>
      </span>
    </span>
  )
}
```

Falls die Datei nicht existiert, lege sie exakt so an. **Wichtig:** das 💉-Symbol steht als eigenständiges Icon links, GETRENNT von der Kategorie-Farbe (🟢/🟡/🔴/⚪ bleibt immer die tatsächliche Kategorie, wird NICHT bei Verletzung auf Rot überschrieben) — das war eine explizite Nutzer-Korrektur im Spike, nicht rückgängig machen.

- [ ] **Step 2: Bestätigen, dass `FormationList.tsx` bereits `PlayerScoreSummary` verwendet**

Der aktuelle Stand der Datei (bereits im Arbeitsverzeichnis vorhanden):

```typescript
import type { FormationSlot } from '../api/formation'
import { formatScore } from './formatters'
import { PlayerScoreSummary } from './PlayerScoreSummary'

interface FormationListProps {
  slots: FormationSlot[]
}

const SLOT_LABEL_TEXT: Record<FormationSlot['label'], string> = {
  Goalkeeper: 'Torwart',
  Defender: 'Verteidiger',
  Midfielder: 'Mittelfeld',
  Forward: 'Sturm',
  Flex: 'Flex',
}

export function FormationList({ slots }: FormationListProps) {
  const l10Sum = slots.reduce((sum, slot) => sum + (slot.candidate?.player.sorareAverageScores.l10 ?? 0), 0)

  return (
    <ul className="formation-list">
      {slots.map((slot) => (
        <li key={slot.label} className="formation-slot">
          <span className="formation-slot-label">{SLOT_LABEL_TEXT[slot.label]}</span>
          {slot.candidate ? (
            <span className="formation-slot-candidate">
              <PlayerScoreSummary player={slot.candidate.player} evaluation={slot.candidate.evaluation} />
            </span>
          ) : (
            <span className="formation-slot-empty">{SLOT_LABEL_TEXT[slot.label]} hinzufügen</span>
          )}
        </li>
      ))}
      <li className="formation-total">
        <span className="formation-slot-label">Team L10-Summe</span>
        <strong>{formatScore(l10Sum)}</strong>
      </li>
    </ul>
  )
}
```

(Die `l10Sum`/„Team L10-Summe"-Zeile stammt aus dem ODI-305-Spike, nicht aus ODI-306 — bereits vorhanden, unverändert lassen.) Falls die Datei anders aussieht, gleiche sie exakt an.

- [ ] **Step 3: Bestätigen, dass `PlayerSearch.tsx` bereits volle Spielerdaten pro Suchergebnis abruft**

Der aktuelle Stand der relevanten Teile (bereits im Arbeitsverzeichnis vorhanden):

```typescript
import { useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, searchPlayers } from '../api/sorareClient'
import { evaluatePlayer } from '../api/scoring'
import { SorareApiError } from '../api/types'
import type { Player, PlayerSearchHit } from '../api/types'
import { PlayerScoreSummary } from './PlayerScoreSummary'

interface PlayerSearchProps {
  onAdd: (player: Player) => void
  label: string
}

export function PlayerSearch({ onAdd, label }: PlayerSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [resultDetails, setResultDetails] = useState<Record<string, Player>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return

    setIsSearching(true)
    setSearchError(null)
    setResultDetails({})
    try {
      const result = await searchPlayers({ query, pageSize: 10 })
      setResults(result.hits)
      const settled = await Promise.allSettled(result.hits.map((hit) => getPlayer(hit.slug)))
      const details = Object.fromEntries(
        settled.flatMap((outcome) => (outcome.status === 'fulfilled' ? [[outcome.value.slug, outcome.value]] : [])),
      )
      setResultDetails(details)
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
          aria-label={`Spieler suchen (${label})`}
        />
        <button type="submit" disabled={isSearching}>
          {isSearching ? 'Suche läuft...' : 'Suchen'}
        </button>
      </form>

      {searchError && (
        <p className="search-error" role="alert">
          {searchError}
        </p>
      )}
      {addError && (
        <p className="search-error" role="alert">
          {addError}
        </p>
      )}

      <ul className="search-results">
        {results.map((hit) => {
          const player = resultDetails[hit.slug]
          return (
            <li key={hit.slug}>
              {player ? (
                <span>
                  <PlayerScoreSummary player={player} evaluation={evaluatePlayer(player)} />
                </span>
              ) : (
                <span>
                  {hit.displayName}
                  {hit.clubName ? ` — ${hit.clubName}` : ''}
                </span>
              )}
              <button type="button" onClick={() => handleAdd(hit.slug)} disabled={addingSlug === hit.slug}>
                {addingSlug === hit.slug ? 'Wird geladen...' : 'Hinzufügen'}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

**Wichtig:** `Promise.allSettled` (nicht `Promise.all`) für die Detail-Abfragen — ein einzelner fehlschlagender `getPlayer`-Aufruf darf nicht die ganze Ergebnisanzeige blockieren (gleiche Lehre wie aus ODI-297s finaler Review). Falls die Datei anders aussieht, gleiche sie exakt an.

- [ ] **Step 4: Bestätigen, dass `src/App.css` die nötigen Regeln enthält**

Prüfe, dass die Datei diese drei Regel-Blöcke enthält (Reihenfolge/Position nicht wichtig, nur Inhalt):

```css
.player-score-summary {
  display: flex;
  gap: 6px;
  align-items: flex-start;
}

.icon-tooltip {
  position: relative;
  cursor: help;
}

.icon-tooltip:hover::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  background: var(--code-bg);
  border: 1px solid var(--border);
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  font-size: 12px;
  z-index: 10;
}
```

Falls nicht vorhanden, ergänze sie. Lass alle anderen, bereits vorhandenen Regeln in `App.css` unverändert (u.a. `.team-toggles`, `.auto-fill`, `.formation-total` gehören zu anderen, bereits committeten Spikes — nicht anfassen).

- [ ] **Step 5: Manuelle Verifikation im Dev-Server**

Run: `npm run dev`

Im Browser: Suche nach einem bekannten, aktuell verletzten Spieler (z.B. "Schlotterbeck" — Nico Schlotterbeck war zum Zeitpunkt der Spike-Verifikation real verletzt; falls das nicht mehr zutrifft, einen anderen aktuell verletzten Spieler suchen). Bestätige:
- In der Ergebnisliste (vor dem Hinzufügen) erscheinen bereits Score, Kategorie-Icon und L5/L10/L40 für jeden Treffer.
- Beim verletzten Spieler erscheint zusätzlich ein 💉-Symbol VOR dem Namen.
- Hovern über das 💉-Symbol zeigt einen Tooltip mit Verletzungsart + voraussichtlicher Rückkehr.
- Hovern über das Kategorie-Symbol (🟢/🟡/🔴/⚪) zeigt einen Tooltip mit der Score-Zusammensetzung.
- Die zweite Zeile (L5/L10/L40) ist links bündig mit dem Spielernamen, nicht mit dem 💉-Symbol.
- Nach dem Hinzufügen zur Formationsliste ist dieselbe Darstellung dort ebenfalls sichtbar.
- Browser-Konsole zeigt keine neuen Fehler.

- [ ] **Step 6: Vollständige Test-Suite und Typecheck ausführen**

Run: `npm test && npx tsc -b --noEmit && npm run lint`

Expected: alle drei PASS, keine Regressionen, kein neuer Lint-Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/components/PlayerScoreSummary.tsx src/components/FormationList.tsx src/components/PlayerSearch.tsx src/App.css
git commit -m "ODI-306: show availability warning and score-explanation tooltips everywhere a player appears"
```

---

### Task 4: Deploy und End-to-End-Abnahme

**Files:** keine Code-Änderungen — nur Push, Deploy-Verifikation, manuelle Live-Prüfung, Jira-Kommentar.

**Interfaces:**
- Consumes: den vollständigen, committeten Diff aus Task 1 + Task 2 + Task 3.

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: GitHub-Actions-Deploy beobachten**

```bash
gh run watch --exit-status
```

(Falls kein Run automatisch startet: `gh run list --branch main --limit 3` zur ID-Ermittlung.)

Expected: Alle Schritte grün, insbesondere `Lint`, `Run tests`, `Build for production`, `Sync files`.

- [ ] **Step 3: Bundle-Hash-Abgleich**

Run lokal: `npm run build` und vergleiche den erzeugten Dateinamen in `dist/assets/index-*.js` mit `curl -s https://sorare-for-beginners.de/ | grep -oE '/assets/index-[a-zA-Z0-9_-]+\.js'`. Beide müssen übereinstimmen.

- [ ] **Step 4: Live-Verifikation gegen die echte Produktions-URL**

Öffne `https://sorare-for-beginners.de/?cachebust=<sha>` (Cache-Busting wegen der bekannten Erfahrung aus früheren Tickets). Suche nach einem aktuell verletzten Spieler (z.B. "Schlotterbeck", falls Nico Schlotterbeck zu diesem Zeitpunkt noch verletzt ist — sonst per curl gegen die eigene Produktions-Proxy `POST /api/sorare-proxy.php` mit `operation: playerDetail` einen anderen Spieler mit nicht-leerem `activeInjuries` finden). Bestätige:
- 💉-Symbol + Tooltip erscheinen bereits in der Suchergebnisliste, nicht erst nach dem Hinzufügen.
- Score ist spürbar niedriger als ohne Verletzung (dauerbasierte Abwertung wirkt).
- Tooltip am Kategorie-Symbol zeigt die Score-Zusammensetzung.
- Saubere Konsole.

- [ ] **Step 5: Jira-Kommentar auf ODI-306**

Kommentiere auf ODI-306 (odenwaldpatrick.atlassian.net), dass die Umsetzung live verifiziert wurde, mit Commit-SHA.

- [ ] **Step 6: Report**

Fasse zusammen: Push-Status, Deploy-Status, Bundle-Hash-Abgleich, Live-Verifikationsergebnis, Jira-Kommentar-Bestätigung.

---

## Self-Review-Notizen (bereits durchgeführt)

- **Spec-Abdeckung:** ODI-306s Akzeptanzkriterien (Warnsymbol + Tooltip, Score-Abwertung, Spieler bleibt wählbar) sind über Task 1-3 abgedeckt. Der Teil von ODI-307 ("Score-Transparenz per Tooltip"), der beim Spike bereits mit umgesetzt wurde (Tooltip an der Kategorie), ist in Task 2/3 enthalten — das reduziert ODI-307s verbleibenden Scope auf ggf. weitere Unterfaktoren, falls später gewünscht.
- **Platzhalter-Scan:** Keine TBD/TODO-Stellen; jeder Step enthält vollständigen, copy-paste-fähigen Code oder ein exaktes Kommando.
- **Typkonsistenz:** `getAvailabilityWarning`/`getScoreExplanation` (formatters.ts) → `PlayerScoreSummary` (Komponente) → `FormationList`/`PlayerSearch` (Verwendung) — Funktionssignaturen sind über alle Dateien identisch.
- **Bereits vorhandener Spike-Code:** Jeder Task prüft zuerst den IST-Zustand, statt blind zu überschreiben — falls der Spike-Code zwischenzeitlich verändert wurde, geben die Code-Blöcke trotzdem die exakte Zielimplementierung vor.
- **Abgrenzung zu anderen Spikes:** Team-Toggle (`App.tsx`) und ODI-305-Auto-Fill (`TeamPanel.tsx`) sind bereits vor diesem Plan committet (`c5adf16`) und werden von keinem Task hier berührt.
