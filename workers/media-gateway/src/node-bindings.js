import { createCache } from "../../../packages/cache/src/index.js";
import { SessionState } from "./session-state.js";

function decode(value) {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function encode(value) {
  return typeof value === "string" ? value : JSON.stringify(value);
}

class RedisKvBinding {
  constructor(cache, prefix) {
    this.cache = cache;
    this.prefix = prefix;
  }
  key(key) {
    return `${this.prefix}:${key}`;
  }
  async get(key, type) {
    const value = await this.cache.get(this.key(key));
    return type === "json" ? decode(value) : value;
  }
  async put(key, value, options = {}) {
    const ttl = Math.max(1, Number(options.expirationTtl || 86400));
    await this.cache.set(this.key(key), value, { ex: ttl });
  }
  async delete(key) {
    await this.cache.del(this.key(key));
  }
}

export class RedisDurableStorage {
  constructor(cache, sessionId) {
    this.alarms = false;
    this.cache = cache;
    this.prefix = `gateway:session:${sessionId}`;
  }
  key(key) {
    return `${this.prefix}:${key}`;
  }
  async get(key) {
    return decode(await this.cache.get(this.key(key)));
  }
  async put(key, value) {
    await this.cache.set(this.key(key), encode(value), { ex: 86400 });
  }
  async delete(key) {
    await this.cache.del(this.key(key));
  }
  async deleteAll() {
    await Promise.all([this.delete("session"), this.delete("mediaKey")]);
  }
  async setAlarm() {}
  async transaction(callback) {
    // Optimistic transaction: commit only if every value read is unchanged.
    // Validation, limits and ticket deletion therefore share one atomic commit.
    for (let attempt = 0; attempt < 16; attempt++) {
      const reads = new Map();
      const writes = new Map();
      const read = async (key) => {
        if (!reads.has(key))
          reads.set(
            key,
            Promise.resolve(this.cache.get(this.key(key))).then((value) =>
              value == null ? null : encode(value),
            ),
          );
        return reads.get(key);
      };
      const tx = {
        get: async (key) => decode(writes.has(key) ? writes.get(key) : await read(key)),
        put: async (key, value) => {
          await read(key);
          writes.set(key, encode(value));
        },
        delete: async (key) => {
          await read(key);
          writes.set(key, null);
        },
        setAlarm: async () => {},
      };
      const result = await callback(tx);
      if (!writes.size) return result;
      const keys = [...reads.keys()];
      const args = [];
      for (const key of keys) {
        const expected = await reads.get(key);
        args.push(
          expected === null ? "0" : "1",
          expected ?? "",
          writes.has(key) ? (writes.get(key) === null ? "D" : "S") : "R",
          writes.get(key) ?? "",
        );
      }
      const committed = await this.cache.eval(
        `
        for i,key in ipairs(KEYS) do
          local offset=(i-1)*4
          local value=redis.call('GET',key)
          if ARGV[offset+1]=='0' then
            if value then return 0 end
          elseif value~=ARGV[offset+2] then return 0 end
        end
        for i,key in ipairs(KEYS) do
          local offset=(i-1)*4
          if ARGV[offset+3]=='D' then redis.call('DEL',key)
          elseif ARGV[offset+3]=='S' then redis.call('SET',key,ARGV[offset+4],'EX',86400) end
        end
        return 1
      `,
        keys.map((key) => this.key(key)),
        args,
      );
      if (Number(committed) === 1) {
        if (attempt > 0)
          console.info(JSON.stringify({ component: "session-tx", event: "committed-after-retry", attempts: attempt + 1, keys: keys.length, session: this.prefix.slice(-8) }));
        return result;
      }
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, 2 ** attempt)));
    }
    console.warn(JSON.stringify({ component: "session-tx", event: "busy-exhausted", attempts: 16, session: this.prefix.slice(-8) }));
    return Response.json({ error: "busy" }, { status: 429 });
  }
}

