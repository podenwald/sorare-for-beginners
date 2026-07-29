# ODI-297: Automatische Marktsuche ohne Namenseingabe — Härtungs-Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Spieler lassen sich automatisch per Liga- und Positionsfilter finden (ohne Namenseingabe), sortiert nach Sorares eigenem Stammspieler-Status und dann nach L10/L40-Performance — mit Test-Abdeckung für das Sortier-/Filterverhalten.

**Architecture:** Eine neue Funktion `searchPlayersByLeagueAndPosition(leagueSlug, position)` fragt zunächst alle Vereine einer Liga ab (`leagueClubs`-Operation), holt dann parallel pro Verein die aktiven Spieler inkl. Sorares `playingStatus` und L10/L40-Durchschnittswerten (`clubPlayers`-Operation), filtert nach Position und sortiert zweistufig: erst Stammspieler (Sorares `STARTER`/`REGULAR`) vor Ergänzungsspielern, innerhalb jeder Gruppe nach absteigender L10+L40-Summe. Eine neue Komponente `LeaguePositionSearch` (Liga-Dropdown, Positions-Dropdown, Ergebnisliste) wird in jedem `TeamPanel` neben der bestehenden `PlayerSearch` gerendert.

**Tech Stack:** React 19, TypeScript, Vite 8, Vitest 4, PHP 7.4.33 (Netcup shared hosting, kein PHP-Testframework).

**Ausgangslage:** Die funktionale Richtung wurde per rudimentärem Spike direkt gegen die echte Sorare-API bestätigt (User: "Passt so, jetzt hart machen"), inklusive zweier Iterationen auf Nutzer-Feedback: (1) Sortierung nach L10/L40-Performance, (2) Ergebnisliste klappt nach Hinzufügen wieder ein, (3) zweistufige Sortierung Stammspieler-zuerst basierend auf Sorares eigenem `Player.playingStatus`-Feld (`STARTER`/`REGULAR` vs. `NOT_PLAYING`/`SUBSTITUTE`/`SUPER_SUBSTITUTE`/`RETIRED` — empirisch aus dem öffentlich abrufbaren Schema unter `https://api.sorare.com/graphql/schema` ermittelt und gegen echte Spieler verifiziert: `kylian-mbappe-lottin` → `STARTER`, `andre-clovis-silva-filho` → `NOT_PLAYING`). Der Spike-Code ist bereits im Arbeitsverzeichnis vorhanden (uncommitted) und wird in diesem Plan gehärtet, nicht neu geschrieben. Ein echter TypeScript-Fehler wurde beim Umsetzungsstart bereits gefunden (`npx tsc -b --noEmit` schlägt aktuell fehl) — Task 2 behebt ihn.

## Global Constraints

- Kein automatisiertes Komponenten-/Rendering-Testing für React-Komponenten — Konsistenz mit ODI-294/ODI-299/ODI-300/ODI-301 (nur pure Funktionen/Module werden unit-getestet, nicht das JSX-Rendering selbst).
- PHP-Proxy-Änderungen werden ausschließlich manuell per `curl` gegen die echte Sorare-API verifiziert — es existiert kein PHP-Testframework im Projekt.
- `tsconfig.app.json` erzwingt `verbatimModuleSyntax` (Typ-only-Imports müssen `import type` verwenden, getrennt von Werte-Imports), `erasableSyntaxOnly` (keine Enums), `noUnusedLocals`/`noUnusedParameters`.
- Sorares `averageScore`-Feld kann `null` liefern (siehe ODI-301) — bei fehlendem Wert wird für die reine Sortierung `0` angenommen (niedrigste Priorität), da es hier nur um die relative Reihenfolge geht, nicht um eine angezeigte Zahl.
- Commit-Messages sollen den Jira-Key referenzieren (`ODI-297: ...`).
- Bei jedem Task: nach Codeänderungen `npm test`, `npx tsc -b --noEmit` und `npm run lint` grün, bevor committet wird.
- `vite.config.ts`'s Dev-Proxy zeigt auf Produktion (`https://sorare-for-beginners.de`) — für lokale Verifikation gegen einen PHP-Proxy-Änderung vor dem Deploy ggf. temporär einen lokalen PHP-Server verwenden (`php -d display_errors=0 -S localhost:PORT -t public`, Dokumentroot muss `public` sein, nicht `public/api`, damit der Pfad `/api/sorare-proxy.php` stimmt) und danach zurücksetzen — niemals mit geänderter `vite.config.ts` committen.

