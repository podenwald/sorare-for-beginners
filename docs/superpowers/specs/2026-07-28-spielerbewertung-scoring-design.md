# Design: Spielerbewertung (Punktzahl-Potenzial & Beständigkeit)

**Jira:** [ODI-293](https://odenwaldpatrick.atlassian.net/browse/ODI-293) (Epic [ODI-290](https://odenwaldpatrick.atlassian.net/browse/ODI-290))
**Datum:** 2026-07-28

## Kontext

Sorare for Beginners soll Sorare Managern helfen, Spieler anhand ihres Punktzahl-Potenzials
und ihrer Beständigkeit zu bewerten, um verlässliche Kaufentscheidungen zu treffen. ODI-291
(Sorare-API-Anbindung, live) liefert bereits Spieler-Rohdaten. ODI-292 (externe Datenquellen
theanalyst.com/transfermarkt.de) wurde zurückgestellt — transfermarkt.de sperrt KI-/Scraping-
Crawler laut `robots.txt`, und der zusätzliche Mehrwert über Sorares eigene Daten hinaus war
nicht geklärt. ODI-293 arbeitet daher ausschließlich mit Sorare-eigenen Daten.

## Entscheidungen aus der Discovery

- **Ergebnisformat:** ein Gesamt-Score, aber mit Einzelwerten pro Faktor identifizierbar (keine
  reine Blackbox-Zahl). Eine farbliche Darstellung ist Aufgabe der späteren UI (ODI-294).
- **Kategorisierung:** ODI-293 liefert bereits eine Kategorie (gut/mittel/riskant) pro Faktor
  und Gesamt-Score — die UI muss nur noch einfärben, nicht selbst Schwellenwerte definieren.
- **Feinjustierung (Gewichtungen, Schwellenwerte) ist explizit für später vorgesehen** — dieses
  Ticket soll zunächst funktional sein, nicht optimal kalibriert.

## Zusätzlicher Datenbedarf

`Player.stats(seasonStartYear: Int!): Stats` (Sorare-API, live bestätigt) liefert `appearances`,
`minutesPlayed`, `substituteIn`, `substituteOut` für eine Saison — bisher nicht in
`getPlayer()` enthalten. Live-Test (Mbappé, Saison 2025): `{"appearances":31,"minutesPlayed":2606,"substituteIn":2,"substituteOut":9}`.

**Saison-Bestimmung:** automatisch aus dem aktuellen Datum abgeleitet, kein manueller Parameter.
Korrigiert nach einem Live-Test-Fund während der Planung: eine naive "ab Juli = neue Saison"-
Regel lieferte für Juli 2026 ausschließlich Nullen (`appearances: 0` etc.), weil die neue Saison
kalendarisch zwar schon begonnen hat, aber noch keine Spiele stattgefunden haben — genau in dem
Moment, in dem die Bewertung am meisten gebraucht wird (Kaderaufbau vor Saisonstart). Regel daher:
ist der aktuelle Monat **September oder später**, ist `seasonStartYear` das aktuelle Kalenderjahr;
in allen anderen Monaten (Januar–August) das Vorjahr — das referenziert dann die zuletzt
abgeschlossene, vollständige Saison statt einer noch leeren neuen Saison.
Beispiel: Juli 2026 → Saison 2025 (live bestätigt: 31 Einsätze, 2606 Minuten). Oktober 2026 →
Saison 2026. Bekannte Einschränkung: MLS läuft kalendarisch anders (Feb–Nov) als die vier
europäischen Ligen — die einheitliche Regel liefert dort ggf. leicht veraltete statt
aktuellster Daten, aber keine Nullen. Feinere, liga-spezifische Saisonlogik ist bewusst nicht
Teil dieses Tickets.

## Änderungen an bestehendem Code (ODI-291)

- `src/api/types.ts`: neues Interface `SeasonStats { appearances, minutesPlayed, substituteIn, substituteOut }`; `Player` bekommt `seasonStats: SeasonStats | null`.
- `src/api/sorareClient.ts`: `getPlayer()`-Query erweitert um `stats(seasonStartYear: $seasonStartYear) { appearances minutesPlayed substituteIn substituteOut }`; `seasonStartYear` wird aus dem aktuellen Datum berechnet und als zusätzliche GraphQL-Variable mitgeschickt.
- `public/api/sorare-proxy.php`: `playerDetail`-Query in der Whitelist um das `stats(...)`-Feld erweitert (keine neue Operation, nur erweiterte Felderliste der bestehenden).

## Berechnungslogik (`src/api/scoring.ts`, neue Datei)

Reine, deterministische Funktion `evaluatePlayer(player: Player): PlayerEvaluation` — nimmt
einen bereits geladenen `Player` entgegen, macht selbst keine Netzwerkaufrufe.

### Punktzahl-Potenzial

Durchschnitt von `recentSo5Scores`, wobei Einträge mit `score === 0` ausgeschlossen werden
(0.0 deutet auf "nicht gespielt", nicht auf schwache Leistung — das wird stattdessen über
Einsatzminuten-Konstanz/Rotationsrisiko abgebildet). Ergebnis `null`, wenn keine verwertbaren
(nicht-0.0) Einträge vorhanden sind.

### Beständigkeit — 4 Unterfaktoren (je 0–100, 100 = am verlässlichsten)

- **Verfügbarkeitsrisiko:** `100` wenn `activeInjuries` und `activeSuspensions` beide leer sind, sonst `20`.
- **Einsatzminuten-Konstanz:** `min(100, (seasonStats.minutesPlayed / seasonStats.appearances / 90) * 100)`. `null`, wenn `seasonStats` fehlt oder `appearances === 0`.
- **Rotationsrisiko:** `100 - min(100, ((seasonStats.substituteIn + seasonStats.substituteOut) / seasonStats.appearances) * 100)`. `null` unter denselben Bedingungen wie oben.
- **Formkurve:** die (nicht-0.0-)Einträge aus `recentSo5Scores` werden nach `gameDate` absteigend sortiert (neueste zuerst — das liefert die API bereits so); bei `n` verwertbaren Einträgen bilden die ersten `Math.ceil(n / 2)` die "neuere Hälfte", der Rest die "ältere Hälfte" (bei ungerader Anzahl bekommt die neuere Hälfte den zusätzlichen Eintrag). Ergebnis ist `50 + (Durchschnitt neuere Hälfte − Durchschnitt ältere Hälfte)`, auf `0–100` gedeckelt. `null`, wenn weniger als 2 verwertbare Einträge vorhanden sind.

**Beständigkeit gesamt** = einfacher Durchschnitt der verfügbaren (nicht-`null`) Unterfaktoren.
`null`, wenn kein Unterfaktor berechenbar ist.

### Gesamt-Score

`0.6 × Punktzahl-Potenzial + 0.4 × Beständigkeit gesamt`. Ist einer der beiden Werte `null`,
wird ausschließlich mit dem jeweils anderen gerechnet (Gewichtung entsprechend angepasst,
nicht einfach `null` durchgereicht) — nur wenn **beide** `null` sind, ist der Gesamt-Score `null`.

### Kategorien

Einheitlich für Gesamt-Score und jeden Einzelfaktor: `≥ 70` → `"gut"`, `40–69` → `"mittel"`,
`< 40` → `"riskant"`, `null`-Wert → `"unbekannt"`.

### Rückgabetyp

```typescript
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
```

## Tests

Vitest, reine Unit-Tests ohne Netzwerkaufrufe (die Funktion nimmt bereits geladene `Player`-
Objekte entgegen). Testfälle mit festen Beispiel-Inputs, u.a. basierend auf den live
verifizierten Datensätzen aus ODI-291 (Mbappé, Haaland):

- Normalfall mit vollständigen Daten (alle Faktoren berechenbar).
- Spieler mit aktiver Verletzung/Sperre → Verfügbarkeitsrisiko `20`/`"riskant"`.
- Spieler ohne `seasonStats` (z.B. neu zur Saison) → Einsatzminuten-Konstanz und
  Rotationsrisiko `null`/`"unbekannt"`, restliche Faktoren unberührt.
- Spieler mit ausschließlich `0.0`-Punktzahlen → Punktzahl-Potenzial und Formkurve
  `null`/`"unbekannt"`.
- Grenzfälle der Kategorie-Schwellenwerte (genau 70, genau 40).

## Out of Scope

- UI/Darstellung inkl. Farbcodierung (ODI-294).
- Feinjustierung von Gewichtungen und Schwellenwerten (bewusst zurückgestellt).
- Externe Datenquellen (ODI-292, zurückgestellt).
- Vergleich mehrerer Spieler untereinander (Perzentile o.ä.) — nur Einzelspieler-Bewertung.
