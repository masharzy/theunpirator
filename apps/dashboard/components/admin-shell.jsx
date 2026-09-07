"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Bell,
  Building2,
  CreditCard,
  Database,
  Gauge,
  KeyRound,
  Menu,
  Search,
  ShieldAlert,
  Users,
  Waypoints,
  X,
} from "lucide-react";
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
  operations_admin: [
    "/admin",
    "/admin/workspaces",
    "/admin/usage",
    "/admin/analytics",
    "/admin/providers",
    "/admin/security",
    "/admin/system",
    "/admin/notifications",
  ],
  billing_admin: [
    "/admin",
    "/admin/workspaces",
    "/admin/subscriptions",
    "/admin/payments",
    "/admin/payment-methods",
    "/admin/plans",
    "/admin/notifications",
  ],
  support_admin: [
    "/admin",
    "/admin/workspaces",
    "/admin/usage",
    "/admin/security",
    "/admin/notifications",
  ],
  security_admin: [
    "/admin",
    "/admin/workspaces",
    "/admin/usage",
    "/admin/providers",
    "/admin/restricted-integrations",
    "/admin/security",
    "/admin/audit",
    "/admin/notifications",
  ],
  auditor: [
    "/admin",
    "/admin/accounts",
    "/admin/workspaces",
    "/admin/subscriptions",
    "/admin/payments",
    "/admin/usage",
    "/admin/providers",
    "/admin/security",
    "/admin/audit",
    "/admin/notifications",
  ],
};

function Sidebar({ path, role, query, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-[-.04em]">
          unpirator<span className="text-[#d7ff75]">.</span>
        </Link>
        <span className="rounded-full border border-[#d7ff75]/25 bg-[#d7ff75]/10 px-2.5 py-1 text-[9px] font-black tracking-[.18em] text-[#d7ff75]">
          ADMIN
        </span>
      </div>

      <nav className="mt-8 flex-1 space-y-6 overflow-y-auto pr-1" aria-label="Admin navigation">
        {groups.map(([label, links]) => {
          const visible = links.filter(([, href, name]) => {
            const roleAllowed = role === "super_admin" || visibleRoutes[role]?.includes(href);
            const queryMatch = !query || name.toLowerCase().includes(query.toLowerCase());
            return roleAllowed && queryMatch;
          });
          if (!visible.length) return null;
          return (
            <section key={label}>
              <p className="mb-2 px-2 text-[9px] font-black uppercase tracking-[.2em] text-white/30">
                {label}
              </p>
              <div className="space-y-1">
                {visible.map(([Icon, href, name]) => {
                  const active = href === "/admin" ? path === href : path.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      onClick={onNavigate}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
                        active
                          ? "bg-[#d7ff75] font-semibold text-[#162008]"
                          : "text-white/58 hover:bg-white/6 hover:text-white"
                      }`}
                    >
                      <Icon size={15} />
                      {name}
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </nav>

      <Link
        href="/dashboard"
        className="mt-5 flex items-center gap-2 rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/60 hover:bg-white/5 hover:text-white"
      >
        <ArrowLeft size={14} />
        Customer dashboard
      </Link>
    </div>
  );
}

export function AdminShell({ children }) {
  const path = usePathname();
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [health, setHealth] = useState("checking");
  const [query, setQuery] = useState("");
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    api("/health/ready")
      .then(() => setHealth("operational"))
      .catch(() => setHealth("incident"));
    api("/v1/admin/commerce/notifications")
      .then((data) => setUnread((data.items || []).filter((item) => !item.readAt).length))
      .catch(() => setUnread(0));
  }, []);

  return (
    <div className="min-h-screen bg-[#0c100d] lg:grid lg:grid-cols-[280px_1fr]">
      <aside className="hidden h-screen border-r border-white/8 bg-[#101511] p-5 lg:sticky lg:top-0 lg:block">
        <Sidebar path={path} role={auth?.account?.platformRole} query={query} />
      </aside>

      <div className="min-w-0 bg-[#f2f4ed] text-[#172014]">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#dfe4d8] bg-[#f7f8f3]/95 px-4 py-3 backdrop-blur md:px-6">
          <button
            className="rounded-xl border border-[#d8ded0] bg-white p-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open admin navigation"
          >
            <Menu size={18} />
          </button>
          <label className="hidden max-w-xl flex-1 items-center gap-2 rounded-xl border border-[#d9dfd2] bg-white px-3 sm:flex">
            <Search size={15} className="text-[#88927f]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full bg-transparent py-2.5 text-sm outline-none"
              placeholder="Filter admin navigation"
            />
          </label>
          <span className="ml-auto rounded-full border border-[#cad7b6] bg-[#eff6df] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] text-[#557034]">
            {process.env.NEXT_PUBLIC_APP_ENV || "Production"}
          </span>
          <span
            className={`rounded-full px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] ${
              health === "operational"
                ? "bg-[#e6f3c8] text-[#4f6c29]"
                : "bg-[#fde2d8] text-[#99482f]"
            }`}
          >
            {health}
          </span>
          <Link
            href="/admin/notifications"
            className="relative rounded-xl border border-[#d8ded0] bg-white p-2"
            aria-label={`${unread} unread admin notifications`}
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[#7d9853] text-[9px] font-bold text-white">
                {Math.min(unread, 9)}
              </span>
            )}
          </Link>
        </header>

        {open && (
          <div className="fixed inset-0 z-50 bg-black/50 lg:hidden" onClick={() => setOpen(false)}>
            <aside
              className="h-full w-[86%] max-w-xs bg-[#101511] p-5 text-white"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-4 flex justify-end">
                <button
                  onClick={() => setOpen(false)}
                  className="rounded-xl border border-white/10 p-2"
                  aria-label="Close admin navigation"
                >
                  <X size={17} />
                </button>
              </div>
              <Sidebar
                path={path}
                role={auth?.account?.platformRole}
                query={query}
                onNavigate={() => setOpen(false)}
              />
            </aside>
          </div>
        )}

        <main className="min-h-[calc(100vh-64px)] p-4 md:p-7 xl:p-10">{children}</main>
      </div>
    </div>
  );
}
