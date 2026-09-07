"use client";
import { DataPage } from "@/components/data-page";
export default function Page() {
  return (
    <DataPage
      title="Usage"
      description="Usage meters prepared for subscription billing."
      endpoint="/v1/usage/summary"
    />
  );
}
