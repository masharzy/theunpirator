"use client";

import Link from "next/link";
import { LockKeyhole, MonitorSmartphone, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";

const planFeatures = [
  ["secure_gateway", "Secure gateway"],
  ["protected_delivery", "Protected media delivery"],
  ["player_integrity", "Player integrity"],
  ["secure_browser_restriction", "Secure browser restriction"],
  ["dynamic_watermark", "Dynamic watermark"],
  ["device_control", "Device block, revoke & limits"],
  ["concurrent_stream_control", "Concurrent stream control"],
  ["webhooks", "Security webhooks"],
  ["youtube_custom", "Restricted YouTube provider"],
];

export default function PoliciesPage() {
  const [billing, setBilling] = useState(null);
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api("/v1/billing"), api("/v1/assets")])
      .then(([billingData, media]) => {
        setBilling(billingData);
        setAssets(media.items || []);
      })
      .catch((failure) => setError(failure.message));
  }, []);

  const entitlements = billing?.entitlements || {};
  const activeAssets = useMemo(
    () => assets.filter((asset) => asset.status === "active").length,
    [assets],
  );
  const planLabel =
    billing?.subscription?.planName || billing?.subscription?.planId || "No active plan";

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Security posture"
        title="Protection"
        description="Viewer identity is a baseline security requirement. Additional playback protections are enforced from the active plan; assets do not choose weaker or stronger policy levels."
        action={
          <Link
            className="rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"
            href="/dashboard/plans"
          >
            Review plan
          </Link>
        }
      />

      {error && (
        <p
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Surface className="p-5">
          <ShieldCheck className="text-[#607a39]" />
          <p className="mt-5 text-xs text-[#74806d]">Viewer identity</p>
          <p className="mt-2 text-lg font-semibold">Email + device ID</p>
          <p className="mt-2 text-xs leading-5 text-[#74806d]">
            Required for every protected playback session.
          </p>
        </Surface>
        <Surface className="p-5">
          <LockKeyhole className="text-[#607a39]" />
          <p className="mt-5 text-xs text-[#74806d]">Active plan</p>
          <p className="mt-2 text-lg font-semibold">{planLabel}</p>
          <p className="mt-2 text-xs leading-5 text-[#74806d]">
            {billing?.subscription
              ? "Plan entitlements are enforced by the control API and gateway."
              : "Protected playback remains unavailable until a plan is active."}
          </p>
        </Surface>
        <Surface className="p-5">
          <MonitorSmartphone className="text-[#607a39]" />
          <p className="mt-5 text-xs text-[#74806d]">Active assets</p>
          <p className="mt-2 text-2xl font-semibold">{activeAssets}</p>
          <p className="mt-2 text-xs leading-5 text-[#74806d]">
            Assets inherit the same active-plan protection capabilities.
          </p>
        </Surface>
      </div>

      <Surface className="overflow-hidden">
        <div className="border-b border-[#e4e8dd] p-5">
          <h2 className="font-semibold">Plan-enforced protections</h2>
          <p className="mt-1 text-xs leading-5 text-[#74806d]">
            These are concrete runtime capabilities, not customer-selectable Standard, Strict or
            Maximum modes.
          </p>
        </div>
        <div className="divide-y divide-[#e8ebe3]">
          {planFeatures.map(([key, label]) => {
            const enabled = entitlements[key] === true;
            return (
              <div key={key} className="flex items-center justify-between gap-4 px-5 py-4 text-sm">
                <div>
                  <p className="font-medium text-[#283222]">{label}</p>
                  <p className="mt-1 font-mono text-[10px] text-[#8a9483]">{key}</p>
                </div>
                <StatusPill status={enabled ? "active" : "disabled"} />
              </div>
            );
          })}
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        <div className="border-b border-[#e4e8dd] p-5">
          <h2 className="font-semibold">Assets under this protection posture</h2>
          <p className="mt-1 text-xs leading-5 text-[#74806d]">
            Asset records select a source and provider. They do not override the workspace plan with
            a separate security level.
          </p>
        </div>
        {assets.length ? (
          assets.map((asset) => (
            <Link
              href={`/dashboard/assets/${asset.id}`}
              key={asset.id}
              className="flex items-center justify-between gap-4 border-b border-[#e8ebe3] px-5 py-4 last:border-0 hover:bg-[#f8faf4]"
            >
              <span>
                <b className="block text-sm">{asset.title}</b>
                <small className="text-[#7a8573]">{asset.provider}</small>
              </span>
              <StatusPill status={asset.status} />
            </Link>
          ))
        ) : (
          <p className="p-8 text-sm text-[#74806d]">
            Register an asset after adding and verifying a site.
          </p>
        )}
      </Surface>
    </div>
  );
}
