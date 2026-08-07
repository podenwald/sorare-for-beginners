<?php

header('Content-Type: application/json');

const SORARE_ENDPOINT = 'https://api.sorare.com/graphql';

const WHITELIST = [
    'playerDetail' => <<<'GRAPHQL'
query PlayerDetail($slug: String!, $seasonStartYear: Int!, $rarity: Rarity = limited) {
  anyPlayer(slug: $slug) {
    ... on Player {
      slug
      displayName
      position
      age
      activeClub {
        name
        slug
      }
      activeInjuries {
        kind
        status
        startDate
        expectedEndDate
      }
      activeSuspensions {
        kind
        reason
        startDate
        endDate
      }
      allSo5Scores(first: 15) {
        nodes {
          score
          game {
            date
          }
        }
      }
      # l5/l10/l40 aliases map to Sorare's AveragePlayerScore enum — no automated test (no PHP test framework); verify manually via curl against api.sorare.com/graphql after any change
      l5: averageScore(type: LAST_FIVE_SO5_AVERAGE_SCORE)
      l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
      l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
      stats(seasonStartYear: $seasonStartYear) {
        appearances
        minutesPlayed
        substituteIn
        substituteOut
      }
      # Lowest currently-listed sale price for the requested rarity, Classic vs. In-Season.
      # `slug` identifies the specific card the price came from, for linking out to
      # sorare.com/football/cards/{slug} — the actual listing the price is quoting.
      # An offer's `amounts` only populates the ONE field matching its own referenceCurrency
      # (Sorare does not auto-convert — e.g. a Solana-priced listing has lamport set and
      # eurCents/usdCents/gbpCents/wei all null), so all 5 currency fields are requested to
      # let the client fall back to displaying the offer's native currency when eurCents is null.
      # ODI-315: a card for sale via auction rather than a fixed-price listing has no
      # liveSingleSaleOffer at all, so latestEnglishAuction is requested alongside it. `bestBid`
      # is null until someone actually bids, in which case `currentPrice`/`currency` (the auction's
      # starting price, a plain decimal string) is the fallback — verify field names manually via
      # curl against api.sorare.com/graphql after any change (no automated test, see l5/l10/l40 note).
      classicPrice: lowestPriceAnyCard(inSeason: false, rarity: $rarity) {
        slug
        liveSingleSaleOffer {
          receiverSide {
            amounts {
              eurCents
              gbpCents
              usdCents
              lamport
              wei
              referenceCurrency
            }
          }
        }
        latestEnglishAuction {
          open
          endDate
          currentPrice
          currency
          bestBid {
            amounts {
              eurCents
              gbpCents
              usdCents
              lamport
              wei
              referenceCurrency
            }
          }
        }
      }
      inSeasonPrice: lowestPriceAnyCard(inSeason: true, rarity: $rarity) {
        slug
        liveSingleSaleOffer {
          receiverSide {
            amounts {
              eurCents
              gbpCents
              usdCents
              lamport
              wei
              referenceCurrency
            }
          }
        }
        latestEnglishAuction {
          open
          endDate
          currentPrice
          currency
          bestBid {
            amounts {
              eurCents
              gbpCents
              usdCents
              lamport
              wei
              referenceCurrency
            }
          }
        }
      }
    }
  }
}
GRAPHQL,
    // ODI-320: lowestPriceAnyCard returns null for a rarity/season combo whenever no card of that
    // combo has an active FIXED-PRICE offer — even if another card instance of the same edition is
    // for sale via an open English auction. As a fallback (only queried client-side when the main
    // playerDetail query finds no offer on one or both sides), sample up to 30 cards of each side
    // and let the client pick whichever open auction ends soonest (not cheapest — a deliberate
    // product decision). Best-effort: editions can have up to ~1000 numbered copies, so this sample
    // can't guarantee finding the true soonest-ending auction, only the soonest within the sample.
    'auctionFallbackCandidates' => <<<'GRAPHQL'
query AuctionFallbackCandidates($slug: String!, $rarity: Rarity!) {
  anyPlayer(slug: $slug) {
    ... on Player {
      classicCandidates: anyCards(classicOnly: true, rarities: [$rarity], first: 30) {
        nodes {
          slug
          latestEnglishAuction {
            open
            endDate
            currentPrice
            currency
            bestBid {
              amounts {
                eurCents
                gbpCents
                usdCents
                lamport
                wei
                referenceCurrency
              }
            }
          }
        }
      }
      inSeasonCandidates: anyCards(inSeasonEligible: true, rarities: [$rarity], first: 30) {
        nodes {
          slug
          latestEnglishAuction {
            open
            endDate
            currentPrice
            currency
            bestBid {
              amounts {
                eurCents
                gbpCents
                usdCents
                lamport
                wei
                referenceCurrency
              }
            }
          }
        }
      }
    }
  }
}
GRAPHQL,
    'playerSearch' => <<<'GRAPHQL'
query PlayerSearch($query: String!, $page: Int, $pageSize: Int) {
  searchPlayers(query: $query, page: $page, pageSize: $pageSize) {
    nbHits
    nbPages
    page
    commonPlayerHits {
      positions
      anyPlayer {
        ... on Player {
          slug
          displayName
          activeClub {
            name
          }
        }
      }
    }
  }
}
GRAPHQL,
    'leagueClubs' => <<<'GRAPHQL'
query LeagueClubs($leagueSlug: String!) {
  football {
    competition(slug: $leagueSlug) {
      name
      teams(first: 50) {
        nodes {
          slug
          name
        }
      }
    }
  }
}
GRAPHQL,
    'clubPlayers' => <<<'GRAPHQL'
query ClubPlayers($clubSlug: String!) {
  football {
    club(slug: $clubSlug) {
      name
      activePlayers(first: 80) {
        nodes {
          slug
          displayName
          position
          playingStatus
          l10: averageScore(type: LAST_TEN_PLAYED_SO5_AVERAGE_SCORE)
          l40: averageScore(type: LAST_FORTY_SO5_AVERAGE_SCORE)
        }
      }
    }
  }
}
GRAPHQL,
];

function respond_error($status, $message) {
    http_response_code($status);
    echo json_encode(['errors' => [['message' => $message]]]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    respond_error(405, 'Method not allowed');
}

$body = json_decode(file_get_contents('php://input'), true);

if (!is_array($body) || !isset($body['operation']) || !is_string($body['operation'])) {
    respond_error(400, 'Missing or invalid "operation"');
}

$operation = $body['operation'];

if (!array_key_exists($operation, WHITELIST)) {
    respond_error(400, 'Unknown operation');
}

if (isset($body['variables']) && !is_array($body['variables'])) {
    respond_error(400, 'Invalid "variables"');
}

$variables = isset($body['variables']) ? $body['variables'] : [];

$payload = json_encode([
    'query' => WHITELIST[$operation],
    'variables' => (object) $variables,
]);

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

$response = curl_exec($ch);
$curlError = curl_error($ch);
curl_close($ch);

if ($response === false) {
    error_log('Sorare proxy upstream error: ' . $curlError);
    respond_error(502, 'Upstream Sorare API unavailable');
}

echo $response;
