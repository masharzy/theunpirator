"use client";
import { useParams } from "next/navigation";
import { DataPage } from "@/components/data-page";

const definitions = {
  workspaces: [
    "Workspaces",
    "Tenant status, ownership and lifecycle records.",
    "/v1/admin/tenants",
  ],
  usage: ["Usage", "Current usage rollups across every workspace.", "/v1/admin/usage"],
  analytics: [
    "Analytics",
    "Live platform totals calculated from operational records.",
    "/v1/admin/analytics",
  ],
  providers: ["Providers", "Provider availability and incident status.", "/v1/admin/providers"],
  "restricted-integrations": [
    "Restricted integrations",
    "Restricted provider feature controls and current state.",
    "/v1/admin/features",
  ],
  features: ["Features", "Global and workspace feature assignments.", "/v1/admin/features"],
  security: ["Security", "Recent security detections across the platform.", "/v1/admin/security"],
  audit: ["Audit", "Immutable administrative and tenant activity.", "/v1/admin/audit"],
  team: [
    "Admin team",
    "Platform operators, roles, status and MFA readiness.",
    "/v1/admin/accounts",
  ],
  roles: [
    "Roles",
    "Operator role assignments enforced by the API permission layer.",
    "/v1/admin/accounts",
  ],
  announcements: [
    "Announcements",
    "Customer-facing operational notifications and announcements.",
    "/v1/admin/announcements",
  ],
};
const workspaceSections = new Set([
  "overview",
  "members",
  "sites",
  "connections",
  "assets",
  "viewers",
  "devices",
  "sessions",
  "usage",
  "subscription",
  "payments",
  "security",
  "audit",
  "notes",
  "features",
  "restricted",
]);
const systemSections = new Set(["overview", "health", "jobs", "webhooks", "keys", "settings"]);
const words = (value) => value.replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());

export default function AdminModule() {
  const params = useParams();
  const parts = Array.isArray(params.slug) ? params.slug : [params.slug].filter(Boolean);
  let definition = definitions[parts[0]];
  if (parts[0] === "accounts" && parts[1]) {
    definition = [
      "Account details",
      "Identity, workspace membership and active authentication sessions.",
      `/v1/admin/accounts/${parts[1]}`,
    ];
  } else if (parts[0] === "workspaces" && parts[1]) {
    const section = workspaceSections.has(parts[2]) ? parts[2] : "overview";
    definition = [
      `Workspace · ${words(section)}`,
      "Live tenant configuration and operational records.",
      `/v1/admin/tenants/${parts[1]}/${section}`,
    ];
  } else if (parts[0] === "system") {
    const section = systemSections.has(parts[1]) ? parts[1] : "overview";
    definition = [
      `System · ${words(section)}`,
      "Platform infrastructure records with sensitive values excluded.",
      `/v1/admin/system/${section}`,
    ];
  }
  const [title, description, endpoint] = definition || [
    "Admin resource",
    "Live platform health records.",
    "/v1/admin/system/overview",
  ];
  return <DataPage title={title} description={description} endpoint={endpoint} />;
}
