export function createUnpiratorServerClient({ apiUrl, apiKey }) {
  if (!apiUrl || !apiKey) throw new Error("apiUrl and apiKey are required");
  return {
    async createPlaybackSession(input) {
      const response = await fetch(`${apiUrl}/v1/playback/sessions`, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify(input),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error?.message || "Playback authorization failed");
      return data;
    },
  };
}
