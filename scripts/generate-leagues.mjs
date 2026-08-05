const SO5_TIER_SLUGS = new Set([
  'seasonal-champions',
  'seasonal-contenders',
  'seasonal-under_twenty_one',
  'seasonal-rest_of_the_world',
])

const COUNTRY_NAME_DE = {
  Norway: 'Norwegen',
  Croatia: 'Kroatien',
  Argentina: 'Argentinien',
  Germany: 'Deutschland',
  France: 'Frankreich',
  Brazil: 'Brasilien',
  Mexico: 'Mexiko',
  Russia: 'Russland',
  Switzerland: 'Schweiz',
  Spain: 'Spanien',
  Italy: 'Italien',
  Chile: 'Chile',
  Ecuador: 'Ecuador',
  Peru: 'Peru',
  China: 'China',
  Colombia: 'Kolumbien',
  Austria: 'Österreich',
  Turkey: 'Türkei',
  Denmark: 'Dänemark',
}

function germanCountryName(englishName) {
  const name = COUNTRY_NAME_DE[englishName]
  if (!name) {
    throw new Error(`No German translation for country "${englishName}" — add it to COUNTRY_NAME_DE`)
  }
  return name
}

const query = `
  query {
    so5 {
      so5Competitions(sport: FOOTBALL) {
        slug
        displayName
        competitions {
          slug
          name
          country {
            name
          }
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

const topLeagues = realLeagues.map((league) => {
  if (league.competitions.length !== 1) {
    throw new Error(`Expected exactly 1 competition for "${league.displayName}", got ${league.competitions.length}`)
  }
  return { slug: league.competitions[0].slug, name: league.displayName }
})
const topSlugSet = new Set(topLeagues.map((l) => l.slug))

const extraLeagues = []
const seenExtraSlugs = new Set()
for (const tierComp of [...champion.competitions, ...contender.competitions]) {
  if (topSlugSet.has(tierComp.slug) || seenExtraSlugs.has(tierComp.slug)) continue
  seenExtraSlugs.add(tierComp.slug)
  extraLeagues.push({ slug: tierComp.slug, name: `${tierComp.name} (${germanCountryName(tierComp.country.name)})` })
}

const allLeagues = [...topLeagues, ...extraLeagues]
const allSlugSet = new Set(allLeagues.map((l) => l.slug))

for (const slug of champion.competitions.map((c) => c.slug)) {
  if (!allSlugSet.has(slug)) throw new Error(`Champion league slug "${slug}" missing from generated LEAGUES`)
}
for (const slug of contender.competitions.map((c) => c.slug)) {
  if (!allSlugSet.has(slug)) throw new Error(`Contender league slug "${slug}" missing from generated LEAGUES`)
}

function formatLeagues(leagues) {
  return leagues.map((l) => `  { slug: '${l.slug}', name: '${l.name.replace(/'/g, "\\'")}' },`).join('\n')
}
function formatSlugs(competitions) {
  return competitions.map((c) => `  '${c.slug}',`).join('\n')
}

console.log('export const LEAGUES = [')
console.log(formatLeagues(allLeagues))
console.log('] as const\n')

console.log('export const CHAMPION_LEAGUE_SLUGS: string[] = [')
console.log(formatSlugs(champion.competitions))
console.log(']\n')

console.log('export const CONTENDER_LEAGUE_SLUGS: string[] = [')
console.log(formatSlugs(contender.competitions))
console.log(']')
