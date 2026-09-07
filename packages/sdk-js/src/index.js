export { ProtectedPlayer, mountProtectedPlayer } from "@unpirator/player";

export function createCustomerBootstrap({ tokenEndpoint, assetId }) {
  return async function bootstrap() {
    const response = await fetch(tokenEndpoint, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetId }),
    });
    if (!response.ok) throw new Error("Customer playback authorization failed");
    return response.json();
  };
}
