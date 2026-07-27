# Sorare-API-Anbindung (ODI-291) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Live, öffentliche Sorare-Spieler-/Marktdaten (Details + Suche) über einen PHP-Proxy und einen typisierten Frontend-Client verfügbar machen.

**Architecture:** Ein schlanker PHP-Proxy (`public/api/sorare-proxy.php`) mit fest hinterlegter Whitelist leitet zwei Operationen (`playerDetail`, `playerSearch`) 1:1 an `api.sorare.com/graphql` weiter. Da Frontend und Proxy in Produktion auf derselben Domain laufen, ist der Aufruf same-origin (kein CORS nötig). Ein typisierter `fetch`-Client (`src/api/sorareClient.ts`) ruft den Proxy auf und mappt die Rohdaten auf saubere TS-Typen.

**Tech Stack:** React 19 + TypeScript + Vite 8 (bestehend), PHP (Netcup-Webhosting, Version wird in Task 1 verifiziert), Vitest 4 (neu) für Frontend-Tests.

## Global Constraints

- Nur die zwei whitelisted Operationen `playerDetail` und `playerSearch` sind erlaubt — kein offener GraphQL-Durchleiter (siehe Spec, Abschnitt "Entscheidungen aus der Discovery").
- Kein Sorare-Login/JWT-Flow in diesem Ticket — nur öffentliche, nicht authentifizierte Felder.
- Keine CORS-Header im PHP-Proxy nötig (same-origin in Produktion) — CORS wird stattdessen über den Vite-Dev-Server-Proxy für die lokale Entwicklung gelöst.
- Kein Apollo/urql — nur ein schlanker `fetch`-Wrapper.
- Kein automatisierter Test gegen die echte Sorare-API in CI — Verifikation gegen die echte API erfolgt manuell per curl nach dem Deploy.
- Kein eigenes PHPUnit-Setup für den Proxy — Verifikation lokal per `php -S` + curl, sowie nach Deploy per curl gegen die Produktion.

---

## Task 1: Netcup-PHP-Support verifizieren

**Files:**
- Create: `public/api/ping.php` (wird am Ende dieser Task wieder entfernt)

**Interfaces:**
- Produces: Bestätigung, dass PHP auf dem Netcup-Webspace unter `/api/*.php` tatsächlich ausgeführt wird (Risiko aus der Spec).

- [ ] **Step 1: Test-Datei anlegen**

Erstelle `public/api/ping.php`:

```php
<?php

header('Content-Type: application/json');

echo json_encode([
    'status' => 'ok',
    'phpVersion' => phpversion(),
]);
```

- [ ] **Step 2: Lokal prüfen, dass Vite die Datei unverändert nach `dist/` kopiert**

Run: `npm run build && cat dist/api/ping.php`
Expected: Die Ausgabe zeigt exakt den PHP-Quellcode aus Step 1 (Vite kopiert `public/`-Inhalte 1:1, ohne sie zu verarbeiten).

- [ ] **Step 3: Commit und Push**

```bash
git add public/api/ping.php
git commit -m "test: add temporary PHP health-check to verify Netcup PHP support"
git push origin main
```

- [ ] **Step 4: Deploy abwarten**

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓ (Build + FTP-Sync erfolgreich).

- [ ] **Step 5: Live gegenprüfen**

Run: `curl -s https://sorare-for-beginners.de/api/ping.php`
Expected: JSON-Antwort wie `{"status":"ok","phpVersion":"8.x.x"}`.

**Falls stattdessen der rohe PHP-Quellcode zurückkommt** (Antwort beginnt mit `<?php`): Das Hosting führt PHP unter diesem Pfad nicht aus. In diesem Fall diese Task hier stoppen, zurück zum Design gehen und die in der Brainstorming-Phase verworfene Serverless-Alternative (z.B. Cloudflare Worker) erneut bewerten, bevor mit Task 2 fortgefahren wird.

- [ ] **Step 6: Test-Datei wieder entfernen**

```bash
rm public/api/ping.php
git add -A
git commit -m "test: remove temporary PHP health-check after verifying Netcup PHP support"
```

(Push erfolgt zusammen mit Task 2, kein separates Deploy nötig.)

---

## Task 2: PHP-Proxy mit Whitelist

**Files:**
- Create: `public/api/sorare-proxy.php`

