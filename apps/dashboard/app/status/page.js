import { PublicPage } from "@/components/public-site";
import { ServiceStatus } from "@/components/service-status";
export const metadata = { title: "Status | The Unpirator" };
export default function StatusPage() {
  return (
    <PublicPage
      eyebrow="STATUS"
      title="Service status."
      intro="A live readiness check for the Unpirator control API."
      cta={false}
    >
      <ServiceStatus />
    </PublicPage>
  );
}
