// Probe the session playback-window behavior: does an integrity report at a
// far position authorize tickets for that position's sequences?
const ORIGIN = "https://theunpirator-demo.pages.dev";
const s = await fetch(`${ORIGIN}/api/unpirator/playback`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    assetId: "2243c5c7-dff7-4444-a60b-7f64c05daa1f",
    deviceId: "window-test-" + Date.now().toString(36),
    client: {},
  }),
});
const d = await s.json();
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
const bd = await b.json();
console.log("bootstrap:", b.status, "| variants:", (bd.manifest?.video || []).length);
const H = { authorization: `Bearer ${d.token}`, "content-type": "application/json" };
const integrity = async (seq, pos) => {
  const r = await fetch(`${base}/integrity`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ sequence: seq, tampered: false, positionSeconds: pos, videoVariant: 0, audioVariant: 0 }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const ticket = async (seq) => {
  const r = await fetch(`${base}/ticket`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ track: "video", variant: 0, sequence: seq }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
};
const i1 = await integrity(1, 0);
console.log("integrity@0:", i1.status, JSON.stringify(i1.body).slice(0, 110));
const t1 = await ticket(1);
console.log("ticket@1  after integ@0  :", t1.status, JSON.stringify(t1.body).slice(0, 90));
const i2 = await integrity(2, 300);
console.log("integrity@300:", i2.status, JSON.stringify(i2.body).slice(0, 110));
const t2 = await ticket(75);
console.log("ticket@75 after integ@300:", t2.status, JSON.stringify(t2.body).slice(0, 90));
const t3 = await ticket(76);
console.log("ticket@76:", t3.status, JSON.stringify(t3.body).slice(0, 90));
