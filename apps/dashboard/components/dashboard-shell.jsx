"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Bell,
  BookOpen,
  ChevronDown,
  Clapperboard,
  CreditCard,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  MonitorSmartphone,
  PlugZap,
  ReceiptText,
  Settings,
  ShieldAlert,
  Users,
  WalletCards,
  Waypoints,
  Webhook,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";

const groups = [
  [
    "Workspace",
    [
      [Gauge, "/dashboard", "Overview"],
      [BookOpen, "/dashboard/onboarding", "Onboarding"],
    ],
  ],
  [
    "Media",
    [
      [Waypoints, "/dashboard/sites", "Sites"],
      [PlugZap, "/dashboard/connections", "Connections"],
      [Clapperboard, "/dashboard/assets", "Assets"],
      [Users, "/dashboard/viewers", "Viewers"],
      [MonitorSmartphone, "/dashboard/sessions", "Sessions"],
    ],
  ],
  ["Security", [[ShieldAlert, "/dashboard/security", "Security Center"]]],
  [
    "Developer",
    [
      [KeyRound, "/dashboard/api-keys", "API Keys"],
      [Webhook, "/dashboard/webhooks", "Webhooks"],
    ],
  ],
  [
    "Business",
    [
      [WalletCards, "/dashboard/plans", "Plans"],
      [Activity, "/dashboard/usage", "Usage"],
      [ReceiptText, "/dashboard/payments", "Payments"],
    ],
  ],
  [
    "Manage",
    [
      [Users, "/dashboard/team", "Team"],
      [Settings, "/dashboard/settings", "Settings"],
      [CreditCard, "/dashboard/account", "Account"],
    ],
  ],
];

