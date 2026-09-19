import { createHash } from "node:crypto";

const PREFIX = "unpirator:metadata:v1";
const VERSION_TTL_SECONDS = 30 * 24 * 60 * 60;

function digest(value) {
  return createHash("sha256")
    .update(String(value || "default"))
    .digest("base64url")
    .slice(0, 24);
}

function scopeKey(scope, namespace) {
  return `${PREFIX}:${scope}:${namespace}`;
}

function versionKey(scope, namespace) {
  return `${scopeKey(scope, namespace)}:version`;
}

function dataKey(scope, namespace, version, key) {
  return `${scopeKey(scope, namespace)}:${version}:${digest(key)}`;
}

async function safeGet(cache, key) {
  if (!cache?.get) return null;
  try {
    return await cache.get(key);
  } catch {
    return null;
  }
}

async function safeSet(cache, key, value, ttlSeconds) {
  if (!cache?.set) return;
  try {
    await cache.set(key, value, { ex: ttlSeconds });
  } catch {
    // Metadata caching must never make a healthy API request fail.
  }
}

function decodePayload(raw) {
  if (raw == null) return { hit: false, value: null };
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!parsed || parsed.cacheVersion !== 1) return { hit: false, value: null };
    return { hit: true, value: parsed.value };
  } catch {
    return { hit: false, value: null };
  }
}

async function currentVersion(cache, scope, namespace) {
  const raw = await safeGet(cache, versionKey(scope, namespace));
  const parsed = Number.parseInt(String(raw ?? "0"), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export async function cachedJson({
  cache,
  scope,
  namespace,
  key = "default",
  ttlSeconds = 60,
  load,
}) {
  if (!cache) return load();

  const version = await currentVersion(cache, scope, namespace);
  const keyName = dataKey(scope, namespace, version, key);
  const cached = decodePayload(await safeGet(cache, keyName));
  if (cached.hit) return cached.value;

  const value = await load();
  await safeSet(
    cache,
    keyName,
    JSON.stringify({ cacheVersion: 1, value }),
    Math.max(1, Number(ttlSeconds) || 60),
  );
  return value;
}

export function cachedTenantJson({ cache, tenantId, ...options }) {
  return cachedJson({ cache, scope: `tenant:${tenantId}`, ...options });
}

export function cachedGlobalJson({ cache, ...options }) {
  return cachedJson({ cache, scope: "global", ...options });
}

export async function invalidateCacheNamespace(cache, scope, namespace) {
  if (!cache?.incr) return;
  const key = versionKey(scope, namespace);
  try {
    await cache.incr(key);
    if (cache.expire) await cache.expire(key, VERSION_TTL_SECONDS);
  } catch {
    // Invalidation is best effort because Redis is an optimization, not source of truth.
  }
}

export function invalidateTenantCache(cache, tenantId, namespace) {
  return invalidateCacheNamespace(cache, `tenant:${tenantId}`, namespace);
}

export function invalidateGlobalCache(cache, namespace) {
  return invalidateCacheNamespace(cache, "global", namespace);
}

export function stableQueryKey(query = {}) {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => {
      const values = Array.isArray(value) ? value : [value];
      return `${encodeURIComponent(key)}=${values
        .map((item) => encodeURIComponent(String(item ?? "")))
        .sort()
        .join(",")}`;
    })
    .join("&");
}
