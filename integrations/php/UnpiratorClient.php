<?php
final class UnpiratorClient {
  public function __construct(private string $apiUrl, private string $apiKey) {}
  public function createPlaybackSession(array $payload): array {
    $ch = curl_init(rtrim($this->apiUrl, '/') . '/v1/playback/sessions');
    curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . $this->apiKey, 'Content-Type: application/json'], CURLOPT_POSTFIELDS => json_encode($payload), CURLOPT_TIMEOUT => 10]);
    $body = curl_exec($ch); $status = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
    if ($body === false || $status < 200 || $status >= 300) throw new RuntimeException('Playback authorization failed');
    return json_decode($body, true, flags: JSON_THROW_ON_ERROR);
  }
}
