import { CustomerRecordsPage } from "@/components/customer-records-page";
export default function AuditPage() {
  return (
    <CustomerRecordsPage
      eyebrow="Workspace governance"
      title="Audit log"
      description="Trace administrative changes, actors, affected objects and source IPs."
      endpoint="/v1/workspace/audit"
      empty="No workspace changes recorded"
    />
  );
}
