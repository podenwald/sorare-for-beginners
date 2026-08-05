# ODI-313: Dynamische Liga-Liste + Mehrfachauswahl (Champion/Contender-Presets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die `LEAGUES`-Konstante wächst von 5 auf alle 14 echten Ligen; Auto-Fill, Team-Stack und die Liga-Positionssuche bekommen eine Mehrfachauswahl statt eines Single-Select-Dropdowns, ergänzt um zwei Presets ("Champion", "Contender"), die die Auswahl vorbelegen.

**Architecture:** `getLeagueClubs`/`searchPlayersByLeagueAndPosition` wechseln von einem einzelnen `leagueSlug: string` auf `leagueSlugs: string[]` und vereinigen die Klubs aller übergebenen Ligen (dedupliziert nach Slug). Eine neue, gemeinsam genutzte Komponente `LeagueMultiSelect` kapselt Checkbox-Liste + Preset-Buttons und wird an den 3 bisherigen Single-Select-Stellen (`TeamPanel.tsx`: Auto-Fill und Team-Stack; `LeaguePositionSearch.tsx`) eingesetzt. Team-Stack bleibt unproblematisch, da am Ende immer nur ein einzelner Klub-Kader geladen wird.

**Tech Stack:** TypeScript, Vitest, React.

## Global Constraints

- Under 23, Rest of the World und das All-Star/`So5Leaderboard`-System sind **nicht** Teil dieses Tickets.
- Kein Concurrency-Cap für die Klub-Fan-out-Requests — die Fan-out-Größe liegt bewusst in der Hand des Nutzers (Anzahl gewählter Ligen).
- Folge der Projekt-Konvention: `sorareClient.ts` bekommt Unit-Tests in `sorareClient.test.ts`; `TeamPanel.tsx`/`LeaguePositionSearch.tsx`/`LeagueMultiSelect.tsx` bekommen keine Komponenten-Tests (nur manuelle/Live-Verifikation im Browser).
- Commit-Messages müssen den Jira-Key `ODI-313` enthalten.

---

### Task 1: Generator-Skript für die Liga-Konstanten

**Files:**
- Create: `scripts/generate-leagues.mjs`

**Interfaces:**
- Consumes: nichts (eigenständiges Node-Skript, fragt `https://api.sorare.com/graphql` direkt ab — kein API-Key nötig, `so5Competitions` ist ohne Auth abrufbar, bereits live verifiziert).
- Produces: TS-Quelltext auf stdout, der manuell in `src/api/sorareClient.ts` eingesetzt wird (Task 2). Kein Teil des Build-Prozesses.

**Context:** Analog zum bestehenden `login-headless.mjs`-Muster in `sorare-manager` (einmaliges, manuelles Node-Skript für einen wiederholbaren Vorgang, nicht Teil der Laufzeit-App). Bei Bedarf erneut ausführen, wenn Sorare Ligen ändert.

- [ ] **Step 1: Skript anlegen**

Erstelle `scripts/generate-leagues.mjs` mit folgendem Inhalt:

```js
const SO5_TIER_SLUGS = new Set([
  'seasonal-champions',
  'seasonal-contenders',
  'seasonal-under_twenty_one',
  'seasonal-rest_of_the_world',
])

const query = `
  query {
    so5 {
      so5Competitions(sport: FOOTBALL) {
        slug
        displayName
        competitions {
          slug
          name
        }
      }
    }
  }
`

const response = await fetch('https://api.sorare.com/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
})
const { data, errors } = await response.json()
if (errors) {
  console.error('Sorare API error:', errors)
  process.exit(1)
}

const so5Competitions = data.so5.so5Competitions
const realLeagues = so5Competitions.filter((c) => !SO5_TIER_SLUGS.has(c.slug))
const champion = so5Competitions.find((c) => c.slug === 'seasonal-champions')
const contender = so5Competitions.find((c) => c.slug === 'seasonal-contenders')

function formatLeagues(leagues) {
  return leagues
    .map((league) => {
      if (league.competitions.length !== 1) {
        throw new Error(`Expected exactly 1 competition for "${league.displayName}", got ${league.competitions.length}`)
      }
      const { slug } = league.competitions[0]
      return `  { slug: '${slug}', name: '${league.displayName.replace(/'/g, "\\'")}' },`
    })
    .join('\n')
}

function formatSlugs(competitions) {
  return competitions.map((c) => `  '${c.slug}',`).join('\n')
}

console.log('export const LEAGUES = [')
console.log(formatLeagues(realLeagues))
console.log('] as const\n')

console.log('export const CHAMPION_LEAGUE_SLUGS: string[] = [')
console.log(formatSlugs(champion.competitions))
console.log(']\n')

console.log('export const CONTENDER_LEAGUE_SLUGS: string[] = [')
console.log(formatSlugs(contender.competitions))
console.log(']')
```

- [ ] **Step 2: Skript ausführen und Ausgabe gegen den bekannten Stand prüfen**

Run: `cd ~/Library/CloudStorage/SynologyDrive-cloud/git/sorare-for-beginners && node scripts/generate-leagues.mjs`

Erwartete Ausgabe (bereits live gegen die echte API verifiziert, Stand 2026-08-05 — bei Abweichungen hat Sorare seine Liga-Liste geändert; dann Task 2 mit der NEUEN Ausgabe statt der hier genannten fortsetzen):

```
export const LEAGUES = [
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  { slug: 'bundesliga-de', name: 'Bundesliga' },
  { slug: 'laliga-es', name: 'LALIGA EA SPORTS' },
  { slug: 'ligue-1-fr', name: 'Ligue 1' },
  { slug: 'mlspa', name: 'MLS' },
  { slug: 'jupiler-pro-league', name: 'Jupiler Pro League' },
  { slug: 'eredivisie', name: 'Eredivisie' },
  { slug: 'j1-league', name: 'J1 League' },
  { slug: 'k-league-1', name: 'K League 1' },
  { slug: 'serie-a-it', name: 'Italian League' },
  { slug: 'primeira-liga-pt', name: 'Liga Portugal' },
  { slug: 'spor-toto-super-lig', name: 'Turkish League' },
  { slug: 'football-league-championship', name: 'EFL Championship' },
  { slug: 'premiership-gb-sct', name: 'SPFL' },
] as const

