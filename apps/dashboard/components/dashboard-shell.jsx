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
} from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
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
];
export function DashboardShell({ children }) {
  const path = usePathname();
  const router = useRouter();
  async function logout() {
    await api("/v1/auth/logout", { method: "POST" });
    localStorage.removeItem("unpirator_tenant_id");
    router.replace("/login");
  }
  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="border-r bg-white p-4">
        <div className="mb-8 px-3 py-2 font-semibold">The Unpirator</div>
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
      <main className="p-6 md:p-10">{children}</main>
    </div>
  );
}
