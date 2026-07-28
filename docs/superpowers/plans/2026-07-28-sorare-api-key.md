# Sorare API-Key für erhöhtes Rate-Limit (ODI-296) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der PHP-Proxy sendet einen Sorare API-Key als `APIKEY`-Header mit, um das Rate-Limit von 20 auf 600 Anfragen/Minute zu erhöhen.

**Architecture:** Ein neues GitHub Secret (`SORARE_API_KEY`) wird von einem neuen CI-Schritt vor dem Build in eine nie committete PHP-Config-Datei geschrieben, die Vite automatisch mit ins Deploy-Verzeichnis kopiert; der Proxy liest diese Datei zur Laufzeit und ergänzt den Header nur, wenn ein Key vorhanden ist.

**Tech Stack:** PHP (Netcup, 7.4.33), Node.js (CI-Skript), GitHub Actions.

## Global Constraints

- Header-Format: `APIKEY: <key>` — Klartext, kein `Bearer`-Präfix.
- Neues GitHub Secret: `SORARE_API_KEY`.
- Neue Datei `public/api/config.php` wird nie committet (`.gitignore`) und nur zur Deploy-Zeit vom CI-Workflow generiert.
- Der Wert wird als PHP-**Single-Quote**-String eingebettet (nur `\` und `'` escaped) — verhindert, dass ein `$` im Key von PHP als Variablen-Interpolation missverstanden wird.
- Ohne `config.php` (z. B. lokal) verhält sich der Proxy exakt wie bisher — kein Sonderfall.
- Kein PHPUnit-Setup — konsistent mit dem bisherigen Vorgehen für `sorare-proxy.php`.
- Ein ungültiger API-Key wird von Sorare stillschweigend ignoriert (kein Fehler) — Wirkung kann nur per Burst-Test gegen das dokumentierte 20/Minute-Limit bewiesen werden, nicht per Einzelrequest.
- **Voraussetzung für Task 3:** Das GitHub Secret `SORARE_API_KEY` muss mit dem echten, vom Nutzer bereits erhaltenen Sorare-API-Key befüllt sein, bevor Task 3 ausgeführt wird — das kann nur der Nutzer selbst in den Repo-Settings eintragen.

---

## Task 1: PHP-Proxy liest Config-Datei und ergänzt Header

**Files:**
- Modify: `public/api/sorare-proxy.php`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nichts Neues (nur Dateisystem-Zugriff auf `public/api/config.php`, falls vorhanden).
- Produces: `public/api/sorare-proxy.php` sendet den `APIKEY`-Header an Sorare, wenn `config.php` einen nicht-leeren `sorareApiKey`-Eintrag liefert — konsumiert von Task 2 (die CI-generierte Datei) und Task 3 (End-to-End-Verifikation).

- [ ] **Step 1: `.gitignore` ergänzen**

Modify `.gitignore`, füge am Ende hinzu:

```gitignore

# Generated at deploy time from the SORARE_API_KEY secret — never commit
public/api/config.php
```

- [ ] **Step 2: `sorare-proxy.php` anpassen**

In `public/api/sorare-proxy.php` den Block

```php
$ch = curl_init(SORARE_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
```

ersetzen durch:

```php
$config = @include __DIR__ . '/config.php';
$apiKey = is_array($config) && !empty($config['sorareApiKey']) ? $config['sorareApiKey'] : null;

$headers = ['Content-Type: application/json'];
if ($apiKey !== null) {
    $headers[] = 'APIKEY: ' . $apiKey;
}

$ch = curl_init(SORARE_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_TIMEOUT => 10,
]);
```

- [ ] **Step 3: Regressionstest lokal ohne `config.php`**

Falls `php` lokal nicht installiert ist: `brew install php`

Run: `php -S localhost:8090 -t public/api` (separates Terminal offen lassen)

```bash
curl -s -X POST http://localhost:8090/sorare-proxy.php \
  -H 'content-type: application/json' \
  -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin","seasonStartYear":2025}}'
```

Expected: JSON mit echten Spielerdaten (`"displayName":"Kylian Mbappé"`, ...) — unverändert gegenüber vor dieser Änderung, da `public/api/config.php` nicht existiert.

- [ ] **Step 4: Header-Konstruktion strukturell prüfen (ohne und mit Config-Datei)**

Ohne `config.php` (sollte gerade nicht existieren):

```bash
php -r '
$config = @include "public/api/config.php";
$apiKey = is_array($config) && !empty($config["sorareApiKey"]) ? $config["sorareApiKey"] : null;
$headers = ["Content-Type: application/json"];
if ($apiKey !== null) { $headers[] = "APIKEY: " . $apiKey; }
var_dump($headers);
'
```

Expected:
```
array(1) {
  [0]=>
  string(24) "Content-Type: application/json"
}
```

Jetzt eine temporäre Test-Datei anlegen:

```bash
cat > public/api/config.php << 'PHPEOF'
<?php
return [
    'sorareApiKey' => 'local-test-key-value',
];
PHPEOF
```

Denselben `php -r`-Befehl aus diesem Step erneut ausführen.

Expected:
```
array(2) {
  [0]=>
  string(24) "Content-Type: application/json"
  [1]=>
  string(35) "APIKEY: local-test-key-value"
}
```

Temporäre Datei wieder entfernen (sie ist ohnehin gitignored, aber für einen sauberen lokalen Stand):

```bash
rm public/api/config.php
```

- [ ] **Step 5: Commit**

```bash
git add public/api/sorare-proxy.php .gitignore
git commit -m "feat: read Sorare API key from config file and send APIKEY header"
```

---

## Task 2: CI generiert die Config-Datei aus dem Secret

**Files:**
- Create: `scripts/generate-sorare-config.cjs`
- Modify: `.github/workflows/main.yml`

**Interfaces:**
- Consumes: Umgebungsvariable `SORARE_API_KEY` (vom Workflow aus dem gleichnamigen GitHub Secret gesetzt).
- Produces: `public/api/config.php` mit dem Inhalt `<?php return ['sorareApiKey' => '<escaped-key>'];` — wird von Vite automatisch nach `dist/api/config.php` kopiert (Task 1 liest genau diese Datei) und von Task 3 im echten Deploy verifiziert.

- [ ] **Step 1: Generator-Skript schreiben**

Erstelle `scripts/generate-sorare-config.cjs`:

```javascript
const fs = require('fs')
const path = require('path')

const key = process.env.SORARE_API_KEY || ''
const escaped = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const content = `<?php\nreturn [\n    'sorareApiKey' => '${escaped}',\n];\n`

fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'config.php'), content)
```

(Endung `.cjs`, damit das Skript trotz `"type": "module"` in `package.json` als CommonJS mit `require()` läuft.)

- [ ] **Step 2: Skript lokal mit einem kniffligen Testwert prüfen**

```bash
SORARE_API_KEY="te\$t'key\\value" node scripts/generate-sorare-config.cjs
cat public/api/config.php
```

Expected:
```php
<?php
return [
    'sorareApiKey' => 'te$t\'key\\value',
];
```

(Das `$` bleibt unescaped, da PHP Single-Quote-Strings nicht interpolieren — genau das soll geprüft werden. `'` und `\` sind escaped.)

```bash
php -l public/api/config.php
```

Expected: `No syntax errors detected in public/api/config.php`

```bash
rm public/api/config.php
```

- [ ] **Step 3: Workflow-Schritt ergänzen**

In `.github/workflows/main.yml`, den neuen Schritt zwischen `Run tests` und `Build for production` einfügen:

```yaml
      - name: Run tests
        run: npm test

      - name: Generate Sorare API key config
        env:
          SORARE_API_KEY: ${{ secrets.SORARE_API_KEY }}
        run: node scripts/generate-sorare-config.cjs

      - name: Build for production
        run: npm run build
        env:
          NODE_ENV: production
          CI: true
```

(Reihenfolge wichtig: Vite kopiert `public/` beim Build nach `dist/` — die Config-Datei muss vorher existieren, damit sie mitkopiert wird.)

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-sorare-config.cjs .github/workflows/main.yml
git commit -m "feat: generate Sorare API key config from secret during CI deploy"
```

---

## Task 3: Deploy und Burst-Test-Verifikation

**Voraussetzung:** Das GitHub Secret `SORARE_API_KEY` muss bereits mit dem echten Sorare-API-Key befüllt sein (nur der Nutzer kann das in den Repo-Settings eintragen — falls noch nicht geschehen, hier stoppen und beim Nutzer nachfragen, nicht raten oder überspringen).

**Files:** keine (nur Deploy + Verifikation)

**Interfaces:**
- Consumes: alles aus Task 1–2.
- Produces: Bestätigung, dass der API-Key live wirkt (Definition of Done für ODI-296).

- [ ] **Step 1: Push**

```bash
git push origin main
```

- [ ] **Step 2: Deploy abwarten**

Run: `gh run watch $(gh run list --repo podenwald/sorare-for-beginners --limit 1 --json databaseId --jq '.[0].databaseId') --repo podenwald/sorare-for-beginners --exit-status`
Expected: Workflow-Run endet mit ✓, inklusive des neuen Schritts "Generate Sorare API key config".

- [ ] **Step 3: Burst-Test — 25 Anfragen in unter einer Minute**

```bash
for i in $(seq 1 25); do
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST https://sorare-for-beginners.de/api/sorare-proxy.php \
    -H 'content-type: application/json' \
    -d '{"operation":"playerDetail","variables":{"slug":"kylian-mbappe-lottin","seasonStartYear":2025}}')
  echo "Request $i: HTTP $status"
done
```

Expected: alle 25 Zeilen zeigen `HTTP 200` — keine `HTTP 429`. Ohne wirksamen API-Key wäre bei mehr als 20 Anfragen pro Minute mindestens eine `429`-Antwort zu erwarten (Sorares dokumentiertes anonymes Limit).

- [ ] **Step 4: Jira-Ticket kommentieren**

Kommentar zu [ODI-296](https://odenwaldpatrick.atlassian.net/browse/ODI-296) hinzufügen: API-Key ist live im Proxy hinterlegt, Burst-Test mit 25 Anfragen/Minute ohne `429` bestanden, Commit-SHA referenzieren.