export const CHAMPION_LEAGUE_SLUGS: string[] = [
  'premier-league-gb-eng',
  'bundesliga-de',
  'laliga-es',
  'ligue-1-fr',
  'serie-a-it',
]

export const CONTENDER_LEAGUE_SLUGS: string[] = [
  'eliteserien',
  '1-hnl',
  'superliga-argentina-de-futbol',
  '2-bundesliga',
  'ligue-2-fr',
  'campeonato-brasileiro-serie-a',
  'liga-mx',
  'russian-premier-league',
  'super-league-ch',
  'segunda-division-es',
  'serie-a-it',
  'serie-b-it',
  'primera-division-cl',
  'liga-pro',
  'primera-division-pe',
  'chinese-super-league',
  'primera-a',
  'austrian-bundesliga',
  'spor-toto-super-lig',
  'superliga-dk',
]
```

- [ ] **Step 3: Commit**

```bash
cd ~/Library/CloudStorage/SynologyDrive-cloud/git/sorare-for-beginners
git add scripts/generate-leagues.mjs
git commit -m "ODI-313: add generate-leagues script"
```

---

### Task 2: Liga-Konstanten in `sorareClient.ts` erweitern

**Files:**
- Modify: `src/api/sorareClient.ts:13-19`

**Interfaces:**
- Consumes: die Ausgabe von Task 1.
- Produces: `LEAGUES` (jetzt 14 statt 5 Einträge, gleiche Form `{slug, name}[]`), neu: `export const CHAMPION_LEAGUE_SLUGS: string[]`, `export const CONTENDER_LEAGUE_SLUGS: string[]`.

**Context:** Reine Datenänderung — keine neuen Tests nötig (die Konstante wird bereits über die bestehenden `sorareClient.test.ts`-Tests der Funktionen, die sie konsumieren, indirekt abgedeckt; ihr Inhalt selbst ist keine Logik). Kein bestehender Test greift auf den konkreten Inhalt von `LEAGUES` zu (verifiziert per Suche).

- [ ] **Step 1: Konstanten ersetzen**

In `src/api/sorareClient.ts`, ersetze:

```typescript
export const LEAGUES = [
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  { slug: 'bundesliga-de', name: 'Bundesliga' },
  { slug: 'laliga-es', name: 'La Liga' },
  { slug: 'ligue-1-fr', name: 'Ligue 1' },
  { slug: 'mlspa', name: 'MLS' },
] as const
```

durch (die verifizierte Ausgabe von Task 1):

```typescript
export const LEAGUES = [
  { slug: 'premier-league-gb-eng', name: 'Premier League' },
  { slug: 'bundesliga-de', name: 'Bundesliga' },
  { slug: 'laliga-es', name: 'LALIGA EA SPORTS' },
  { slug: 'ligue-1-fr', name: 'Ligue 1' },
  { slug: 'mlspa', name: 'MLS' },
  { slug: 'jupiler-pro-league', name: 'Jupiler Pro League' },
  { slug: 'eredivisie', name: 'Eredivisie' },
  { slug: 'j1-league', name: 'J1 League' },
  { slug: 'k-league-1', name: 'K League 1' },
  { slug: 'serie-a-it', name: 'Italian League' },
  { slug: 'primeira-liga-pt', name: 'Liga Portugal' },
  { slug: 'spor-toto-super-lig', name: 'Turkish League' },
  { slug: 'football-league-championship', name: 'EFL Championship' },
  { slug: 'premiership-gb-sct', name: 'SPFL' },
] as const

export const CHAMPION_LEAGUE_SLUGS: string[] = [
  'premier-league-gb-eng',
  'bundesliga-de',
  'laliga-es',
  'ligue-1-fr',
  'serie-a-it',
]

