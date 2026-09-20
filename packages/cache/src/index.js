import IORedis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";

class NullCache {
  async get() {
    return null;
  }
  async set() {
    return null;
  }
  async del() {
    return 0;
  }
  async incr() {
    return 1;
  }
  async expire() {
    return 1;
  }
  async ping() {
    return "DISABLED";
  }
}

class MemoryCache {
  constructor() {
    this.values = new Map();
  }
  read(key) {
    const item = this.values.get(key);
    if (!item) return null;
    if (item.expiresAt && item.expiresAt <= Date.now()) {
      this.values.delete(key);
      return null;
    }
    return item.value;
  }
  async get(key) {
    return this.read(key);
  }
  async set(key, value, options = {}) {
    const seconds = Number(options.ex || 0);
    this.values.set(key, {
      value,
      expiresAt: seconds > 0 ? Date.now() + seconds * 1000 : null,
    });
    return "OK";
  }
  async del(key) {
    return this.values.delete(key) ? 1 : 0;
  }
  async incr(key) {
    const value = Number(this.read(key) || 0) + 1;
    await this.set(key, String(value));
    return value;
  }
  async expire(key, seconds) {
    const value = this.read(key);
    if (value == null) return 0;
    await this.set(key, value, { ex: seconds });
    return 1;
  }
  async eval(_script, keys, args) {
    // RedisDurableStorage uses one fixed compare-and-swap script. JavaScript runs
    // each fallback operation to completion before another event-loop task runs,
    // so this check and commit is atomic within a gateway process.
    for (let index = 0; index < keys.length; index++) {
      const offset = index * 4;
      const value = this.read(keys[index]);
      if (args[offset] === "0" ? value != null : value !== args[offset + 1]) return 0;
    }
    for (let index = 0; index < keys.length; index++) {
      const offset = index * 4;
      if (args[offset + 2] === "D") await this.del(keys[index]);
      if (args[offset + 2] === "S") await this.set(keys[index], args[offset + 3], { ex: 86400 });
    }
    return 1;
  }
  async ping() {
    return "MEMORY";
  }
}

class ResilientCache {
  constructor(primary) {
    this.primary = primary;
    this.fallback = new MemoryCache();
    this.primaryUnavailableUntil = 0;
  }
  primaryAvailable() {
    return Date.now() >= this.primaryUnavailableUntil;
  }
  markPrimaryUnavailable() {
    this.primaryUnavailableUntil = Date.now() + 30_000;
  }
  async read(method, args) {
    if (!this.primaryAvailable()) return this.fallback[method](...args);
    try {
      const value = await this.primary[method](...args);
      this.primaryUnavailableUntil = 0;
      return value == null ? this.fallback[method](...args) : value;
    } catch {
      this.markPrimaryUnavailable();
      return this.fallback[method](...args);
    }
  }
  async write(method, args) {
    const fallbackResult = await this.fallback[method](...args);
    if (!this.primaryAvailable()) return fallbackResult;
    try {
      const result = await this.primary[method](...args);
      this.primaryUnavailableUntil = 0;
      return result;
    } catch {
      this.markPrimaryUnavailable();
      return fallbackResult;
    }
  }
  get(...args) {
    return this.read("get", args);
  }
  set(...args) {
    return this.write("set", args);
  }
  del(...args) {
    return this.write("del", args);
  }
  incr(...args) {
    return this.write("incr", args);
  }
  expire(...args) {
    return this.write("expire", args);
  }
  eval(...args) {
    return this.write("eval", args);
  }
  async ping() {
    if (!this.primaryAvailable()) return this.fallback.ping();
    try {
      const result = await this.primary.ping();
      this.primaryUnavailableUntil = 0;
      return result;
    } catch {
      this.markPrimaryUnavailable();
      return this.fallback.ping();
    }
  }
}

class IoRedisAdapter {
  constructor(url) {
    this.client = new IORedis(url, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }
  async ensure() {
    if (this.client.status === "wait") await this.client.connect();
  }
  async get(key) {
    await this.ensure();
    return this.client.get(key);
  }
  async eval(script, keys, args) {
    await this.ensure();
    return this.client.eval(script, keys.length, ...keys, ...args);
  }
  async set(key, value, options = {}) {
    await this.ensure();
    return options.ex ? this.client.set(key, value, "EX", options.ex) : this.client.set(key, value);
  }
  async del(key) {
    await this.ensure();
    return this.client.del(key);
  }
  async incr(key) {
    await this.ensure();
    return this.client.incr(key);
  }
  async expire(key, seconds) {
    await this.ensure();
    return this.client.expire(key, seconds);
  }
  async ping() {
    await this.ensure();
    return this.client.ping();
  }
}

class UpstashAdapter {
  constructor(url, token) {
    this.client = new UpstashRedis({ url, token });
  }
  async get(key) {
    return this.client.get(key);
  }
  async eval(script, keys, args) {
    return this.client.eval(script, keys, args);
  }
  async set(key, value, options = {}) {
    return this.client.set(key, value, options.ex ? { ex: options.ex } : undefined);
  }
  async del(key) {
    return this.client.del(key);
  }
  async incr(key) {
    return this.client.incr(key);
  }
  async expire(key, seconds) {
    return this.client.expire(key, seconds);
  }
  async ping() {
    return this.client.ping();
  }
}

export function createCache(env = process.env) {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN)
    return new ResilientCache(
      new UpstashAdapter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN),
    );
  if (env.REDIS_URL) return new ResilientCache(new IoRedisAdapter(env.REDIS_URL));
  return new NullCache();
}
