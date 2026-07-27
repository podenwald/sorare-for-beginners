# Design: Sorare-API-Anbindung für Spieler-/Marktdaten

**Jira:** [ODI-291](https://odenwaldpatrick.atlassian.net/browse/ODI-291) (Epic [ODI-290](https://odenwaldpatrick.atlassian.net/browse/ODI-290))
**Datum:** 2026-07-28

## Kontext

Sorare for Beginners soll Sorare Managern eine Marktanalyse von Spielern bieten. Grundlage dafür sind
Spieler- und Marktdaten aus der offiziellen Sorare-API (GraphQL, `api.sorare.com/graphql`,
siehe [github.com/sorare/api](https://github.com/sorare/api)). ODI-291 legt die technische Anbindung
an diese API, auf der die spätere Bewertungslogik (ODI-293) und Formationsansicht (ODI-294) aufbauen.

## Rechercheergebnisse (vor dem Design geprüft)

- Abfragen zu öffentlichen Spielerdaten (`anyPlayer`, `searchPlayers`) funktionieren **ohne
  Authentifizierung** — kein JWT/Login nötig, solange nur öffentliche Felder abgefragt werden
  (bestätigt durch Testanfragen ohne Auth-Header).
- Die Sorare-API sendet **keine CORS-Freigabe** (`Access-Control-Allow-Origin`) — ein Browser kann
  sie nicht direkt von einer fremden Domain aus aufrufen. Es braucht einen Server dazwischen.
- Das Netcup-Hosting (`hosting119408.a2fac.netcup.net`) folgt dem Muster von Netcups
  Standard-Webhosting-Produkten — diese unterstützen PHP, aber kein Node.js. Muss als erster
  Implementierungsschritt praktisch verifiziert werden (siehe Risiken).
- Relevante, bestätigte Schema-Felder für später (Story ODI-293): `allSo5Scores` (Punktzahl-Historie),
  `activeInjuries`, `activeSuspensions` (Beständigkeit), `activeClub.activeCompetitions` (Liga-Zuordnung).

## Entscheidungen aus der Discovery

- **Nur öffentliche Sorare-Daten** werden benötigt (keine privaten Kontodaten wie eigenes Team/Gebote)
  → kein Sorare-Login/JWT-Flow in diesem Ticket nötig.
- **PHP-Proxy auf dem bestehenden Netcup-Webspace**, keine separate Serverless-Lösung — nutzt die
  bestehende FTP-Deploy-Pipeline weiter.
- **Whitelist statt offenem Durchleiter**: Der Proxy lässt nur fest hinterlegte Operationen zu, kein
  beliebiger GraphQL-Text vom Client.
- **v1-Whitelist:** `playerDetail(slug)` und `playerSearch(query, page, pageSize)`.

## Architektur

```
Frontend (React)  →  /api/sorare-proxy.php (gleiche Domain)  →  api.sorare.com/graphql
```

Da Frontend und Proxy in Produktion auf derselben Domain (`sorare-for-beginners.de`) ausgeliefert
werden, ist der Aufruf **same-origin** — es sind keine CORS-Header in der PHP-Antwort nötig. CORS ist
nur in der lokalen Entwicklung relevant (siehe Deployment).

### PHP-Proxy (`server/sorare-proxy.php` → ausgeliefert unter `public/api/sorare-proxy.php`)

- Nimmt `POST { operation: "playerDetail" | "playerSearch", variables: {...} }` entgegen.
- Schlägt `operation` in einer serverseitig fest hinterlegten Map auf die zugehörige GraphQL-Query auf.
- Leitet die Anfrage mit `variables` an `https://api.sorare.com/graphql` weiter (kein Auth-Header).
- Antwortet im selben `{ data, errors }`-Format wie Sorare selbst.

### Frontend-Client (`src/api/sorareClient.ts`)

- Schlanker `fetch`-Wrapper (kein Apollo/urql), zwei typisierte Funktionen:
  - `getPlayer(slug: string): Promise<Player>`
  - `searchPlayers(params: { query: string; page?: number; pageSize?: number }): Promise<PlayerSearchResult>`
- Typen (`src/api/types.ts`) bilden reale Sorare-Felder ab: Name, Position, aktueller Verein/Liga,
  SO5-Score-Historie, aktive Verletzungen/Sperren.
- Wirft bei Fehlern einen typisierten `SorareApiError` (Message + optionale GraphQL-Fehlerliste).

## Fehlerbehandlung

- Unbekannte `operation` / fehlende Variablen → HTTP 400, `{ errors: [{ message: "Unknown operation" }] }`.
- Sorare-API nicht erreichbar/Timeout → HTTP 502, generische Fehlermeldung ohne interne Details.
- Echte GraphQL-Fehler von Sorare werden unverändert durchgereicht.
- Der Frontend-Client unterscheidet über `SorareApiError` zwischen "keine Treffer" und "API-Fehler".

## Tests

- `sorareClient.ts` bekommt Unit-Tests mit Vitest (`fetch` gemockt): Erfolgsfälle (Spieler-Detail,
  Suche) und Fehlerfälle (Netzwerkfehler, GraphQL-Fehler, unbekannte Operation).
- Kein automatisierter Test gegen die echte Sorare-API in CI (externe Abhängigkeit, würde CI instabil
  machen). Stattdessen manuelle Verifikation nach dem Deploy (curl gegen den echten Endpoint) als Teil
  der Definition of Done.
- Für die PHP-Datei kein eigenes PHPUnit-Setup — Logik bleibt bewusst minimal (Whitelist-Lookup +
  Weiterleitung), Review durch Lesen ausreichend.

## Deployment

Keine Änderung am bestehenden GitHub-Actions-Workflow nötig:

- PHP-Datei liegt in `public/api/sorare-proxy.php` — Vite kopiert den Inhalt von `public/` automatisch
  unverändert nach `dist/`, landet also bei `dist/api/sorare-proxy.php` und wird von der bestehenden
  FTP-Pipeline mit ausgeliefert.
- Lokale Entwicklung: `vite.config.ts` bekommt einen Dev-Server-Proxy (`server.proxy`), der `/api/*`
  lokal an die deployte PHP-Datei weiterleitet — läuft serverseitig (Node), unterliegt keiner
  Browser-CORS-Prüfung.

```
sorare-for-beginners/
├── public/api/sorare-proxy.php     # Whitelist + Weiterleitung an Sorare
├── src/api/
│   ├── sorareClient.ts             # fetch-Wrapper, 2 typisierte Funktionen
│   ├── sorareClient.test.ts        # Vitest, fetch gemockt
│   └── types.ts                    # Player, Club, Position, ...
└── vite.config.ts                  # + Dev-Server-Proxy für /api
```

## Out of Scope (spätere Tickets)

- Externe Datenquellen theanalyst.com/transfermarkt.de (ODI-292).
- Bewertungslogik/Scoring (ODI-293).
- Formationsansicht (ODI-294).
- Sorare-Login/JWT-Flow (nur relevant, falls später private Kontodaten gebraucht werden).

## Risiken

- **Unverifiziert:** Ob das Netcup-Paket tatsächlich PHP unterstützt, ist eine begründete Annahme
  (Hosting-Muster), aber nicht bestätigt. Erster Implementierungsschritt: minimale Testdatei
  hochladen und aufrufen, um das zu verifizieren, bevor die eigentliche Proxy-Logik gebaut wird.
- Sorare könnte die Netcup-Server-IP künftig raten-limitieren oder blockieren, falls die Nutzung
  stark wächst — für v1 mit begrenztem Nutzerkreis nicht kritisch, aber zu beobachten.
