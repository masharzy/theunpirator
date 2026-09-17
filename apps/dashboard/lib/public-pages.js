export const publicPages = {
  features: {
    eyebrow: "PRODUCT",
    title: "Protection that follows the playback session.",
    intro:
      "Build a protected delivery layer around the media you already own, without moving access decisions into the browser.",
    sections: [
      {
        title: "Protected delivery",
        body: "Keep private media sources server-side and deliver registered assets through the Unpirator gateway.",
        items: [
          "Short-lived signed playback",
          "Revocable sessions",
          "Registered source boundaries",
        ],
      },
      {
        title: "Viewer accountability",
        body: "Tie playback to your own viewer identity and the controls included in the purchased plan.",
        items: ["Dynamic watermark", "Device tracking", "Concurrent stream control"],
      },
      {
        title: "Developer control",
        body: "Your backend remains the authority for who is allowed to watch.",
        items: [
          "API keys stay server-side",
          "Webhooks when included",
          "Versioned integration packages",
        ],
      },
    ],
  },
  howItWorks: {
    eyebrow: "HOW IT WORKS",
    title: "Your app decides. Unpirator delivers.",
    intro:
      "A protected session starts only after your server connects the viewer, the content reference and the plan features that are actually enabled.",
    sections: [
      {
        title: "1. Register the source",
        body: "Your server sends private source metadata to Unpirator over server-to-server HTTPS and receives a playbackRef.",
      },
      {
        title: "2. Render the player",
        body: "The browser receives the playbackRef, never your provider credentials or private source configuration.",
      },
      {
        title: "3. Authorize the viewer",
        body: "The player calls your playback endpoint. Your server authenticates the viewer and decides whether access is allowed.",
      },
      {
        title: "4. Create a session",
        body: "Unpirator creates a short-lived protected session with only the features enabled by that customer's plan.",
      },
      {
        title: "5. Stream through the gateway",
        body: "The media gateway validates the session and serves the allowed media response.",
      },
      {
        title: "6. Revoke when needed",
        body: "Where enabled, device and concurrency controls can stop or replace active sessions.",
      },
    ],
  },
  integrations: {
    eyebrow: "INTEGRATIONS",
    title: "Keep your stack. Add protected playback.",
    intro:
      "Use a small server-side integration plus the Unpirator player. The security boundary stays on your server.",
    sections: [
      {
        title: "Next.js & React",
        body: "Use the React player and Next.js integration helpers for same-origin playback bootstrap endpoints.",
      },
      {
        title: "Node & Express",
        body: "Authorize viewers in your existing API and create protected sessions server-to-server.",
      },
      {
        title: "Laravel & PHP",
        body: "Keep API keys in backend configuration and return only the playback bootstrap response to the browser.",
      },
      {
        title: "Django & Flask",
        body: "Use your existing authentication and entitlement model before asking Unpirator for playback.",
      },
      {
        title: "HTML + backend",
        body: "The player can live on a plain page, but the API key and authorization decision still belong on a server.",
      },
      {
        title: "Storage & providers",
        body: "Connect supported private HTTP/HLS and object-storage sources without exposing storage credentials to the viewer.",
      },
    ],
  },
  security: {
    eyebrow: "SECURITY",
    title: "No magic labels. Concrete controls.",
    intro:
      "Unpirator protection is plan-driven. Customers cannot choose Standard, Strict or Maximum; the plan's enabled features define the actual behavior.",
    sections: [
      {
        title: "Server-side source boundary",
        body: "Private source URLs and provider credentials do not belong in the browser.",
      },
      {
        title: "Signed short-lived sessions",
        body: "Playback uses time-limited signed authorization that can be revoked instead of permanent public media URLs.",
      },
      {
        title: "Plan-enforced features",
        body: "Watermark, device controls, integrity checks, browser restrictions and concurrency controls activate only when included in the purchased plan.",
      },
      {
        title: "Fail-closed gateway",
        body: "Invalid, expired, revoked or mismatched sessions are rejected before protected media delivery.",
      },
      {
        title: "Origin restrictions",
        body: "Registered host boundaries prevent the media gateway from becoming an arbitrary URL proxy.",
      },
      {
        title: "Honest limits",
        body: "No browser system can guarantee prevention of every screen recording. Protection focuses on access control, accountability and reducing casual redistribution.",
      },
    ],
  },
  useCases: {
    eyebrow: "USE CASES",
    title: "For video that should stay with the right audience.",
    intro:
      "Use the same protected playback layer across learning products, memberships and private media applications.",
    sections: [
      {
        title: "Education platforms",
        body: "Connect course enrollment checks to viewer authorization, device controls and visible watermarking.",
      },
      {
        title: "Membership products",
        body: "Turn a paid or private membership decision into a short-lived playback session.",
      },
      {
        title: "Internal training",
        body: "Deliver company-only videos without publishing reusable provider URLs to the browser.",
      },
      {
        title: "Premium communities",
        body: "Add session revocation and concurrent stream controls to exclusive video collections.",
      },
      {
        title: "SaaS product teams",
        body: "Embed protected playback into an existing product without replacing the product's own user database.",
      },
      {
        title: "Multi-site operators",
        body: "Use plan limits to manage multiple properties from one workspace.",
      },
    ],
  },
  about: {
    eyebrow: "COMPANY",
    title: "Built around one boundary: private video should not become a public URL.",
    intro:
      "The Unpirator is a protected video-delivery product for teams that want their own application to keep control of viewer access.",
    sections: [
      {
        title: "What we build",
        body: "Developer tools, playback infrastructure and customer controls that sit between authorization and media delivery.",
      },
      {
        title: "What we do not promise",
        body: "We do not claim that browser video can be made impossible to record. We focus on enforceable access controls and accountability.",
      },
      {
        title: "How we design",
        body: "Security-sensitive secrets stay server-side, plan features are concrete, and customer applications remain the source of truth for users and content access.",
      },
    ],
  },
};