const SESSION_REVALIDATE_MS = 10_000;
const MEMORY_IDLE_EVICT_MS = 30 * 60_000;
const memorySessions = new Map(); // sessionId -> MemoryDurableStorage (lives as long as the process)

const swallowPersist = (promise) =>
  Promise.resolve(promise).catch((error) =>
    console.warn(
      JSON.stringify({
        component: "session-store",
        event: "persist-failed",
        message: String(error?.message || error).slice(0, 120),
      }),
    ),
  );

// In-process session storage for the single-process node gateway. Same key layout and
// API as RedisDurableStorage, so SessionState is unchanged. Operations on one session
// are serialized by a queue (no optimistic conflicts, no Redis round trips). Only
// `session` and `mediaKey` are persisted to Redis, and only on rare changes.
export class MemoryDurableStorage {
  constructor(cache, sessionId) {
    this.alarms = false;
    this.cache = cache;
    this.sessionId = String(sessionId);
    this.prefix = `gateway:session:${sessionId}`;
    this.data = new Map(); // key -> encoded string
    this.queue = Promise.resolve();
    this.hydration = null;
    this.persistedSig = undefined;
    this.touchedAt = Date.now();
    this.lastRevalidate = Date.now();
    this.revalidating = false;
  }
  key(key) {
    return `${this.prefix}:${key}`;
  }
  ready() {
    this.touchedAt = Date.now();
    this.hydration ||= this.hydrate().catch((error) => {
      this.hydration = null; // fail closed now, retry on the next request
      throw error;
    });
    return this.hydration;
  }
  async hydrate() {
    const started = Date.now();
    const [session, mediaKey] = await Promise.all([
      this.cache.get(this.key("session")),
      this.cache.get(this.key("mediaKey")),
    ]);
    if (session != null && !this.data.has("session")) {
      this.data.set("session", encode(session));
      const parsed = decode(session);
      this.persistedSig = `${parsed?.status}|${parsed?.expiresAt}`;
    }
    if (mediaKey != null && !this.data.has("mediaKey")) this.data.set("mediaKey", encode(mediaKey));
    console.info(
      JSON.stringify({
        component: "session-store",
        event: "hydrated",
        session: this.sessionId.slice(-8),
        found: session != null,
        ms: Date.now() - started,
      }),
    );
  }
  // Safety net if something other than this process changes the session in Redis:
  // adopt a non-active status within SESSION_REVALIDATE_MS. Monotonic (downgrade only).
  maybeRevalidate() {
    if (this.revalidating || Date.now() - this.lastRevalidate < SESSION_REVALIDATE_MS) return;
    this.revalidating = true;
    Promise.resolve(this.cache.get(this.key("session")))
      .then((raw) => {
        const stored = decode(raw);
        if (!stored?.status || stored.status === "active") return;
        this.queue = this.queue
          .then(() => {
            const mine = decode(this.data.get("session"));
            if (mine?.status === "active") {
              mine.status = stored.status;
              this.data.set("session", encode(mine));
              this.persistedSig = `${mine.status}|${mine.expiresAt}`;
              console.warn(
                JSON.stringify({
                  component: "session-store",
                  event: "status-adopted",
                  session: this.sessionId.slice(-8),
                  status: stored.status,
                }),
              );
            }
          })
          .catch(() => {});
      })
      .catch(() => {})
      .finally(() => {
        this.lastRevalidate = Date.now();
        this.revalidating = false;
      });
  }
  persist(key, value) {
    return value === null
      ? this.cache.del(this.key(key))
      : this.cache.set(this.key(key), value, { ex: 86400 });
  }
  // Applies one write to memory; returns a persist promise only for rare, durable changes.
  commitKey(key, value) {
    if (value === null) this.data.delete(key);
    else this.data.set(key, value);
    if (key === "mediaKey") return this.persist(key, value);
    if (key !== "session") return null;
    if (value === null) {
      this.persistedSig = undefined;
      return this.persist(key, null);
    }
    const next = decode(value);
    const signature = `${next?.status}|${next?.expiresAt}`;
    if (signature === this.persistedSig) return null; // integrity/window updates stay in memory
    this.persistedSig = signature;
    return this.persist(key, value);
  }
  async get(key) {
    await this.ready();
    this.maybeRevalidate();
    return decode(this.data.get(key) ?? null);
  }
  async put(key, value) {
    await this.ready();
    await swallowPersist(this.commitKey(key, encode(value)));
  }
  async delete(key) {
    await this.ready();
    await swallowPersist(this.commitKey(key, null));
  }
  async deleteAll() {
    await this.ready();
    this.data.clear();
    this.persistedSig = undefined;
    await Promise.all([this.persist("session", null), this.persist("mediaKey", null)].map(swallowPersist));
  }
  async setAlarm() {}
  async transaction(callback) {
    await this.ready();
    this.maybeRevalidate();
    const run = async () => {
      const writes = new Map();
      const tx = {
        get: async (key) => decode(writes.has(key) ? writes.get(key) : (this.data.get(key) ?? null)),
        put: async (key, value) => {
          writes.set(key, encode(value));
        },
        delete: async (key) => {
          writes.set(key, null);
        },
        setAlarm: async () => {},
      };
      const result = await callback(tx); // a throw discards the buffered writes
      const persists = [];
      for (const [key, value] of writes) {
        const pending = this.commitKey(key, value);
        if (pending) persists.push(pending);
      }
      return { result, persists };
    };
    const job = this.queue.then(run, run);
    this.queue = job.then(
      () => {},
      () => {},
    );
    const { result, persists } = await job;
    await Promise.all(persists.map(swallowPersist)); // outside the per-session queue
    return result;
  }
}

