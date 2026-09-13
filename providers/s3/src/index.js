import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function parseReference(reference) {
  if (reference.startsWith("s3://")) {
    const url = new URL(reference);
    return { bucket: url.hostname, key: url.pathname.replace(/^\//, "") };
  }
  const slash = reference.indexOf("/");
  if (slash < 1) throw new Error("S3 providerReference must be s3://bucket/key or bucket/key");
  return { bucket: reference.slice(0, slash), key: reference.slice(slash + 1) };
}

export const s3Provider = {
  name: "s3",
  async resolve({ asset, providerConfig }) {
    const { bucket, key } = parseReference(asset.providerReference);
    const client = new S3Client({
      region: providerConfig.region || "auto",
      endpoint: providerConfig.endpoint,
      forcePathStyle: providerConfig.forcePathStyle === true,
      credentials:
        providerConfig.accessKeyId && providerConfig.secretAccessKey
          ? {
              accessKeyId: providerConfig.accessKeyId,
              secretAccessKey: providerConfig.secretAccessKey,
            }
          : undefined,
    });
    const expiresIn = Math.min(Math.max(Number(providerConfig.expiresIn || 240), 30), 600);
    const url = await getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), {
      expiresIn,
    });
    return {
      url,
      supportsRange: true,
      manifestType: key.toLowerCase().endsWith(".m3u8") ? "hls" : null,
      expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
      cacheTtlSeconds: Math.min(expiresIn - 10, 180),
    };
  },
};
