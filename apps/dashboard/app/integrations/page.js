import { redirect } from "next/navigation";

export const metadata = { title: "Integrations | The Unpirator" };

export default function IntegrationsPage() {
  redirect("/docs");
}
