"use client";

import { Activity, Gauge, HardDriveDownload } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, ProgressMeter, StatusPill, Surface } from "@/components/console-kit";

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

function formatterFor(unit) {
  return unit === "bytes" ? formatBytes : formatNumber;
}

const metricIcons = {
  playback_minutes: Activity,
  egress_bytes: HardDriveDownload,
  playback_sessions: Activity,
  gateway_requests: Gauge,
};

function MeteredCard({ item }) {
  const Icon = metricIcons[item.key] || Activity;
  const format = formatterFor(item.unit);
  return (
    <Surface className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#75806e]">{item.label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-[#172014]">
            {format(item.used)}
          </p>
          <p className="mt-2 text-xs text-[#87917f]">
            {item.capped ? `${format(item.limit)} included this period` : "No metered cap"}
          </p>
        </div>
        <span className="grid size-10 place-items-center rounded-2xl bg-[#edf5d8] text-[#4c632d]">
          <Icon size={18} />
        </span>
      </div>
      <div className="mt-5">
        <ProgressMeter label="Period usage" used={item.used} limit={item.limit} format={format} />
      </div>
    </Surface>
  );
}

export default function UsagePage() {
  const [usage, setUsage] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/v1/usage/summary")
      .then(setUsage)
      .catch((error) => setMessage(error.message));
  }, []);

  const metered = usage?.metered || [];
  const resources = usage?.resources || [];
  const live = usage?.live || [];
  const concurrentStreams = live.find((item) => item.key === "concurrent_streams");
  const devicesPerViewer = live.find((item) => item.key === "devices_per_viewer");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Usage & Analytics"
        title="Plan usage"
        description={`${formatPeriod(usage?.period)}. Billing-period usage, workspace capacity and live limits are tracked separately.`}
      />

      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}

      <Surface className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.14em] text-[#74806d]">
            Current plan
          </p>
          <p className="mt-2 text-xl font-semibold text-[#172014]">
            {usage?.subscription?.planName || "No active plan"}
          </p>
          <p className="mt-1 text-sm text-[#74806d]">{formatPeriod(usage?.period)}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusPill status={usage?.subscription?.status || "inactive"} />
          <span aria-hidden="true" className="text-[#b0b8aa]">
            ·
          </span>
          <span className="text-sm font-medium text-[#5f6b58]">
            {usage?.headline?.percent != null
              ? `${Math.round(usage.headline.percent)}% ${usage.headline.label}`
              : "No billing-period cap"}
          </span>
        </div>
      </Surface>

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-[#172014]">Billing-period usage</h2>
          <p className="mt-1 text-sm text-[#74806d]">
            Only customer-facing metered activity appears here. Internal heartbeat telemetry is not
            a plan quota.
          </p>
        </div>
        {metered.length ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {metered.map((item) => (
              <MeteredCard key={item.key} item={item} />
            ))}
          </div>
        ) : (
          <Surface className="p-6 text-sm text-[#74806d]">
            This plan has no metered billing-period usage configured yet.
          </Surface>
        )}
      </section>

      <Surface className="p-6">
        <div>
          <h2 className="font-semibold">Workspace capacity</h2>
          <p className="mt-1 text-sm text-[#74806d]">
            Resource limits are capacity controls. They do not contribute to the navbar billing
            usage percentage.
          </p>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {resources.map((item) => (
            <ProgressMeter
              key={item.key}
              label={item.label}
              used={item.used}
              limit={item.limit}
              format={formatterFor(item.unit)}
            />
          ))}
        </div>
      </Surface>

      <Surface className="p-6">
        <div>
          <h2 className="font-semibold">Live limits</h2>
          <p className="mt-1 text-sm text-[#74806d]">
            Simultaneous runtime limits are evaluated in real time and reset as sessions or devices
            leave the active set.
          </p>
        </div>
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {concurrentStreams && (
            <ProgressMeter
              label={concurrentStreams.label}
              used={concurrentStreams.used}
              limit={concurrentStreams.limit}
              format={formatNumber}
            />
          )}
          <div className="rounded-2xl border border-[#e3e7dd] bg-[#f8faf5] p-4">
            <p className="text-sm font-medium text-[#33402d]">Devices per viewer</p>
            <p className="mt-2 text-2xl font-semibold text-[#172014]">
              {devicesPerViewer?.limit != null
                ? formatNumber(devicesPerViewer.limit)
                : "No configured cap"}
            </p>
            <p className="mt-1 text-xs text-[#87917f]">
              Maximum active devices allowed for one viewer identity.
            </p>
          </div>
        </div>
      </Surface>
    </div>
  );
}
