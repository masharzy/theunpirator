"use client";

import Link from "next/link";
import {
  ArrowRight,
  Check,
  KeyRound,
  LockKeyhole,
  PlugZap,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Waypoints,
  Clapperboard,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/console-kit";

export default function OnboardingPage() {
  const auth = useAuth();
  // read once client-side: window is unavailable during static prerendering
  const [planParam, setPlanParam] = useState("");
  const [summary, setSummary] = useState(null);
  const [connections, setConnections] = useState([]);
  const [keys, setKeys] = useState([]);
  const [youtubeEnabled, setYoutubeEnabled] = useState(false);
  const [billing, setBilling] = useState(null);
  const [planName, setPlanName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("plan") || "";
    setPlanParam(fromUrl);
    Promise.all([
      api("/v1/workspace/summary"),
      api("/v1/workspace/connections").catch(() => ({ items: [] })),
      api("/v1/api-keys").catch(() => ({ items: [] })),
      api("/v1/assets/providers").catch(() => ({ items: [] })),
      api("/v1/billing").catch(() => null),
      fromUrl ? api("/v1/billing/plans").catch(() => ({ items: [] })) : Promise.resolve(null),
    ])
      .then(([summaryData, connectionData, keyData, providerData, billingData, planData]) => {
        setSummary(summaryData);
        setConnections(connectionData.items || []);
        setKeys(keyData.items || []);
        setYoutubeEnabled((providerData.items || []).includes("youtube_custom"));
        setBilling(billingData);
        if (planData) {
          setPlanName((planData.items || []).find((plan) => plan.id === fromUrl)?.name || fromUrl);
        }
      })
      .catch((e) => setMessage(e.message));
  }, []);

  const subscription = billing?.subscription || null;
  const activeSubscription =
    subscription && ["active", "trialing"].includes(String(subscription.status).toLowerCase())
      ? subscription
      : null;
  const pendingPayment = billing?.pendingPayment || null;
  const trialOffer = billing?.trialOffer || null;
  const planDone = Boolean(activeSubscription || pendingPayment);

  const [claiming, setClaiming] = useState(false);
  async function claimTrial() {
    if (!trialOffer) return;
    setClaiming(true);
    try {
      await api("/v1/billing/trials/claim", {
        method: "POST",
        body: JSON.stringify({ offerId: trialOffer.id }),
      });
      setBilling(await api("/v1/billing").catch(() => null));
      setMessage("");
    } catch (e) {
      setMessage(e.message);
    } finally {
      setClaiming(false);
    }
  }

  const counts = summary?.counts || {};
  const steps = [
    [
      WalletCards,
      "Choose your plan",
      "Protection stays locked until a plan is active — pick one and check out in minutes.",
      planParam ? `/dashboard/checkout?plan=${planParam}` : "/dashboard/plans",
      planDone,
    ],
    [
      ShieldCheck,
      "Verify your email",
      "Unlock production credentials and billing.",
      "/dashboard/account",
      Boolean(auth?.account?.emailVerified),
    ],
    [
      Waypoints,
      "Add & verify a site",
      "Register the domain where your protected player runs.",
      "/dashboard/sites",
      counts.verifiedSites > 0,
    ],
    [
      PlugZap,
      "Save a provider connection",
      "YouTube Custom needs approved access; R2, S3 and Bunny use saved credentials.",
      "/dashboard/connections",
      youtubeEnabled || connections.length > 0,
    ],
    [
      Clapperboard,
      "Connect a video source",
      "YouTube videos are discovered automatically; other providers use registered assets.",
      "/dashboard/assets",
      youtubeEnabled || counts.assets > 0,
    ],
    [
      KeyRound,
      "Create an API key",
      "Authorize your backend to issue playback sessions.",
      "/dashboard/api-keys",
      keys.some((key) => !key.revokedAt),
    ],
  ];

  const complete = steps.filter((step) => step[4]).length;
  const percent = Math.round((complete / steps.length) * 100);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Launch path"
        title="Protect your first video"
        description="A guided path from workspace creation to your first protected playback session."
      />

      {message ? (
        <div
          className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          {message}
        </div>
      ) : null}

      <Surface className="overflow-hidden">
        <div className="bg-[#172014] p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-white/10">
              <Sparkles size={18} className="text-[#d7ff75]" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[.16em] text-white/50">Welcome to</p>
              <p className="text-xl font-semibold">The Unpirator</p>
            </div>
          </div>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/70">
            {auth?.account?.email ? `Hi ${auth.account.email.split("@")[0]} — ` : ""}
            your videos are about to become leak-proof: protected streaming, traceable watermarks
            and automatic piracy monitoring.
          </p>
          <div className="mt-5 flex items-end justify-between gap-4">
            <p className="text-sm text-white/60">
              {complete} of {steps.length} steps complete
            </p>
            <p className="text-3xl font-semibold">{percent}%</p>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-[#d7ff75]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        {planParam && !planDone ? (
          <Link
            href={`/dashboard/checkout?plan=${planParam}`}
            className="group flex items-center gap-4 border-b border-[#edf0e9] bg-[#eef5df] p-5 transition hover:bg-[#e6efd2]"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-white text-[#536b31]">
              <WalletCards size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[#263120]">
                Continue: complete your {planName} checkout
              </p>
              <p className="mt-1 text-sm text-[#596551]">
                You picked {planName} on the pricing page — finish checkout to activate it.
              </p>
            </div>
            <ArrowRight size={17} className="text-[#536b31] transition group-hover:translate-x-1" />
          </Link>
        ) : null}

        {trialOffer && !planDone ? (
          <div className="flex flex-col gap-4 border-b border-[#edf0e9] bg-[#eef5df] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <Sparkles size={18} className="mt-0.5 shrink-0 text-[#5a7433]" />
              <div>
                <p className="font-semibold text-[#263120]">
                  Free trial: {trialOffer.planName} — {trialOffer.durationDays} days
                </p>
                <p className="mt-1 text-sm text-[#596551]">
                  Full protection, no payment now. Claim it and start protecting your videos today.
                </p>
              </div>
            </div>
            <Button className="shrink-0" onClick={claimTrial} disabled={claiming}>
              {claiming ? "Claiming…" : "Claim free trial"}
            </Button>
          </div>
        ) : null}

        {!planDone ? (
          <div className="flex flex-col gap-4 border-b border-[#edf0e9] bg-[#fff9ea] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <LockKeyhole size={18} className="mt-0.5 shrink-0 text-[#9a6b1f]" />
              <div>
                <p className="font-semibold text-[#3d432f]">Protected playback is locked</p>
                <p className="mt-1 text-sm text-[#6f745f]">
                  Choose a plan to unlock protected streaming, watermarking and piracy monitoring
                  for your workspace.
                </p>
              </div>
            </div>
            <Link
              href="/dashboard/plans"
              className="inline-flex shrink-0 justify-center rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263120]"
            >
              Browse plans
            </Link>
          </div>
        ) : null}

        <div className="divide-y divide-[#edf0e9]">
          {steps.map(([Icon, title, description, href, done], index) => (
            <Link
              key={title}
              href={href}
              className="group flex items-center gap-4 p-5 transition hover:bg-[#fafbf8]"
            >
              <span
                className={`grid size-11 shrink-0 place-items-center rounded-2xl ${done ? "bg-emerald-50 text-emerald-600" : "bg-[#edf5d8] text-[#536b31]"}`}
              >
                {done ? <Check size={18} /> : <Icon size={18} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold tracking-[.16em] text-[#9aa292]">
                    0{index + 1}
                  </span>
                  <h2 className="font-semibold">{title}</h2>
                </div>
                <p className="mt-1 text-sm text-[#75806e]">{description}</p>
              </div>
              <ArrowRight
                size={17}
                className="text-[#9ca594] transition group-hover:translate-x-1"
              />
            </Link>
          ))}
        </div>
      </Surface>
    </div>
  );
}
