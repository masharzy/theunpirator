import { decryptJson } from "@unpirator/crypto";

const providers = new Map();
export function registerProvider(name, provider) {
  providers.set(name, provider);
}
export function listProviders() {
  return [...providers.keys()];
}

export async function resolveAssetSource(asset, context, env = process.env) {
  const provider = providers.get(asset.provider);
  if (!provider)
    throw Object.assign(new Error("Media provider unavailable"), {
      code: "PROVIDER_UNAVAILABLE",
      status: 503,
    });
  const providerConfig = asset.encryptedProviderConfig
    ? decryptJson(asset.encryptedProviderConfig, env.APP_ENCRYPTION_KEY_BASE64)
    : {};
  const resolved = await provider.resolve({ asset, providerConfig, context });
  assertResolvedSource(asset, resolved);
  return resolved;
}

function assertResolvedSource(asset, source) {
  if (!source?.url)
    throw Object.assign(new Error("Provider returned no source"), {
      code: "SOURCE_INVALID",
      status: 502,
    });
  const url = new URL(source.url);
  if (
    url.username ||
    url.password ||
    url.hostname.includes(":") ||
    /^\d+(\.\d+){3}$/.test(url.hostname) ||
    /(^|\.)(localhost|local|internal)$/.test(url.hostname)
  )
    throw Object.assign(new Error("Source host is not permitted"), {
      code: "SOURCE_HOST_BLOCKED",
      status: 502,
    });
  if (!["https:", "http:"].includes(url.protocol))
    throw Object.assign(new Error("Unsupported source protocol"), {
      code: "SOURCE_INVALID",
      status: 502,
    });
  const providerResolvedHosts =
    source.trustedResolvedHosts === true &&
    Array.isArray(source.allowedHosts) &&
    source.allowedHosts.length > 0 &&
    referenceHostIsAllowed(asset);
  const allowed =
    (asset.provider === "youtube_custom" || providerResolvedHosts) &&
    Array.isArray(source.allowedHosts)
      ? source.allowedHosts
      : Array.isArray(asset.allowedHosts)
        ? asset.allowedHosts
        : [];
  if (!allowed.some((host) => url.hostname === host.toLowerCase())) {
    throw Object.assign(new Error("Resolved source host is not allowed for this asset"), {
      code: "SOURCE_HOST_BLOCKED",
      status: 502,
    });
  }
}

function referenceHostIsAllowed(asset) {
  try {
    const hostname = new URL(asset.providerReference).hostname.toLowerCase();
    return (asset.allowedHosts || []).some((host) => host.toLowerCase() === hostname);
  } catch {
    return false;
  }
}
