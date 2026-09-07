import {
  createHash,
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";

export const sha256 = (value) => createHash("sha256").update(String(value)).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const safeEqual = (a, b) => {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && timingSafeEqual(aa, bb);
};

export function decodeKeyRing(encoded) {
  if (!encoded) return [];
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
}

export function signPlaybackToken(payload, { ring, activeKid }) {
  const key = ring.find((entry) => entry.kid === activeKid && entry.privateJwk);
  if (!key) throw new Error(`Active signing key '${activeKid}' is unavailable`);
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const input = `${activeKid}.${body}`;
  const signature = sign(
    null,
    Buffer.from(input),
    createPrivateKey({ key: key.privateJwk, format: "jwk" }),
  ).toString("base64url");
  return `${input}.${signature}`;
}

export function verifyPlaybackToken(token, { ring, nowSeconds = Math.floor(Date.now() / 1000) }) {
  const [kid, body, signature, extra] = String(token || "").split(".");
  if (!kid || !body || !signature || extra)
    throw Object.assign(new Error("Malformed playback token"), { code: "INVALID_TOKEN" });
  const key = ring.find((entry) => entry.kid === kid && entry.publicJwk);
  if (!key) throw Object.assign(new Error("Unknown signing key"), { code: "INVALID_TOKEN" });
  const valid = verify(
    null,
    Buffer.from(`${kid}.${body}`),
    createPublicKey({ key: key.publicJwk, format: "jwk" }),
    Buffer.from(signature, "base64url"),
  );
  if (!valid)
    throw Object.assign(new Error("Invalid playback signature"), { code: "INVALID_TOKEN" });
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!Number.isFinite(payload.exp) || payload.exp <= nowSeconds)
    throw Object.assign(new Error("Playback token expired"), { code: "TOKEN_EXPIRED" });
  return { kid, payload };
}

export function encryptJson(value, base64Key) {
  const key = Buffer.from(base64Key || "", "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString("base64");
}

export function decryptJson(encoded, base64Key) {
  const key = Buffer.from(base64Key || "", "base64");
  if (key.length !== 32) throw new Error("APP_ENCRYPTION_KEY_BASE64 must decode to 32 bytes");
  const packed = Buffer.from(encoded, "base64");
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(
    Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"),
  );
}
