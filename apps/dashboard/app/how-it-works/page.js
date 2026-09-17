import { PublicPage } from "@/components/public-site";
import { publicPages } from "@/lib/public-pages";
export default function Page() {
  return <PublicPage {...publicPages.howItWorks} />;
}
