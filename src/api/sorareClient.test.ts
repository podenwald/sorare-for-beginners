import { afterEach, describe, expect, it, vi } from 'vitest'
import { getClubRoster, getLeagueClubs, getPlayer, searchPlayers, searchPlayersByLeagueAndPosition } from './sorareClient'
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

// ODI-320: getPlayer issues a follow-up 'auctionFallbackCandidates' call whenever either side lacks
// a primary offer. Appended to mockFetchSequence for tests where the fallback is expected to find
// nothing, so the outcome (still "kein Angebot") stays the same as before the fallback existed.
const AUCTION_FALLBACK_EMPTY = {
  data: { anyPlayer: { classicCandidates: { nodes: [] }, inSeasonCandidates: { nodes: [] } } },
}

describe('getPlayer', () => {
  it('maps a successful response to a Player', async () => {
    mockFetchSequence([
      {
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
      },
      AUCTION_FALLBACK_EMPTY,
    ])

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
    mockFetchSequence([
      {
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
      },
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.seasonStats).toBeNull()
  })

  it('maps l5/l10/l40 averageScore fields to sorareAverageScores', async () => {
    mockFetchSequence([
      {
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
      },
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.sorareAverageScores).toEqual({ l5: 74, l10: 70, l40: 64 })
  })

  it('maps missing averageScore data to null fields in sorareAverageScores', async () => {
    mockFetchSequence([
      {
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
      },
      AUCTION_FALLBACK_EMPTY,
    ])

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

  it('maps a live sale offer on both cards to eurCents values and their card slugs', async () => {
    mockFetchOnce(
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: 5498, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
        },
        {
          slug: 'kylian-mbappe-2025-limited-2',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: 6000, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
        },
      ),
    )

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({
      classicEurCents: 5498,
      inSeasonEurCents: 6000,
      classicOfferAmount: null,
      inSeasonOfferAmount: null,
      classicCardSlug: 'kylian-mbappe-2024-limited-1',
      inSeasonCardSlug: 'kylian-mbappe-2025-limited-2',
      classicIsAuction: false,
      inSeasonIsAuction: false,
      classicAuctionEndDate: null,
      inSeasonAuctionEndDate: null,
      rarity: 'limited',
    })
  })

  it('maps a card with no active offer (liveSingleSaleOffer: null) to null, including no card slug', async () => {
    mockFetchSequence([
      playerDetailResponse(
        { slug: 'kylian-mbappe-2024-limited-1', liveSingleSaleOffer: null },
        { slug: 'kylian-mbappe-2025-limited-2', liveSingleSaleOffer: null },
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({
      classicEurCents: null,
      inSeasonEurCents: null,
      classicOfferAmount: null,
      inSeasonOfferAmount: null,
      classicCardSlug: null,
      inSeasonCardSlug: null,
      classicIsAuction: false,
      inSeasonIsAuction: false,
      classicAuctionEndDate: null,
      inSeasonAuctionEndDate: null,
      rarity: 'limited',
    })
  })

  it('maps no matching card at all (classicPrice/inSeasonPrice: null) to null', async () => {
    mockFetchSequence([playerDetailResponse(null, null), AUCTION_FALLBACK_EMPTY])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({
      classicEurCents: null,
      inSeasonEurCents: null,
      classicOfferAmount: null,
      inSeasonOfferAmount: null,
      classicCardSlug: null,
      inSeasonCardSlug: null,
      classicIsAuction: false,
      inSeasonIsAuction: false,
      classicAuctionEndDate: null,
      inSeasonAuctionEndDate: null,
      rarity: 'limited',
    })
  })

  it('maps a live offer priced in Solana (lamport) to a SOL offerAmount when eurCents is null', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'michael-olise-2025-limited-278',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: {
                eurCents: null,
                gbpCents: null,
                usdCents: null,
                lamport: '1320000000',
                wei: null,
                referenceCurrency: 'LAMPORT',
              },
            },
          },
        },
        { slug: 'michael-olise-2025-limited-278', liveSingleSaleOffer: null },
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBeNull()
    expect(player.marketPrices.classicOfferAmount).toEqual({ currency: 'SOL', value: 1.32 })
    expect(player.marketPrices.classicCardSlug).toBe('michael-olise-2025-limited-278')
  })

  it('maps a live offer priced in ETH (wei) to an ETH offerAmount when eurCents is null', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: {
                eurCents: null,
                gbpCents: null,
                usdCents: null,
                lamport: null,
                wei: '54000000000000000',
                referenceCurrency: 'WEI',
              },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicOfferAmount).toEqual({ currency: 'ETH', value: 0.054 })
  })

  it('maps a live offer priced in GBP to a GBP offerAmount when eurCents is null', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: null, gbpCents: 4500, usdCents: null, lamport: null, wei: null, referenceCurrency: 'GBP' },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicOfferAmount).toEqual({ currency: 'GBP', value: 45 })
  })

  it('maps a live offer priced in USD to a USD offerAmount when eurCents is null', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: null, gbpCents: null, usdCents: 5000, lamport: null, wei: null, referenceCurrency: 'USD' },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicOfferAmount).toEqual({ currency: 'USD', value: 50 })
  })

  it('prefers eurCents over a native-currency offerAmount when both happen to be present', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: {
                eurCents: 5498,
                gbpCents: null,
                usdCents: null,
                lamport: '1000000000',
                wei: null,
                referenceCurrency: 'EUR',
              },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBe(5498)
    expect(player.marketPrices.classicOfferAmount).toBeNull()
  })

  it('trusts referenceCurrency over field presence when a stray, non-matching field is also populated', async () => {
    // referenceCurrency says GBP, but `wei` (belonging to a different currency) is also non-null —
    // a legacy/inconsistent-looking response that should never happen in practice, but proves the
    // fix genuinely switches on referenceCurrency rather than just checking "which field is set".
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: {
                eurCents: null,
                gbpCents: 4500,
                usdCents: null,
                lamport: null,
                wei: '23000000000000000',
                referenceCurrency: 'GBP',
              },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicOfferAmount).toEqual({ currency: 'GBP', value: 45 })
  })

  it('maps a live offer with no eurCents value and no other currency field to null, including no card slug', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: {
                eurCents: null,
                gbpCents: null,
                usdCents: null,
                lamport: null,
                wei: null,
                referenceCurrency: 'EUR',
              },
            },
          },
        },
        {
          slug: 'kylian-mbappe-2025-limited-2',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: {
                eurCents: null,
                gbpCents: null,
                usdCents: null,
                lamport: null,
                wei: null,
                referenceCurrency: 'EUR',
              },
            },
          },
        },
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({
      classicEurCents: null,
      inSeasonEurCents: null,
      classicOfferAmount: null,
      inSeasonOfferAmount: null,
      classicCardSlug: null,
      inSeasonCardSlug: null,
      classicIsAuction: false,
      inSeasonIsAuction: false,
      classicAuctionEndDate: null,
      inSeasonAuctionEndDate: null,
      rarity: 'limited',
    })
  })

  it('maps an offer whose receiverSide is missing entirely to null (defensive against a partial response)', async () => {
    mockFetchSequence([
      playerDetailResponse(
        { slug: 'kylian-mbappe-2024-limited-1', liveSingleSaleOffer: {} },
        { slug: 'kylian-mbappe-2025-limited-2', liveSingleSaleOffer: {} },
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices).toEqual({
      classicEurCents: null,
      inSeasonEurCents: null,
      classicOfferAmount: null,
      inSeasonOfferAmount: null,
      classicCardSlug: null,
      inSeasonCardSlug: null,
      classicIsAuction: false,
      inSeasonIsAuction: false,
      classicAuctionEndDate: null,
      inSeasonAuctionEndDate: null,
      rarity: 'limited',
    })
  })

  it('stamps the resulting marketPrices with the rarity the prices were fetched for', async () => {
    mockFetchSequence([playerDetailResponse(null, null), AUCTION_FALLBACK_EMPTY])

    const player = await getPlayer('kylian-mbappe-lottin', 'super_rare')

    expect(player.marketPrices.rarity).toBe('super_rare')
  })

  it('passes the requested rarity as the rarity variable, defaulting to limited', async () => {
    mockFetchSequence([playerDetailResponse(null, null), AUCTION_FALLBACK_EMPTY])

    await getPlayer('kylian-mbappe-lottin')

    const call = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.variables.rarity).toBe('limited')
  })

  it('passes an explicit rarity through as the rarity variable', async () => {
    mockFetchSequence([playerDetailResponse(null, null), AUCTION_FALLBACK_EMPTY])

    await getPlayer('kylian-mbappe-lottin', 'super_rare')

    const call = (fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0]
    const body = JSON.parse((call[1] as RequestInit).body as string)
    expect(body.variables.rarity).toBe('super_rare')
  })
})

