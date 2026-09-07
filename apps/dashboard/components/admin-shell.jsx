"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  Database,
  Gauge,
  KeyRound,
  Search,
  ShieldAlert,
  Users,
  Waypoints,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
const groups = [
  [
    "Operate",
    [
      [Gauge, "/admin", "Command Center"],
      [Users, "/admin/accounts", "Accounts"],
      [Building2, "/admin/workspaces", "Workspaces"],
    ],
  ],
  [
    "Revenue",
    [
      [CreditCard, "/admin/subscriptions", "Subscriptions"],
      [CreditCard, "/admin/payments", "Payments"],
      [Waypoints, "/admin/payment-methods", "Payment methods"],
      [Database, "/admin/plans", "Plans"],
    ],
  ],
  [
    "Platform",
    [
      [Activity, "/admin/usage", "Usage"],
      [Activity, "/admin/analytics", "Analytics"],
      [Waypoints, "/admin/providers", "Providers"],
      [ShieldAlert, "/admin/restricted-integrations", "Restricted"],
      [Waypoints, "/admin/features", "Features"],
    ],
  ],
  [
    "Trust",
    [
      [ShieldAlert, "/admin/security", "Security"],
      [Database, "/admin/audit", "Audit"],
      [Users, "/admin/team", "Team"],
      [KeyRound, "/admin/roles", "Roles"],
    ],
  ],
  [
    "System",
    [
      [Activity, "/admin/system", "System"],
      [Bell, "/admin/notifications", "Notifications"],
      [Bell, "/admin/announcements", "Announcements"],
    ],
  ],
];
const visibleRoutes = {
  operations_admin: ["/admin", "/admin/workspaces", "/admin/usage", "/admin/analytics", "/admin/providers", "/admin/security", "/admin/system"],
  billing_admin: ["/admin", "/admin/workspaces", "/admin/subscriptions", "/admin/payments", "/admin/payment-methods", "/admin/plans"],
  support_admin: ["/admin", "/admin/workspaces", "/admin/usage", "/admin/security"],
  security_admin: ["/admin", "/admin/workspaces", "/admin/usage", "/admin/providers", "/admin/restricted-integrations", "/admin/security", "/admin/audit"],
  auditor: ["/admin", "/admin/accounts", "/admin/workspaces", "/admin/subscriptions", "/admin/payments", "/admin/usage", "/admin/providers", "/admin/security", "/admin/audit"],
};
export function AdminShell({ children }) {
  const path = usePathname(),
    auth = useAuth();
  const [query, setQuery] = useState(""),
    [health, setHealth] = useState("checking"),
    [alerts, setAlerts] = useState(0);
  useEffect(() => {
    api("/health/ready")
      .then(() => setHealth("operational"))
      .catch(() => setHealth("incident"));
    api("/v1/admin/security")
      .then((data) => setAlerts(data.items?.length || 0))
      .catch(() => {});
  }, []);
  return (
    <div className="min-h-screen bg-[#0b0d0c] text-white lg:grid lg:grid-cols-[270px_1fr]">
      <aside className="border-r border-white/10 bg-[#101411] p-5">
        <Link href="/" className="flex items-center justify-between text-lg font-semibold">
          unpirator
          <span className="rounded bg-[#d7ff75] px-2 py-1 text-[10px] font-black tracking-[.18em] text-[#162008]">
            ADMIN
          </span>
        </Link>
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
          <span className="grid size-9 place-items-center rounded-full bg-[#d7ff75] text-xs font-bold text-black">
            {auth?.account?.email?.[0]?.toUpperCase() || "A"}
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs">{auth?.account?.email}</p>
            <p className="text-[10px] uppercase tracking-wider text-white/45">
              {auth?.account?.platformRole?.replaceAll("_", " ")}
            </p>
          </div>
        </div>
        <nav className="mt-6 space-y-6" aria-label="Admin navigation">
          {groups.map(([label, links]) => (
            <section key={label}>
              <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-white/35">
                {label}
              </p>
              <div className="space-y-1">
                {links.map(
                  ([Icon, href, name]) =>
                    (auth?.account?.platformRole === "super_admin" || visibleRoutes[auth?.account?.platformRole]?.includes(href)) &&
                    (!query || name.toLowerCase().includes(query.toLowerCase())) && (
                      <Link
                        key={href}
                        href={href}
                        className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${path === href ? "bg-[#d7ff75] text-black" : "text-white/65 hover:bg-white/5 hover:text-white"}`}
                      >
                        <Icon size={15} />
                        {name}
                      </Link>
                    ),
                )}
              </div>
            </section>
          ))}
        </nav>
      </aside>
      <div>
        <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-white/10 bg-[#0b0d0c]/95 px-6 py-4 backdrop-blur">
          <label className="flex min-w-56 flex-1 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3">
            <Search size={15} className="text-white/40" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent py-2 text-sm outline-none"
              placeholder="Search admin navigation"
            />
          </label>
          <span className="rounded-full border border-sky-400/25 bg-sky-400/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-300">
            {process.env.NEXT_PUBLIC_APP_ENV || "Production"}
          </span>
          <span
            className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${health === "operational" ? "bg-emerald-400/10 text-emerald-300" : "bg-red-400/10 text-red-300"}`}
          >
            {health}
          </span>
          <Link
            href="/admin/notifications"
            className="relative rounded-lg border border-white/10 p-2"
            aria-label={`${alerts} security notifications`}
          >
            <Bell size={17} />
            {alerts > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-red-500 text-[9px]">
                {Math.min(alerts, 9)}
              </span>
            )}
          </Link>
        </header>
        <main className="min-h-[calc(100vh-70px)] bg-[#f2f4ed] p-6 text-[#172014] md:p-10">
          {children}
        </main>
      </div>
    </div>
  );
}
