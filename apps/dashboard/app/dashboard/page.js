"use client";

import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  Clapperboard,
  KeyRound,
  MonitorSmartphone,
  PlugZap,
  ShieldAlert,
  Waypoints,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import {
  ChecklistItem,
  EmptyState,
  PageHeader,
  ProgressMeter,
  Stat,
  StatusPill,
  Surface,
} from "@/components/console-kit";

export default function Dashboard() {
  const [summary, setSummary] = useState(null);
  const [billing, setBilling] = useState(null);
  const [usage, setUsage] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/v1/workspace/summary"), api("/v1/billing"), api("/v1/usage/summary")])
      .then(([summaryData, billingData, usageData]) => {
        setSummary(summaryData);
        setBilling(billingData);
        setUsage(usageData.metrics || {});
      })
      .catch((requestError) => setError(requestError.message));
  }, []);

  const counts = summary?.counts || {};
  const entitlements = billing?.entitlements || {};
  const recentAssets = summary?.recentAssets || [];
  const recentSecurity = summary?.recentSecurity || [];
  const steps = [
    ["Add a site", counts.sites > 0],
    ["Verify a domain", counts.verifiedSites > 0],
    ["Add a provider connection", counts.connections > 0],
    ["Create an API key", counts.apiKeys > 0],
    ["Register an asset", counts.assets > 0],
    ["Start protected playback", Number(usage.playback_sessions || 0) > 0],
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace control"
        title="Overview"
        description="Media activity, integration readiness, security posture and plan status in one place."
        action={
          <Link
            href="/dashboard/assets"
            className="rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"
          >
            Add protected video
          </Link>
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Protected assets" value={counts.assets ?? "—"} icon={Clapperboard} />
        <Stat label="Active sessions" value={counts.activeSessions ?? "—"} icon={Activity} />
        <Stat label="Known devices" value={counts.devices ?? "—"} icon={MonitorSmartphone} />
        <Stat label="Security alerts" value={counts.securityAlerts ?? "—"} icon={ShieldAlert} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.25fr_.75fr]">
        <Surface className="overflow-hidden">
          <div className="bg-[#172014] p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-white/45">
                  Current plan
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {billing?.subscription?.planName || "No active plan"}
                </h2>
                <p className="mt-1 text-sm text-white/55">
                  {billing?.subscription?.periodEnd
                    ? `Valid until ${new Date(billing.subscription.periodEnd).toLocaleDateString()}`
                    : "Choose a plan to activate paid entitlements."}
                </p>
              </div>
              <StatusPill status={billing?.subscription?.status || "inactive"} />
            </div>
          </div>
          <div className="p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <ProgressMeter
                label="Sites"
                used={counts.sites || 0}
                limit={entitlements.max_sites}
              />
              <ProgressMeter
                label="Concurrent streams"
                used={counts.activeSessions || 0}
                limit={entitlements.max_concurrent_streams}
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/dashboard/plans"
                className="rounded-xl bg-[#edf5d8] px-4 py-2.5 text-sm font-semibold text-[#405525]"
              >
                Manage plan
              </Link>
              <Link
                href="/dashboard/usage"
                className="rounded-xl border border-[#dfe4d6] bg-white px-4 py-2.5 text-sm font-semibold text-[#45503f]"
              >
                View usage
              </Link>
            </div>
          </div>
        </Surface>

        <Surface className="p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
            Launch checklist
          </p>
          <div className="mt-4 space-y-2">
            {steps.map(([label, done]) => (
              <ChecklistItem key={label} done={done}>
                {label}
              </ChecklistItem>
            ))}
          </div>
          <Link
            href="/dashboard/onboarding"
            className="mt-5 inline-flex text-sm font-semibold text-[#536b31] hover:underline"
          >
            Continue onboarding →
          </Link>
        </Surface>
      </div>

      <Surface className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
              Integration readiness
            </p>
            <h2 className="mt-2 text-xl font-semibold">Control-plane setup</h2>
          </div>
          <Link href="/dashboard/onboarding" className="text-sm font-semibold text-[#536b31]">
            Open onboarding →
          </Link>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [Waypoints, "Verified sites", counts.verifiedSites || 0, "/dashboard/sites"],
            [PlugZap, "Connections", counts.connections || 0, "/dashboard/connections"],
            [KeyRound, "Active API keys", counts.apiKeys || 0, "/dashboard/api-keys"],
            [CheckCircle2, "Registered assets", counts.assets || 0, "/dashboard/assets"],
          ].map(([Icon, label, value, href]) => (
            <Link
              key={label}
              href={href}
              className="rounded-2xl border border-[#e0e5d9] bg-[#f8faf4] p-4 transition hover:-translate-y-0.5 hover:bg-white"
            >
              <Icon size={17} className="text-[#657d3f]" />
              <p className="mt-4 text-xs text-[#7c8675]">{label}</p>
              <p className="mt-1 text-2xl font-semibold">{value}</p>
            </Link>
          ))}
        </div>
      </Surface>

      <div className="grid gap-5 lg:grid-cols-2">
        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#e4e8df] p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#71805b]">Media</p>
              <h2 className="mt-1 font-semibold">Recent assets</h2>
            </div>
            <Link href="/dashboard/assets" className="text-sm font-semibold text-[#536b31]">
              View all
            </Link>
          </div>
          {recentAssets.length ? (
            <div className="divide-y divide-[#edf0e9]">
              {recentAssets.map((asset) => (
                <Link
                  key={asset.id}
                  href={`/dashboard/assets/${asset.id}`}
                  className="flex items-center justify-between gap-4 p-5 hover:bg-[#fafbf8]"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{asset.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[.12em] text-[#8a9483]">
                      {asset.provider}
                    </p>
                  </div>
                  <StatusPill status={asset.status} />
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                title="No protected assets"
                description="Register your first source after adding a site and provider connection."
                href="/dashboard/assets"
                action="Add asset"
              />
            </div>
          )}
        </Surface>

        <Surface className="overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-[#e4e8df] p-5">
            <div>
              <p className="text-xs font-bold uppercase tracking-[.14em] text-[#71805b]">
                Security
              </p>
              <h2 className="mt-1 font-semibold">Recent enforcement</h2>
            </div>
            <Link href="/dashboard/security" className="text-sm font-semibold text-[#536b31]">
              Security Center
            </Link>
          </div>
          {recentSecurity.length ? (
            <div className="divide-y divide-[#edf0e9]">
              {recentSecurity.map((event) => (
                <div key={event.id} className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="font-medium">{event.type.replaceAll("_", " ")}</p>
                    <p className="mt-1 text-xs text-[#8a9483]">
                      {new Date(event.createdAt).toLocaleString()} · risk {event.riskScore}
                    </p>
                  </div>
                  <StatusPill status={event.severity} />
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-sm text-[#7b8574]">No security events yet.</div>
          )}
        </Surface>
      </div>
    </div>
  );
}
