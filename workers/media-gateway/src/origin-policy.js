import { securityError } from "./token.js";

function normalizeAllowedHost(value) {
  const raw = String(value || "")
    .trim()
    .toLowerCase();
  if (!raw) return "";
  try {
    const parsed = new URL(raw.includes("://") ? raw : `https://${raw}`);
    return parsed.hostname.replace(/\.$/, "");
  } catch {
    return raw.replace(/^\.+|\.+$/g, "");
  }
}

export function assertSourceUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw securityError("SOURCE_HOST_BLOCKED", 502, "Media source unavailable");
  }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  const normalizedAllowedHosts = (allowedHosts || [])
    .flatMap((value) => String(value || "").split(/[\s,]+/))
    .map(normalizeAllowedHost)
    .filter(Boolean);
  const privateHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.includes(":") ||
    /^\d+(\.\d+){3}$/.test(host);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    privateHost ||
    (url.port && !["80", "443"].includes(url.port)) ||
    !normalizedAllowedHosts.includes(host)
  ) {
    console.error(
      JSON.stringify({
        level: "error",
        component: "origin-policy",
        code: "SOURCE_HOST_BLOCKED",
        actualHost: host,
        allowedHosts: normalizedAllowedHosts,
      }),
    );
    throw securityError("SOURCE_HOST_BLOCKED", 502, "Media source unavailable");
  }
  return url;
}
