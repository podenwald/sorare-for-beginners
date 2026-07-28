<?php

header('Content-Type: application/json');

const SORARE_ENDPOINT = 'https://api.sorare.com/graphql';

const WHITELIST = [
    'playerDetail' => <<<'GRAPHQL'
query PlayerDetail($slug: String!, $seasonStartYear: Int!) {
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
      stats(seasonStartYear: $seasonStartYear) {
        appearances
        minutesPlayed
        substituteIn
        substituteOut
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

$ch = curl_init(SORARE_ENDPOINT);
curl_setopt_array($ch, [
    CURLOPT_POST => true,
    CURLOPT_POSTFIELDS => $payload,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
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