---

### Task 1: PHP-Proxy-Operationen und `searchPlayersByLeagueAndPosition` mit Tests

**Files:**
- Modify: `public/api/sorare-proxy.php` (zwei neue Whitelist-Operationen `leagueClubs`/`clubPlayers` — bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Modify: `src/api/sorareClient.ts` (`LEAGUES`-Export, `searchPlayersByLeagueAndPosition` — bereits im Arbeitsverzeichnis vorhanden, siehe unten)
- Test: `src/api/sorareClient.test.ts` (neue Tests ergänzen)

**Interfaces:**
- Produces: `export const LEAGUES: readonly { slug: string; name: string }[]` (aus `src/api/sorareClient.ts`).
- Produces: `export async function searchPlayersByLeagueAndPosition(leagueSlug: string, position: Position): Promise<PlayerSearchHit[]>` — Rückgabe ist bereits sortiert (Stammspieler zuerst, dann absteigend nach L10+L40), enthält NUR die `PlayerSearchHit`-Felder (`slug`, `displayName`, `positions`, `clubName`) — keine internen Sortierfelder (`l10`/`l40`/`isRegularStarter`) sickern nach außen.

Der folgende Code ist bereits im Arbeitsverzeichnis vorhanden (uncommitted) und wurde bereits mehrfach empirisch per `curl` gegen die echte Sorare-API verifiziert. Wenn eine der folgenden Dateien beim Start dieses Tasks bereits exakt so aussieht, überspringe den jeweiligen Schreibschritt und fahre mit dem nächsten fort — verifiziere aber trotzdem mit den angegebenen Kommandos.

- [ ] **Step 1: Bestätigen, dass die PHP-Proxy-Whitelist bereits die beiden neuen Operationen enthält**

Prüfe, dass `public/api/sorare-proxy.php`'s `WHITELIST`-Array (nach der bestehenden `'playerSearch' => ...`-Operation, vor der schließenden `];`) exakt diese zwei neuen Einträge enthält:

```php
    'leagueClubs' => <<<'GRAPHQL'
query LeagueClubs($leagueSlug: String!) {
  football {
    competition(slug: $leagueSlug) {
      name
      clubs(first: 30) {
        nodes {
          slug
          name
        }
      }
    }
  }
}
GRAPHQL,
    'clubPlayers' => <<<'GRAPHQL'
query ClubPlayers($clubSlug: String!) {
  football {
    club(slug: $clubSlug) {
      name
      activePlayers(first: 40) {
        nodes {
          slug
          displayName
          position
          playingStatus
          l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
          l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
        }
      }
    }
  }
}
GRAPHQL,
```

Falls nicht vorhanden, füge sie exakt an dieser Stelle ein (Reihenfolge: `leagueClubs` vor `clubPlayers`, beide vor dem schließenden `];` des `WHITELIST`-Arrays).

- [ ] **Step 2: Beide neuen Operationen manuell gegen die echte Sorare-API verifizieren**

Run:
```bash
curl -s -X POST https://api.sorare.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { football { competition(slug: \"bundesliga-de\") { name clubs(first: 3) { nodes { slug name } } } } }"}'
```
Expected: JSON mit `clubs.nodes` — mindestens 3 Vereins-Slugs (z.B. `bayern-munchen-munchen`), keine GraphQL-`errors`.

```bash
curl -s -X POST https://api.sorare.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query":"query { football { club(slug: \"bayern-munchen-munchen\") { name activePlayers(first: 3) { nodes { slug displayName position playingStatus l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE) l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE) } } } } }"}'
```
Expected: JSON mit `activePlayers.nodes`, jeder Eintrag mit einem `playingStatus`-Wert aus `NOT_PLAYING`/`REGULAR`/`RETIRED`/`STARTER`/`SUBSTITUTE`/`SUPER_SUBSTITUTE` (oder `null`), keine `errors`. Vereinsnamen/Spieler können sich seit der letzten Verifikation geändert haben (Transfers) — wichtig ist nur, dass die Felder in der richtigen Form zurückkommen.

- [ ] **Step 3: Bestätigen, dass `src/api/sorareClient.ts` bereits `LEAGUES` und `searchPlayersByLeagueAndPosition` enthält**

Prüfe, dass die Datei ganz oben (nach den bestehenden Imports) diesen Export enthält:

```typescript
export const LEAGUES = [
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  { slug: 'bundesliga-de', name: 'Bundesliga' },
  { slug: 'laliga-es', name: 'La Liga' },
  { slug: 'ligue-1-fr', name: 'Ligue 1' },
  { slug: 'mlspa', name: 'MLS' },
] as const
```

und dass sie am Ende der Datei (nach der bestehenden `searchPlayers`-Funktion) diesen Block enthält:

```typescript
interface LeagueClubsRaw {
  football: {
    competition: {
      name: string
      clubs: { nodes: { slug: string; name: string }[] }
    } | null
  }
}

type SorarePlayingStatus = 'NOT_PLAYING' | 'REGULAR' | 'RETIRED' | 'STARTER' | 'SUBSTITUTE' | 'SUPER_SUBSTITUTE'

interface ClubPlayersRaw {
  football: {
    club: {
      name: string
      activePlayers: {
        nodes: {
          slug: string
          displayName: string
          position: Player['position']
          playingStatus: SorarePlayingStatus | null
          l10: number | null
          l40: number | null
        }[]
      }
    } | null
  }
}

function isRegularStarter(playingStatus: SorarePlayingStatus | null): boolean {
  return playingStatus === 'STARTER' || playingStatus === 'REGULAR'
}

function performanceRank(l10: number | null, l40: number | null): number {
  return (l10 ?? 0) + (l40 ?? 0)
}

export async function searchPlayersByLeagueAndPosition(
  leagueSlug: string,
  position: Position,
): Promise<PlayerSearchHit[]> {
  const leagueData = await callProxy<LeagueClubsRaw>('leagueClubs', { leagueSlug })
  const clubs = leagueData.football.competition?.clubs.nodes ?? []

  const clubResults = await Promise.all(
    clubs.map((club) => callProxy<ClubPlayersRaw>('clubPlayers', { clubSlug: club.slug })),
  )

  const hits = clubResults.flatMap((clubData) => {
    const club = clubData.football.club
    if (!club) return []
    return club.activePlayers.nodes
      .filter((player) => player.position === position)
      .map((player) => ({
        slug: player.slug,
        displayName: player.displayName,
        positions: [player.position],
        clubName: club.name,
        l10: player.l10,
        l40: player.l40,
        isRegularStarter: isRegularStarter(player.playingStatus),
      }))
  })

  hits.sort((a, b) => {
    if (a.isRegularStarter !== b.isRegularStarter) return a.isRegularStarter ? -1 : 1
    return performanceRank(b.l10, b.l40) - performanceRank(a.l10, a.l40)
  })

  return hits.map(({ slug, displayName, positions, clubName }) => ({ slug, displayName, positions, clubName }))
}
```

Confirm the file's import line at the top was also extended to `import type { GraphQLError, Player, PlayerSearchHit, PlayerSearchResult, Position } from './types'` (adding `PlayerSearchHit` and `Position` to the existing type-only import). Falls irgendetwas davon fehlt, ergänze es exakt so.

- [ ] **Step 4: Bestehenden Build-Status prüfen**

Run: `npx tsc -b --noEmit`

Expected: FAIL — der Fehler liegt in `src/components/LeaguePositionSearch.tsx` (Task 2), nicht in den Dateien dieses Tasks. Bestätige, dass der einzige Fehler diese Datei betrifft (`error TS2345: Argument of type 'string' is not assignable to parameter of type 'SetStateAction<"premier-league-gb-eng">'`), und dass `src/api/sorareClient.ts`/`public/api/sorare-proxy.php` selbst KEINE Fehler verursachen. Dieser Fehler wird in Task 2 behoben — hier nur zur Kenntnis nehmen, nicht fixen.

- [ ] **Step 5: Test-Helper für mehrere aufeinanderfolgende Fetch-Antworten hinzufügen**

Der bestehende `mockFetchOnce`-Helper in `src/api/sorareClient.test.ts` liefert bei jedem Aufruf dieselbe Antwort — für `searchPlayersByLeagueAndPosition` (1 Aufruf für `leagueClubs`, dann N Aufrufe für `clubPlayers`, je einer pro Verein) wird eine Sequenz unterschiedlicher Antworten benötigt. Füge direkt nach der bestehenden `mockFetchOnce`-Funktion folgenden neuen Helper hinzu:

```typescript
function mockFetchSequence(responses: unknown[]) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const body = responses[call]
      call += 1
      return Promise.resolve({ json: () => Promise.resolve(body) })
    }),
  )
}
```

- [ ] **Step 6: Test schreiben — zweistufige Sortierung (Stammspieler vor Reserve, dann L10+L40 absteigend)**

Füge am Ende von `src/api/sorareClient.test.ts` einen neuen `describe`-Block hinzu:

```typescript
describe('searchPlayersByLeagueAndPosition', () => {
  it('sorts regular starters before others, then by descending L10+L40 within each group', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: {
              name: 'Bundesliga',
              clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }] },
            },
          },
        },
      },
      {
        data: {
          football: {
            club: {
              name: 'Club A',
              activePlayers: {
                nodes: [
                  {
                    slug: 'sub-high-score',
                    displayName: 'Sub High Score',
                    position: 'Defender',
                    playingStatus: 'SUBSTITUTE',
                    l10: 90,
                    l40: 90,
                  },
                  {
                    slug: 'starter-low-score',
                    displayName: 'Starter Low Score',
                    position: 'Defender',
                    playingStatus: 'STARTER',
                    l10: 10,
                    l40: 10,
                  },
                  {
                    slug: 'regular-high-score',
                    displayName: 'Regular High Score',
                    position: 'Defender',
                    playingStatus: 'REGULAR',
                    l10: 70,
                    l40: 70,
                  },
                  {
                    slug: 'wrong-position',
                    displayName: 'Wrong Position',
                    position: 'Midfielder',
                    playingStatus: 'STARTER',
                    l10: 100,
                    l40: 100,
                  },
                ],
              },
            },
          },
        },
      },
    ])

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Defender')

    expect(hits.map((hit) => hit.slug)).toEqual(['regular-high-score', 'starter-low-score', 'sub-high-score'])
  })

  it('treats null l10/l40 as lowest priority within a tier', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: { name: 'Bundesliga', clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }] } },
          },
        },
      },
      {
        data: {
          football: {
            club: {
              name: 'Club A',
              activePlayers: {
                nodes: [
                  {
                    slug: 'no-data-starter',
                    displayName: 'No Data Starter',
                    position: 'Forward',
                    playingStatus: 'STARTER',
                    l10: null,
                    l40: null,
                  },
                  {
                    slug: 'scored-starter',
                    displayName: 'Scored Starter',
                    position: 'Forward',
                    playingStatus: 'STARTER',
                    l10: 5,
                    l40: 5,
                  },
                ],
              },
            },
          },
        },
      },
    ])

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Forward')

    expect(hits.map((hit) => hit.slug)).toEqual(['scored-starter', 'no-data-starter'])
  })

  it('skips a club with no data and returns an empty array when the competition is not found', async () => {
    mockFetchSequence([
      { data: { football: { competition: null } } },
    ])

    const hits = await searchPlayersByLeagueAndPosition('unknown-league', 'Defender')

    expect(hits).toEqual([])
  })

  it('only returns PlayerSearchHit fields, no internal sort data', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: { name: 'Bundesliga', clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }] } },
          },
        },
      },
      {
        data: {
          football: {
            club: {
              name: 'Club A',
              activePlayers: {
                nodes: [
                  {
                    slug: 'a-player',
                    displayName: 'A Player',
                    position: 'Goalkeeper',
                    playingStatus: 'STARTER',
                    l10: 50,
                    l40: 50,
                  },
                ],
              },
            },
          },
        },
      },
    ])

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Goalkeeper')

    expect(hits).toEqual([
      { slug: 'a-player', displayName: 'A Player', positions: ['Goalkeeper'], clubName: 'Club A' },
    ])
  })
})
```

- [ ] **Step 7: Tests ausführen**

Run: `npm test -- sorareClient`

Expected: PASS, alle Tests in `sorareClient.test.ts` grün (12 Tests: 8 bestehende + 4 neue).

- [ ] **Step 8: Commit**

```bash
git add public/api/sorare-proxy.php src/api/sorareClient.ts src/api/sorareClient.test.ts
git commit -m "ODI-297: add league/position search backed by Sorare's playingStatus"
```

---

### Task 2: `LeaguePositionSearch`-Komponente, TeamPanel-Einbindung und TypeScript-Fix

**Files:**
- Create: `src/components/LeaguePositionSearch.tsx` (bereits im Arbeitsverzeichnis vorhanden, siehe unten — enthält den zu behebenden TypeScript-Fehler)
- Modify: `src/components/TeamPanel.tsx` (Einbindung — bereits im Arbeitsverzeichnis vorhanden, siehe unten)

**Interfaces:**
- Consumes: `LEAGUES`, `searchPlayersByLeagueAndPosition` (aus Task 1), `getPlayer` (bereits vorhanden), `Player`/`PlayerSearchHit`/`Position`/`SorareApiError` (aus `src/api/types.ts`).
- Produces: `export function LeaguePositionSearch({ onAdd }: { onAdd: (player: Player) => void })`.

- [ ] **Step 1: Bestätigen, dass `src/components/LeaguePositionSearch.tsx` bereits existiert, und den TypeScript-Fehler beheben**

Der aktuelle Stand der Datei (bereits im Arbeitsverzeichnis vorhanden):

```typescript
import { useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, LEAGUES, searchPlayersByLeagueAndPosition } from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { Player, PlayerSearchHit, Position } from '../api/types'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'Goalkeeper', label: 'Torwart' },
  { value: 'Defender', label: 'Verteidiger' },
  { value: 'Midfielder', label: 'Mittelfeld' },
  { value: 'Forward', label: 'Sturm' },
]

interface LeaguePositionSearchProps {
  onAdd: (player: Player) => void
}

export function LeaguePositionSearch({ onAdd }: LeaguePositionSearchProps) {
  const [leagueSlug, setLeagueSlug] = useState(LEAGUES[0].slug)
  const [position, setPosition] = useState<Position>('Defender')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    setIsSearching(true)
    setSearchError(null)
    try {
      const hits = await searchPlayersByLeagueAndPosition(leagueSlug, position)
      setResults(hits)
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
      setResults([])
    } catch (error) {
      setAddError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Hinzufügen')
    } finally {
      setAddingSlug(null)
    }
  }

  return (
    <div className="league-position-search">
      <form onSubmit={handleSearch}>
        <select value={leagueSlug} onChange={(event) => setLeagueSlug(event.target.value)}>
          {LEAGUES.map((league) => (
            <option key={league.slug} value={league.slug}>
              {league.name}
            </option>
          ))}
        </select>
        <select value={position} onChange={(event) => setPosition(event.target.value as Position)}>
          {POSITIONS.map((pos) => (
            <option key={pos.value} value={pos.value}>
              {pos.label}
            </option>
          ))}
        </select>
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

Falls die Datei nicht existiert, lege sie exakt so an. Der bekannte TypeScript-Fehler: `useState(LEAGUES[0].slug)` in Zeile mit `const [leagueSlug, setLeagueSlug] = ...` leitet einen zu engen Literal-Typ ab (`"premier-league-gb-eng"` statt `string`), weil `LEAGUES` mit `as const` deklariert ist. Der `<select onChange>`-Handler übergibt aber ein generisches `string` (`event.target.value`), was der engere Typ ablehnt. Fix: ändere genau diese eine Zeile zu

```typescript
  const [leagueSlug, setLeagueSlug] = useState<string>(LEAGUES[0].slug)
```

Keine weitere Änderung an der Datei.

- [ ] **Step 2: Build-Fehler behoben bestätigen**

Run: `npx tsc -b --noEmit`

Expected: PASS (keine Ausgabe, Exit-Code 0).

- [ ] **Step 3: Bestätigen, dass `TeamPanel.tsx` die neue Komponente bereits einbindet**

Prüfe, dass `src/components/TeamPanel.tsx` einen zusätzlichen Import enthält:

```typescript
import { LeaguePositionSearch } from './LeaguePositionSearch'
```

und dass im JSX, direkt nach der bestehenden `<PlayerSearch onAdd={handleAdd} label={label} />`-Zeile, folgendes ergänzt ist:

```tsx
      <LeaguePositionSearch onAdd={handleAdd} />
```

Falls nicht vorhanden, ergänze beides exakt so — `handleAdd` ist bereits in `TeamPanel` definiert und muss nicht verändert werden.

- [ ] **Step 4: Vollständige Test-Suite, Typecheck und Lint ausführen**

Run: `npm test && npx tsc -b --noEmit && npm run lint`

Expected: alle drei PASS, keine Regressionen, kein neuer Lint-Fehler.

- [ ] **Step 5: Commit**

```bash
git add src/components/LeaguePositionSearch.tsx src/components/TeamPanel.tsx
git commit -m "ODI-297: add LeaguePositionSearch UI to each team panel"
```

---

### Task 3: Deploy und End-to-End-Abnahme

**Files:** keine Code-Änderungen — nur Push, Deploy-Verifikation, manuelle Live-Prüfung, Jira-Kommentar.

**Interfaces:**
- Consumes: den vollständigen, committeten Diff aus Task 1 + Task 2.

- [ ] **Step 1: Vor dem Push prüfen, dass `vite.config.ts` unverändert ist**

Run: `git diff vite.config.ts`

Expected: keine Ausgabe (leerer Diff). Falls die Datei noch auf einen lokalen PHP-Server zeigt (von der Spike-Verifikation), setze sie zurück auf `target: 'https://sorare-for-beginners.de'`, bevor du fortfährst — diese Datei darf niemals mit einem lokalen Ziel committet werden.

- [ ] **Step 2: Push**

```bash
git push origin main
```

Expected: Erfolgreicher Push, keine Konflikte.

- [ ] **Step 3: GitHub-Actions-Deploy beobachten**

```bash
gh run watch --exit-status
```

(Falls kein Run automatisch startet oder die ID unklar ist: `gh run list --branch main --limit 3` zur ID-Ermittlung.)

Expected: Alle Schritte grün, insbesondere `Lint`, `Run tests`, `Build for production`, `Sync files`.

- [ ] **Step 4: Bundle-Hash-Abgleich**

Run lokal: `npm run build` und prüfe den erzeugten Dateinamen in `dist/assets/index-*.js`. Vergleiche mit dem Hash, den `curl -s https://sorare-for-beginners.de/ | grep -oE '/assets/index-[a-zA-Z0-9]+\.js'` zurückliefert. Beide müssen übereinstimmen — sonst wurde entweder nicht neu gebaut oder das Deployment ist noch nicht fertig.

- [ ] **Step 5: Live-Verifikation gegen die echte Produktions-URL**

Öffne `https://sorare-for-beginners.de/` (bei Bedarf mit `?cachebust=<sha>` gegen Browser-Caching, siehe Erfahrung aus ODI-299/300). Wähle in einem der drei Teams z.B. Bundesliga + Verteidiger, klicke "Suchen". Bestätige:
- Es erscheint eine Ergebnisliste mit mehreren Spielern.
- Die ersten Einträge sind erkennbare Stammspieler (nicht zufällige Ergänzungsspieler).
- Nach Klick auf "Hinzufügen" bei einem Ergebnis: der Spieler landet in der Shortlist, UND die Ergebnisliste klappt wieder ein (leer).
- Die Browser-Konsole zeigt keine neuen Fehler.

- [ ] **Step 6: Jira-Kommentar auf ODI-297**

Kommentiere auf ODI-297 (odenwaldpatrick.atlassian.net), dass die Umsetzung live verifiziert wurde, mit Commit-SHA.

- [ ] **Step 7: Report**

Fasse zusammen: Push-Status, Deploy-Status, Bundle-Hash-Abgleich, Live-Verifikationsergebnis, Jira-Kommentar-Bestätigung.

---

## Self-Review-Notizen (bereits durchgeführt)

- **Spec-Abdeckung:** ODI-297s User Story ("Spieler automatisch nach Position/Liga finden, ohne Namen einzugeben") ist abgedeckt — Task 1 liefert die Liga/Positions-Suche, Task 2 die UI, Task 3 verifiziert live. Der ursprüngliche Ticket-Text ließ den Scope bewusst offen ("erst bei Bedarf im Detail planen") — die konkrete Ausgestaltung (Sortierung Stammspieler-zuerst nach `playingStatus`, dann L10/L40) wurde direkt mit dem Nutzer im Spike abgestimmt, nicht eigenständig erfunden.
- **Platzhalter-Scan:** Keine TBD/TODO-Stellen; jeder Step enthält vollständigen, copy-paste-fähigen Code oder ein exaktes Kommando.
- **Typkonsistenz:** `SorarePlayingStatus` (sorareClient.ts) → `ClubPlayersRaw.football.club.activePlayers.nodes[].playingStatus` → `isRegularStarter()` — ein einziger, lokal definierter String-Union-Typ, nicht dupliziert. `PlayerSearchHit` (aus `types.ts`, unverändert von ODI-291) ist die einzige Form, die die Funktion nach außen zurückgibt — die internen Sortierfelder (`l10`, `l40`, `isRegularStarter`) werden vor dem `return` explizit weggeworfen (Step 6, Test 4 in Task 1 prüft das).
- **Bereits vorhandener Spike-Code:** Task 1/2 sind so formuliert, dass ein frischer Implementer zuerst den IST-Zustand prüft, statt blind zu überschreiben — falls der Spike-Code zwischenzeitlich verändert/verworfen wurde, geben die Code-Blöcke trotzdem die exakte Zielimplementierung vor.
- **Bekannter Fehler vorab dokumentiert:** der TypeScript-Fehler in `LeaguePositionSearch.tsx` wurde vor Planerstellung bereits reproduziert (`npx tsc -b --noEmit`) und ist in Task 2 als expliziter Fix-Schritt eingeplant, nicht als offene Überraschung für den Implementer.
