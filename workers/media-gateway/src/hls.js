import { putHlsObject } from "./source.js";
import { assertSourceUrl } from "./origin-policy.js";

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function mapUri(uri, baseUrl, assetId, source, env) {
  const absolute = new URL(uri, baseUrl).toString();
  assertSourceUrl(absolute, source.allowedHosts);
  const id = (await sha256Hex(absolute)).slice(0, 40);
  await putHlsObject(
    env,
    assetId,
    id,
    {
      url: absolute,
      headers: source.headers || {},
      allowedHosts: source.allowedHosts || [],
      allowedOrigins: source.allowedOrigins || [],
    },
    3600,
  );
  return `/v/${assetId}/hls/${id}`;
}

export async function rewriteHlsManifest(text, baseUrl, assetId, source, env) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    if (!line) {
      out.push(line);
      continue;
    }
    if (!line.startsWith("#")) {
      out.push(await mapUri(line.trim(), baseUrl, assetId, source, env));
      continue;
    }
    if (line.includes('URI="')) {
      const matches = [...line.matchAll(/URI="([^"]+)"/g)];
      let rewritten = line;
      for (const match of matches)
        rewritten = rewritten.replace(
          `URI="${match[1]}"`,
          `URI="${await mapUri(match[1], baseUrl, assetId, source, env)}"`,
        );
      out.push(rewritten);
    } else out.push(line);
  }
  return out.join("\n");
}
