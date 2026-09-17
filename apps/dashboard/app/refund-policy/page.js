import { PublicPage } from "@/components/public-site";
const sections = [
  {
    title: "Plan pricing",
    body: "Public prices and plan entitlements are taken from the active Admin Plans configuration shown on the Pricing page.",
  },
  {
    title: "Payment review",
    body: "Where manual payment review is used, access may remain pending until the submitted payment is verified.",
  },
  {
    title: "Refund requests",
    body: "Refund eligibility depends on the payment circumstances, service usage and applicable law. A payment should not be represented as automatically refundable unless that is explicitly stated during checkout.",
  },
  {
    title: "Plan changes",
    body: "Changing plans can change enabled features and limits. Customers should review the current plan details before paying.",
  },
  {
    title: "Billing records",
    body: "Customers can review plan and payment history from the authenticated workspace billing area.",
  },
];
export default function Page() {
  return (
    <PublicPage
      eyebrow="BILLING"
      title="Billing & Refund Policy"
      intro="How plan charges, payment review and refund requests are handled."
      sections={sections}
      cta={false}
    />
  );
}
