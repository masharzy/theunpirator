import { generateKeyPairSync, randomBytes } from "node:crypto";

const kid = `ed25519_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}_${randomBytes(3).toString("hex")}`;
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const ring = [
  {
    kid,
    privateJwk: privateKey.export({ format: "jwk" }),
    publicJwk: publicKey.export({ format: "jwk" }),
  },
];
const encoded = Buffer.from(JSON.stringify(ring), "utf8").toString("base64");
const publicEncoded = Buffer.from(
  JSON.stringify(ring.map(({ kid: k, publicJwk }) => ({ kid: k, publicJwk }))),
  "utf8",
).toString("base64");

console.log(`ACTIVE_SIGNING_KID=${kid}`);
console.log(`SIGNING_KEYS_B64=${encoded}`);
console.log(`PLAYBACK_PUBLIC_KEYS_B64=${publicEncoded}`);
console.log(`APP_ENCRYPTION_KEY_BASE64=${randomBytes(32).toString("base64")}`);
