# Design: Formationsansicht (Vorschlag für alle 5 In-Season-Plätze)

**Jira:** [ODI-294](https://odenwaldpatrick.atlassian.net/browse/ODI-294) (Epic [ODI-290](https://odenwaldpatrick.atlassian.net/browse/ODI-290))
**Datum:** 2026-07-28

## Kontext

Erste echte UI-Funktion des Projekts — bisher zeigt `src/App.tsx` nur den Vite-Standard-Demo-Content.
Aufbauend auf ODI-291 (Sorare-API-Client) und ODI-293 (Bewertungslogik `evaluatePlayer`) soll der
Nutzer einen Formationsvorschlag für die 5 In-Season-Plätze (Torwart, Verteidiger, Mittelfeld,
Sturm, Flex) sehen.

## Entscheidungen aus der Discovery

- **Kandidaten-Quelle:** Der Nutzer sucht Spieler manuell per Namen (bestehende `searchPlayers()`)
  und baut sich eine Shortlist. Ein automatisches Durchsuchen des gesamten Marktes ohne
  Namenseingabe ist zurückgestellt ([ODI-297](https://odenwaldpatrick.atlassian.net/browse/ODI-297)).
- **Zuteilung:** Bester Kandidat pro exakter Position (TW/ABW/MF/ST); der beste verbleibende
  Nicht-Torwart-Kandidat füllt Flex. Keine global-optimale Kombinationssuche.
- **Persistenz:** Nur während der Sitzung (React-State) — kein `localStorage`/IndexedDB in diesem
  Ticket. Echte Persistenz ist Teil von ODI-295 (lokales Präferenzprofil).
- **Aktualisierung:** Live — jede Änderung an der Shortlist berechnet die Formation sofort neu,
  kein expliziter "Berechnen"-Button.
- **Layout (visuell geprüft, drei Mockups verglichen):** kompakte Liste — eine Zeile pro Position
  mit Spielername, Score und Kategorie-Indikator. Kein Spielfeld-Grafik-Layout, keine Kartenreihe.
- **Seitenaufbau (visuell geprüft):** einspaltig, mobil-first — Suche, Shortlist-Chips,
  Formationsliste untereinander. Keine zusätzliche Zweispalten-Desktop-Variante in diesem Ticket.
- **"Unbekannt"-Zustand:** eigenes, von gut/mittel/riskant getrenntes visuelles Signal (nicht nur
  ein Zusatzhinweis neben dem Score).

## Bekannter Bewertungs-Gap (aus ODI-293, hier adressiert)

Ein Spieler ganz ohne verwertbare Daten bekommt von `evaluatePlayer()` aktuell einen Gesamt-Score
von 100/`"gut"`, weil die Fallback-Logik "keine negativen Signale" als "voll positiv" wertet
(`consistency` wird durch das immer verfügbare `availability`-Signal auf 100 gezogen, sobald keine
Verletzung/Sperre vorliegt, während `scorePotential` mangels Punktzahl-Historie `null`/`"unbekannt"`
bleibt und der Gesamt-Score dann allein aus `consistency` gebildet wird).

**Lösung ohne Änderung an `scoring.ts`:** Die Anzeige verwendet nicht direkt
`evaluation.overall.category`, sondern:

```typescript
const displayCategory =
  evaluation.scorePotential.category === 'unbekannt' ? 'unbekannt' : evaluation.overall.category
```

Das trifft genau den bekannten Bug-Fall (keine Punktzahl-Historie vorhanden → Gesamtwert nicht
vertrauenswürdig), ohne die bereits geprüfte Bewertungslogik aus ODI-293 zu verändern.

## Architektur

### Neue Datei: `src/api/formation.ts` (reine Logik, analog zu `scoring.ts`)

```typescript
export interface EvaluatedCandidate {
  player: Player
  evaluation: PlayerEvaluation
}

export type FormationSlotLabel = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Flex'

export interface FormationSlot {
  label: FormationSlotLabel
  candidate: EvaluatedCandidate | null
}

export function assignFormation(candidates: EvaluatedCandidate[]): FormationSlot[]
```

**Algorithmus:**
1. Für `Goalkeeper`, `Defender`, `Midfielder`, `Forward` (in dieser Reihenfolge): wähle aus den
   verbleibenden Kandidaten mit passender `player.position` denjenigen mit dem höchsten
   `evaluation.overall.value` (fehlender Wert gilt als niedrigster); aus dem Pool entfernen.
2. Für `Flex`: aus den verbleibenden Kandidaten mit `player.position !== 'Goalkeeper'` denjenigen
   mit dem höchsten `overall.value`.
3. Kein passender Kandidat für einen Slot → `candidate: null`.

**Rangfolge-Details:** Ein `overall.value` von `null` gilt als niedrigster möglicher Wert (wird
nur gewählt, wenn kein Kandidat mit numerischem Wert für den Slot verfügbar ist). Bei exakt
gleichem `overall.value` gewinnt der Kandidat, der zuerst in der Eingabe-Reihenfolge (Reihenfolge
des Hinzufügens zur Shortlist) auftaucht — stabile Sortierung, kein weiteres Tie-Breaking.

Reine Funktion, keine Netzwerkaufrufe — unabhängig von React testbar.

### Neue Komponenten

- **`src/components/PlayerSearch.tsx`** — Suchfeld, ruft `searchPlayers()` auf, zeigt Treffer mit
  "Hinzufügen"-Button. Bei Klick: lädt `getPlayer(slug)`, meldet Erfolg/Fehler an den Parent.
- **`src/components/FormationList.tsx`** — rendert die 5 `FormationSlot`s als kompakte Liste;
  nutzt die `displayCategory`-Regel oben für den Kategorie-Indikator; zeigt "hinzufügen"-Platzhalter
  bei `candidate: null`.
- **`src/App.tsx`** (komplett ersetzt) — hält den Shortlist-State (`Player[]`), berechnet bei jeder
  Änderung `evaluatePlayer()` pro Kandidat und `assignFormation()`, reicht das Ergebnis an
  `FormationList` weiter.

### Datenfluss beim Hinzufügen eines Kandidaten

1. Nutzer sucht per Namen → Treffer werden angezeigt.
2. Klick auf "Hinzufügen" → Ladezustand am Button → `getPlayer(slug)`.
3. Erfolg: vollständiger `Player` kommt in den Shortlist-State. Fehler: Inline-Meldung, nicht
   hinzugefügt.
4. `evaluatePlayer()` läuft synchron für jeden Shortlist-Spieler (kein zusätzlicher Ladezustand
   nötig, da reine Funktion ohne Netzwerkzugriff).
5. `assignFormation()` verteilt die bewerteten Kandidaten neu — bei jeder Shortlist-Änderung.

## Fehlerbehandlung

- `searchPlayers()`-Fehler → Inline-Fehlermeldung im Suchbereich.
- `getPlayer()`-Fehler beim Hinzufügen → Inline-Fehlermeldung, Kandidat wird nicht hinzugefügt.
- Leere Shortlist → alle 5 Slots zeigen den "hinzufügen"-Platzhalter (kein Sonderfall im Code).

## Tests

- `src/api/formation.test.ts` (Vitest, reine Logik): Normalfall mit mehreren Kandidaten pro
  Position, fehlender Kandidat für eine Position, Flex-Zuteilung aus Kandidaten-Überschuss,
  leere Eingabe, Gleichstand zweier Kandidaten mit identischem `overall.value`.
- Kein automatisiertes Komponenten-Testing (React Testing Library o.ä.) in diesem Ticket, um den
  Scope schlank zu halten — die eigentliche UI-Verkabelung (Suche → Hinzufügen → Anzeige) wird
  manuell im Dev-Server-Browser verifiziert, konsistent mit dem bisherigen Vorgehen (ODI-291/293).

## Out of Scope

- Automatisches Durchsuchen des Marktes ohne Namenseingabe (ODI-297).
- Persistenz der Shortlist über die Sitzung hinaus (ODI-295).
- Globale, kombinationsoptimierende Zuteilungslogik.
- Zweispalten-Desktop-Layout.
- Änderungen an `src/api/scoring.ts` (der bekannte Bewertungs-Gap wird rein in der Anzeige
  abgefangen, siehe oben).
