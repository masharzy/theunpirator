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
    return new UpstashAdapter(env.UPSTASH_REDIS_REST_URL, env.UPSTASH_REDIS_REST_TOKEN);
  if (env.REDIS_URL) return new IoRedisAdapter(env.REDIS_URL);
  return new NullCache();
}