function sweepMemorySessions() {
  const now = Date.now();
  const bucket = Math.floor(now / 60_000);
  const bucketOf = (key) => {
    const match = /^(?:ticket-rate|resource-rate):(\d+)$/.exec(key) || /^usage:(\d+):/.exec(key);
    return match ? Number(match[1]) : null;
  };
  for (const [id, storage] of memorySessions) {
    const session = decode(storage.data.get("session"));
    const expired = session?.expiresAt && session.expiresAt + 5 * 60_000 < now;
    if (expired || now - storage.touchedAt > MEMORY_IDLE_EVICT_MS) {
      memorySessions.delete(id); // safe: session + mediaKey rehydrate from Redis
      continue;
    }
    for (const [key, raw] of storage.data) {
      if (key.startsWith("ticket:") || key.startsWith("resource-ticket:")) {
        if ((decode(raw)?.expiresAt || 0) <= now) storage.data.delete(key);
      } else {
        const keyBucket = bucketOf(key);
        if (keyBucket !== null && keyBucket < bucket - 2) storage.data.delete(key);
      }
    }
  }
}
setInterval(sweepMemorySessions, 60_000).unref?.();

class RedisSessionNamespace {
  constructor(cache, mode = "memory") {
    this.cache = cache;
    this.mode = mode;
  }
  idFromName(name) {
    return String(name);
  }
  get(sessionId) {
    let storage;
    if (this.mode === "redis") {
      storage = new RedisDurableStorage(this.cache, sessionId);
    } else {
      storage = memorySessions.get(sessionId);
      if (!storage) {
        storage = new MemoryDurableStorage(this.cache, sessionId);
        memorySessions.set(sessionId, storage);
      }
    }
    const state = new SessionState({ storage });
    return { fetch: (input, init) => state.fetch(new Request(input, init)) };
  }
}

let storeAnnounced = false;
export function createNodeBindings(source = process.env) {
  const cache = createCache(source);
  const sessionStore = source.GATEWAY_SESSION_STORE === "redis" ? "redis" : "memory";
  if (!storeAnnounced) {
    storeAnnounced = true;
    console.info(JSON.stringify({ component: "session-store", mode: sessionStore }));
  }
  return {
    ...source,
    SOURCE_CACHE: new RedisKvBinding(cache, "gateway:kv"),
    SESSION_STATE: new RedisSessionNamespace(cache, sessionStore),
    __cache: cache,
  };
}
