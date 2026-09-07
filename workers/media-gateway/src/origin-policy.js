import { securityError } from "./token.js";

export function assertSourceUrl(value, allowedHosts) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw securityError("SOURCE_HOST_BLOCKED", 502, "Media source unavailable");
  }
  const host = url.hostname.toLowerCase();
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
    !(allowedHosts || []).some((v) => host === v.toLowerCase())
  ) {
    throw securityError("SOURCE_HOST_BLOCKED", 502, "Media source unavailable");
  }
  return url;
}
