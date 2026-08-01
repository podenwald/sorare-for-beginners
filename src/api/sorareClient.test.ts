import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayer, searchPlayers, searchPlayersByLeagueAndPosition } from './sorareClient'
import { getCurrentSeasonStartYear } from './season'
import { SorareApiError } from './types'

function mockFetchOnce(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
    }),
  )
}

function mockFetchSequence(responses: unknown[]) {
  let call = 0
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation(() => {
      const body = responses[call]
      call += 1
      return Promise.resolve({ json: () => Promise.resolve(body) })
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
          l5: null,
          l10: null,
          l40: null,
          stats: { appearances: 31, minutesPlayed: 2606, substituteIn: 2, substituteOut: 9 },
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')
    const expectedSeasonStartYear = getCurrentSeasonStartYear()

    expect(fetch).toHaveBeenCalledWith('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'playerDetail',
        variables: { slug: 'kylian-mbappe-lottin', seasonStartYear: expectedSeasonStartYear, rarity: 'limited' },
      }),
    })
    expect(player.displayName).toBe('Kylian Mbappé')
    expect(player.recentSo5Scores).toEqual([{ score: 87.7, gameDate: '2026-07-18T21:00:00Z' }])
    expect(player.seasonStats).toEqual({ appearances: 31, minutesPlayed: 2606, substituteIn: 2, substituteOut: 9 })
  })

  it('maps a null stats field to seasonStats: null', async () => {
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
          allSo5Scores: { nodes: [] },
          l5: null,
          l10: null,
          l40: null,
          stats: null,
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.seasonStats).toBeNull()
  })

  it('maps l5/l10/l40 averageScore fields to sorareAverageScores', async () => {
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
          allSo5Scores: { nodes: [] },
          l5: 74,
          l10: 70,
          l40: 64,
          stats: null,
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.sorareAverageScores).toEqual({ l5: 74, l10: 70, l40: 64 })
  })

  it('maps missing averageScore data to null fields in sorareAverageScores', async () => {
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
          allSo5Scores: { nodes: [] },
          l5: null,
          l10: null,
          l40: null,
          stats: null,
        },
      },
    })

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.sorareAverageScores).toEqual({ l5: null, l10: null, l40: null })
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

describe('getPlayer market prices', () => {
  function playerDetailResponse(classicPrice: unknown, inSeasonPrice: unknown) {
    return {
      data: {
        anyPlayer: {
          slug: 'kylian-mbappe-lottin',
          displayName: 'Kylian Mbappé',
          position: 'Forward',
          age: 27,
          activeClub: { name: 'Real Madrid', slug: 'real-madrid-madrid' },
          activeInjuries: [],
          activeSuspensions: [],
          allSo5Scores: { nodes: [] },
          l5: null,
          l10: null,
          l40: null,
          stats: null,
          classicPrice,
          inSeasonPrice,
        },
      },
    }
  }

  it('maps a live sale offer on both cards to eurCents values', async () => {
    mockFetchOnce(
      playerDetailResponse(
        { liveSingleSaleOffer: { receiverSide: { amounts: { eurCents: 5498 } } } },
        { liveSingleSaleOffer: { receiverSide: { amounts: { eurCents: 6000 } } } },
      ),
    )

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({ classicEurCents: 5498, inSeasonEurCents: 6000 })
  })

  it('maps a card with no active offer (liveSingleSaleOffer: null) to null', async () => {
    mockFetchOnce(
      playerDetailResponse({ liveSingleSaleOffer: null }, { liveSingleSaleOffer: null }),
    )

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({ classicEurCents: null, inSeasonEurCents: null })
  })

  it('maps no matching card at all (classicPrice/inSeasonPrice: null) to null', async () => {
    mockFetchOnce(playerDetailResponse(null, null))

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({ classicEurCents: null, inSeasonEurCents: null })
  })

  it('maps a live offer with no eurCents value (eurCents: null) to null', async () => {
    mockFetchOnce(
      playerDetailResponse(
        { liveSingleSaleOffer: { receiverSide: { amounts: { eurCents: null } } } },
        { liveSingleSaleOffer: { receiverSide: { amounts: { eurCents: null } } } },
      ),
    )

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({ classicEurCents: null, inSeasonEurCents: null })
  })

  it('passes the requested rarity as the rarity variable, defaulting to limited', async () => {
    mockFetchOnce(playerDetailResponse(null, null))

    await getPlayer('kylian-mbappe-lottin')

    const call = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.variables.rarity).toBe('limited')
  })

  it('passes an explicit rarity through as the rarity variable', async () => {
    mockFetchOnce(playerDetailResponse(null, null))

    await getPlayer('kylian-mbappe-lottin', 'super_rare')

    const call = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.variables.rarity).toBe('super_rare')
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

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Defender')

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

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Forward')

    expect(hits.map((hit) => hit.slug)).toEqual(['scored-starter', 'no-data-starter'])
  })

  it('skips a club with no data and returns an empty array when the competition is not found', async () => {
    mockFetchSequence([
      { data: { football: { competition: null } } },
    ])

    const hits = await searchPlayersByLeagueAndPosition('unknown-league', 'Defender')

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

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Goalkeeper')

    expect(hits).toEqual([
      { slug: 'a-player', displayName: 'A Player', positions: ['Goalkeeper'], clubName: 'Club A' },
    ])
  })

  it('merges and sorts results across multiple clubs, keeping each hit tagged with its own club', async () => {
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

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Defender')

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

    const hits = await searchPlayersByLeagueAndPosition('bundesliga-de', 'Defender')

    expect(hits).toEqual([
      { slug: 'a-starter', displayName: 'A Starter', positions: ['Defender'], clubName: 'Club A' },
    ])
  })

  it('returns an empty array when the league has zero clubs', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'Empty League', clubs: { nodes: [] } } } } },
    ])

    const hits = await searchPlayersByLeagueAndPosition('empty-league', 'Defender')

    expect(hits).toEqual([])
  })
})
