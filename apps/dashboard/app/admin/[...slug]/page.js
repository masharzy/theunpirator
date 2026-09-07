"use client";
import { useParams } from "next/navigation";
import { DataPage } from "@/components/data-page";
const endpoints = {
  accounts: "/v1/admin/accounts",
  workspaces: "/v1/admin/tenants",
  subscriptions: "/v1/admin/subscriptions",
  plans: "/v1/admin/plans",
  providers: "/v1/admin/providers",
  features: "/v1/admin/features",
  security: "/v1/admin/security",
  audit: "/v1/admin/audit",
};
export default function AdminModule() {
  const params = useParams(),
    parts = Array.isArray(params.slug) ? params.slug : [params.slug],
    key = parts[0],
    title = parts
      .map((part) => part.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase()))
      .join(" / "),
    endpoint = endpoints[key];
  if (endpoint)
    return (
      <DataPage
        title={title}
        description="Platform-wide operator records. API permissions remain authoritative."
        endpoint={endpoint}
      />
    );
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#657154]">ADMIN MODULE</p>
      <h1 className="mt-3 text-4xl font-semibold">{title}</h1>
      <div className="mt-8 rounded-2xl border border-dashed border-[#cbd3bf] bg-white p-10">
        <h2 className="font-semibold">Module route is ready</h2>
        <p className="mt-2 max-w-xl text-sm text-[#687260]">
          This operator surface is part of the admin route tree. Live records and actions will
          appear when its domain model is implemented.
        </p>
      </div>
    </div>
  );
}
