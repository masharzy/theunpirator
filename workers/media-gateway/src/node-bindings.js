import { createCache } from "@unpirator/cache";
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

class RedisDurableStorage {
  constructor(cache, sessionId) {
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