**Interfaces:**
- Consumes: nichts (ruft `https://api.sorare.com/graphql` direkt auf)
- Produces: HTTP-Endpoint `POST /api/sorare-proxy.php` mit Body `{ "operation": "playerDetail" | "playerSearch", "variables": {...} }`, Antwort im Format `{ "data": ... }` oder `{ "errors": [{ "message": "..." }] }`. Dies ist der Endpoint, den `src/api/sorareClient.ts` (Task 3) aufruft.

- [ ] **Step 1: Proxy-Datei schreiben**

Erstelle `public/api/sorare-proxy.php`:

```php
<?php

header('Content-Type: application/json');

const SORARE_ENDPOINT = 'https://api.sorare.com/graphql';

const WHITELIST = [
    'playerDetail' => <<<'GRAPHQL'
query PlayerDetail($slug: String!) {
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
    }
  }
}
GRAPHQL,
    'playerSearch' => <<<'GRAPHQL'
query PlayerSearch($query: String!, $page: Int, $pageSize: Int) {
  searchPlayers(query: $query, page: $page, pageSize: $pageSize) {
    nbHits
    nbPages
    page
    commonPlayerHits {
      positions
      anyPlayer {
        ... on Player {
          slug
          displayName
          activeClub {
            name
          }
        }
      }
    }
  }
}
GRAPHQL,
];

function respond_error($status, $message) {
    http_response_code($status);
    echo json_encode(['errors' => [['message' => $message]]]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_error(405, 'Method not allowed');
}

$body = json_decode(file_get_contents('php://input'), true);

if (!is_array($body) || !isset($body['operation']) || !is_string($body['operation'])) {
    respond_error(400, 'Missing or invalid "operation"');
}

$operation = $body['operation'];

if (!array_key_exists($operation, WHITELIST)) {
    respond_error(400, 'Unknown operation');
}

$variables = isset($body['variables']) && is_array($body['variables']) ? $body['variables'] : [];

$payload = json_encode([
    'query' => WHITELIST[$operation],
    'variables' => $variables,
]);

$ch = curl_init(SORARE_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);

$response = curl_exec($ch);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    error_log('Sorare proxy upstream error: ' . $curlError);
    respond_error(502, 'Upstream Sorare API unavailable');
}

echo $response;
```

- [ ] **Step 2: Lokal testen (PHP-Built-in-Server)**

Falls `php` lokal nicht installiert ist: `brew install php`

Run: `php -S localhost:8090 -t public/api`  (in einem separaten Terminal laufen lassen)

Dann in einem zweiten Terminal:

```bash
curl -s -X POST http://localhost:8090/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin"}}'
```

Expected: JSON mit echten Spielerdaten, u.a. `"displayName":"Kylian Mbappé"`, `"position":"Forward"`, `"activeClub":{"name":"Real Madrid",...}`.

```bash
curl -s -X POST http://localhost:8090/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerSearch","variables":{"query":"Mbappe","pageSize":3}}'
```

Expected: JSON mit `"nbHits":2` und einer Trefferliste, die u.a. `"displayName":"Kylian Mbappé"` enthält.

- [ ] **Step 3: Fehlerfälle lokal prüfen**

```bash
curl -s -i -X POST http://localhost:8090/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"bogus"}'
```

Expected: `HTTP/1.1 400 Bad Request` und Body `{"errors":[{"message":"Unknown operation"}]}`.

```bash
curl -s -i http://localhost:8090/sorare-proxy.php
```

Expected: `HTTP/1.1 405 Method Not Allowed` und Body `{"errors":[{"message":"Method not allowed"}]}`.

- [ ] **Step 4: Commit**

```bash
git add public/api/sorare-proxy.php
git commit -m "feat: add PHP proxy with whitelisted Sorare GraphQL operations"
```

- [ ] **Step 5: Push und Deploy abwarten**

```bash
git push origin main
```

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓.

- [ ] **Step 6: Gegen Produktion verifizieren**

```bash
curl -s -X POST https://sorare-for-beginners.de/api/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin"}}'
```

Expected: Gleiche Art von Antwort wie in Step 2, live von der Produktions-URL.

---

## Task 3: TypeScript-Typen und Sorare-Client mit Tests

**Files:**
- Create: `src/api/types.ts`
- Create: `src/api/sorareClient.ts`
- Create: `src/api/sorareClient.test.ts`
- Modify: `package.json` (Vitest als devDependency + `test`-Script)

