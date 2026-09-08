import { CustomerRecordsPage } from "@/components/customer-records-page";
export default function BillingHistoryPage() {
  return <CustomerRecordsPage eyebrow="Business records" title="Billing history" description="Submitted payments, review outcomes and immutable transaction references." endpoint="/v1/billing/payments" empty="No billing transactions yet" />;
}
