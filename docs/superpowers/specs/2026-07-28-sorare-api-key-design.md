# Design: Sorare API-Key für erhöhtes Rate-Limit

**Jira:** [ODI-296](https://odenwaldpatrick.atlassian.net/browse/ODI-296) (Epic [ODI-290](https://odenwaldpatrick.atlassian.net/browse/ODI-290))
**Datum:** 2026-07-28

## Kontext

Der PHP-Proxy (`public/api/sorare-proxy.php`, aus ODI-291) leitet aktuell alle Anfragen unauthentifiziert
an `api.sorare.com/graphql` weiter — Sorares dokumentiertes Limit dafür sind **20 Anfragen/Minute**.
Ein Sorare-API-Key erhöht dieses Limit auf **600 Anfragen/Minute**. Der Nutzer hat bereits einen Key
von Sorare erhalten.

## Recherche-Ergebnisse

- Header-Format laut [github.com/sorare/api](https://github.com/sorare/api): `APIKEY: <key>` — Klartext,
  kein `Bearer`-Präfix, kein anderer Wrapper.
- Ein **ungültiger** Key wird von Sorare **stillschweigend ignoriert** (live getestet: Anfrage mit
  offensichtlich falschem Key liefert normal `200` mit echten Daten, kein Fehler). Das heißt: ein
  einzelner Request kann nicht beweisen, ob der Key tatsächlich ankommt und wirkt — nur ein
  Burst-Test gegen das dokumentierte Rate-Limit kann das zeigen (siehe Tests unten).
- Payload-/Komplexitätslimits sind für authentifizierte (API-Key-)Anfragen ebenfalls höher (Tiefe
  12 statt 7, Komplexität 30.000 statt 500) — nicht Ziel dieses Tickets, aber ein Nebeneffekt.

## Architektur-Besonderheit

Die bestehenden GitHub Secrets (`FTP_USERNAME`/`FTP_PASSWORT`) werden nur **innerhalb** des
GitHub-Actions-Workflows verwendet (für den FTP-Deploy-Schritt) und landen nie im deployten Code.
Der Sorare-API-Key muss aber **zur Laufzeit** im PHP-Proxy auf dem Netcup-Server verfügbar sein —
PHP auf Shared-Hosting hat keinen Zugriff auf GitHub-Actions-Umgebungsvariablen. Der Wert muss daher
während des CI-Laufs in eine Datei geschrieben werden, die mit deployed wird.

## Entscheidung: CI generiert eine PHP-Config-Datei

- Neues GitHub Secret: `SORARE_API_KEY`.
- Neuer Workflow-Schritt in `.github/workflows/main.yml`, **vor** "Build for production" (Vite kopiert
  `public/` beim Build nach `dist/` — die Datei muss vorher existieren, damit sie mitkopiert wird):
  generiert `public/api/config.php` aus dem Secret.
- Escaping: der Wert wird als PHP-**Single-Quote**-String eingebettet (nicht Double-Quote), um zu
  verhindern, dass ein `$` im Key von PHP als Variablen-Interpolation missverstanden wird. Nur `\`
  und `'` müssen dafür escaped werden.
- `public/api/config.php` kommt ins `.gitignore` — wird nie committet, nur zur Deploy-Zeit generiert.
- Verworfene Alternativen: manuelle Konfiguration im Netcup-Kundenpanel (nicht in Git nachvollziehbar,
  manueller Schritt außerhalb der Pipeline); separater FTP-Upload nur für die Config-Datei (unnötige
  Komplexität — der Wert ist dem CI-Runner ohnehin anvertraut, genau wie `FTP_PASSWORT` heute).

## Änderungen an `public/api/sorare-proxy.php`

```php
$config = @include __DIR__ . '/config.php';
$apiKey = is_array($config) && !empty($config['sorareApiKey']) ? $config['sorareApiKey'] : null;

$headers = ['Content-Type: application/json'];
if ($apiKey !== null) {
    $headers[] = 'APIKEY: ' . $apiKey;
}
```

`$headers` ersetzt das bisherige fest verdrahtete `['Content-Type: application/json']` in
`CURLOPT_HTTPHEADER`. Ohne `config.php` (z. B. lokal via `php -S`, wo die Datei nie existiert)
verhält sich der Proxy exakt wie bisher — kein Sonderfall, keine Änderung an bestehenden
Test-Workflows aus ODI-291/293.

## Tests

- **Lokal, ohne `config.php`:** bestehender Ablauf (`php -S` + curl) muss weiterhin unverändert
  funktionieren — Regressionscheck, dass das Fehlen der Datei den Proxy nicht bricht.
- **Lokal, mit temporärer Test-`config.php`:** strukturell prüfen, dass der `APIKEY`-Header korrekt
  gebaut wird (Code-Review + lokaler Test mit einem Test-Wert) — da ein falscher Wert von Sorare
  stillschweigend ignoriert wird, beweist das nicht die Wirkung, nur die korrekte Header-Konstruktion.
- **Nach Deploy mit echtem Secret, Burst-Test:** 25 `playerDetail`-Anfragen (Slug `kylian-mbappe-lottin`)
  innerhalb einer Minute nacheinander an die Produktions-URL schicken. Schlägt keine mit `429` fehl,
  ist das der Beweis, dass der Key wirkt (ohne Key wäre das dokumentierte Limit von 20/Minute
  überschritten).
- Kein PHPUnit-Setup — konsistent mit dem bisherigen Vorgehen für `sorare-proxy.php`.

## Out of Scope

- Rotation/Ablauf des API-Keys.
- Nutzung der höheren Komplexitäts-/Tiefenlimits für größere Queries (Nebeneffekt, nicht Ziel).
- Verhalten bei tatsächlichem `429` (Retry-Logik) — aktuell nicht implementiert, auch nicht vor
  diesem Ticket; bleibt unverändert.
