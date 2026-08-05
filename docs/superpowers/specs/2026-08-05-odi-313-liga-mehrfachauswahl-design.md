# Design: Dynamische Liga-Liste + Mehrfachauswahl (Champion/Contender-Presets)

**Jira:** ODI-313
**Datum:** 2026-08-05

## Kontext

Die `LEAGUES`-Konstante in `src/api/sorareClient.ts` enthält heute nur 5 hartkodierte Ligen
(Premier League, Bundesliga, La Liga, Ligue 1, MLS). Recherche gegen die echte Sorare-API
(`so5.so5Competitions(sport: FOOTBALL)`) zeigt: es gibt insgesamt 18 Einträge — 14 echte Ligen
und 4 Sorare-eigene Wettbewerbsstufen (Champion, Contender, Under 23, Rest of the World).

**Wichtiger Fund aus der Discovery:** `So5Competition` verknüpft sich über ein Feld
`competitions: [Competition!]!` mit der echten Liga-Entität (`football.competition(slug:)`,
die heutige Grundlage von `getLeagueClubs`/`searchPlayersByLeagueAndPosition`). Diese Beziehung
ist **nicht** einheitlich 1:1:

| Eintrag | Reale Ligen dahinter | Klubs insgesamt |
|---|---|---|
| 14 echte Ligen | je genau 1 | wie heute |
| Champion | 5 (PL, Bundesliga, La Liga, Ligue 1, Serie A) | 96 |
| Contender | 20 | 348 |
| Under 23 | 0 (keine Verknüpfung) | — |
| Rest of the World | 22 | — |

Under 23, Rest of the World und das komplett getrennte "All-Star"-System (`So5Leaderboard`/
`So5LeaderboardType`) sind **nicht** Teil dieses Tickets — sie brauchen eine andere Architektur
(Alters-Filter bzw. eigenes Turnierformat) und werden ggf. in einem eigenen Ticket behandelt.

## Entscheidungen aus der Discovery

- **Ladestrategie:** statisch generiert (Build-Zeit), kein Laufzeit-Request. Ein einmaliges
  Node-Skript fragt die echte API ab und erzeugt die Konstanten; sie werden committet und bei
  Bedarf manuell neu generiert (Ligen ändern sich selten).
- **Sortierung:** Reihenfolge der API-Antwort (kein manuelles Kuratieren, kein Alphabetisieren).
- **`scoutable`-Filter:** nicht nötig — alle 18 Einträge haben `scoutable: true`, ein Filter
  hätte aktuell keine Wirkung.
- **UI-Mechanismus:** aus der Diskussion um das Skalierungsrisiko bei Contender (348 Klubs ≈
  10-30s Ladezeit bei Auto-Fill statt <2s) hat sich eine bessere Lösung ergeben als ein
  Concurrency-Cap: der Nutzer wählt selbst, wie viele Ligen einbezogen werden. Champion/Contender
  werden zu **Presets**, die eine freie Mehrfachauswahl vorbelegen — der Nutzer kann sie vor dem
  Absenden verkleinern. Die Ladezeit wird dadurch zur bewussten Nutzerentscheidung statt eines
  technischen Limits.
- **Team-Stack ist von der Skalierungsfrage nicht betroffen:** dort wird am Ende immer nur der
  Kader **eines** Klubs geladen, unabhängig davon, wie viele Ligen in der Mehrfachauswahl aktiv
  sind — nur die Klub-Dropdown-Befüllung (günstig: 1 Request pro Liga) skaliert mit der Anzahl
  gewählter Ligen.

## Architektur

### `src/api/sorareClient.ts`: erweiterte Liga-Konstanten

```typescript
export const LEAGUES = [
  // heute 5, künftig alle 14 echten Ligen — generiert per Skript aus
  // so5.so5Competitions(sport: FOOTBALL) { competitions { slug name } },
  // eine Zeile pro Eintrag mit genau 1 verknüpfter Competition
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  // ... 13 weitere
] as const

// Beide aus So5Competition.competitions generiert (Champion: 5, Contender: 20 Slugs)
export const CHAMPION_LEAGUE_SLUGS: string[] = [/* 5 Competition-Slugs */]
export const CONTENDER_LEAGUE_SLUGS: string[] = [/* 20 Competition-Slugs */]
```