**Interfaces:**
- Consumes: `POST /api/sorare-proxy.php` (Task 2) mit `{ operation, variables }`, Antwort `{ data } | { errors }`.
- Produces: `getPlayer(slug: string): Promise<Player>`, `searchPlayers(params: { query: string; page?: number; pageSize?: number }): Promise<PlayerSearchResult>`, sowie die Typen `Player`, `PlayerSearchResult`, `SorareApiError` — werden von der späteren Formationsansicht (ODI-294) und Bewertungslogik (ODI-293) konsumiert.

- [ ] **Step 1: Vitest installieren**

```bash
npm install --save-dev vitest@^4.1.10
```

- [ ] **Step 2: Test-Script ergänzen**

Modify `package.json`, im `scripts`-Block:

```json
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Typen schreiben**

Erstelle `src/api/types.ts`:

```typescript
export type Position = 'Goalkeeper' | 'Defender' | 'Midfielder' | 'Forward' | 'Coach' | 'Unknown'

export interface Club {
  name: string
  slug: string
}

export interface Injury {
  kind: string | null
  status: string | null
  startDate: string | null
  expectedEndDate: string | null
}

export interface Suspension {
  kind: string | null
  reason: string | null
  startDate: string
  endDate: string | null
}

export interface So5ScoreEntry {
  score: number
  gameDate: string
}

export interface Player {
  slug: string
  displayName: string
  position: Position
  age: number
  activeClub: Club | null
  activeInjuries: Injury[]
  activeSuspensions: Suspension[]
  recentSo5Scores: So5ScoreEntry[]
}

export interface PlayerSearchHit {
  slug: string
  displayName: string
  positions: Position[]
  clubName: string | null
}

export interface PlayerSearchResult {
  totalHits: number
  page: number
  totalPages: number
  hits: PlayerSearchHit[]
}

export interface GraphQLError {
  message: string
}

export class SorareApiError extends Error {
  graphQLErrors?: GraphQLError[]

  constructor(message: string, graphQLErrors?: GraphQLError[]) {
    super(message)
    this.name = 'SorareApiError'
    this.graphQLErrors = graphQLErrors
  }
}
```

- [ ] **Step 4: Failing Tests schreiben**

Erstelle `src/api/sorareClient.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayer, searchPlayers } from './sorareClient'
import { SorareApiError } from './types'

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    }),
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getPlayer', () => {
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
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.displayName).toBe('Kylian Mbappé')
    expect(player.recentSo5Scores).toEqual([{ score: 87.7, gameDate: '2026-07-18T21:00:00Z' }])
  })

  it('throws SorareApiError when the player is not found', async () => {
    mockFetchOnce({ data: { anyPlayer: null } })

    await expect(getPlayer('unknown-slug')).rejects.toThrow(SorareApiError)
  })

  it('throws SorareApiError when the proxy returns a GraphQL error', async () => {
    mockFetchOnce({ errors: [{ message: 'Unknown operation' }] })

    await expect(getPlayer('x')).rejects.toThrow('Unknown operation')
  })

  it('throws SorareApiError on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    await expect(getPlayer('x')).rejects.toThrow(SorareApiError)
  })
})

describe('searchPlayers', () => {
  it('maps search hits, skipping entries without anyPlayer', async () => {
    mockFetchOnce({
      data: {
        searchPlayers: {
          nbHits: 2,
          nbPages: 1,
          page: 1,
          commonPlayerHits: [
            {
              positions: ['Forward'],
              anyPlayer: {
                slug: 'kylian-mbappe-lottin',
                displayName: 'Kylian Mbappé',
                activeClub: { name: 'Real Madrid' },
              },
            },
            {
              positions: ['Midfielder'],
              anyPlayer: null,
            },
          ],
        },
      },
    })

    const result = await searchPlayers({ query: 'Mbappe' })

    expect(result.totalHits).toBe(2)
    expect(result.hits).toHaveLength(1)
    expect(result.hits[0].clubName).toBe('Real Madrid')
  })
})
```

- [ ] **Step 5: Tests laufen lassen, sicherstellen, dass sie fehlschlagen**

Run: `npm run test`
Expected: FAIL — `sorareClient.ts` existiert noch nicht (`Cannot find module './sorareClient'`).

- [ ] **Step 6: Client implementieren**

Erstelle `src/api/sorareClient.ts`:

```typescript
import type { GraphQLError, Player, PlayerSearchResult } from './types'
import { SorareApiError } from './types'

interface ProxyResponse<T> {
  data?: T
  errors?: GraphQLError[]
}

