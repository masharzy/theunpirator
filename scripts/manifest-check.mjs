// Inspect the manifest the gateway returns for the YouTube demo asset.
const ORIGIN = "https://theunpirator-demo.pages.dev";
const s = await fetch(`${ORIGIN}/api/unpirator/playback`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    assetId: "2243c5c7-dff7-4444-a60b-7f64c05daa1f",
    deviceId: "manifest-check-" + Date.now().toString(36),
    client: {},
  }),
});
const d = await s.json();
console.log("session:", s.status);
const mediaUrl = new URL(d.playbackUrl);
mediaUrl.search = "";
const base = mediaUrl.toString().replace(/\/media$/, "");
const pair = await crypto.subtle.generateKey(
  { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  false,
  ["encrypt", "unwrapKey"],
);
const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
const b = await fetch(`${base}/bootstrap`, {
  method: "POST",
  headers: { authorization: `Bearer ${d.token}`, "content-type": "application/json" },
  body: JSON.stringify({
    publicKey: jwk,
    playerBuild: "protected-v1",
    providerProof: { type: "youtube_web", contentBinding: "abcd1234", token: "x".repeat(60) },
  }),
});
const bd = await b.json().catch(() => ({}));
console.log("bootstrap:", b.status);
const m = bd.manifest || {};
console.log("durationMs:", m.durationMs);
console.log("video variants:", (m.video || []).length);
console.log("video[0] segments:", (m.video?.[0]?.segments || []).length);
console.log("audio variants:", (m.audio || []).length);
console.log("audio[0] segments:", (m.audio?.[0]?.segments || []).length);
console.log("video[0] sample:", JSON.stringify(m.video?.[0] || null).slice(0, 320));
