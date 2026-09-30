"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  CircleAlert,
  Copy,
  FileClock,
  MailCheck,
  ShieldCheck,
  WalletCards,
} from "lucide-react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, Surface, money } from "@/components/console-kit";

const STEPS = [{ title: "Review plan" }, { title: "Send payment" }, { title: "Confirm" }];

function formatNumber(value) {
  if (!Number.isFinite(Number(value))) return null;
  return new Intl.NumberFormat().format(Number(value));
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return null;
  const gb = bytes / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString(undefined, { maximumFractionDigits: 1 })} GB`;
  return `${(bytes / 1024 ** 2).toLocaleString(undefined, { maximumFractionDigits: 0 })} MB`;
}

function supportsAmount(method, plan) {
  const amount = Number(plan?.priceMinor);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  if (method.minAmountMinor != null && amount < Number(method.minAmountMinor)) return false;
  if (method.maxAmountMinor != null && amount > Number(method.maxAmountMinor)) return false;
  return true;
}

function Stepper({ current }) {
  return (
    <div className="bg-[#172014] p-6 text-white">
      <p className="text-xs uppercase tracking-[.16em] text-white/50">Checkout</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        {STEPS.map((step, index) => {
          const done = index < current;
          const active = index === current;
          return (
            <div key={step.title} className="flex items-center gap-3 sm:flex-1">
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  done
                    ? "bg-[#d7ff75] text-[#172014]"
                    : active
                      ? "bg-white/15 text-white ring-2 ring-[#d7ff75]"
                      : "bg-white/10 text-white/50"
                }`}
              >
                {done ? <Check size={16} /> : index + 1}
              </span>
              <span className={`text-sm font-semibold ${active ? "text-white" : "text-white/50"}`}>
                {step.title}
              </span>
              {index < STEPS.length - 1 ? (
                <span className="hidden h-px flex-1 bg-white/15 sm:block" />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  // useSearchParams needs a Suspense boundary during static prerendering
  return (
    <Suspense
      fallback={<Surface className="p-6 text-sm text-[#75806e]">Preparing checkout…</Surface>}
    >
      <CheckoutInner />
    </Suspense>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const planId = searchParams.get("plan") || "";

  const [loading, setLoading] = useState(true);
  const [plan, setPlan] = useState(null);
  const [methods, setMethods] = useState([]);
  const [billing, setBilling] = useState(null);
  const [step, setStep] = useState(0);
  const [methodId, setMethodId] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [transactionId, setTransactionId] = useState("");
  const [note, setNote] = useState("");
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!planId) {
      router.replace("/dashboard/plans");
      return;
    }
    Promise.all([
      api("/v1/billing/plans"),
      api("/v1/billing"),
      api("/v1/billing/payment-methods").catch(() => ({ items: [] })),
    ])
      .then(([planData, billingData, methodData]) => {
        const found = (planData.items || []).find((item) => item.id === planId);
        setPlan(found || null);
        setBilling(billingData);
        setMethods(methodData.items || []);
      })
      .catch((failure) => setError(failure.message))
      .finally(() => setLoading(false));
  }, [planId, router]);

  const subscription = billing?.subscription || null;
  const activeSubscription =
    subscription && ["active", "trialing"].includes(String(subscription.status).toLowerCase())
      ? subscription
      : null;
  const pendingPayment = billing?.pendingPayment || null;
  const emailVerified = Boolean(auth?.account?.emailVerified);
  const compatibleMethods = useMemo(
    () => methods.filter((method) => supportsAmount(method, plan)),
    [methods, plan],
  );
  const selectedMethod = useMemo(
    () => compatibleMethods.find((method) => method.id === methodId) || null,
    [compatibleMethods, methodId],
  );
  const trialDays = Number(plan?.trialDays) || 0;

  const entitlements = plan?.entitlements || {};
  const summaryLimits = [
    ["Websites", formatNumber(entitlements.max_sites)],
    ["Videos", formatNumber(entitlements.max_assets)],
    ["Monthly transfer", formatBytes(entitlements.monthly_egress_bytes)],
  ].filter(([, value]) => value != null);
  const summaryFeatures = [
    entitlements.secure_gateway && "Secure playback gateway",
    entitlements.protected_delivery && "Protected media delivery",
    entitlements.dynamic_watermark && "Dynamic watermark",
    entitlements.device_control && "Device control",
    entitlements.concurrent_stream_control && "Concurrent stream control",
    entitlements.piracy_scan && "Piracy detection & takedowns",
  ].filter(Boolean);

  if (loading) {
    return (
      <div className="space-y-8">
        <Surface className="p-6 text-sm text-[#75806e]">Preparing checkout…</Surface>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="space-y-8">
        <Surface className="p-6">
          <EmptyState
            title="Plan not found"
            description="The plan you selected is no longer available. Pick a current plan from the catalog."
            href="/dashboard/plans"
            action="Back to plans"
          />
        </Surface>
      </div>
    );
  }

  if (activeSubscription && activeSubscription.planId === plan.id) {
    return (
      <div className="space-y-8">
        <Surface className="p-6">
          <EmptyState
            title={`You are already on ${plan.name}`}
            description="This plan is your active subscription. Manage it from the plans page."
            href="/dashboard/plans"
            action="Back to plans"
          />
        </Surface>
      </div>
    );
  }

  if (pendingPayment) {
    return (
      <div className="space-y-8">
        <Surface className="overflow-hidden">
          <div className="flex flex-col gap-5 bg-[#fff9ea] p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold text-[#3d432f]">Payment already under review</p>
                <span className="rounded-full bg-[#fdf3e3] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#9a6b1f] ring-1 ring-[#f0e0bd]">
                  {pendingPayment.status}
                </span>
              </div>
              <p className="mt-2 text-sm text-[#6f745f]">
                {pendingPayment.planName} ·{" "}
                {money(pendingPayment.amountMinor, pendingPayment.currency)} · finish this one
                before starting another checkout.
              </p>
            </div>
            <Link
              href="/dashboard/billing"
              className="inline-flex shrink-0 justify-center rounded-xl border border-[#d9dfcf] bg-white px-4 py-2.5 text-sm font-semibold text-[#34402e] transition hover:bg-[#f8faf4]"
            >
              Track in billing
            </Link>
          </div>
        </Surface>
      </div>
    );
  }

  if (!emailVerified) {
    return (
      <div className="space-y-8">
        <Surface className="p-6">
          <div className="flex items-start gap-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#fdf3e3] text-[#9a6b1f]">
              <MailCheck size={19} />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-[#263120]">
                Verify your email to continue
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[#697363]">
                Checkout needs a verified email so we can reach you about this payment. Verify from
                your account page, then come straight back — your plan selection stays here.
              </p>
              <Link
                href="/dashboard/account"
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263120]"
              >
                <MailCheck size={16} /> Open account & verify
              </Link>
            </div>
          </div>
        </Surface>
      </div>
    );
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedMethod) return;
    setSubmitting(true);
    setError("");
    try {
      await api("/v1/billing/payments", {
        method: "POST",
        body: JSON.stringify({
          planId: plan.id,
          paymentMethodId: selectedMethod.id,
          senderNumber,
          transactionId,
          customerNote: note || null,
        }),
      });
      setStep(3);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (step === 0 ? router.push("/dashboard/plans") : setStep(step - 1))}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#596551] transition hover:text-[#263120]"
        >
          <ArrowLeft size={16} /> {step === 0 ? "Plans" : "Back"}
        </button>
      </div>

      <Surface className="overflow-hidden">
        <Stepper current={Math.min(step, 2)} />

        {/* Step 1 — review the plan */}
        {step === 0 ? (
          <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
            <div className="border-b border-[#e6eadf] p-6 lg:border-b-0 lg:border-r">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.14em] text-[#7b8574]">
                    You are buying
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[#263120]">{plan.name}</h2>
                  <p className="mt-2 max-w-md text-sm leading-6 text-[#697363]">
                    {plan.description || "Protected media controls for your workspace."}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-3xl font-semibold text-[#263120]">
                    {money(plan.priceMinor, plan.currency)}
                  </p>
                  <p className="text-xs text-[#87917f]">per month</p>
                  {trialDays > 0 ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#eef5df] px-2.5 py-1 text-[11px] font-semibold text-[#5a7433]">
                      <BadgeCheck size={13} /> {trialDays}-day trial
                    </p>
                  ) : null}
                </div>
              </div>

              {summaryFeatures.length ? (
                <div className="mt-6 border-t border-[#e8ebe3] pt-5">
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-[#87917f]">
                    Included protection
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {summaryFeatures.map((feature) => (
                      <p key={feature} className="flex gap-2 text-sm text-[#596551]">
                        <Check size={15} className="mt-0.5 shrink-0 text-[#78944f]" />
                        <span>{feature}</span>
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}

              {summaryLimits.length ? (
                <div className="mt-5 border-t border-[#e8ebe3] pt-5">
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-[#87917f]">
                    Usage limits
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {summaryLimits.map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-[#f7f9f2] p-3 text-xs">
                        <span className="text-[#87917f]">{label}</span>
                        <p className="mt-1 font-semibold text-[#263120]">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="flex flex-col justify-between gap-6 p-6">
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#78944f]" />
                  <p className="text-sm leading-6 text-[#596551]">
                    Payment is verified manually by our team — usually within a few hours. Your plan
                    activates the moment it is approved.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9f2] p-4 text-sm">
                  <p className="text-xs font-bold uppercase tracking-[.13em] text-[#87917f]">
                    Billed to workspace
                  </p>
                  <p className="mt-1.5 font-semibold text-[#263120]">
                    {billing?.tenant?.name || auth?.account?.email || "Your workspace"}
                  </p>
                  <p className="mt-1 text-xs text-[#87917f]">{auth?.account?.email}</p>
                </div>
              </div>
              <Button
                className="h-12 w-full text-sm"
                onClick={() => {
                  if (!selectedMethod && compatibleMethods.length) {
                    setMethodId(compatibleMethods[0].id);
                  }
                  setStep(1);
                }}
              >
                Continue to payment <ArrowRight size={16} />
              </Button>
            </div>
          </div>
        ) : null}

        {/* Step 2 — send the money */}
        {step === 1 ? (
          <div className="grid gap-0 lg:grid-cols-[.9fr_1.1fr]">
            <div className="border-b border-[#e6eadf] p-6 lg:border-b-0 lg:border-r">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
                Choose how to pay
              </p>
              <div className="mt-4 space-y-2">
                {compatibleMethods.length === 0 ? (
                  <EmptyState
                    title="No payment method available"
                    description="An administrator must enable a payment method first. Please reach out to support."
                    href="/dashboard/support"
                    action="Contact support"
                  />
                ) : (
                  compatibleMethods.map((method) => (
                    <button
                      type="button"
                      key={method.id}
                      onClick={() => setMethodId(method.id)}
                      className={`flex w-full cursor-pointer items-center gap-3 rounded-2xl border p-4 text-left transition hover:bg-[#f8faf4] ${
                        methodId === method.id
                          ? "border-[#829b57] bg-[#f3f8e7]"
                          : "border-[#e0e5d9]"
                      }`}
                    >
                      <WalletCards size={17} className="shrink-0 text-[#536b31]" />
                      <span className="min-w-0">
                        <b className="block text-[#263120]">{method.displayName}</b>
                        <small className="text-[#7b8574]">
                          {method.accountType || method.type}
                        </small>
                      </span>
                      {methodId === method.id ? (
                        <Check size={16} className="ml-auto shrink-0 text-[#5a7433]" />
                      ) : null}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div className="p-6">
              {selectedMethod ? (
                <>
                  <div className="rounded-2xl bg-[#172014] p-5 text-white">
                    <p className="text-xs text-white/55">Send exactly</p>
                    <p className="mt-1 text-3xl font-semibold">
                      {money(plan.priceMinor, plan.currency)}
                    </p>
                    <div className="mt-4 flex items-center justify-between gap-3 rounded-xl bg-white/10 p-3">
                      <div className="min-w-0">
                        <p className="truncate font-mono">{selectedMethod.accountNumber}</p>
                        {selectedMethod.accountName ? (
                          <p className="mt-1 truncate text-xs text-white/55">
                            {selectedMethod.accountName}
                          </p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(selectedMethod.accountNumber);
                          setCopied(true);
                          window.setTimeout(() => setCopied(false), 1600);
                        }}
                        className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-xl bg-white/10 transition hover:bg-white/15"
                        aria-label="Copy payment account number"
                      >
                        {copied ? <BadgeCheck size={16} /> : <Copy size={16} />}
                      </button>
                    </div>
                    {selectedMethod.instructions ? (
                      <p className="mt-3 text-xs leading-5 text-white/60">
                        {selectedMethod.instructions}
                      </p>
                    ) : null}
                  </div>
                  <Button className="mt-6 h-12 w-full text-sm" onClick={() => setStep(2)}>
                    I have sent the money <ArrowRight size={16} />
                  </Button>
                  <p className="mt-3 text-center text-xs text-[#87917f]">
                    Keep the transaction receipt — you will need its ID in the next step.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[#75806e]">Select a payment method to see details.</p>
              )}
            </div>
          </div>
        ) : null}

        {/* Step 3 — confirm the transaction */}
        {step === 2 ? (
          <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
            <div className="border-b border-[#e6eadf] p-6 lg:border-b-0 lg:border-r">
              <h2 className="text-lg font-semibold text-[#263120]">Tell us how you sent it</h2>
              <p className="mt-1 text-sm text-[#697363]">
                Our team matches these details against {selectedMethod?.displayName} to verify your
                payment.
              </p>
              <form className="mt-5 space-y-4" onSubmit={submit}>
                <label className="block text-sm font-medium text-[#34402e]">
                  Sender number
                  <span className="mt-0.5 block text-xs font-normal text-[#87917f]">
                    The {selectedMethod?.displayName} number the money was sent from
                  </span>
                  <Input
                    className="mt-2"
                    required
                    value={senderNumber}
                    onChange={(event) => setSenderNumber(event.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium text-[#34402e]">
                  Transaction ID
                  <span className="mt-0.5 block text-xs font-normal text-[#87917f]">
                    From the confirmation SMS / app receipt
                  </span>
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
                    placeholder="Anything our team should know"
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </label>
                {error ? (
                  <div
                    role="alert"
                    className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-700"
                  >
                    {error}
                  </div>
                ) : null}
                <Button className="h-12 w-full text-sm" disabled={submitting}>
                  {submitting ? "Submitting…" : "Submit for review"}
                </Button>
              </form>
            </div>

            <div className="p-6">
              <div className="rounded-2xl bg-[#f7f9f2] p-5">
                <p className="text-xs font-bold uppercase tracking-[.13em] text-[#87917f]">
                  Order summary
                </p>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#75806e]">Plan</span>
                    <span className="font-semibold text-[#263120]">{plan.name}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#75806e]">Amount</span>
                    <span className="font-semibold text-[#263120]">
                      {money(plan.priceMinor, plan.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#75806e]">Method</span>
                    <span className="font-semibold text-[#263120]">
                      {selectedMethod?.displayName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[#75806e]">To</span>
                    <span className="truncate font-mono text-xs text-[#263120]">
                      {selectedMethod?.accountNumber}
                    </span>
                  </div>
                  {trialDays > 0 ? (
                    <div className="flex items-start justify-between gap-3 border-t border-[#e8ebe3] pt-3">
                      <span className="text-[#75806e]">Trial</span>
                      <span className="text-right font-semibold text-[#4c632d]">
                        {trialDays} days included
                      </span>
                    </div>
                  ) : null}
                </div>
                <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-[#75806e]">
                  <FileClock size={14} className="mt-0.5 shrink-0" />
                  Verification usually takes a few hours. You can track the status from Billing at
                  any time.
                </p>
              </div>
            </div>
          </div>
        ) : null}

        {/* Success */}
        {step === 3 ? (
          <div className="p-8 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-[#eef5df] text-[#5a7433]">
              <BadgeCheck size={26} />
            </span>
            <h2 className="mt-5 text-2xl font-semibold text-[#263120]">
              Payment submitted for review
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[#697363]">
              We received your {plan.name} payment of <b>{money(plan.priceMinor, plan.currency)}</b>
              . Our team verifies it manually — usually within a few hours. The moment it is
              approved, {plan.name} activates for your workspace and you get an email.
            </p>
            <div className="mx-auto mt-6 grid max-w-md gap-2 text-left">
              {[
                [
                  "Track the status",
                  "Billing shows your payment as pending until approved.",
                  "/dashboard/billing",
                ],
                [
                  "Keep setting up",
                  "Sites, videos and API keys can all be prepared meanwhile.",
                  "/dashboard/onboarding",
                ],
              ].map(([title, description, href]) => (
                <Link
                  key={title}
                  href={href}
                  className="group flex items-center gap-3 rounded-2xl border border-[#e4e9db] bg-white p-4 transition hover:border-[#bcc9aa]"
                >
                  <FileClock size={17} className="shrink-0 text-[#536b31]" />
                  <span className="min-w-0">
                    <b className="block text-sm text-[#263120]">{title}</b>
                    <small className="text-[#75806e]">{description}</small>
                  </span>
                  <ArrowRight
                    size={16}
                    className="ml-auto shrink-0 text-[#9ca594] transition group-hover:translate-x-1"
                  />
                </Link>
              ))}
            </div>
          </div>
        ) : null}
      </Surface>

      <p className="flex items-start gap-2 text-xs leading-5 text-[#87917f]">
        <CircleAlert size={13} className="mt-0.5 shrink-0" />
        The Unpirator never asks for your bKash/Nagad PIN. Pay only to the account shown above.
      </p>
    </div>
  );
}
