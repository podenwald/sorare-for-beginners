import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlayer, searchPlayers } from './sorareClient'
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
        variables: { slug: 'kylian-mbappe-lottin', seasonStartYear: expectedSeasonStartYear },
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