export const CONTENDER_LEAGUE_SLUGS: string[] = [
  'eliteserien',
  '1-hnl',
  'superliga-argentina-de-futbol',
  '2-bundesliga',
  'ligue-2-fr',
  'campeonato-brasileiro-serie-a',
  'liga-mx',
  'russian-premier-league',
  'super-league-ch',
  'segunda-division-es',
  'serie-a-it',
  'serie-b-it',
  'primera-division-cl',
  'liga-pro',
  'primera-division-pe',
  'chinese-super-league',
  'primera-a',
  'austrian-bundesliga',
  'spor-toto-super-lig',
  'superliga-dk',
]
```

- [ ] **Step 2: Vollständige Suite, Lint und Build ausführen**

```bash
cd ~/Library/CloudStorage/SynologyDrive-cloud/git/sorare-for-beginners
node node_modules/vitest/dist/cli.js run --no-color
./node_modules/.bin/oxlint
npm run build
```

Erwartet: alle 114 bestehenden Tests PASS (unverändert, da `LEAGUES` noch niemand mit einem festen Index >4 konsumiert), Lint sauber, Build erfolgreich.

- [ ] **Step 3: Commit**

```bash
git add src/api/sorareClient.ts
git commit -m "ODI-313: expand LEAGUES to all 14 real leagues, add Champion/Contender slug presets"
```

---

### Task 3: `getLeagueClubs`/`searchPlayersByLeagueAndPosition` auf `leagueSlugs: string[]` umstellen

**Files:**
- Modify: `src/api/sorareClient.ts:269-292` (`getLeagueClubs`) und `src/api/sorareClient.ts:294-328` (`searchPlayersByLeagueAndPosition`)
- Modify: `src/api/sorareClient.test.ts` (Describe-Blöcke `getLeagueClubs` und `searchPlayersByLeagueAndPosition`)

**Interfaces:**
- Consumes: `callProxy`, `LeagueClubsRaw`, `ClubPlayersRaw`, `isRegularStarter`, `performanceRank` (alle unverändert, bereits in der Datei vorhanden).
- Produces:
  - `export async function getLeagueClubs(leagueSlugs: string[]): Promise<{ slug: string; name: string }[]>` — vereinigt die Klubs aller übergebenen Ligen, dedupliziert nach `slug`. Leeres Array → `[]`, kein Request.
  - `export async function searchPlayersByLeagueAndPosition(leagueSlugs: string[], position: Position): Promise<PlayerSearchHit[]>` — nutzt jetzt intern `getLeagueClubs`, Rest der Sortier-/Filterlogik unverändert.

**Context:** `searchPlayersByLeagueAndPosition` hat die Klub-Ermittlung bisher selbst inline gemacht (eigener `callProxy('leagueClubs', ...)`-Aufruf); jetzt delegiert es an `getLeagueClubs`, um die Vereinigungs-/Dedupe-Logik nicht doppelt zu pflegen (DRY).

- [ ] **Step 1: Implementierung ändern**

In `src/api/sorareClient.ts`, ersetze die beiden Funktionen `getLeagueClubs` und `searchPlayersByLeagueAndPosition`:

```typescript
export async function getLeagueClubs(leagueSlugs: string[]): Promise<{ slug: string; name: string }[]> {
  const settled = await Promise.allSettled(
    leagueSlugs.map((leagueSlug) => callProxy<LeagueClubsRaw>('leagueClubs', { leagueSlug })),
  )
  const clubs = settled.flatMap((result) =>
    result.status === 'fulfilled' ? result.value.football.competition?.clubs.nodes ?? [] : [],
  )
  // Dedupe defensiv nach Slug — die Mehrfachauswahl erlaubt beliebige Liga-Kombinationen; ein Klub,
  // der in zwei ausgewählten Ligen auftaucht, ist zumindest theoretisch nicht ausgeschlossen.
  return Array.from(new Map(clubs.map((club) => [club.slug, club])).values())
}

export async function searchPlayersByLeagueAndPosition(
  leagueSlugs: string[],
  position: Position,
): Promise<PlayerSearchHit[]> {
  const clubs = await getLeagueClubs(leagueSlugs)

  const settled = await Promise.allSettled(
    clubs.map((club) => callProxy<ClubPlayersRaw>('clubPlayers', { clubSlug: club.slug })),
  )
  const clubResults = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))

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

- [ ] **Step 2: Bestehende Tests auf Array-Signatur umstellen und neue Tests ergänzen**

