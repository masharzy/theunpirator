"use client";

import { Activity, Gauge, HardDriveDownload } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, ProgressMeter, Stat, Surface } from "@/components/console-kit";

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let amount = bytes;
  let unit = "B";
  for (const nextUnit of units) {
    amount /= 1024;
    unit = nextUnit;
    if (amount < 1024) break;
  }
  return `${amount.toFixed(amount >= 100 ? 0 : amount >= 10 ? 1 : 2)} ${unit}`;
}

function formatPeriod(period) {
  if (!period?.start || !period?.end) return "Current billing period";
  const start = new Date(period.start);
  const end = new Date(new Date(period.end).getTime() - 1);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

export default function UsagePage() {
  const [usage, setUsage] = useState({ metrics: {}, period: null });
  const [billing, setBilling] = useState(null);
  const [summary, setSummary] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    Promise.all([api("/v1/usage/summary"), api("/v1/billing"), api("/v1/workspace/summary")])
      .then(([usageData, billingData, summaryData]) => {
        setUsage(usageData || { metrics: {}, period: null });
        setBilling(billingData);
        setSummary(summaryData);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  const metrics = usage?.metrics || {};
  const entitlements = billing?.entitlements || {};
  const counts = summary?.counts || {};

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Usage & Analytics"
        title="Plan usage"
        description={`${formatPeriod(usage?.period)}. Usage resets with the active billing period; live limits such as concurrent streams are measured separately.`}
      />

      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Playback sessions"
          value={formatNumber(metrics.playback_sessions)}
          hint="This billing period"
          icon={Activity}
        />
        <Stat
          label="Gateway requests"
          value={formatNumber(metrics.gateway_requests)}
          hint="This billing period"
          icon={Gauge}
        />
        <Stat
          label="Egress"
          value={formatBytes(metrics.egress_bytes)}
          hint="Recorded protected delivery"
          icon={HardDriveDownload}
        />
      </div>

      <Surface className="p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-semibold">Included plan allowances</h2>
            <p className="mt-1 text-sm text-[#74806d]">
              {billing?.subscription?.planName || "No active plan"} ·{" "}
              {billing?.subscription?.status || "inactive"}
            </p>
          </div>
          <p className="text-xs text-[#87917f]">{formatPeriod(usage?.period)}</p>
        </div>

        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ProgressMeter
            label="Playback sessions"
            used={metrics.playback_sessions || 0}
            limit={entitlements.monthly_playback_sessions}
            format={formatNumber}
          />
          <ProgressMeter
            label="Gateway requests"
            used={metrics.gateway_requests || 0}
            limit={entitlements.monthly_gateway_requests}
            format={formatNumber}
          />
          <ProgressMeter
            label="Egress"
            used={metrics.egress_bytes || 0}
            limit={entitlements.monthly_egress_bytes}
            format={formatBytes}
          />
          <ProgressMeter
            label="Playback minutes"
            used={metrics.playback_minutes || 0}
            limit={entitlements.monthly_playback_minutes}
            format={formatNumber}
          />
          <ProgressMeter
            label="Sites"
            used={counts.sites || 0}
            limit={entitlements.max_sites}
            format={formatNumber}
          />
          <ProgressMeter
            label="Assets"
            used={counts.assets || 0}
            limit={entitlements.max_assets}
            format={formatNumber}
          />
        </div>
      </Surface>

      <Surface className="p-6">
        <h2 className="font-semibold">Live limits</h2>
        <p className="mt-1 text-sm text-[#74806d]">
          These do not contribute to the navbar usage percentage because they are simultaneous limits,
          not billing-period consumption.
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ProgressMeter
            label="Active streams"
            used={counts.activeSessions || 0}
            limit={entitlements.max_concurrent_streams}
            format={formatNumber}
          />
          <div className="rounded-2xl border border-[#e3e7dd] bg-[#f8faf5] p-4">
            <p className="text-sm font-medium text-[#33402d]">Devices per viewer</p>
            <p className="mt-2 text-2xl font-semibold text-[#172014]">
              {entitlements.max_devices_per_user != null
                ? formatNumber(entitlements.max_devices_per_user)
                : "No configured limit"}
            </p>
            <p className="mt-1 text-xs text-[#87917f]">Maximum active devices allowed per viewer.</p>
          </div>
        </div>
      </Surface>

      <Surface className="p-6">
        <h2 className="font-semibold">Metered activity</h2>
        <p className="mt-1 text-sm text-[#74806d]">
          Raw counters recorded for the current billing period.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.keys(metrics).length ? (
            Object.entries(metrics).map(([key, value]) => (
              <div key={key} className="rounded-xl bg-[#f7f9f2] p-4">
                <p className="text-xs uppercase tracking-[.12em] text-[#7c8675]">
                  {key.replaceAll("_", " ")}
                </p>
                <p className="mt-2 text-2xl font-semibold">{formatNumber(value)}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-[#87917f]">No metered activity yet in this billing period.</p>
          )}
        </div>
      </Surface>
    </div>
  );
}
