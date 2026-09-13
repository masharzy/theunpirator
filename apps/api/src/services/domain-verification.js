import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_RESPONSE_BYTES = 256 * 1024;

function verificationError(code, message, status, details) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.details = details;
  return error;
}

function isPrivateIpv4(address) {
  const parts = address.split(".").map(Number);
  return (
    parts[0] === 10 ||
    parts[0] === 127 ||
    parts[0] === 0 ||
    (parts[0] === 169 && parts[1] === 254) ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168) ||
    (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
    parts[0] >= 224
  );
}

function isPrivateAddress(address) {
  if (isIP(address) === 4) return isPrivateIpv4(address);
  const normalized = address.toLowerCase().split("%")[0];
  if (normalized.startsWith("::ffff:")) return isPrivateIpv4(normalized.slice(7));
  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    /^fe[89ab]/.test(normalized)
  );
}

async function assertPublicDomain(domain) {
  const addresses = await lookup(domain, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    const error = new Error("Verification host is not publicly reachable");
    error.code = "DOMAIN_NOT_PUBLIC";
    error.status = 409;
    throw error;
  }
}

async function fetchVerificationPage(domain, path = "/") {
  await assertPublicDomain(domain);
  let response;
  try {
    response = await fetch(`https://${domain}${path}`, {
      headers: {
        accept: "text/html,text/plain;q=0.9",
        "user-agent": "The-Unpirator-Verify/1.0",
      },
      redirect: "error",
      signal: AbortSignal.timeout(7000),
    });
  } catch (cause) {
    const timeout = cause?.name === "TimeoutError" || cause?.name === "AbortError";
    throw verificationError(
      timeout ? "DOMAIN_VERIFICATION_TIMEOUT" : "DOMAIN_VERIFICATION_FETCH_FAILED",
      timeout
        ? "Domain verification request timed out after 7 seconds"
        : "Could not fetch the domain verification page over HTTPS",
      422,
      { domain, path },
    );
  }
  return readVerificationResponse(response, { domain, path });
}

export async function readVerificationResponse(
  response,
  { domain = "unknown", path = "/", maxBytes = MAX_RESPONSE_BYTES } = {},
) {
  if (!response.ok) {
    throw verificationError(
      "DOMAIN_VERIFICATION_HTTP_ERROR",
      `Domain verification URL returned HTTP ${response.status}`,
      422,
      { domain, path, httpStatus: response.status },
    );
  }
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > maxBytes) {
    throw verificationError(
      "DOMAIN_VERIFICATION_RESPONSE_TOO_LARGE",
      `Domain verification response exceeds the ${Math.round(maxBytes / 1024)} KB limit`,
      422,
      { domain, path, maxBytes, declaredBytes: declaredLength },
    );
  }
  const body = await response.text();
  if (Buffer.byteLength(body, "utf8") > maxBytes) {
    throw verificationError(
      "DOMAIN_VERIFICATION_RESPONSE_TOO_LARGE",
      `Domain verification response exceeds the ${Math.round(maxBytes / 1024)} KB limit`,
      422,
      { domain, path, maxBytes, actualBytes: Buffer.byteLength(body, "utf8") },
    );
  }
  return body;
}

function readMetaAttributes(tag) {
  const attributes = {};
  for (const match of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gi)) {
    attributes[match[1].toLowerCase()] = match[3];
  }
  return attributes;
}

export function domainChallenges(domain, token) {
  const expected = `unpirator-verification=${token}`;
  return {
    token,
    dns: { name: `_unpirator.${domain}`, type: "TXT", value: expected },
    meta: {
      value: `<meta name="unpirator-site-verification" content="${token}">`,
      url: `https://${domain}/`,
    },
    file: {
      name: "unpirator-verification.txt",
      value: expected,
      url: `https://${domain}/unpirator-verification.txt`,
    },
  };
}

export async function verifyMetaChallenge(domain, token) {
  const html = await fetchVerificationPage(domain);
  if (!html) return false;
  return [...html.matchAll(/<meta\b[^>]*>/gi)].some((match) => {
    const attributes = readMetaAttributes(match[0]);
    return attributes.name === "unpirator-site-verification" && attributes.content === token;
  });
}

export async function verifyFileChallenge(domain, token) {
  const body = await fetchVerificationPage(domain, "/unpirator-verification.txt");
  if (body === null) return false;
  const value = body.trim();
  return value === token || value === `unpirator-verification=${token}`;
}
