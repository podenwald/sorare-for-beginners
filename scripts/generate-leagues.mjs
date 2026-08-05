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