export function DashboardShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [billing, setBilling] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [summary, setSummary] = useState(null);

  const activeMembership = useMemo(
    () => (auth?.memberships || []).find((m) => m.tenantId === auth?.activeTenantId),
    [auth?.memberships, auth?.activeTenantId],
  );

  async function loadChrome() {
    const [billingData, notificationData, summaryData] = await Promise.all([
      api("/v1/billing").catch(() => null),
      api("/v1/billing/notifications").catch(() => ({ items: [] })),
      api("/v1/workspace/summary").catch(() => null),
    ]);
    setBilling(billingData);
    setNotifications(notificationData?.items || []);
    setSummary(summaryData);
  }

  useEffect(() => {
    if (!auth?.activeTenantId) return;
    loadChrome();
  }, [auth?.activeTenantId]);

  useEffect(() => setMenuOpen(false), [path]);

  async function switchWorkspace(tenantId) {
    await api("/v1/auth/workspace", { method: "PUT", body: JSON.stringify({ tenantId }) });
    localStorage.setItem("unpirator_tenant_id", tenantId);
    await auth.refresh();
    router.refresh();
  }

  async function logout() {
    await api("/v1/auth/logout", { method: "POST" });
    localStorage.removeItem("unpirator_tenant_id");
    router.replace("/login");
  }

  const unread = notifications.filter((item) => !item.readAt).length;
  const planLabel = billing?.subscription?.planName || "No active plan";
  const sitesUsed = summary?.counts?.sites ?? 0;
  const sitesLimit = billing?.entitlements?.max_sites;

  const nav = (
    <>
      <Link href="/" className="flex items-center justify-between px-2 py-2 text-lg font-semibold">
        <span>
          unpirator<span className="text-[#78944f]">.</span>
        </span>
        <span className="rounded-full bg-[#edf5d8] px-2 py-1 text-[9px] font-black uppercase tracking-[.16em] text-[#536b31]">
          Console
        </span>
      </Link>
      <div className="mt-5 rounded-2xl border border-[#dde4d5] bg-[#f7f9f2] p-3">
        <label className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8574]">
          Workspace
        </label>
        <div className="relative mt-2">
          <select
            className="w-full appearance-none bg-transparent pr-7 text-sm font-semibold text-[#273121] outline-none"
            value={auth?.activeTenantId || ""}
            onChange={(event) => switchWorkspace(event.target.value)}
          >
            {(auth?.memberships || []).map((m) => (
              <option key={m.tenantId} value={m.tenantId}>
                {m.tenantName}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-0 top-0.5 h-4 w-4 text-[#7c8873]" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="rounded-full bg-white px-2 py-1 text-[10px] font-semibold capitalize text-[#65705f] ring-1 ring-[#e0e5d8]">
            {activeMembership?.role || "member"}
          </span>
          <span className="truncate text-[10px] font-semibold text-[#65705f]">
            {sitesLimit != null ? `${sitesUsed}/${sitesLimit} sites` : planLabel}
          </span>
        </div>
      </div>
      <nav className="mt-6 space-y-6" aria-label="Workspace navigation">
        {groups.map(([label, links]) => (
          <section key={label}>
            <p className="mb-2 px-2 text-[10px] font-bold uppercase tracking-[.18em] text-[#a0a99a]">
              {label}
            </p>
            <div className="space-y-1">
              {links.map(([Icon, href, name]) => {
                const active = href === "/dashboard" ? path === href : path.startsWith(href);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${active ? "bg-[#172014] font-semibold text-white shadow-sm" : "text-[#5d6857] hover:bg-[#f1f4eb] hover:text-[#1f291c]"}`}
                  >
                    <Icon size={16} />
                    {name}
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </nav>
      <Button variant="ghost" className="mt-8 w-full justify-start text-[#66705f]" onClick={logout}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </>
  );

  return (
    <div className="min-h-screen bg-[#f2f4ed] lg:grid lg:grid-cols-[270px_1fr]">
      <aside className="hidden border-r border-[#dde3d5] bg-white p-5 lg:block">{nav}</aside>
      {menuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/35"
            onClick={() => setMenuOpen(false)}
          />
          <aside className="relative h-full w-[86%] max-w-[320px] overflow-y-auto bg-white p-5 shadow-2xl">
            <button
              aria-label="Close navigation"
              className="absolute right-4 top-4 rounded-lg border p-2"
              onClick={() => setMenuOpen(false)}
            >
              <X size={17} />
            </button>
            {nav}
          </aside>
        </div>
      )}
      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-[#dde3d5] bg-[#f8faf4]/95 px-4 py-3 backdrop-blur md:px-8">
          <button
            aria-label="Open navigation"
            className="rounded-xl border border-[#dce2d4] bg-white p-2 lg:hidden"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[#2e3929]">
              {activeMembership?.tenantName || "Workspace"}
            </p>
            <p className="text-[10px] uppercase tracking-[.14em] text-[#8c9586]">{planLabel}</p>
          </div>
          <Link
            href="/dashboard/notifications"
            className="relative rounded-xl border border-[#dce2d4] bg-white p-2.5 text-[#56634e]"
            aria-label={`${unread} unread notifications`}
          >
            <Bell size={17} />
            {unread > 0 && (
              <span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full bg-[#7d9853] text-[9px] font-bold text-white">
                {Math.min(unread, 9)}
              </span>
            )}
          </Link>
          {auth?.account?.platformRole && (
            <Link
              href="/admin"
              className="hidden rounded-xl bg-[#172014] px-3 py-2 text-xs font-semibold text-white sm:inline-flex"
            >
              Admin Console
            </Link>
          )}
        </header>
        <main className="p-4 md:p-8 lg:p-10">
          {auth?.account && !auth.account.emailVerified && (
            <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
              <span>
                <strong>Verify your email.</strong> Production credentials, payments and API keys
                stay locked until verification.
              </span>
              <Button
                size="sm"
                variant="outline"
                onClick={() => api("/v1/auth/verification/resend", { method: "POST" })}
              >
                Resend email
              </Button>
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