In `src/api/sorareClient.test.ts`, ersetze den kompletten Block `describe('searchPlayersByLeagueAndPosition', ...)` durch:

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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Defender')

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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Forward')

    expect(hits.map((hit) => hit.slug)).toEqual(['scored-starter', 'no-data-starter'])
  })

  it('skips a club with no data and returns an empty array when the competition is not found', async () => {
    mockFetchSequence([{ data: { football: { competition: null } } }])

    const hits = await searchPlayersByLeagueAndPosition(['unknown-league'], 'Defender')

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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Goalkeeper')

    expect(hits).toEqual([
      { slug: 'a-player', displayName: 'A Player', positions: ['Goalkeeper'], clubName: 'Club A' },
    ])
  })

  it('merges and sorts results across multiple clubs in the same league, keeping each hit tagged with its own club', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: {
              name: 'Bundesliga',
              clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }] },
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
                  { slug: 'a-starter-low', displayName: 'A Starter Low', position: 'Defender', playingStatus: 'STARTER', l10: 20, l40: 20 },
                ],
              },
            },
          },
        },
      },
      {
        data: {
          football: {
            club: {
              name: 'Club B',
              activePlayers: {
                nodes: [
                  { slug: 'b-starter-high', displayName: 'B Starter High', position: 'Defender', playingStatus: 'STARTER', l10: 80, l40: 80 },
                ],
              },
            },
          },
        },
      },
    ])

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Defender')

    expect(hits).toEqual([
      { slug: 'b-starter-high', displayName: 'B Starter High', positions: ['Defender'], clubName: 'Club B' },
      { slug: 'a-starter-low', displayName: 'A Starter Low', positions: ['Defender'], clubName: 'Club A' },
    ])
  })

  it('merges and sorts results across multiple selected leagues, keeping each hit tagged with its own club', async () => {
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
            competition: { name: 'Ligue 1', clubs: { nodes: [{ slug: 'club-b', name: 'Club B' }] } },
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
                  { slug: 'a-starter-low', displayName: 'A Starter Low', position: 'Defender', playingStatus: 'STARTER', l10: 20, l40: 20 },
                ],
              },
            },
          },
        },
      },
      {
        data: {
          football: {
            club: {
              name: 'Club B',
              activePlayers: {
                nodes: [
                  { slug: 'b-starter-high', displayName: 'B Starter High', position: 'Defender', playingStatus: 'STARTER', l10: 80, l40: 80 },
                ],
              },
            },
          },
        },
      },
    ])

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de', 'ligue-1-fr'], 'Defender')

    expect(hits).toEqual([
      { slug: 'b-starter-high', displayName: 'B Starter High', positions: ['Defender'], clubName: 'Club B' },
      { slug: 'a-starter-low', displayName: 'A Starter Low', positions: ['Defender'], clubName: 'Club A' },
    ])
  })

  it('returns results from clubs that succeeded even if another club fetch fails', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: {
              name: 'Bundesliga',
              clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }] },
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
                  { slug: 'a-starter', displayName: 'A Starter', position: 'Defender', playingStatus: 'STARTER', l10: 50, l40: 50 },
                ],
              },
            },
          },
        },
      },
      { errors: [{ message: 'Upstream Sorare API unavailable' }] },
    ])

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Defender')

    expect(hits).toEqual([
      { slug: 'a-starter', displayName: 'A Starter', positions: ['Defender'], clubName: 'Club A' },
    ])
  })

  it('returns an empty array when the league has zero clubs', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'Empty League', clubs: { nodes: [] } } } } },
    ])

    const hits = await searchPlayersByLeagueAndPosition(['empty-league'], 'Defender')

    expect(hits).toEqual([])
  })

  it('returns an empty array and makes no fetch calls when leagueSlugs is empty', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const hits = await searchPlayersByLeagueAndPosition([], 'Defender')

    expect(hits).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

Ersetze außerdem den kompletten Block `describe('getLeagueClubs', ...)` durch:

```typescript
describe('getLeagueClubs', () => {
  it('returns the clubs for a competition', async () => {
    mockFetchOnce({
      data: {
        football: {
          competition: {
            name: 'Bundesliga',
            clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }] },
          },
        },
      },
    })

    const clubs = await getLeagueClubs(['bundesliga-de'])

    expect(fetch).toHaveBeenCalledWith('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'leagueClubs', variables: { leagueSlug: 'bundesliga-de' } }),
    })
    expect(clubs).toEqual([{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }])
  })

  it('returns an empty array when the competition is not found', async () => {
    mockFetchOnce({ data: { football: { competition: null } } })

    const clubs = await getLeagueClubs(['unknown-league'])

    expect(clubs).toEqual([])
  })

  it('unions clubs from multiple leagues', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'Bundesliga', clubs: { nodes: [{ slug: 'club-a', name: 'Club A' }] } } } } },
      { data: { football: { competition: { name: 'Ligue 1', clubs: { nodes: [{ slug: 'club-b', name: 'Club B' }] } } } } },
    ])

    const clubs = await getLeagueClubs(['bundesliga-de', 'ligue-1-fr'])

    expect(clubs).toEqual([{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }])
  })

  it('dedupes a club that appears in more than one selected league', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'League A', clubs: { nodes: [{ slug: 'club-x', name: 'Club X' }] } } } } },
      { data: { football: { competition: { name: 'League B', clubs: { nodes: [{ slug: 'club-x', name: 'Club X' }] } } } } },
    ])

    const clubs = await getLeagueClubs(['league-a', 'league-b'])

    expect(clubs).toEqual([{ slug: 'club-x', name: 'Club X' }])
  })

  it('returns an empty array and makes no fetch calls for an empty leagueSlugs array', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const clubs = await getLeagueClubs([])

    expect(clubs).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Tests, Lint, Build ausführen**

```bash
cd ~/Library/CloudStorage/SynologyDrive-cloud/git/sorare-for-beginners
node node_modules/vitest/dist/cli.js run --no-color
./node_modules/.bin/oxlint
npm run build
```

Erwartet: `sorareClient.test.ts` hat jetzt 5 (`getLeagueClubs`, davor 2) + 9 (`searchPlayersByLeagueAndPosition`, davor 7) = 14 Tests in diesen beiden Blöcken statt 9 zuvor (+5 neu), gesamte Suite PASS, Lint sauber, Build erfolgreich. **Kompiliert der Build an dieser Stelle noch nicht**, weil `TeamPanel.tsx`/`LeaguePositionSearch.tsx` die Funktionen noch mit einem einzelnen String statt einem Array aufrufen (TypeScript-Fehler) — das ist erwartet und wird in Task 4 behoben. Falls `npm run build` hier fehlschlägt, prüfe, dass die Fehler ausschließlich in `TeamPanel.tsx`/`LeaguePositionSearch.tsx` liegen (falsche Argumenttypen für `getLeagueClubs`/`searchPlayersByLeagueAndPosition`), nicht in `sorareClient.ts`/`sorareClient.test.ts` selbst.

- [ ] **Step 4: Commit**

```bash
git add src/api/sorareClient.ts src/api/sorareClient.test.ts
git commit -m "ODI-313: change getLeagueClubs/searchPlayersByLeagueAndPosition to accept leagueSlugs: string[]"
```

---

### Task 4: `LeagueMultiSelect`-Komponente + Verdrahtung in `TeamPanel.tsx`/`LeaguePositionSearch.tsx`

**Files:**
- Create: `src/components/LeagueMultiSelect.tsx`
- Modify: `src/App.css`
- Modify: `src/components/TeamPanel.tsx` (voller Dateiinhalt)
- Modify: `src/components/LeaguePositionSearch.tsx` (voller Dateiinhalt)

**Interfaces:**
- Consumes: `LEAGUES`, `CHAMPION_LEAGUE_SLUGS`, `CONTENDER_LEAGUE_SLUGS` aus `src/api/sorareClient.ts` (Task 2); `getLeagueClubs`/`searchPlayersByLeagueAndPosition` mit der neuen Array-Signatur (Task 3).
- Produces: `export function LeagueMultiSelect({ label, selectedSlugs, onChange }: { label: string; selectedSlugs: string[]; onChange: (slugs: string[]) => void })`. Keine neuen automatisierten Tests (Komponente, projekt-konventionsgemäß nur Live-Verifikation).

**Context:** Diese Komponente kapselt Checkbox-Liste über `LEAGUES` + zwei Preset-Buttons ("Champion", "Contender"), damit die Mehrfachauswahl nicht dreimal (Auto-Fill, Team-Stack, Positionssuche) separat implementiert wird.

- [ ] **Step 1: `LeagueMultiSelect.tsx` anlegen**

Erstelle `src/components/LeagueMultiSelect.tsx` mit folgendem Inhalt:

```tsx
import { CHAMPION_LEAGUE_SLUGS, CONTENDER_LEAGUE_SLUGS, LEAGUES } from '../api/sorareClient'

interface LeagueMultiSelectProps {
  label: string
  selectedSlugs: string[]
  onChange: (slugs: string[]) => void
}

export function LeagueMultiSelect({ label, selectedSlugs, onChange }: LeagueMultiSelectProps) {
  function toggleLeague(slug: string) {
    onChange(
      selectedSlugs.includes(slug) ? selectedSlugs.filter((selected) => selected !== slug) : [...selectedSlugs, slug],
    )
  }

  return (
    <div className="league-multi-select">
      <div className="league-presets">
        <button type="button" onClick={() => onChange(CHAMPION_LEAGUE_SLUGS)}>
          Champion
        </button>
        <button type="button" onClick={() => onChange(CONTENDER_LEAGUE_SLUGS)}>
          Contender
        </button>
      </div>
      <div className="league-checkboxes" role="group" aria-label={label}>
        {LEAGUES.map((league) => (
          <label key={league.slug}>
            <input
              type="checkbox"
              checked={selectedSlugs.includes(league.slug)}
              onChange={() => toggleLeague(league.slug)}
            />
            {league.name}
          </label>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: CSS ergänzen**

In `src/App.css`, füge nach dem Block `.auto-fill, .team-stack, .market-rarity { ... }` (endet mit der schließenden `}` vor `.price-refresh-status`) folgende neuen Regeln ein:

```css
.league-multi-select {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.league-presets {
  display: flex;
  gap: 8px;
}

.league-checkboxes {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
}

.league-checkboxes label {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
```

- [ ] **Step 3: `TeamPanel.tsx` verdrahten**

Ersetze den vollständigen Inhalt von `src/components/TeamPanel.tsx` mit:

```tsx
import { useEffect, useId, useMemo, useState } from 'react'
import { PlayerSearch } from './PlayerSearch'
import { LeaguePositionSearch } from './LeaguePositionSearch'
import { FormationList } from './FormationList'
import { LeagueMultiSelect } from './LeagueMultiSelect'
import { computeFormationView } from '../api/formation'
import { evaluatePlayer } from '../api/scoring'
import {
  CANDIDATES_PER_POSITION,
  FORMATION_POSITIONS,
  LEAGUES,
  MARKET_RARITIES,
  getClubRoster,
  getLeagueClubs,
  getPlayer,
  searchPlayersByLeagueAndPosition,
} from '../api/sorareClient'
import { SorareApiError } from '../api/types'
import type { MarketRarity, Player } from '../api/types'
import type { EvaluatedCandidate, FormationMode } from '../api/formation'
import { formatSlotOutcome } from './formatters'

interface TeamPanelProps {
  label: string
}

export function TeamPanel({ label }: TeamPanelProps) {
  const headingId = useId()
  const groupName = useId()
  const [shortlist, setShortlist] = useState<Player[]>([])
  const [mode, setMode] = useState<FormationMode>('normal')
  const [autoFillLeagues, setAutoFillLeagues] = useState<string[]>([LEAGUES[0].slug])
  const [isAutoFilling, setIsAutoFilling] = useState(false)
  const [autoFillError, setAutoFillError] = useState<string | null>(null)
  const [stackLeagues, setStackLeagues] = useState<string[]>([LEAGUES[0].slug])
  const [stackClubs, setStackClubs] = useState<{ slug: string; name: string }[]>([])
  const [stackClubSlug, setStackClubSlug] = useState<string>('')
  const [isLoadingClubs, setIsLoadingClubs] = useState(false)
  const [isStackFilling, setIsStackFilling] = useState(false)
  const [stackError, setStackError] = useState<string | null>(null)
  const [now] = useState(() => new Date())
  const [marketRarity, setMarketRarity] = useState<MarketRarity>('limited')
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)
  const [priceRefreshError, setPriceRefreshError] = useState<string | null>(null)

  useEffect(() => {
    if (mode !== 'teamStack') return
    let cancelled = false
    setIsLoadingClubs(true)
    setStackError(null)
    getLeagueClubs(stackLeagues)
      .then((clubs) => {
        if (cancelled) return
        setStackClubs(clubs)
        setStackClubSlug(clubs[0]?.slug ?? '')
      })
      .catch(() => {
        if (!cancelled) setStackError('Clubs konnten nicht geladen werden')
      })
      .finally(() => {
        if (!cancelled) setIsLoadingClubs(false)
      })
    return () => {
      cancelled = true
    }
  }, [mode, stackLeagues])

  // Self-healing price refresh: re-fetches any shortlisted player whose prices were fetched
  // under a different rarity than the one currently selected. Since `shortlist` is a
  // dependency, this also catches players added via search/KI-Team/Team-Stack while a rarity
  // change was still in flight — adding them re-triggers this effect, which then notices the
  // mismatch and corrects it, regardless of which flow added them.
  useEffect(() => {
    const stale = shortlist.filter((player) => player.marketPrices.rarity !== marketRarity)
    if (stale.length === 0) {
      setIsRefreshingPrices(false)
      setPriceRefreshError(null)
      return
    }
    let cancelled = false
    setIsRefreshingPrices(true)
    setPriceRefreshError(null)
    Promise.allSettled(stale.map((player) => getPlayer(player.slug, marketRarity)))
      .then((settled) => {
        if (cancelled) return
        const refreshed = new Map(
          settled.flatMap((outcome, index) =>
            outcome.status === 'fulfilled' ? [[stale[index].slug, outcome.value] as const] : [],
          ),
        )
        // Only touch shortlist when something actually changed — updating it unconditionally
        // would create a new array identity every time, re-triggering this effect and refetching
        // the same still-failing players forever whenever a refetch rejects.
        if (refreshed.size > 0) {
          setShortlist((prev) => prev.map((player) => refreshed.get(player.slug) ?? player))
        }
        if (settled.some((outcome) => outcome.status === 'rejected')) {
          setPriceRefreshError('Einige Preise konnten nicht aktualisiert werden')
        }
      })
      .finally(() => {
        if (!cancelled) setIsRefreshingPrices(false)
      })
    return () => {
      cancelled = true
    }
  }, [marketRarity, shortlist])

  function handleAdd(player: Player): boolean {
    let added = false
    setShortlist((current) => {
      if (current.some((existing) => existing.slug === player.slug)) return current
      added = true
      return [...current, player]
    })
    return added
  }

  async function handleAutoFill() {
    setIsAutoFilling(true)
    setAutoFillError(null)
    try {
      const picksPerPosition = await Promise.all(
        FORMATION_POSITIONS.map((position) => searchPlayersByLeagueAndPosition(autoFillLeagues, position)),
      )
      const topSlugs = picksPerPosition.flatMap((hits) => hits.slice(0, CANDIDATES_PER_POSITION).map((hit) => hit.slug))
      const settled = await Promise.allSettled(topSlugs.map((slug) => getPlayer(slug, marketRarity)))
      const players = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      players.forEach((player) => handleAdd(player))
    } catch (error) {
      setAutoFillError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler bei der KI-Auswahl')
    } finally {
      setIsAutoFilling(false)
    }
  }

  async function handleLoadClubRoster() {
    if (!stackClubSlug) return
    setIsStackFilling(true)
    setStackError(null)
    try {
      const hits = await getClubRoster(stackClubSlug)
      const settled = await Promise.allSettled(hits.map((hit) => getPlayer(hit.slug, marketRarity)))
      const players = settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []))
      players.forEach((player) => handleAdd(player))
    } catch (error) {
      setStackError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Laden des Teams')
    } finally {
      setIsStackFilling(false)
    }
  }

  function handleRemove(slug: string) {
    setShortlist((current) => current.filter((player) => player.slug !== slug))
  }

  const candidates: EvaluatedCandidate[] = useMemo(
    () => shortlist.map((player) => ({ player, evaluation: evaluatePlayer(player, now) })),
    [shortlist, now],
  )

  // Single computation shared by the shortlist chips and FormationList — guarantees the two
  // views can never disagree about who's in a slot vs. why someone isn't (see ODI-308 final
  // review: computing this twice, even from identical inputs, left the invariant unenforced).
  const { slots, explanations } = useMemo(
    () => computeFormationView(candidates, mode, mode === 'teamStack' ? stackClubSlug : undefined),
    [candidates, mode, stackClubSlug],
  )

  return (
    <section className="team-panel" aria-labelledby={headingId}>
      <h2 id={headingId}>{label}</h2>

      <div className="mode-toggle" role="radiogroup" aria-label={`${label} — Flex-Modus`}>
        <label>
          <input
            type="radio"
            name={groupName}
            value="normal"
            checked={mode === 'normal'}
            onChange={() => setMode('normal')}
          />
          Normal
        </label>
        <label>
          <input
            type="radio"
            name={groupName}
            value="defensiveStack"
            checked={mode === 'defensiveStack'}
            onChange={() => setMode('defensiveStack')}
          />
          Defensiv-Stack
        </label>
        <label>
          <input
            type="radio"
            name={groupName}
            value="teamStack"
            checked={mode === 'teamStack'}
            onChange={() => setMode('teamStack')}
          />
          Team-Stack
        </label>
      </div>

      <div className="market-rarity">
        <label>
          Marktpreis-Rarität:{' '}
          <select
            value={marketRarity}
            onChange={(event) => setMarketRarity(event.target.value as MarketRarity)}
            aria-label={`${label} — Marktpreis-Rarität`}
          >
            {MARKET_RARITIES.map((rarity) => (
              <option key={rarity.value} value={rarity.value}>
                {rarity.label}
              </option>
            ))}
          </select>
        </label>
        {isRefreshingPrices && <span className="price-refresh-status">Preise werden aktualisiert…</span>}
        {priceRefreshError && (
          <p className="search-error" role="alert">
            {priceRefreshError}
          </p>
        )}
      </div>

      <PlayerSearch onAdd={handleAdd} label={label} marketRarity={marketRarity} />

      <LeaguePositionSearch onAdd={handleAdd} label={label} marketRarity={marketRarity} />

      <div className="auto-fill">
        <LeagueMultiSelect label={`${label} — KI-Team Liga`} selectedSlugs={autoFillLeagues} onChange={setAutoFillLeagues} />
        <button type="button" onClick={handleAutoFill} disabled={isAutoFilling}>
          {isAutoFilling ? 'KI wählt aus...' : 'KI-Team erstellen'}
        </button>
        {autoFillError && (
          <p className="search-error" role="alert">
            {autoFillError}
          </p>
        )}
      </div>

      {mode === 'teamStack' && (
        <div className="team-stack">
          <LeagueMultiSelect label={`${label} — Team-Stack Liga`} selectedSlugs={stackLeagues} onChange={setStackLeagues} />
          <select
            value={stackClubSlug}
            onChange={(event) => setStackClubSlug(event.target.value)}
            aria-label={`${label} — Team-Stack Club`}
            disabled={isLoadingClubs || stackClubs.length === 0}
          >
            {stackClubs.map((club) => (
              <option key={club.slug} value={club.slug}>
                {club.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={handleLoadClubRoster} disabled={isStackFilling || !stackClubSlug}>
            {isStackFilling ? 'Team wird geladen...' : 'Team laden'}
          </button>
          {stackError && (
            <p className="search-error" role="alert">
              {stackError}
            </p>
          )}
        </div>
      )}

      <div className="shortlist">
        {shortlist.map((player) => {
          const explanation = explanations.get(player.slug)
          const isInSlot = explanation?.assignedSlot != null
          // Only chips for players NOT currently in a slot get a tooltip — that info is already
          // visible via the ℹ️ icon in the formation list for anyone who IS in a slot.
          return (
            <span
              key={player.slug}
              className={explanation && !isInSlot ? 'shortlist-chip icon-tooltip' : 'shortlist-chip'}
              data-tooltip={explanation && !isInSlot ? formatSlotOutcome(explanation) : undefined}
            >
              {player.displayName}
              <button
                type="button"
                onClick={() => handleRemove(player.slug)}
                aria-label={`${player.displayName} von der Shortlist entfernen`}
              >
                ✕
              </button>
            </span>
          )
        })}
      </div>

      <FormationList slots={slots} explanations={explanations} />
    </section>
  )
}
```

- [ ] **Step 4: `LeaguePositionSearch.tsx` verdrahten**

Ersetze den vollständigen Inhalt von `src/components/LeaguePositionSearch.tsx` mit:

```tsx
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { getPlayer, LEAGUES, searchPlayersByLeagueAndPosition } from '../api/sorareClient'
import { evaluatePlayer } from '../api/scoring'
import { SorareApiError } from '../api/types'
import type { MarketRarity, Player, PlayerSearchHit, Position } from '../api/types'
import { PlayerScoreSummary } from './PlayerScoreSummary'
import { LeagueMultiSelect } from './LeagueMultiSelect'

const POSITIONS: { value: Position; label: string }[] = [
  { value: 'Goalkeeper', label: 'Torwart' },
  { value: 'Defender', label: 'Verteidiger' },
  { value: 'Midfielder', label: 'Mittelfeld' },
  { value: 'Forward', label: 'Sturm' },
]

// This search can return 100+ hits (a whole league/position); fetching full player detail for
// every one would mean 100+ proxy calls per search. Only the first N — already sorted by
// starter-status and form — get full score/injury/price data. The rest stay name-only until added.
const DETAILED_RESULTS_LIMIT = 20

interface LeaguePositionSearchProps {
  onAdd: (player: Player) => boolean
  label: string
  marketRarity: MarketRarity
}

export function LeaguePositionSearch({ onAdd, label, marketRarity }: LeaguePositionSearchProps) {
  const [leagueSlugs, setLeagueSlugs] = useState<string[]>([LEAGUES[0].slug])
  const [position, setPosition] = useState<Position>('Defender')
  const [results, setResults] = useState<PlayerSearchHit[]>([])
  const [resultDetails, setResultDetails] = useState<Record<string, Player>>({})
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [addingSlug, setAddingSlug] = useState<string | null>(null)
  const [addError, setAddError] = useState<string | null>(null)
  const [isRefreshingPrices, setIsRefreshingPrices] = useState(false)
  const [priceRefreshError, setPriceRefreshError] = useState<string | null>(null)
  const [now] = useState(() => new Date())

  async function handleSearch(event: FormEvent) {
    event.preventDefault()
    setIsSearching(true)
    setSearchError(null)
    setResultDetails({})
    try {
      const hits = await searchPlayersByLeagueAndPosition(leagueSlugs, position)
      setResults(hits)
      const detailed = hits.slice(0, DETAILED_RESULTS_LIMIT)
      const settled = await Promise.allSettled(detailed.map((hit) => getPlayer(hit.slug, marketRarity)))
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

  // Self-healing price refresh, scoped to the same first-N results that got full details in the
  // first place — mirrors PlayerSearch's reconciliation effect (see there for the full rationale).
  useEffect(() => {
    const stale = results
      .slice(0, DETAILED_RESULTS_LIMIT)
      .map((hit) => resultDetails[hit.slug])
      .filter((player): player is Player => player !== undefined && player.marketPrices.rarity !== marketRarity)
    if (stale.length === 0) {
      setIsRefreshingPrices(false)
      setPriceRefreshError(null)
      return
    }
    let cancelled = false
    setIsRefreshingPrices(true)
    setPriceRefreshError(null)
    Promise.allSettled(stale.map((player) => getPlayer(player.slug, marketRarity)))
      .then((settled) => {
        if (cancelled) return
        const refreshed = new Map(
          settled.flatMap((outcome, index) =>
            outcome.status === 'fulfilled' ? [[stale[index].slug, outcome.value] as const] : [],
          ),
        )
        if (refreshed.size > 0) {
          setResultDetails((prev) => ({ ...prev, ...Object.fromEntries(refreshed) }))
        }
        if (settled.some((outcome) => outcome.status === 'rejected')) {
          setPriceRefreshError('Einige Preise konnten nicht aktualisiert werden')
        }
      })
      .finally(() => {
        if (!cancelled) setIsRefreshingPrices(false)
      })
    return () => {
      cancelled = true
    }
  }, [marketRarity, results, resultDetails])

  async function handleAdd(slug: string) {
    setAddingSlug(slug)
    setAddError(null)
    try {
      const cached = resultDetails[slug]
      const player = cached && cached.marketPrices.rarity === marketRarity ? cached : await getPlayer(slug, marketRarity)
      const added = onAdd(player)
      // Deliberately collapses the list after a successful add — unlike PlayerSearch, whose
      // result sets are small enough to stay useful; this one can return 100+ hits.
      if (added) setResults([])
    } catch (error) {
      setAddError(error instanceof SorareApiError ? error.message : 'Unbekannter Fehler beim Hinzufügen')
    } finally {
      setAddingSlug(null)
    }
  }

  function handleFilterChange() {
    setResults([])
    setResultDetails({})
    setAddError(null)
  }

  return (
    <div className="league-position-search">
      <form onSubmit={handleSearch}>
        <LeagueMultiSelect
          label={`${label} — Liga`}
          selectedSlugs={leagueSlugs}
          onChange={(slugs) => {
            setLeagueSlugs(slugs)
            handleFilterChange()
          }}
        />
        <select
          value={position}
          onChange={(event) => {
            setPosition(event.target.value as Position)
            handleFilterChange()
          }}
          aria-label={`${label} — Position`}
        >
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
      {isRefreshingPrices && <p className="price-refresh-status">Preise werden aktualisiert…</p>}
      {priceRefreshError && (
        <p className="search-error" role="alert">
          {priceRefreshError}
        </p>
      )}

      <ul className="search-results">
        {results.map((hit) => {
          const player = resultDetails[hit.slug]
          return (
            <li key={hit.slug}>
              {player ? (
                <span>
                  <PlayerScoreSummary player={player} evaluation={evaluatePlayer(player, now)} />
                </span>
              ) : (
                <span className="result-name">
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

- [ ] **Step 5: Tests, Lint, Build ausführen**

```bash
cd ~/Library/CloudStorage/SynologyDrive-cloud/git/sorare-for-beginners
node node_modules/vitest/dist/cli.js run --no-color
./node_modules/.bin/oxlint
npm run build
```

Erwartet: alle Tests PASS (keine neuen — diese Task fügt nur UI-Verdrahtung hinzu, projekt-konventionsgemäß ohne Komponenten-Tests), Lint sauber, Build erfolgreich (jetzt ohne die in Task 3 erwarteten Typfehler).

- [ ] **Step 6: Live-Verifikation im Browser**

Dev-Server starten (`sorare-for-beginners-dev`-Preview) und in einem Team-Panel prüfen:
- Auto-Fill-Liga-Auswahl zeigt jetzt 14 Checkboxen statt eines Dropdowns; mehrere gleichzeitig anwählbar.
- Klick auf "Champion" wählt genau die 5 Ligen (Premier League, Bundesliga, LALIGA EA SPORTS, Ligue 1, Italian League) aus; einzelne lassen sich danach abwählen.
- Klick auf "Contender" wählt die entsprechenden 20 Ligen aus.
- "KI-Team erstellen" mit mehreren ausgewählten Ligen liefert Spieler aus mehreren Ligen (z. B. Klub-Namen aus verschiedenen Ligen in der Shortlist erkennbar).
- Team-Stack: Mehrfachauswahl mehrerer Ligen befüllt das Klub-Dropdown mit Klubs aus allen gewählten Ligen; "Team laden" lädt weiterhin nur den Kader des einen ausgewählten Klubs.
- Liga-Positionssuche: Mehrfachauswahl funktioniert identisch, Ändern der Auswahl setzt die bisherigen Suchergebnisse zurück (wie bisher bei Liga-Wechsel).

- [ ] **Step 7: Commit**

```bash
git add src/components/LeagueMultiSelect.tsx src/App.css src/components/TeamPanel.tsx src/components/LeaguePositionSearch.tsx
git commit -m "ODI-313: replace league dropdown with multi-select + Champion/Contender presets"
```

---

## After all tasks: final whole-branch review

Per diesem Projekt etabliertem Prozess: einen abschließenden Review-Agenten (fähigstes Modell) gegen den vollständigen Diff seit Task 1 dispatchen. Besonderes Augenmerk auf:

- Ob die Dedupe-Logik in `getLeagueClubs` (nach `club.slug`) korrekt mit `Map` funktioniert, auch wenn ein Klub in mehr als zwei ausgewählten Ligen auftaucht.
- Ob `searchPlayersByLeagueAndPosition`s Delegation an `getLeagueClubs` (statt eigenem inline-Fetch) das bisherige Fehlerverhalten bei einer nicht gefundenen Liga (`competition: null`) identisch nachbildet.
- Ob die `LeagueMultiSelect`-Präsenz an drei Stellen (Auto-Fill, Team-Stack, Positionssuche) mit jeweils eigenem, unabhängigem State (`autoFillLeagues`, `stackLeagues`, `leagueSlugs`) tatsächlich unabhängig funktioniert und sich die drei Instanzen nicht gegenseitig beeinflussen.
- Live-Verifikation gemäß Task 4 Step 6 nach etwaigen Fixes erneut durchführen.
