<?php
final class UnpiratorClient {
  public function __construct(private string $apiUrl, private string $apiKey) {}

  public function createPlaybackSession(array $payload): array {
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

    $ch = curl_init(rtrim($this->apiUrl, '/') . '/v1/playback/sessions');
    curl_setopt_array($ch, [
      CURLOPT_POST => true,
      CURLOPT_RETURNTRANSFER => true,
      CURLOPT_HTTPHEADER => [
        'Authorization: Bearer ' . $this->apiKey,
        'Content-Type: application/json'
      ],
      CURLOPT_POSTFIELDS => json_encode($payload),
      CURLOPT_TIMEOUT => 10
    ]);
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($body === false || $status < 200 || $status >= 300) {
      throw new RuntimeException('Playback authorization failed');
    }
    return json_decode($body, true, flags: JSON_THROW_ON_ERROR);
  }
}
