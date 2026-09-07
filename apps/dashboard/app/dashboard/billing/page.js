"use client";
import { DataPage } from "@/components/data-page";
export default function Page() {
  return (
    <DataPage
      title="Billing"
      description="Subscription and effective entitlements."
      endpoint="/v1/billing"
    />
  );
}
