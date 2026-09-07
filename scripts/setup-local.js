import { generateKeyPairSync, randomBytes } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
const path = new URL("../.env", import.meta.url);
if (existsSync(path)) {
  console.log("Existing .env preserved");
  process.exit(0);
}
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const kid = "local-2026";
const ring = [
  {
    kid,
    privateJwk: privateKey.export({ format: "jwk" }),
    publicJwk: publicKey.export({ format: "jwk" }),
  },
];
const secret = () => randomBytes(32).toString("hex");
const control = secret(),
  internal = secret();
writeFileSync(
  path,
  `NODE_ENV=development\nAPI_PORT=4100\nDATABASE_URL=postgresql://unpirator:unpirator@localhost:55432/unpirator\nREDIS_URL=redis://localhost:56379\nDASHBOARD_URL=http://localhost:3100\nAPP_ENCRYPTION_KEY_BASE64=${randomBytes(32).toString("base64")}\nSIGNING_KEYS_B64=${Buffer.from(JSON.stringify(ring)).toString("base64")}\nACTIVE_SIGNING_KID=${kid}\nGATEWAY_CONTROL_SECRET=${control}\nGATEWAY_INTERNAL_SECRET=${internal}\nGATEWAY_PUBLIC_URL=http://localhost:8787\nGATEWAY_CONTROL_URL=http://localhost:8787\nYOUTUBE_CUSTOM_GLOBAL=false\n`,
);
writeFileSync(
  new URL("../workers/media-gateway/.dev.vars", import.meta.url),
  `PLAYBACK_PUBLIC_KEYS_B64=${Buffer.from(JSON.stringify(ring.map(({ kid, publicJwk }) => ({ kid, publicJwk })))).toString("base64")}\nGATEWAY_CONTROL_SECRET=${control}\nGATEWAY_INTERNAL_SECRET=${internal}\nINTERNAL_API_URL=http://localhost:4100\n`,
);
console.log("Local environment and gateway public keys generated. Secrets were not printed.");
