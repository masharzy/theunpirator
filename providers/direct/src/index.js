export const directProvider = {
  name: "direct",
  async resolve({ asset, providerConfig }) {
    return {
      url: asset.providerReference,
      headers: providerConfig.headers || {},
      supportsRange: true,
      contentType: providerConfig.contentType || null,
      cacheTtlSeconds: Number(providerConfig.cacheTtlSeconds || 120),
    };
  },
};
