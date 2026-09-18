<?php
namespace TheUnpirator;

use Illuminate\Support\Facades\Http;
use InvalidArgumentException;

final class UnpiratorClient {
  public function __construct(private string $apiUrl, private string $apiKey) {}

  public function playback(array $payload): array {
    $email = strtolower(trim((string)($payload['email'] ?? '')));
    $deviceId = trim((string)($payload['deviceId'] ?? ''));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
      throw new InvalidArgumentException('Authenticated viewer email is required');
    }
    if (strlen($deviceId) < 8) {
      throw new InvalidArgumentException('Stable deviceId is required');
    }
    $payload['email'] = $email;
    $payload['deviceId'] = $deviceId;

    return Http::withToken($this->apiKey)
      ->timeout(10)
      ->post(rtrim($this->apiUrl, '/') . '/v1/playback/sessions', $payload)
      ->throw()
      ->json();
  }
}
