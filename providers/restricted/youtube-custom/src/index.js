export const youtubeCustomProvider = {
  name: "youtube_custom",
  async resolve() {
    const error = new Error(
      "Restricted provider adapter has no implementation. Configure an independently authorized integration before enabling it.",
    );
    error.code = "RESTRICTED_PROVIDER_UNCONFIGURED";
    error.status = 503;
    throw error;
  },
};
