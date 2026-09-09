import { securityError } from "./token.js";

const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const CREATE_URL = "https://www.youtube.com/api/jnn/v1/Create";
const GENERATE_IT_URL = "https://www.youtube.com/api/jnn/v1/GenerateIT";
const BOTGUARD_API_KEY = "AIzaSyDyT5W0Jh49F30Pqqtyfdf7pDLFKLJoAnw";
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_BOTGUARD_RESPONSE_LENGTH = 256 * 1024;

function youtubeHeaders(userAgent) {
  return {
    accept: "application/json",
    "content-type": "application/json+protobuf",
    "x-goog-api-key": BOTGUARD_API_KEY,
    "x-user-agent": "grpc-web-javascript/0.1",
    "user-agent": userAgent,
  };
}

async function readTextLimited(response) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_RESPONSE_BYTES)
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES)
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  return text;
}

function decodeScrambled(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/").replace(/\./g, "=");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  let bytes;
  try {
    bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  } catch {
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  }
  return new TextDecoder().decode(bytes.map((byte) => (byte + 97) & 0xff));
}

function firstString(value) {
  return Array.isArray(value) ? value.find((item) => typeof item === "string" && item) : null;
}

function parseChallenge(raw) {
  let response;
  try {
    response = JSON.parse(raw);
  } catch {
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  }
  let challenge = response;
  if (response.length > 1 && typeof response[1] === "string") {
    try {
      challenge = JSON.parse(decodeScrambled(response[1]));
    } catch (error) {
      if (error?.code) throw error;
      throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
    }
  } else if (Array.isArray(response[0])) {
    challenge = response[0];
  }
  const interpreterJavascript = firstString(challenge?.[1]);
  const interpreterUrl = firstString(challenge?.[2]);
  const interpreterHash = challenge?.[3];
  const program = challenge?.[4];
  const globalName = challenge?.[5];
  if (
    typeof interpreterJavascript !== "string" ||
    typeof program !== "string" ||
    typeof globalName !== "string" ||
    interpreterJavascript.length > MAX_RESPONSE_BYTES ||
    program.length > MAX_RESPONSE_BYTES ||
    globalName.length > 200
  )
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  return {
    interpreterJavascript,
    interpreterUrl: typeof interpreterUrl === "string" ? interpreterUrl : null,
    interpreterHash: typeof interpreterHash === "string" ? interpreterHash : null,
    program,
    globalName,
  };
}

async function callBotGuard(url, data, userAgent) {
  const response = await fetch(url, {
    method: "POST",
    headers: youtubeHeaders(userAgent),
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw securityError("ATTESTATION_UPSTREAM_FAILURE", 502, "Browser attestation unavailable");
  }
  return readTextLimited(response);
}

export async function createYoutubeAttestation(userAgent) {
  return parseChallenge(await callBotGuard(CREATE_URL, [REQUEST_KEY], userAgent));
}

export async function createYoutubeIntegrityToken(userAgent, botguardResponse) {
  if (
    typeof botguardResponse !== "string" ||
    !botguardResponse ||
    botguardResponse.length > MAX_BOTGUARD_RESPONSE_LENGTH
  )
    throw securityError("INVALID_REQUEST", 400, "Invalid browser attestation response");
  const raw = await callBotGuard(GENERATE_IT_URL, [REQUEST_KEY, botguardResponse], userAgent);
  let result;
  try {
    result = JSON.parse(raw);
  } catch {
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  }
  const [integrityToken, estimatedTtlSeconds, mintRefreshThreshold] = result;
  if (typeof integrityToken !== "string" || !integrityToken || integrityToken.length > 16 * 1024)
    throw securityError("ATTESTATION_RESPONSE_INVALID", 502, "Browser attestation unavailable");
  return {
    integrityToken,
    estimatedTtlSeconds: Math.max(60, Math.min(Number(estimatedTtlSeconds || 3600), 86400)),
    mintRefreshThreshold: Math.max(0, Number(mintRefreshThreshold || 0)),
  };
}

export function validateYoutubeProof(proof, expectedBinding) {
  if (
    proof?.type !== "youtube_web" ||
    proof.contentBinding !== expectedBinding ||
    typeof proof.token !== "string" ||
    proof.token.length < 40 ||
    proof.token.length > 4096 ||
    !/^[A-Za-z0-9_.=-]+$/.test(proof.token)
  )
    throw securityError("ATTESTATION_REQUIRED", 403, "Browser verification required");
  return proof.token;
}
