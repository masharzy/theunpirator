// Generates ready-to-send takedown notices from a finding + case. Plaintext
// only: the dashboard offers copy/download and the tenant sends it through
// the platform's official channel (email or web form).

const PLATFORM_TARGETS = {
  telegram: { to: "dmca@telegram.org", channel: "email", label: "Telegram (DMCA agent)" },
  youtube: { to: null, channel: "web_form", label: "YouTube copyright web form" },
  facebook: { to: null, channel: "web_form", label: "Meta copyright report" },
  web_host: { to: "abuse@<host>", channel: "email", label: "Host abuse contact" },
};

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return "unknown host";
  }
}

function formatDate(date) {
  return date instanceof Date ? date.toISOString().slice(0, 10) : String(date).slice(0, 10);
}

function dmcaBody({ complainant, contactEmail, workDescription, finding, caseRow, host }) {
  return [
    `To: ${PLATFORM_TARGETS[caseRow.platform]?.label || "Content platform"}`,
    "",
    `Date: ${formatDate(new Date())}`,
    "",
    "RE: DMCA Takedown Notice — Copyright Infringement",
    "",
    "I am the copyright owner or authorized agent of the copyrighted work described below. I have a good faith belief that the material identified below is not authorized by the copyright owner, its agent, or the law. Under penalty of perjury, I state that the information in this notice is accurate and that I am authorized to act on behalf of the owner of the exclusive right that is allegedly infringed.",
    "",
    "1. Copyrighted work:",
    `   ${workDescription}`,
    "",
    "2. Infringing material (to be removed or disabled):",
    `   ${finding.url}`,
    `   Title: ${finding.title || "(none)"}`,
    `   Detected on: ${formatDate(finding.firstSeenAt)} via automated monitoring`,
    "",
    "3. Infringer: the account or channel operating the URL above (identity unknown).",
    "",
    "4. Contact information of the complainant:",
    `   ${complainant}`,
    `   Email: ${contactEmail}`,
    "",
    "5. I request the prompt removal or disabling of access to the infringing material.",
    "",
    "Signature:",
    complainant,
    "",
    host ? `Note: this notice concerns content hosted at ${host}.` : "",
  ]
    .filter((line) => line !== "")
    .join("\n");
}

export function generateTakedownNotice({ finding, caseRow, tenant, account }) {
  const platform = caseRow.platform;
  const target = PLATFORM_TARGETS[platform] || PLATFORM_TARGETS.web_host;
  const host = hostFromUrl(finding.url);
  const workDescription = `Educational course content published by "${tenant.name}" (protected by The Unpirator content security platform).`;
  const body = dmcaBody({
    complainant: tenant.name,
    contactEmail: account?.email || "(sender email)",
    workDescription,
    finding,
    caseRow,
    host,
  });
  return {
    platform,
    platformLabel: target.label,
    channel: target.channel,
    to: platform === "web_host" ? `abuse@${host}` : target.to,
    subject: `DMCA takedown request — ${tenant.name} — ${host}`,
    body,
    instructions:
      platform === "youtube"
        ? "Submit through https://www.youtube.com/copyright_complaint (YouTube requires the form be completed by the signed-in copyright owner). The text above maps 1:1 to the form fields."
        : platform === "facebook"
          ? "Submit through https://www.facebook.com/help/contact/208281075826953 (Meta copyright report form). The text above maps to the form fields."
          : `Send the email above to ${platform === "web_host" ? `abuse@${host} (lookup the host's abuse contact if it differs)` : target.to}. Attach a screenshot of the infringing page as evidence.`,
  };
}
