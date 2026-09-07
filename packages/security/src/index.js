export const EVENT_RISK = {
  INVALID_TOKEN: 25,
  TOKEN_EXPIRED: 10,
  TOKEN_REPLAY: 60,
  DOMAIN_MISMATCH: 50,
  DEVICE_LIMIT: 45,
  CONCURRENT_PLAYBACK: 40,
  SESSION_REVOKED: 25,
  RATE_LIMIT: 35,
  ORIGIN_FAILURE: 5,
  ABNORMAL_RANGE: 30,
  API_KEY_FAILURE: 45,
  SUSPICIOUS_IP_CHANGE: 35,
};

export function riskFor(type, modifiers = 0) {
  return Math.max(0, Math.min(100, (EVENT_RISK[type] || 10) + modifiers));
}
export function decisionForRisk(score) {
  if (score >= 80) return "block";
  if (score >= 50) return "restrict";
  if (score >= 20) return "monitor";
  return "allow";
}