describe('getPlayer market prices — auctions (ODI-315)', () => {
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

  it('falls back to an open auction bid when there is no fixed-price offer', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: null,
          latestEnglishAuction: {
            open: true,
            endDate: '2026-08-10T12:00:00Z',
            currentPrice: '2500',
            currency: 'EUR',
            bestBid: {
              amounts: { eurCents: 2500, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBe(2500)
    expect(player.marketPrices.classicCardSlug).toBe('kylian-mbappe-2024-limited-1')
    expect(player.marketPrices.classicIsAuction).toBe(true)
    expect(player.marketPrices.classicAuctionEndDate).toBe('2026-08-10T12:00:00Z')
  })

  it('falls back to the auction starting price (currentPrice) when no bid has been placed yet', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: null,
          latestEnglishAuction: {
            open: true,
            endDate: '2026-08-10T12:00:00Z',
            currentPrice: '1000',
            currency: 'EUR',
            bestBid: null,
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBe(1000)
    expect(player.marketPrices.classicIsAuction).toBe(true)
    expect(player.marketPrices.classicAuctionEndDate).toBe('2026-08-10T12:00:00Z')
  })

  it('derives a non-EUR offerAmount from the auction starting price the same way as a fixed-price offer', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: null,
          latestEnglishAuction: {
            open: true,
            endDate: '2026-08-10T12:00:00Z',
            currentPrice: '4500',
            currency: 'GBP',
            bestBid: null,
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBeNull()
    expect(player.marketPrices.classicOfferAmount).toEqual({ currency: 'GBP', value: 45 })
    expect(player.marketPrices.classicIsAuction).toBe(true)
  })

  it('ignores a closed auction and reports no offer, same as having no auction at all', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: null,
          latestEnglishAuction: {
            open: false,
            endDate: '2026-08-01T12:00:00Z',
            currentPrice: '2500',
            currency: 'EUR',
            bestBid: {
              amounts: { eurCents: 2500, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBeNull()
    expect(player.marketPrices.classicIsAuction).toBe(false)
    expect(player.marketPrices.classicCardSlug).toBeNull()
    expect(player.marketPrices.classicAuctionEndDate).toBeNull()
  })

  it('prefers a fixed-price offer over an auction when both are present on the same card', async () => {
    mockFetchSequence([
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: 5000, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
          latestEnglishAuction: {
            open: true,
            endDate: '2026-08-10T12:00:00Z',
            currentPrice: '2500',
            currency: 'EUR',
            bestBid: null,
          },
        },
        null,
      ),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBe(5000)
    expect(player.marketPrices.classicIsAuction).toBe(false)
    expect(player.marketPrices.classicAuctionEndDate).toBeNull()
  })

  it('treats a missing latestEnglishAuction field the same as no auction (defensive against a partial response)', async () => {
    mockFetchSequence([
      playerDetailResponse({ slug: 'kylian-mbappe-2024-limited-1', liveSingleSaleOffer: null }, null),
      AUCTION_FALLBACK_EMPTY,
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.classicEurCents).toBeNull()
    expect(player.marketPrices.classicIsAuction).toBe(false)
    expect(player.marketPrices.classicCardSlug).toBeNull()
  })
})

describe('getPlayer market prices — auction fallback via anyCards (ODI-320)', () => {
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

  function auction(open: boolean, endDate: string, eurCents: number | null) {
    return {
      open,
      endDate,
      currentPrice: String(eurCents ?? 0),
      currency: 'EUR',
      bestBid:
        eurCents === null
          ? null
          : { amounts: { eurCents, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' } },
    }
  }

  it('picks the open auction ending soonest, not the cheapest, from the anyCards fallback batch', async () => {
    // lowestPriceAnyCard finds nothing for either side (no fixed offer, no card at all) — the
    // fallback samples anyCards directly and must prefer the soonest-ending open auction (a
    // deliberate product decision, not "lowest price wins") among a mix of open, closed, and
    // auction-less candidates.
    mockFetchSequence([
      playerDetailResponse(null, null),
      {
        data: {
          anyPlayer: {
            classicCandidates: { nodes: [] },
            inSeasonCandidates: {
              nodes: [
                { slug: 'card-cheap-later', latestEnglishAuction: auction(true, '2026-08-10T12:00:00Z', 500) },
                { slug: 'card-expensive-sooner', latestEnglishAuction: auction(true, '2026-08-08T09:00:00Z', 9000) },
                { slug: 'card-closed', latestEnglishAuction: auction(false, '2026-08-01T00:00:00Z', 100) },
                { slug: 'card-no-auction', latestEnglishAuction: null },
              ],
            },
          },
        },
      },
    ])

    const player = await getPlayer('kylian-mbappe-lottin')

    expect(player.marketPrices.inSeasonEurCents).toBe(9000)
    expect(player.marketPrices.inSeasonCardSlug).toBe('card-expensive-sooner')
    expect(player.marketPrices.inSeasonIsAuction).toBe(true)
    expect(player.marketPrices.inSeasonAuctionEndDate).toBe('2026-08-08T09:00:00Z')
    expect(player.marketPrices.classicEurCents).toBeNull()
    expect(player.marketPrices.classicCardSlug).toBeNull()
  })

  it('does not call the auction-fallback operation when both sides already have a primary offer', async () => {
    mockFetchOnce(
      playerDetailResponse(
        {
          slug: 'kylian-mbappe-2024-limited-1',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: 5498, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
        },
        {
          slug: 'kylian-mbappe-2025-limited-2',
          liveSingleSaleOffer: {
            receiverSide: {
              amounts: { eurCents: 6000, gbpCents: null, usdCents: null, lamport: null, wei: null, referenceCurrency: 'EUR' },
            },
          },
        },
      ),
    )

    await getPlayer('kylian-mbappe-lottin')

    expect(fetch).toHaveBeenCalledTimes(1)
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
              teams: { nodes: [{ slug: 'club-a', name: 'Club A' }] },
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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Defender')

    expect(hits.map((hit) => hit.slug)).toEqual(['regular-high-score', 'starter-low-score', 'sub-high-score'])
  })

  it('treats null l10/l40 as lowest priority within a tier', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: { name: 'Bundesliga', teams: { nodes: [{ slug: 'club-a', name: 'Club A' }] } },
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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Forward')

    expect(hits.map((hit) => hit.slug)).toEqual(['scored-starter', 'no-data-starter'])
  })

  it('skips a club with no data and returns an empty array when the competition is not found', async () => {
    mockFetchSequence([{ data: { football: { competition: null } } }])

    const hits = await searchPlayersByLeagueAndPosition(['unknown-league'], 'Defender')

    expect(hits).toEqual([])
  })

  it('only returns PlayerSearchHit fields, no internal sort data', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: { name: 'Bundesliga', teams: { nodes: [{ slug: 'club-a', name: 'Club A' }] } },
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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Goalkeeper')

    expect(hits).toEqual([
      { slug: 'a-player', displayName: 'A Player', positions: ['Goalkeeper'], clubName: 'Club A' },
    ])
  })

  it('merges and sorts results across multiple clubs in the same league, keeping each hit tagged with its own club', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: {
              name: 'Bundesliga',
              teams: { nodes: [{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }] },
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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Defender')

    expect(hits).toEqual([
      { slug: 'b-starter-high', displayName: 'B Starter High', positions: ['Defender'], clubName: 'Club B' },
      { slug: 'a-starter-low', displayName: 'A Starter Low', positions: ['Defender'], clubName: 'Club A' },
    ])
  })

  it('merges and sorts results across multiple selected leagues, keeping each hit tagged with its own club', async () => {
    mockFetchSequence([
      {
        data: {
          football: {
            competition: { name: 'Bundesliga', teams: { nodes: [{ slug: 'club-a', name: 'Club A' }] } },
          },
        },
      },
      {
        data: {
          football: {
            competition: { name: 'Ligue 1', teams: { nodes: [{ slug: 'club-b', name: 'Club B' }] } },
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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de', 'ligue-1-fr'], 'Defender')

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
              teams: { nodes: [{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }] },
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

    const hits = await searchPlayersByLeagueAndPosition(['bundesliga-de'], 'Defender')

    expect(hits).toEqual([
      { slug: 'a-starter', displayName: 'A Starter', positions: ['Defender'], clubName: 'Club A' },
    ])
  })

  it('returns an empty array when the league has zero clubs', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'Empty League', teams: { nodes: [] } } } } },
    ])

    const hits = await searchPlayersByLeagueAndPosition(['empty-league'], 'Defender')

    expect(hits).toEqual([])
  })

  it('returns an empty array and makes no fetch calls when leagueSlugs is empty', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const hits = await searchPlayersByLeagueAndPosition([], 'Defender')

    expect(hits).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('getLeagueClubs', () => {
  it('returns the clubs for a competition', async () => {
    mockFetchOnce({
      data: {
        football: {
          competition: {
            name: 'Bundesliga',
            teams: { nodes: [{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }] },
          },
        },
      },
    })

    const clubs = await getLeagueClubs(['bundesliga-de'])

    expect(fetch).toHaveBeenCalledWith('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'leagueClubs', variables: { leagueSlug: 'bundesliga-de' } }),
    })
    expect(clubs).toEqual([{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }])
  })

  it('returns an empty array when the competition is not found', async () => {
    mockFetchOnce({ data: { football: { competition: null } } })

    const clubs = await getLeagueClubs(['unknown-league'])

    expect(clubs).toEqual([])
  })

  it('unions clubs from multiple leagues', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'Bundesliga', teams: { nodes: [{ slug: 'club-a', name: 'Club A' }] } } } } },
      { data: { football: { competition: { name: 'Ligue 1', teams: { nodes: [{ slug: 'club-b', name: 'Club B' }] } } } } },
    ])

    const clubs = await getLeagueClubs(['bundesliga-de', 'ligue-1-fr'])

    expect(clubs).toEqual([{ slug: 'club-a', name: 'Club A' }, { slug: 'club-b', name: 'Club B' }])
  })

  it('dedupes a club that appears in more than one selected league', async () => {
    mockFetchSequence([
      { data: { football: { competition: { name: 'League A', teams: { nodes: [{ slug: 'club-x', name: 'Club X' }] } } } } },
      { data: { football: { competition: { name: 'League B', teams: { nodes: [{ slug: 'club-x', name: 'Club X' }] } } } } },
    ])

    const clubs = await getLeagueClubs(['league-a', 'league-b'])

    expect(clubs).toEqual([{ slug: 'club-x', name: 'Club X' }])
  })

  it('returns an empty array and makes no fetch calls for an empty leagueSlugs array', async () => {
    vi.stubGlobal('fetch', vi.fn())

    const clubs = await getLeagueClubs([])

    expect(clubs).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('getClubRoster', () => {
  function clubPlayersResponse(nodes: unknown[]) {
    return {
      data: {
        football: {
          club: {
            name: 'Club A',
            activePlayers: { nodes },
          },
        },
      },
    }
  }

  it('returns the empty array when the club is not found', async () => {
    mockFetchOnce({ data: { football: { club: null } } })

    const hits = await getClubRoster('unknown-club')

    expect(hits).toEqual([])
  })

  it('excludes players who are not regular starters', async () => {
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'starter-gk', displayName: 'Starter GK', position: 'Goalkeeper', playingStatus: 'STARTER', l10: 50, l40: 50 },
        { slug: 'substitute-gk', displayName: 'Substitute GK', position: 'Goalkeeper', playingStatus: 'SUBSTITUTE', l10: 90, l40: 90 },
        { slug: 'not-playing-gk', displayName: 'Not Playing GK', position: 'Goalkeeper', playingStatus: 'NOT_PLAYING', l10: 95, l40: 95 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(hits.map((hit) => hit.slug)).toEqual(['starter-gk'])
  })

  it('treats REGULAR the same as STARTER (both count as a regular starter)', async () => {
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'regular-gk', displayName: 'Regular GK', position: 'Goalkeeper', playingStatus: 'REGULAR', l10: 50, l40: 50 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(hits.map((hit) => hit.slug)).toEqual(['regular-gk'])
  })

  it('keeps only the top 2 regular starters per position, ranked by L10+L40', async () => {
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'def-low', displayName: 'Def Low', position: 'Defender', playingStatus: 'STARTER', l10: 10, l40: 10 },
        { slug: 'def-high', displayName: 'Def High', position: 'Defender', playingStatus: 'STARTER', l10: 90, l40: 90 },
        { slug: 'def-mid', displayName: 'Def Mid', position: 'Defender', playingStatus: 'STARTER', l10: 50, l40: 50 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(hits.map((hit) => hit.slug)).toEqual(['def-high', 'def-mid'])
  })

  it('treats null l10/l40 as the lowest rank, not zero-vs-zero ties in original order', async () => {
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'no-data', displayName: 'No Data', position: 'Forward', playingStatus: 'STARTER', l10: null, l40: null },
        { slug: 'scored', displayName: 'Scored', position: 'Forward', playingStatus: 'STARTER', l10: 5, l40: 5 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(hits.map((hit) => hit.slug)).toEqual(['scored', 'no-data'])
  })

  it('returns each hit tagged with the club name and a single-element positions array', async () => {
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'a-player', displayName: 'A Player', position: 'Midfielder', playingStatus: 'STARTER', l10: 50, l40: 50 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(fetch).toHaveBeenCalledWith('/api/sorare-proxy.php', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'clubPlayers', variables: { clubSlug: 'club-a' } }),
    })
    expect(hits).toEqual([
      { slug: 'a-player', displayName: 'A Player', positions: ['Midfielder'], clubName: 'Club A' },
    ])
  })

  it('returns fewer than 2 players for a position when the club has fewer than 2 regular starters there', async () => {
    // Real-world equivalent: a club whose only recognized STARTER/REGULAR goalkeeper is a single
    // player (backups marked SUBSTITUTE/NOT_PLAYING) — confirmed to occur for real clubs during
    // manual verification. getClubRoster does not backfill from non-regular-starters; this is the
    // current, deliberate behavior (mirrors the KI-Team auto-fill's own top-2-per-position logic),
    // not a defect — this test pins it down so a future change doesn't silently alter it.
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'only-gk', displayName: 'Only GK', position: 'Goalkeeper', playingStatus: 'STARTER', l10: 50, l40: 50 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(hits.map((hit) => hit.slug)).toEqual(['only-gk'])
  })

  it('covers all 4 exact positions independently, not just the first one found', async () => {
    mockFetchOnce(
      clubPlayersResponse([
        { slug: 'gk', displayName: 'GK', position: 'Goalkeeper', playingStatus: 'STARTER', l10: 50, l40: 50 },
        { slug: 'def', displayName: 'Def', position: 'Defender', playingStatus: 'STARTER', l10: 50, l40: 50 },
        { slug: 'mid', displayName: 'Mid', position: 'Midfielder', playingStatus: 'STARTER', l10: 50, l40: 50 },
        { slug: 'fwd', displayName: 'Fwd', position: 'Forward', playingStatus: 'STARTER', l10: 50, l40: 50 },
      ]),
    )

    const hits = await getClubRoster('club-a')

    expect(hits.map((hit) => hit.slug).sort()).toEqual(['def', 'fwd', 'gk', 'mid'])
  })
})
