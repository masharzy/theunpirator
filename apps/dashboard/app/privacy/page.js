import { PublicPage } from "@/components/public-site";
const sections = [
  {
    title: "Workspace data",
    body: "We process account, workspace, billing and configuration data needed to provide the service.",
  },
  {
    title: "Viewer identifiers",
    body: "Customer servers may send an opaque external user ID. A display label is optional. Customers should avoid sending unnecessary personal information.",
  },
  {
    title: "Device identifiers",
    body: "A random application-generated device ID can be used for device controls when included in a plan. Hardware fingerprinting is not required for the normal integration.",
  },
  {
    title: "Playback and security telemetry",
    body: "Session, usage, device and security-event records may be processed to operate limits, revocation, abuse detection and customer reporting.",
  },
  {
    title: "Customer responsibility",
    body: "Customers remain responsible for providing appropriate notices and obtaining any permissions required for the end-user data they send to the service.",
  },
];
export default function Page() {
  return (
    <PublicPage
      eyebrow="PRIVACY"
      title="Privacy Policy"
      intro="The Unpirator is designed to minimize the personal information required for protected playback."
      sections={sections}
      cta={false}
    />
  );
}
