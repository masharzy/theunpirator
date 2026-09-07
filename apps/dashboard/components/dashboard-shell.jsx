"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  Clapperboard,
  CreditCard,
  Gauge,
  KeyRound,
  LogOut,
  MonitorSmartphone,
  ShieldAlert,
  Webhook,
  Waypoints,
  ChevronDown,
  UserRound,
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
const links = [
  [Gauge, "/dashboard", "Overview"],
  [Waypoints, "/dashboard/sites", "Sites"],
  [Clapperboard, "/dashboard/assets", "Assets"],
  [MonitorSmartphone, "/dashboard/sessions", "Sessions"],
  [ShieldAlert, "/dashboard/security", "Security"],
  [Activity, "/dashboard/usage", "Usage"],
  [KeyRound, "/dashboard/api-keys", "API Keys"],
  [Webhook, "/dashboard/webhooks", "Webhooks"],
  [CreditCard, "/dashboard/billing", "Billing"],
  [UserRound, "/dashboard/account", "Account"],
];
export function DashboardShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  const auth = useAuth();
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
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-r bg-white p-4">
        <Link href="/" className="mb-6 block px-3 py-2 text-lg font-semibold">
          unpirator<span className="text-[#78944f]">.</span>
        </Link>
        <label className="mb-7 block px-3 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          Workspace
          <span className="relative mt-2 block">
            <select
              className="w-full appearance-none rounded-lg border bg-[#f6f8f1] px-3 py-2 pr-8 text-sm font-medium normal-case tracking-normal"
              value={auth?.activeTenantId || ""}
              onChange={(e) => switchWorkspace(e.target.value)}
            >
              {(auth?.memberships || []).map((m) => (
                <option key={m.tenantId} value={m.tenantId}>
                  {m.tenantName}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-2.5 h-4 w-4" />
          </span>
        </label>
        <nav className="space-y-1">
          {links.map(([Icon, href, label]) => (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${path === href ? "bg-neutral-900 text-white" : "hover:bg-muted"}`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
        <Button variant="ghost" className="mt-8 w-full justify-start" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Sign out
        </Button>
      </aside>
      <main className="bg-[#f4f5ef] p-6 md:p-10">
        {auth?.account && !auth.account.emailVerified && (
          <div className="verification-banner">
            <span>
              <strong>Verify your email.</strong> Complete verification before adding production
              credentials or API keys.
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
  );
}
