import { CustomerRecordsPage } from "@/components/customer-records-page";
export default function LogsPage() {
  return <CustomerRecordsPage eyebrow="Developer operations" title="Logs" description="A time-ordered stream of gateway usage and security events for this workspace." endpoint="/v1/workspace/logs" empty="No operational events recorded" />;
}
