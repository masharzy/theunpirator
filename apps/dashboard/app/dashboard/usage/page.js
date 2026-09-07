"use client";
import { Activity, Gauge, HardDriveDownload } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, ProgressMeter, Stat, Surface } from "@/components/console-kit";
export default function UsagePage() {
  const [metrics, setMetrics] = useState({}),
    [billing, setBilling] = useState(null),
    [summary, setSummary] = useState(null),
    [message, setMessage] = useState("");
  useEffect(() => {
    Promise.all([api("/v1/usage/summary"), api("/v1/billing"), api("/v1/workspace/summary")])
      .then(([u, b, s]) => {
        setMetrics(u.metrics || {});
        setBilling(b);
        setSummary(s);
      })
      .catch((e) => setMessage(e.message));
  }, []);
  const e = billing?.entitlements || {},
    c = summary?.counts || {};
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace metering"
        title="Usage"
        description="Current control-plane usage and the limits included with your active plan."
      />
      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Playback sessions"
          value={Number(metrics.playback_sessions || 0)}
          icon={Activity}
        />
        <Stat label="Gateway requests" value={Number(metrics.gateway_requests || 0)} icon={Gauge} />
        <Stat
          label="Egress bytes recorded"
          value={Number(metrics.egress_bytes || 0).toLocaleString()}
          icon={HardDriveDownload}
        />
      </div>
      <Surface className="p-6">
        <h2 className="font-semibold">Plan limits</h2>
        <p className="mt-1 text-sm text-[#74806d]">
          {billing?.subscription?.planName || "No active plan"} ·{" "}
          {billing?.subscription?.status || "inactive"}
        </p>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          <ProgressMeter label="Sites" used={c.sites || 0} limit={e.max_sites} />
          <ProgressMeter
            label="Active streams"
            used={c.activeSessions || 0}
            limit={e.max_concurrent_streams}
          />
          <ProgressMeter label="Devices per viewer" used={0} limit={e.max_devices_per_viewer} />
          <ProgressMeter label="Assets" used={c.assets || 0} limit={e.max_assets} />
        </div>
      </Surface>
      <Surface className="p-6">
        <h2 className="font-semibold">Raw metered events</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(metrics).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[#f7f9f2] p-4">
              <p className="text-xs uppercase tracking-[.12em] text-[#7c8675]">
                {k.replaceAll("_", " ")}
              </p>
              <p className="mt-2 text-2xl font-semibold">{Number(v || 0).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </Surface>
    </div>
  );
}
