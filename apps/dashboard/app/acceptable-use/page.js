import { PublicPage } from "@/components/public-site";
const sections = [
  {
    title: "Authorized content only",
    body: "Do not use the platform to distribute, proxy or protect media you do not have the right to use.",
  },
  {
    title: "No abuse infrastructure",
    body: "Do not attempt to turn the media gateway into an open proxy, scanning service, credential relay or attack platform.",
  },
  {
    title: "No security interference",
    body: "Do not intentionally defeat tenant isolation, rate limits, signed-session controls or other safeguards.",
  },
  {
    title: "Respect users",
    body: "Do not use viewer identifiers, watermarks or device controls for unlawful surveillance, harassment or deception.",
  },
  {
    title: "Enforcement",
    body: "Access may be limited or suspended when activity threatens the platform, other customers or third-party rights.",
  },
];
export default function Page() {
  return (
    <PublicPage
      eyebrow="ACCEPTABLE USE"
      title="Acceptable Use Policy"
      intro="The service is for protecting authorized media, not bypassing the rights of others."
      sections={sections}
      cta={false}
    />
  );
}