async function callProxy<T>(operation: string, variables: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation, variables }),
    })
  } catch {
    throw new SorareApiError('Netzwerkfehler beim Aufruf der Sorare-API')
  }

  const body = (await response.json()) as ProxyResponse<T>

  if (body.errors && body.errors.length > 0) {
    throw new SorareApiError(body.errors[0].message, body.errors)
  }

  if (!body.data) {
    throw new SorareApiError('Keine Daten in der Antwort')
  }

  return body.data
}

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
  } | null
}

export async function getPlayer(slug: string): Promise<Player> {
  const data = await callProxy<PlayerDetailRaw>('playerDetail', { slug })

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
  }
}

interface PlayerSearchRaw {
  searchPlayers: {
    nbHits: number
    nbPages: number
    page: number
    commonPlayerHits: {
      positions: Player['position'][]
      anyPlayer: { slug: string; displayName: string; activeClub: { name: string } | null } | null
    }[]
  }
}

export async function searchPlayers(params: {
  query: string
  page?: number
  pageSize?: number
}): Promise<PlayerSearchResult> {
  const data = await callProxy<PlayerSearchRaw>('playerSearch', params)
  const result = data.searchPlayers

  return {
    totalHits: result.nbHits,
    page: result.page,
    totalPages: result.nbPages,
    hits: result.commonPlayerHits.flatMap((hit) => {
      if (!hit.anyPlayer) return []
      return [
        {
          slug: hit.anyPlayer.slug,
          displayName: hit.anyPlayer.displayName,
          positions: hit.positions,
          clubName: hit.anyPlayer.activeClub?.name ?? null,
        },
      ]
    }),
  }
}
```

- [ ] **Step 7: Tests laufen lassen, sicherstellen, dass sie bestehen**

Run: `npm run test`
Expected: PASS — alle 5 Tests grün.

- [ ] **Step 8: Typecheck**

Run: `npx tsc -b`
Expected: Keine Fehler.

- [ ] **Step 9: Commit**

```bash
git add src/api/types.ts src/api/sorareClient.ts src/api/sorareClient.test.ts package.json package-lock.json
git commit -m "feat: add typed Sorare API client with unit tests"
```

---

## Task 4: Vite Dev-Server-Proxy für lokale Entwicklung

**Files:**
- Modify: `vite.config.ts`

**Interfaces:**
- Consumes: nichts Neues.
- Produces: `npm run dev` leitet Anfragen an `/api/*` transparent an `https://sorare-for-beginners.de/api/*` weiter, sodass `sorareClient.ts` lokal ohne CORS-Probleme funktioniert.

- [ ] **Step 1: Dev-Proxy konfigurieren**

Modify `vite.config.ts`:

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://sorare-for-beginners.de',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 2: Manuell verifizieren**

Run: `npm run dev` (Terminal offen lassen)

In einem zweiten Terminal, während der Dev-Server läuft:

```bash
curl -s -X POST http://localhost:5173/api/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin"}}'
```

Expected: Gleiche JSON-Antwort mit echten Spielerdaten wie in Task 2 — bestätigt, dass der Dev-Server die Anfrage transparent an die Produktions-PHP-Datei weiterleitet.

- [ ] **Step 3: Commit**

```bash
git add vite.config.ts
git commit -m "feat: add Vite dev server proxy for /api to avoid CORS in local development"
```

---

## Task 5: Deploy und End-to-End-Abnahme

**Files:** keine (nur Deploy + Verifikation)

**Interfaces:**
- Consumes: alles aus Task 1–4.
- Produces: Bestätigung, dass ODI-291 in Produktion vollständig funktioniert (Definition of Done aus der Spec).

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy abwarten**

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓.

- [ ] **Step 3: Beide Operationen live gegen Produktion verifizieren**

```bash
curl -s -X POST https://sorare-for-beginners.de/api/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin"}}'

curl -s -X POST https://sorare-for-beginners.de/api/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerSearch","variables":{"query":"Mbappe","pageSize":3}}'
```

Expected: Beide liefern echte, aktuelle Sorare-Daten (kein `<?php`-Quellcode, keine Fehler).

- [ ] **Step 4: Jira-Ticket aktualisieren**

Kommentar zu [ODI-291](https://odenwaldpatrick.atlassian.net/browse/ODI-291) hinzufügen, dass die Anbindung live verifiziert wurde (Link zum Commit/PR).
