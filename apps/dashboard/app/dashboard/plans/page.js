"use client";

import Link from "next/link";
import {
  Check,
  Copy,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatusPill, Surface, money } from "@/components/console-kit";

const protectionFeatures = [
  ["secure_gateway", "Secure playback gateway"],
  ["protected_delivery", "Protected media delivery"],
  ["player_integrity", "Player integrity checks"],
  ["secure_browser_restriction", "Browser protection"],
  ["dynamic_watermark", "Dynamic watermark"],
  ["device_tracking", "Device tracking"],
  ["device_control", "Device controls"],
  ["concurrent_stream_control", "Concurrent stream protection"],
  ["webhooks", "Security webhooks"],
];

const planLimits = [
  ["max_sites", "Sites"],
  ["max_assets", "Assets"],
  ["max_devices_per_user", "Devices per viewer"],
  ["max_concurrent_streams", "Concurrent streams"],
  ["monthly_playback_sessions", "Monthly playback sessions"],
  ["monthly_gateway_requests", "Monthly gateway requests"],
  ["monthly_egress_bytes", "Monthly transfer", "bytes"],
];

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat().format(Number(value));
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return null;
  if (bytes === 0) return "0 GB";
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`;
  const mb = bytes / 1024 ** 2;
  return `${mb.toLocaleString(undefined, { maximumFractionDigits: 0 })} MB`;
}

function readableLimits(entitlements = {}) {
  return planLimits
    .map(([key, label, unit]) => {
      const value = entitlements[key];
      if (value == null) return null;
      const formatted = unit === "bytes" ? formatBytes(value) : formatNumber(value);
      return formatted == null ? null : { key, label, value: formatted };
    })
    .filter(Boolean);
}

function readableFeatures(entitlements = {}) {
  return protectionFeatures
    .filter(([key]) => entitlements[key] === true)
    .map(([key, label]) => ({ key, label }));
}

function supportsAmount(method, plan) {
  const amount = Number(plan?.priceMinor);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (method.minAmountMinor != null && amount < Number(method.minAmountMinor)) return false;
  if (method.maxAmountMinor != null && amount > Number(method.maxAmountMinor)) return false;
  return true;
}

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function PlansPage() {
  const [plans, setPlans] = useState([]);
  const [methods, setMethods] = useState([]);
  const [billing, setBilling] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedMethodId, setSelectedMethodId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const [planData, billingData, methodData] = await Promise.all([
      api("/v1/billing/plans"),
      api("/v1/billing"),
      api("/v1/billing/payment-methods"),
    ]);
    setPlans(planData.items || []);
    setBilling(billingData);
    setMethods(methodData.items || []);
  }

  useEffect(() => {
    load()
      .catch((failure) => setError(failure.message))
      .finally(() => setLoading(false));
  }, []);

  const subscription = billing?.subscription || null;
  const activeSubscription =
    subscription && ["active", "trialing"].includes(String(subscription.status).toLowerCase())
      ? subscription
      : null;
  const currentPlanId = activeSubscription?.planId || null;
  const currentPlan = useMemo(
    () => plans.find((plan) => plan.id === currentPlanId) || null,
    [plans, currentPlanId],
  );
  const selectedPlan = useMemo(
    () => plans.find((plan) => plan.id === selectedPlanId) || null,
    [plans, selectedPlanId],
  );
  const compatibleMethods = useMemo(
    () => methods.filter((method) => supportsAmount(method, selectedPlan)),
    [methods, selectedPlan],
  );
  const selectedMethod = useMemo(
    () => compatibleMethods.find((method) => method.id === selectedMethodId) || null,
    [compatibleMethods, selectedMethodId],
  );
  const currentFeatures = readableFeatures(billing?.entitlements || {});

  function choosePlan(plan) {
    if (billing?.pendingPayment) {
      setMessage("A payment is already under review. Open Billing to track its status.");
      return;
    }
    setSelectedPlanId(plan.id);
    const firstMethod = methods.find((method) => supportsAmount(method, plan));
    setSelectedMethodId(firstMethod?.id || "");
    setMessage("");
    setError("");
    requestAnimationFrame(() => {
      document.getElementById("plan-checkout")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }

  async function submitPayment(event) {
    event.preventDefault();
    if (!selectedPlan || !selectedMethod) return;

    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      await api("/v1/billing/payments", {
        method: "POST",
        body: JSON.stringify({
          planId: selectedPlan.id,
          paymentMethodId: selectedMethod.id,
          senderNumber,
          transactionId,
          customerNote: note || null,
        }),
      });
      setSenderNumber("");
      setTransactionId("");
      setNote("");
      setSelectedPlanId("");
      setSelectedMethodId("");
      await load();
      setMessage("Payment submitted for review. You can track it from Billing.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subscription"
        title="Plan & protection"
        description="Choose the protection and usage capacity for this workspace. Payment stays in this flow; subscription status and transaction history live in Billing."
        action={
          loading ? null : activeSubscription ? (
            <StatusPill status={activeSubscription.status} />
          ) : (
            <span className="rounded-full bg-[#f1f3ed] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#65705f] ring-1 ring-[#dde2d7]">
              Free workspace
            </span>
          )
        }
      />

      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
          <div className="border-b border-[#e6eadf] p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                <ShieldCheck size={19} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#7b8574]">
                  Protection model
                </p>
                <h2 className="mt-2 text-lg font-semibold text-[#263120]">
                  Plan-driven protection
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697363]">
                  Viewer email and a stable device ID are required for protected playback. Your
                  active plan adds the playback protections and limits shown here; individual assets
                  do not choose separate security levels.
                </p>
              </div>
            </div>
          </div>

          <div className="p-6">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#f1f3ed] text-[#5f6a58]">
                <LockKeyhole size={18} />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#7b8574]">
                  {activeSubscription ? "Current plan" : "Workspace access"}
                </p>
                <p className="mt-2 truncate text-lg font-semibold text-[#263120]">
                  {activeSubscription?.planName || currentPlan?.name || "Free workspace"}
                </p>
                <p className="mt-2 text-sm leading-6 text-[#697363]">
                  {activeSubscription
                    ? `${currentFeatures.length} protection capabilities currently enabled.`
                    : "Protected playback remains unavailable until a paid plan is active."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Surface>

      {billing?.pendingPayment && (
        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-5 bg-[#fff9ea] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[#3d432f]">Payment under review</p>
                <StatusPill status={billing.pendingPayment.status} />
              </div>
              <p className="mt-2 text-sm text-[#6f745f]">
                {billing.pendingPayment.planName} · {money(
                  billing.pendingPayment.amountMinor,
                  billing.pendingPayment.currency,
                )}
              </p>
              <p className="mt-1 text-xs text-[#8a8d7d]">
                Submitted {dateTime(billing.pendingPayment.submittedAt)} · Transaction {billing.pendingPayment.transactionId}
              </p>
            </div>
            <Link
              href="/dashboard/billing"
              className="inline-flex shrink-0 justify-center rounded-xl border border-[#d9dfcf] bg-white px-4 py-2.5 text-sm font-semibold text-[#34402e] transition hover:bg-[#f8faf4]"
            >
              Open billing
            </Link>
          </div>
        </Surface>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((plan) => {
          const active = currentPlanId === plan.id;
          const selected = selectedPlanId === plan.id;
          const configured = Number(plan.priceMinor) > 0;
          const features = readableFeatures(plan.entitlements || {});
          const limits = readableLimits(plan.entitlements || {});

          return (
            <Surface
              key={plan.id}
              className={`relative flex h-full flex-col p-6 ${
                active
                  ? "ring-2 ring-[#91a96b]"
                  : selected
                    ? "ring-2 ring-[#bdc9ae]"
                    : ""
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <span className="grid size-11 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                  <Sparkles size={18} />
                </span>
                {active && <StatusPill status="active" />}
              </div>

              <h2 className="mt-6 text-xl font-semibold">{plan.name}</h2>
              <p className="mt-2 min-h-12 text-sm leading-6 text-[#74806d]">
                {plan.description || "Protected media controls for your workspace."}
              </p>
              <p className="mt-5 text-3xl font-semibold">
                {configured ? money(plan.priceMinor, plan.currency) : "Admin pricing"}
              </p>
              <p className="mt-1 text-xs text-[#87917f]">{plan.durationDays || 30} days</p>

              <div className="mt-6 border-t border-[#e8ebe3] pt-5">
                <p className="text-xs font-bold uppercase tracking-[.13em] text-[#87917f]">
                  Protection included
                </p>
                <div className="mt-3 space-y-2.5">
                  {features.length ? (
                    features.slice(0, 7).map((feature) => (
                      <p key={feature.key} className="flex gap-2 text-sm text-[#596551]">
                        <Check size={15} className="mt-0.5 shrink-0 text-[#78944f]" />
                        <span>{feature.label}</span>
                      </p>
                    ))
                  ) : (
                    <p className="text-sm text-[#7b8574]">No additional playback protections.</p>
                  )}
                </div>
              </div>

              {limits.length > 0 && (
                <div className="mt-5 border-t border-[#e8ebe3] pt-5">
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-[#87917f]">
                    Plan limits
                  </p>
                  <div className="mt-3 space-y-2">
                    {limits.slice(0, 5).map((limit) => (
                      <div
                        key={limit.key}
                        className="flex items-center justify-between gap-4 text-sm text-[#596551]"
                      >
                        <span>{limit.label}</span>
                        <span className="font-semibold text-[#34402e]">{limit.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-auto pt-7">
                {active ? (
                  <div className="rounded-xl bg-[#edf5d8] px-4 py-3 text-center text-sm font-semibold text-[#4c632d]">
                    Current plan
                  </div>
                ) : !configured ? (
                  <div className="rounded-xl border border-dashed p-3 text-center text-xs text-[#7b8574]">
                    Admin must configure price first
                  </div>
                ) : billing?.pendingPayment ? (
                  <div className="rounded-xl bg-[#f5f2e8] px-4 py-3 text-center text-sm font-semibold text-[#7a704f]">
                    Payment under review
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => choosePlan(plan)}
                    className="flex w-full cursor-pointer justify-center rounded-xl bg-[#172014] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#263120]"
                  >
                    Select {plan.name}
                  </button>
                )}
              </div>
            </Surface>
          );
        })}
      </div>

      {selectedPlan && !billing?.pendingPayment && (
        <div id="plan-checkout" className="scroll-mt-24">
          <Surface className="overflow-hidden">
            <div className="border-b border-[#e6eadf] px-6 py-5">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8574]">
                Checkout
              </p>
              <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-[#263120]">{selectedPlan.name}</h2>
                  <p className="mt-1 text-sm text-[#74806d]">
                    Complete the payment below. Your plan activates after verification.
                  </p>
                </div>
                <p className="text-2xl font-semibold text-[#263120]">
                  {money(selectedPlan.priceMinor, selectedPlan.currency)}
                </p>
              </div>
            </div>

            {compatibleMethods.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No payment method supports this plan"
                  description="An administrator must enable a compatible payment method before this plan can be purchased."
                />
              </div>
            ) : (
              <div className="grid gap-0 xl:grid-cols-[.9fr_1.1fr]">
                <div className="border-b border-[#e6eadf] p-6 xl:border-b-0 xl:border-r">
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
                    Payment method
                  </p>
                  <div className="mt-4 space-y-2">
                    {compatibleMethods.map((method) => (
                      <button
                        type="button"
                        key={method.id}
                        onClick={() => setSelectedMethodId(method.id)}
                        className={`w-full cursor-pointer rounded-2xl border p-4 text-left transition hover:bg-[#f8faf4] ${
                          selectedMethodId === method.id
                            ? "border-[#829b57] bg-[#f3f8e7]"
                            : "border-[#e0e5d9]"
                        }`}
                      >
                        <span className="flex items-center gap-3">
                          <WalletCards size={17} />
                          <span>
                            <b className="block">{method.displayName}</b>
                            <small className="text-[#7b8574]">
                              {method.accountType || method.type}
                            </small>
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-6">
                  {selectedMethod && (
                    <>
                      <div className="rounded-2xl bg-[#172014] p-5 text-white">
                        <p className="text-xs text-white/55">Send exactly</p>
                        <p className="mt-1 text-3xl font-semibold">
                          {money(selectedPlan.priceMinor, selectedPlan.currency)}
                        </p>
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/10 p-3">
                          <div className="min-w-0">
                            <p className="truncate font-mono">{selectedMethod.accountNumber}</p>
                            {selectedMethod.accountName && (
                              <p className="mt-1 truncate text-xs text-white/55">
                                {selectedMethod.accountName}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              navigator.clipboard?.writeText(selectedMethod.accountNumber)
                            }
                            className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-white/10 transition hover:bg-white/15"
                            aria-label="Copy payment account number"
                          >
                            <Copy size={16} />
                          </button>
                        </div>
                        {selectedMethod.instructions && (
                          <p className="mt-3 text-xs leading-5 text-white/60">
                            {selectedMethod.instructions}
                          </p>
                        )}
                      </div>

                      <form className="mt-6 space-y-4" onSubmit={submitPayment}>
                        <label className="block text-sm font-medium text-[#34402e]">
                          Sender number
                          <Input
                            className="mt-2"
                            required
                            value={senderNumber}
                            onChange={(event) => setSenderNumber(event.target.value)}
                          />
                        </label>
                        <label className="block text-sm font-medium text-[#34402e]">
                          Transaction ID
                          <Input
                            className="mt-2"
                            required
                            value={transactionId}
                            onChange={(event) => setTransactionId(event.target.value)}
                          />
                        </label>
                        <label className="block text-sm font-medium text-[#34402e]">
                          Note <span className="font-normal text-[#899283]">(optional)</span>
                          <textarea
                            className="mt-2 min-h-24 w-full rounded-xl border border-[#dfe4d8] bg-white p-3 text-sm outline-none transition focus:border-[#9aaa84] focus:ring-2 focus:ring-[#dfe8cf]"
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                          />
                        </label>
                        <Button className="w-full" disabled={submitting}>
                          {submitting ? "Submitting…" : "Submit payment for review"}
                        </Button>
                      </form>
                    </>
                  )}
                </div>
              </div>
            )}
          </Surface>
        </div>
      )}
    </div>
  );
}
