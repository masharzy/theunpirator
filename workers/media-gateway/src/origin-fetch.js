import { assertSourceUrl } from "./origin-policy.js";
import { securityError } from "./token.js";

function redirectError(code, upstreamStatus, message = "Media source unavailable") {
  const error = securityError(code, 502, message);
  error.upstreamStatus = upstreamStatus;
  return error;
}

export async function fetchOriginWithRedirects(
  url,
  options,
  allowedHosts,
  { maxRedirects = 3 } = {},
) {
  let current = assertSourceUrl(url, allowedHosts);

  for (let redirects = 0; redirects <= maxRedirects; redirects += 1) {
    const response = await fetch(current.toString(), {
      ...(options || {}),
      redirect: "manual",
    });

    const isRedirect = response.status >= 300 && response.status < 400 && response.status !== 304;
    if (!isRedirect) {
      return {
        response,
        resolvedUrl: current.toString(),
        redirects,
      };
    }

    const location = response.headers.get("location");
    await response.body?.cancel();

    if (!location) {
      throw redirectError(
        "ORIGIN_REDIRECT_INVALID",
        response.status,
        "Media origin returned a redirect without a location",
      );
    }

    if (redirects >= maxRedirects) {
      throw redirectError(
        "ORIGIN_REDIRECT_LIMIT",
        response.status,
        "Media origin exceeded the redirect limit",
      );
    }

    let next;
    try {
      next = new URL(location, current);
    } catch {
      throw redirectError(
        "ORIGIN_REDIRECT_INVALID",
        response.status,
        "Media origin returned an invalid redirect",
      );
    }

    try {
      current = assertSourceUrl(next.toString(), allowedHosts);
    } catch {
      throw redirectError(
        "ORIGIN_REDIRECT_BLOCKED",
        response.status,
        "Media origin redirected to an unapproved host",
      );
    }
  }

  throw securityError("ORIGIN_REDIRECT_LIMIT", 502, "Media origin exceeded the redirect limit");
}
