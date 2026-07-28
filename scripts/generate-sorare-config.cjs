const fs = require('fs')
const path = require('path')

const key = (process.env.SORARE_API_KEY || '').trim()

if (!key) {
  console.warn('SORARE_API_KEY is empty — deploying without an API key (Sorare rate limit stays at 20 req/min).')
} else if (/[\x00-\x1f\x7f]/.test(key)) {
  console.error('SORARE_API_KEY contains a control character (e.g. an embedded newline) — refusing to write a malformed header value.')
  process.exit(1)
}

const escaped = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const content = `<?php\nreturn [\n    'sorareApiKey' => '${escaped}',\n];\n`

fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'config.php'), content)
