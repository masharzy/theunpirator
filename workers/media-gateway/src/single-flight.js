const pending = new WeakMap();
export function singleFlight(env, key, action) {
  let entries = pending.get(env);
  if (!entries) {
    entries = new Map();
    pending.set(env, entries);
  }
  if (entries.has(key)) return entries.get(key);
  const promise = Promise.resolve()
    .then(action)
    .finally(() => entries.delete(key));
  entries.set(key, promise);
  return promise;
}
