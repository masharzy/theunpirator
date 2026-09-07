<?php
namespace TheUnpirator;
use Illuminate\Support\Facades\Http;
final class UnpiratorClient {
  public function __construct(private string $apiUrl, private string $apiKey) {}
  public function playback(array $payload): array {
    return Http::withToken($this->apiKey)->timeout(10)->post(rtrim($this->apiUrl, '/') . '/v1/playback/sessions', $payload)->throw()->json();
  }
}
