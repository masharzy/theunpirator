import { PublicPage } from "@/components/public-site";
const sections = [
  {
    title: "Using the service",
    body: "You must use the service only for media and systems you are authorized to operate, and you are responsible for the viewers and content connected to your workspace.",
  },
  {
    title: "Accounts and security",
    body: "Keep account credentials and API keys secure. Activity performed through your workspace may be treated as authorized activity unless you report compromise.",
  },
  {
    title: "Service changes",
    body: "Features, limits and availability may change as the product evolves. Active plan entitlements determine the features available to a workspace.",
  },
  {
    title: "Availability",
    body: "No online service can promise uninterrupted operation. Status and maintenance information should be read together with these terms.",
  },
  {
    title: "Liability boundary",
    body: "The service is an access-control and delivery layer, not a guarantee that browser-viewed media can never be copied or recorded.",
  },
];
export default function Page() {
  return (
    <PublicPage
      eyebrow="TERMS"
      title="Terms of Service"
      intro="These terms set the baseline rules for using The Unpirator."
      sections={sections}
      cta={false}
    />
  );
}
