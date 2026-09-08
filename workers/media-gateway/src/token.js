function fromB64Url(value) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
function decodeJsonB64Url(value) {
  return JSON.parse(new TextDecoder().decode(fromB64Url(value)));
}
function decodeB64(value) {
  return JSON.parse(atob(value));
}

export async function verifyPlaybackToken(
  token,
  env,
  nowSeconds = Math.floor(Date.now() / 1000),
  allowExpiredSeconds = 0,
) {
  const [kid, body, signature, extra] = String(token || "").split(".");
  if (!kid || !body || !signature || extra) throw securityError("INVALID_TOKEN", 401);
  const ring = decodeB64(env.PLAYBACK_PUBLIC_KEYS_B64 || "W10=");
  const entry = ring.find((item) => item.kid === kid && item.publicJwk);
  if (!entry) throw securityError("INVALID_TOKEN", 401);
  const key = await crypto.subtle.importKey("jwk", entry.publicJwk, { name: "Ed25519" }, false, [
    "verify",
  ]);
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    fromB64Url(signature),
    new TextEncoder().encode(`${kid}.${body}`),
  );
  if (!valid) throw securityError("INVALID_TOKEN", 401);
  const payload = decodeJsonB64Url(body);
  if (
    !Number.isFinite(payload.exp) ||
    payload.exp + Math.max(0, Number(allowExpiredSeconds || 0)) <= nowSeconds
  )
    throw securityError("TOKEN_EXPIRED", 401);
  if (
    payload.iss !== "the-unpirator" ||
    !Number.isFinite(payload.iat) ||
    payload.iat > nowSeconds + 5 ||
    payload.exp - payload.iat > 180
  )
    throw securityError("INVALID_TOKEN", 401);
  if (!payload.tid || !payload.sid || !payload.aid || !payload.psid)
    throw securityError("INVALID_TOKEN", 401);
  return payload;
}

export function securityError(code, status = 403, message = "Playback request denied") {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}
