import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const MAX_RESPONSE_BYTES = 64 * 1024;

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
  const response = await fetch(`https://${domain}${path}`, {
    headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "The-Unpirator-Verify/1.0" },
    redirect: "error",
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) return null;
  const declaredLength = Number(response.headers.get("content-length") || 0);
  if (declaredLength > MAX_RESPONSE_BYTES) return null;
  const body = await response.text();
  return body.length <= MAX_RESPONSE_BYTES ? body : null;
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
