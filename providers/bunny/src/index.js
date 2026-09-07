export const bunnyProvider = {
  name: "bunny",
  async resolve({ asset, providerConfig }) {
    // providerReference is a customer-authorized Bunny pull-zone/origin URL.
    // Private credentials remain encrypted in the control plane and can be forwarded as origin headers.
    return {
      url: asset.providerReference,
      headers: providerConfig.accessKey
        ? { AccessKey: providerConfig.accessKey, ...(providerConfig.headers || {}) }
        : providerConfig.headers || {},
      supportsRange: true,
      manifestType:
        providerConfig.manifestType || (asset.providerReference.includes(".m3u8") ? "hls" : null),
      cacheTtlSeconds: Number(providerConfig.cacheTtlSeconds || 120),
    };
  },
};
