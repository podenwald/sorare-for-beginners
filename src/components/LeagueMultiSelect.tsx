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
