import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { blindIndex, decryptJson, deriveKey, encryptJson, signPlaybackToken, verifyPlaybackToken } from "../src/index.js";

describe("crypto", () => {
  it("signs and verifies playback grants", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ed25519");
    const ring = [
      {
        kid: "k1",
        privateJwk: privateKey.export({ format: "jwk" }),
        publicJwk: publicKey.export({ format: "jwk" }),
      },
    ];
    const token = signPlaybackToken({ sub: "u1", exp: 5000 }, { ring, activeKid: "k1" });
    expect(verifyPlaybackToken(token, { ring, nowSeconds: 100 }).payload.sub).toBe("u1");
  });
  it("encrypts provider configuration", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const encrypted = encryptJson({ secret: "value" }, key);
    expect(decryptJson(encrypted, key)).toEqual({ secret: "value" });
  });

  it("binds encrypted viewer identity to tenant context", () => {
    const key = Buffer.alloc(32, 9).toString("base64");
    const encrypted = encryptJson({ email: "viewer@example.com" }, key, "viewer-email:tenant-a");
    expect(decryptJson(encrypted, key, "viewer-email:tenant-a")).toEqual({
      email: "viewer@example.com",
    });
    expect(() => decryptJson(encrypted, key, "viewer-email:tenant-b")).toThrow();
  });

  it("derives domain-separated application subkeys", () => {
    const key = Buffer.alloc(32, 13).toString("base64");
    const lookup = deriveKey(key, "viewer-email:lookup:v2");
    const encryption = deriveKey(key, "viewer-email:encryption:v2");
    expect(Buffer.from(lookup, "base64")).toHaveLength(32);
    expect(Buffer.from(encryption, "base64")).toHaveLength(32);
    expect(lookup).not.toBe(encryption);
  });

  it("creates deterministic context-separated blind indexes", () => {
    const key = Buffer.alloc(32, 11).toString("base64");
    const first = blindIndex("viewer@example.com", key, "viewer-email");
    const second = blindIndex("viewer@example.com", key, "viewer-email");
    const differentContext = blindIndex("viewer@example.com", key, "other-context");
    expect(first).toBe(second);
    expect(first).not.toBe(differentContext);
    expect(first).not.toContain("viewer@example.com");
  });
});
