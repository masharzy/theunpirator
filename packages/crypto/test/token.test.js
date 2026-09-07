import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { signPlaybackToken, verifyPlaybackToken, encryptJson, decryptJson } from "../src/index.js";

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
});