Ein neues, einmalig auszuführendes Skript (z. B. `scripts/generate-leagues.mjs`, nicht Teil des
Build-Prozesses) fragt die echte API ab und gibt den TS-Quelltext für diese drei Konstanten aus,
der dann manuell in `sorareClient.ts` eingesetzt wird — analog zum bereits bestehenden
`login-headless.mjs`-Muster in `sorare-manager` (Node-Skript für einen manuellen,
wiederholbaren Vorgang, kein Teil der Laufzeit-App).

### API-Schicht: Einzel-Slug → Slug-Array

`getLeagueClubs` und `searchPlayersByLeagueAndPosition` nehmen künftig `leagueSlugs: string[]`
statt eines einzelnen `leagueSlug: string`:

```typescript
export async function getLeagueClubs(leagueSlugs: string[]): Promise<{ slug: string; name: string }[]> {
  const settled = await Promise.allSettled(
    leagueSlugs.map((leagueSlug) => callProxy<LeagueClubsRaw>('leagueClubs', { leagueSlug })),
  )
  const clubs = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.football.competition?.clubs.nodes ?? [] : [],
  )
  // Dedupe defensiv nach Slug — echte Ligen sind zwar disjunkt, aber die Mehrfachauswahl
  // erlaubt beliebige Kombinationen, und ein Klub in zwei ausgewählten Ligen ist zumindest
  // theoretisch nicht ausgeschlossen.
  return Array.from(new Map(clubs.map((club) => [club.slug, club])).values())
}

export async function searchPlayersByLeagueAndPosition(
  leagueSlugs: string[],
  position: Position,
): Promise<PlayerSearchHit[]> {
  const clubs = await getLeagueClubs(leagueSlugs)
  // Rest unverändert: Promise.allSettled über clubs.map(clubPlayers), gleiches
  // Sortier-/Filterverhalten wie heute. Kein Concurrency-Cap — die Fan-out-Größe liegt in der
  // Hand des Nutzers (Anzahl gewählter Ligen), nicht in der Implementierung.
}
```

`getClubRoster(clubSlug: string)` bleibt unverändert (arbeitet bereits auf einem einzelnen Klub).

### UI: Mehrfachauswahl statt `<select>`

Drei Stellen wechseln von `useState<string>` (ein Slug) auf `useState<string[]>` (mehrere Slugs):

- `TeamPanel.tsx`: `autoFillLeague` (Auto-Fill/KI-Team) und `stackLeague` (Team-Stack)
- `LeaguePositionSearch.tsx`: `leagueSlug`

Jede Stelle bekommt statt des `<select>` eine Mehrfachauswahl (Checkbox-Liste über `LEAGUES`)
plus zwei Preset-Buttons "Champion" und "Contender", die den State auf
`CHAMPION_LEAGUE_SLUGS`/`CONTENDER_LEAGUE_SLUGS` setzen — der Nutzer kann danach einzelne
Checkboxen an-/abwählen, bevor er Auto-Fill/Suche/Team-Stack-Klub-Laden auslöst.

Team-Stack-Klub-Dropdown (`stackClubs`) wird weiterhin aus `getLeagueClubs(stackLeagues)`
befüllt — jetzt mit der Klub-Vereinigung aller ausgewählten Ligen statt nur einer.

## Tests

- `src/api/sorareClient.test.ts` (bereits vorhanden, wird erweitert): Tests für die neue
  Array-Signatur von `getLeagueClubs`/`searchPlayersByLeagueAndPosition` — Vereinigung mehrerer
  Ligen, Deduplizierung, leeres Array liefert leeres Ergebnis.
- Kein automatisiertes Komponenten-Testing für `TeamPanel.tsx`/`LeaguePositionSearch.tsx`
  (konsistent mit bisheriger Projekt-Konvention) — manuelle Verifikation im Dev-Server-Browser:
  Mehrfachauswahl in allen 3 Stellen, Champion-/Contender-Preset befüllt korrekt, Abwählen
  einzelner Ligen funktioniert, Team-Stack lädt weiterhin nur einen Klub-Kader.

## Out of Scope

- Under 23 (keine Competition-Verknüpfung in der API, bräuchte einen Alters-Filter — eigenes
  Ticket).
- Rest of the World (bewusst ausgeklammert).
- All-Star / `So5Leaderboard`-System (komplett anderes Feature mit eigener Datenstruktur,
  eigenes Ticket falls gewünscht).
- Concurrency-Limit für die Klub-Fan-out-Requests (bewusst nicht eingeführt — die
  Mehrfachauswahl macht die Fan-out-Größe zur Nutzerentscheidung).
