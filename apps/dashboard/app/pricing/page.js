import { PublicPage } from "@/components/public-site";
import { PublicPlans } from "@/components/public-plans";
export const metadata = { title: "Pricing | The Unpirator" };
export default function PricingPage() {
  return (
    <PublicPage
      eyebrow="PRICING"
      title="Plans built from real product features."
      intro="Every public plan below comes directly from the Admin Plans configuration. Change a price, limit or entitlement in Admin and this page follows automatically."
      cta={false}
    >
      <section className="mx-auto max-w-7xl px-5 py-16 md:px-8 md:py-24">
        <PublicPlans />
      </section>
    </PublicPage>
  );
}
