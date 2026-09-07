export const hlsProvider = {
  name: "hls",
  async resolve({ asset, providerConfig }) {
    return {
      url: asset.providerReference,
      headers: providerConfig.headers || {},
      supportsRange: true,
      manifestType: "hls",
      contentType: "application/vnd.apple.mpegurl",
      cacheTtlSeconds: Number(providerConfig.cacheTtlSeconds || 60),
    };
  },
};
