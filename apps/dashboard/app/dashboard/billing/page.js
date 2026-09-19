"use client";

import Link from "next/link";
import { CalendarDays, CreditCard, ReceiptText, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, StatusPill, Surface, money } from "@/components/console-kit";

function dateTime(value) {
  return value ? new Date(value).toLocaleString() : "—";
}

function dateOnly(value) {
  return value ? new Date(value).toLocaleDateString() : "—";
}

function Metric({ label, value, hint, icon: Icon }) {
  return (
    <Surface className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#879080]">{label}</p>
          <p className="mt-2 truncate text-xl font-semibold tracking-tight text-[#263120]">
            {value}
          </p>
          <p className="mt-1 text-xs text-[#899283]">{hint}</p>
        </div>
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf5d8] text-[#536b31]">
          <Icon size={16} />
        </span>
      </div>
    </Surface>
  );
}

export default function BillingPage() {
  const [billing, setBilling] = useState(null);
  const [history, setHistory] = useState(null);
  const [error, setError] = useState("");

  async function load() {
    const [billingData, paymentData] = await Promise.all([
      api("/v1/billing"),
      api("/v1/billing/payments"),
    ]);
    setBilling(billingData);
    setHistory(paymentData.items || []);
  }

  useEffect(() => {
    load().catch((failure) => setError(failure.message));
  }, []);

  const subscription = billing?.subscription || null;
  const activeSubscription =
    subscription && ["active", "trialing"].includes(String(subscription.status).toLowerCase())
      ? subscription
      : null;
  const pending = billing?.pendingPayment || null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Subscription"
        title="Billing"
        description="Track the active subscription, payment reviews and transaction history for this workspace. Choose or change plans from the Plan page."
        action={
          <Link
            href="/dashboard/plans"
            className="inline-flex justify-center rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263120]"
          >
            {activeSubscription ? "Manage plan" : "Choose a plan"}
          </Link>
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {billing === null ? (
        <Surface className="p-10 text-sm text-[#74806d]">Loading billing details…</Surface>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Metric
              label="Workspace plan"
              value={activeSubscription?.planName || "Free"}
              hint={activeSubscription ? "Protected playback plan" : "No paid plan is active"}
              icon={ShieldCheck}
            />
            <Metric
              label="Billing status"
              value={activeSubscription?.status || pending?.status || "Free"}
              hint={pending ? "Payment review in progress" : "Current workspace billing state"}
              icon={CreditCard}
            />
            <Metric
              label="Current period ends"
              value={activeSubscription ? dateOnly(activeSubscription.periodEnd) : "—"}
              hint={activeSubscription ? "Manual renewal is required" : "No billing period yet"}
              icon={CalendarDays}
            />
          </div>

          {activeSubscription ? (
            <Surface className="overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
                <div className="border-b border-[#e6eadf] p-6 lg:border-b-0 lg:border-r">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8574]">
                        Current subscription
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold text-[#263120]">
                        {activeSubscription.planName}
                      </h2>
                      <p className="mt-2 max-w-xl text-sm leading-6 text-[#697363]">
                        {activeSubscription.planDescription ||
                          "Plan protections and usage limits are active across this workspace."}
                      </p>
                    </div>
                    <StatusPill status={activeSubscription.status} />
                  </div>
                </div>
                <div className="grid gap-5 p-6 sm:grid-cols-2 lg:grid-cols-1">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#90998a]">
                      Plan price
                    </p>
                    <p className="mt-1 text-lg font-semibold text-[#34402e]">
                      {money(activeSubscription.priceMinor, activeSubscription.currency)}
                    </p>
                    <p className="mt-1 text-xs text-[#899283]">
                      {activeSubscription.durationDays || 30}-day access period
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#90998a]">
                      Current period
                    </p>
                    <p className="mt-1 text-sm font-medium text-[#34402e]">
                      {dateOnly(activeSubscription.periodStart)} →{" "}
                      {dateOnly(activeSubscription.periodEnd)}
                    </p>
                    <p className="mt-1 text-xs text-[#899283]">
                      Renew from Plan before access ends.
                    </p>
                  </div>
                </div>
              </div>
            </Surface>
          ) : (
            <Surface className="overflow-hidden">
              <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-semibold text-[#263120]">Free workspace</h2>
                    <span className="rounded-full bg-[#f1f3ed] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#65705f] ring-1 ring-[#dde2d7]">
                      Free
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-[#697363]">
                    Protected playback is unavailable until a paid plan is active. Workspace setup
                    can continue without a subscription.
                  </p>
                </div>
                <Link
                  href="/dashboard/plans"
                  className="inline-flex shrink-0 justify-center rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#263120]"
                >
                  View plans
                </Link>
              </div>
            </Surface>
          )}

          {pending && (
            <Surface className="overflow-hidden">
              <div className="bg-[#fff9ea] p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#8a7a45]">
                      Payment review
                    </p>
                    <h2 className="mt-2 text-xl font-semibold text-[#3d432f]">
                      {pending.planName}
                    </h2>
                    <p className="mt-2 text-sm text-[#6f745f]">
                      {money(pending.amountMinor, pending.currency)} · Transaction{" "}
                      {pending.transactionId}
                    </p>
                    <p className="mt-1 text-xs text-[#8a8d7d]">
                      Submitted {dateTime(pending.submittedAt)}
                    </p>
                  </div>
                  <StatusPill status={pending.status} />
                </div>
                {(pending.reviewNote || pending.rejectionReason) && (
                  <div className="mt-5 rounded-xl border border-[#eadfb7] bg-white/70 p-4 text-sm text-[#665f45]">
                    {pending.rejectionReason || pending.reviewNote}
                  </div>
                )}
                <p className="mt-5 text-sm leading-6 text-[#756f57]">
                  The plan activates only after the payment is verified. You cannot submit another
                  payment while this review is open.
                </p>
              </div>
            </Surface>
          )}

          <Surface className="overflow-hidden">
            <div className="flex items-center justify-between gap-4 border-b border-[#e6eadf] px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#7b8574]">
                  Transactions
                </p>
                <h2 className="mt-1 font-semibold text-[#263120]">Payment history</h2>
              </div>
              <span className="grid size-9 place-items-center rounded-xl bg-[#f1f5ec] text-[#627150]">
                <ReceiptText size={16} />
              </span>
            </div>

            {history === null ? (
              <p className="p-6 text-sm text-[#74806d]">Loading payment history…</p>
            ) : history.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  title="No payment history yet"
                  description="Submitted plan payments and their review outcomes will appear here."
                />
              </div>
            ) : (
              <div className="divide-y divide-[#e8ebe3]">
                {history.map((payment) => (
                  <div
                    key={payment.id}
                    className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_180px_180px] md:items-center"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-[#253021]">{payment.planName}</p>
                        <StatusPill status={payment.status} />
                      </div>
                      <p className="mt-1.5 text-sm text-[#697363]">
                        {money(payment.amountMinor, payment.currency)} · Transaction{" "}
                        {payment.transactionId}
                      </p>
                      {(payment.rejectionReason || payment.reviewNote) && (
                        <p className="mt-2 text-xs leading-5 text-[#8a7468]">
                          {payment.rejectionReason || payment.reviewNote}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Submitted
                      </p>
                      <p className="mt-1 text-sm text-[#4b5745]">{dateTime(payment.submittedAt)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#929b8c]">
                        Reviewed
                      </p>
                      <p className="mt-1 text-sm text-[#4b5745]">{dateTime(payment.reviewedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Surface>
        </>
      )}
    </div>
  );
}
