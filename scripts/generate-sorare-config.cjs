const fs = require('fs')
const path = require('path')

const key = process.env.SORARE_API_KEY || ''
const escaped = key.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
const content = `<?php\nreturn [\n    'sorareApiKey' => '${escaped}',\n];\n`

fs.writeFileSync(path.join(__dirname, '..', 'public', 'api', 'config.php'), content)
