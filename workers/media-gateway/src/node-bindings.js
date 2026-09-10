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
      if (Number(committed) === 1) return result;
      await new Promise((resolve) => setTimeout(resolve, Math.min(50, 2 ** attempt)));
    }
    return Response.json({ error: "busy" }, { status: 429 });
  }
}

class RedisSessionNamespace {
  constructor(cache) {
    this.cache = cache;
  }
  idFromName(name) {
    return String(name);
  }
  get(sessionId) {
    const state = new SessionState({
      storage: new RedisDurableStorage(this.cache, sessionId),
    });
    return { fetch: (input, init) => state.fetch(new Request(input, init)) };
  }
}

export function createNodeBindings(source = process.env) {
  const cache = createCache(source);
  return {
    ...source,
    SOURCE_CACHE: new RedisKvBinding(cache, "gateway:kv"),
    SESSION_STATE: new RedisSessionNamespace(cache),
    __cache: cache,
  };
}
