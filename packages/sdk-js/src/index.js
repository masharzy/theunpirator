export { ProtectedPlayer, mountProtectedPlayer } from "@unpirator/player";

export function getOrCreateDeviceId(storageKey = "unpirator_device_id") {
  try {
    let id = localStorage.getItem(storageKey);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(storageKey, id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

export function createPlaybackBootstrap({
  endpoint = "/api/unpirator/playback",
  src,
  assetId,
  title,
  currentUser,
  deviceId,
  deviceStorageKey,
} = {}) {
  if (Boolean(src) === Boolean(assetId)) throw new Error("Provide either src or assetId");
  return async function bootstrap() {
    const response = await fetch(endpoint, {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        ...(src ? { src, title } : { assetId }),
        deviceId: deviceId || getOrCreateDeviceId(deviceStorageKey),
        ...(currentUser ? { currentUser } : {}),
        client: {
          browser: navigator.userAgent.slice(0, 100),
          os: navigator.platform?.slice(0, 100) || undefined,
        },
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data?.error?.message || "Playback authorization failed");
      error.status = response.status;
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  };
}

export function createCustomerBootstrap({ tokenEndpoint, assetId }) {
  return createPlaybackBootstrap({ endpoint: tokenEndpoint, assetId });
}
