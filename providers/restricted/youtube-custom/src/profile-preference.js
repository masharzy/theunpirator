// A process-local ordering hint, never a cache of authorization or media URLs.
export function createProfilePreference(ttlMs = 10 * 60 * 1000) {
  let preferred;
  return {
    order(attempts, now = Date.now()) {
      if (!preferred || preferred.expiresAt <= now) return attempts;
      const selected = attempts.find(
        (item) => item.region === preferred.region && item.profile.name === preferred.name,
      );
      return selected ? [selected, ...attempts.filter((item) => item !== selected)] : attempts;
    },
    succeeded(attempt, now = Date.now()) {
      preferred = { region: attempt.region, name: attempt.profile.name, expiresAt: now + ttlMs };
    },
  };
}
