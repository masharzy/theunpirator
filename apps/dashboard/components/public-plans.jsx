"use client";
import Link from "next/link";
import { Check, ArrowUpRight } from "lucide-react";
import { useEffect, useState } from "react";

const featureLabels = {
  secure_gateway: "Secure gateway",
  protected_delivery: "Protected media delivery",
  player_integrity: "Player integrity verification",
  secure_browser_restriction: "Secure browser restriction",
  dynamic_watermark: "Dynamic watermark",
  device_tracking: "Device tracking",
  require_device_id: "Required device identity",
  device_control: "Device block, revoke & limits",
  concurrent_stream_control: "Concurrent stream control",
  webhooks: "Webhooks",
  youtube_custom: "Restricted YouTube provider",
};
const limitLabels = {
  max_sites: "sites",
  max_assets: "assets",
  max_api_keys: "API keys",
  max_webhooks: "webhooks",
  max_team_members: "team members",
  max_devices_per_user: "devices / viewer",
  max_concurrent_streams: "concurrent streams",
  monthly_playback_minutes: "playback minutes / month",
  monthly_playback_sessions: "playback sessions / month",
};

function price(plan) {
  if (!Number.isInteger(plan.priceMinor) || plan.priceMinor <= 0) return "Contact";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: plan.currency || "USD",
      maximumFractionDigits: 0,
    }).format(plan.priceMinor / 100);
  } catch {
    return `${plan.currency || ""} ${plan.priceMinor / 100}`.trim();
  }
}
function planFeatures(plan) {
  const e = plan.entitlements || {};
  const features = Object.entries(featureLabels)
    .filter(([key]) => e[key] === true)
    .map(([, label]) => label);
  const limits = Object.entries(limitLabels)
    .filter(([key]) => Number.isFinite(Number(e[key])))
    .map(([key, label]) => `${e[key]} ${label}`);
  return [...limits, ...features].slice(0, 10);
}

export function PublicPlans({ compact = false }) {
  const [plans, setPlans] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    fetch("/control-api/v1/public/plans", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("plans unavailable");
        return response.json();
      })
      .then((data) => setPlans(data.items || []))
      .catch(() => setError(true));
  }, []);
  if (error)
    return (
      <div className="rounded-2xl border border-[#dce3d5] bg-white p-6 text-sm text-[#687362]">
        Plans are temporarily unavailable. Please try again shortly.
      </div>
    );
  if (!plans)
    return (
      <div className="grid gap-5 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-72 animate-pulse rounded-[28px] border border-[#e0e5da] bg-white"
          />
        ))}
      </div>
    );
  if (!plans.length)
    return (
      <div className="rounded-2xl border border-[#dce3d5] bg-white p-6 text-sm text-[#687362]">
        No public plans are available right now.
      </div>
    );
  return (
    <div className={`grid gap-5 ${plans.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
      {plans.map((plan, index) => {
        const features = planFeatures(plan);
        return (
          <article
            key={plan.id}
            className={`relative rounded-[28px] border p-7 ${index === 1 && plans.length > 2 ? "border-[#718c4a] bg-[#172014] text-white shadow-xl" : "border-[#dce3d5] bg-white text-[#20291d]"}`}
          >
            {plan.badge && (
              <span
                className={`inline-flex rounded-full px-3 py-1 text-[10px] font-black uppercase tracking-[.12em] ${index === 1 && plans.length > 2 ? "bg-[#dcebbd] text-[#26331e]" : "bg-[#edf4df] text-[#607742]"}`}
              >
                {plan.badge}
              </span>
            )}
            <h3 className="mt-4 text-2xl font-semibold tracking-[-.03em]">{plan.name}</h3>
            <p
              className={`mt-2 min-h-12 text-sm leading-6 ${index === 1 && plans.length > 2 ? "text-[#c7d0c1]" : "text-[#687362]"}`}
            >
              {plan.description || "Plan features are configured by the platform administrator."}
            </p>
            <div className="mt-6 flex items-end gap-2">
              <strong className="text-4xl tracking-[-.04em]">{price(plan)}</strong>
              {plan.priceMinor > 0 && (
                <span
                  className={`pb-1 text-xs ${index === 1 && plans.length > 2 ? "text-[#a9b5a3]" : "text-[#7b8675]"}`}
                >
                  /{plan.billingInterval || "period"}
                </span>
              )}
            </div>
            {plan.trialDays > 0 && (
              <p className="mt-2 text-xs font-semibold text-[#78944f]">
                {plan.trialDays}-day trial
              </p>
            )}
            <ul className={`mt-7 space-y-2.5 text-sm ${compact ? "min-h-40" : "min-h-56"}`}>
              {features.map((item) => (
                <li key={item} className="flex gap-2">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#8eaa61]" />
                  {item}
                </li>
              ))}
            </ul>
            <Link
              href="/register"
              className={`mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ${index === 1 && plans.length > 2 ? "bg-[#dcebbd] text-[#1e2919]" : "bg-[#172014] text-white"}`}
            >
              Get started <ArrowUpRight size={16} />
            </Link>
          </article>
        );
      })}
    </div>
  );
}
