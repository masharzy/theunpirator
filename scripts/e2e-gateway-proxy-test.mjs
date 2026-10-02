// End-to-end test of the demo /gw same-origin proxy: replays the player's
// exact request flow (session create -> bootstrap -> ticket -> chunk ->
// decrypt) against the deployed Pages site.
const ORIGIN = "https://theunpirator-demo.pages.dev";
const ASSET_ID = process.argv[2] || "2243c5c7-dff7-4444-a60b-7f64c05daa1f";
const DEVICE = `e2e-proxy-${Date.now().toString(36)}`;

const step = (name, ok, detail) =>
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);

const session = await fetch(`${ORIGIN}/api/unpirator/playback`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ assetId: ASSET_ID, deviceId: DEVICE, client: {} }),
});
const state = await session.json();
const playbackUrl = String(state.playbackUrl || "");
step("session create", session.ok, `status=${session.status} playbackUrl=${playbackUrl}`);
if (!session.ok) process.exit(1);

const sameOrigin = playbackUrl.startsWith(`${ORIGIN}/gw`);
step("playbackUrl rewritten to /gw", sameOrigin, playbackUrl);
if (!sameOrigin) process.exit(1);

const mediaUrl = new URL(playbackUrl);
mediaUrl.search = "";
let baseUrl = mediaUrl.toString().replace(/\/media$/, "");
if (process.env.GATEWAY_DIRECT)
  baseUrl = baseUrl.replace(/^https?:\/\/[^/]+\/gw/, "http://localhost:8787");

const pair = await crypto.subtle.generateKey(
  { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  false,
  ["encrypt", "unwrapKey"],
);
const publicKey = await crypto.subtle.exportKey("jwk", pair.publicKey);

const boot = await fetch(`${baseUrl}/bootstrap`, {
  method: "POST",
  headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json" },
  body: JSON.stringify({ publicKey, playerBuild: "protected-v1" }),
});
const bootData = await boot.json().catch(() => ({}));
step("gateway bootstrap via /gw", boot.ok, `status=${boot.status} transport=${bootData.transport || "?"}`);
if (!boot.ok) console.log("bootstrap body:", (await boot.text().catch(() => "")).slice(0, 500));
if (!boot.ok) process.exit(1);

const key = await crypto.subtle.unwrapKey(
  "raw",
  Uint8Array.from(atob(bootData.wrappedKey), (c) => c.charCodeAt(0)),
  pair.privateKey,
  { name: "RSA-OAEP" },
  { name: "AES-GCM" },
  false,
  ["decrypt"],
);
step("unwrap media key", true, "AES-GCM key ready");

const manifest = bootData.manifest || {};
const videoVariants = Object.keys(manifest.video || {});
const variant = videoVariants[0] || "0";
step("manifest has variants", videoVariants.length > 0, `video variants: ${videoVariants.join(",")}`);

const ticketRes = await fetch(`${baseUrl}/ticket`, {
  method: "POST",
  headers: { authorization: `Bearer ${state.token}`, "content-type": "application/json" },
  body: JSON.stringify({ track: "video", variant, sequence: 0 }),
});
const ticket = await ticketRes.json().catch(() => ({}));
step("ticket", ticketRes.ok, `status=${ticketRes.status}`);

const chunkRes = await fetch(`${baseUrl}/chunk/video/${variant}/0?ticket=${encodeURIComponent(ticket.ticket)}`, {
  headers: { authorization: `Bearer ${state.token}` },
});
const iv = chunkRes.headers.get("x-unpirator-iv");
const context = chunkRes.headers.get("x-unpirator-context") || "";
step("chunk fetch", chunkRes.ok, `status=${chunkRes.status} bytes=${chunkRes.headers.get("content-length") || "?"}`);
if (!chunkRes.ok || !iv) process.exit(1);

const plain = await crypto.subtle.decrypt(
  { name: "AES-GCM", iv: Uint8Array.from(atob(iv), (c) => c.charCodeAt(0)), additionalData: new TextEncoder().encode(context) },
  key,
  await chunkRes.arrayBuffer(),
);
step("decrypt first video segment", plain.byteLength > 1000, `${plain.byteLength} bytes of media`);

console.log(process.exitCode ? "\nE2E FAILED" : "\nE2E OK — player flow fully works through /gw proxy");
