"use client";
import { Copy, WalletCards } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatusPill, Surface, money } from "@/components/console-kit";

export default function PaymentsPage() {
  const params = useSearchParams();
  const [plans, setPlans] = useState([]),
    [methods, setMethods] = useState([]),
    [billing, setBilling] = useState(null),
    [history, setHistory] = useState([]),
    [message, setMessage] = useState("");
  const [planId, setPlanId] = useState(params.get("plan") || ""),
    [methodId, setMethodId] = useState(""),
    [senderNumber, setSenderNumber] = useState(""),
    [transactionId, setTransactionId] = useState(""),
    [note, setNote] = useState("");
  const load = async () => {
    const [p, m, b, h] = await Promise.all([
      api("/v1/billing/plans"),
      api("/v1/billing/payment-methods"),
      api("/v1/billing"),
      api("/v1/billing/payments"),
    ]);
    setPlans(p.items || []);
    setMethods(m.items || []);
    setBilling(b);
    setHistory(h.items || []);
    if (!planId && p.items?.length) setPlanId(p.items[0].id);
    if (!methodId && m.items?.length) setMethodId(m.items[0].id);
  };
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  const plan = useMemo(() => plans.find((x) => x.id === planId), [plans, planId]);
  const method = useMemo(() => methods.find((x) => x.id === methodId), [methods, methodId]);
  const pending = billing?.pendingPayment;
  async function submit(e) {
    e.preventDefault();
    try {
      await api("/v1/billing/payments", {
        method: "POST",
        body: JSON.stringify({
          planId,
          paymentMethodId: methodId,
          senderNumber,
          transactionId,
          customerNote: note || null,
        }),
      });
      setMessage("Payment submitted for admin approval.");
      setTransactionId("");
      setNote("");
      await load();
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Manual billing"
        title="Payments"
        description="Pay by bKash, Nagad or Rocket and submit the transaction for verification."
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">
          {message}
        </div>
      )}
      {pending ? (
        <Surface className="overflow-hidden">
          <div className="bg-[#172014] p-6 text-white">
            <p className="text-xs uppercase tracking-[.16em] text-white/50">Awaiting approval</p>
            <h2 className="mt-2 text-2xl font-semibold">{pending.planName}</h2>
            <p className="mt-2 text-sm text-white/60">Transaction {pending.transactionId}</p>
            <div className="mt-4">
              <StatusPill status={pending.status} />
            </div>
          </div>
          <p className="p-6 text-sm text-[#687461]">
            Your plan activates only after an admin verifies this payment.
          </p>
        </Surface>
      ) : methods.length === 0 ? (
        <EmptyState
          title="No payment method is enabled"
          description="An administrator must enable bKash, Nagad or Rocket first."
        />
      ) : (
        <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
          <Surface className="p-6">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
              Choose plan
            </p>
            <div className="mt-4 space-y-2">
              {plans.map((p) => (
                <button
                  key={p.id}
                  disabled={!p.priceMinor}
                  onClick={() => setPlanId(p.id)}
                  className={`flex w-full justify-between rounded-2xl border p-4 text-left ${planId === p.id ? "border-[#829b57] bg-[#f3f8e7]" : "border-[#e0e5d9]"}`}
                >
                  <span>
                    <strong className="block">{p.name}</strong>
                    <small>{p.durationDays || 30} days</small>
                  </span>
                  <b>{money(p.priceMinor, p.currency)}</b>
                </button>
              ))}
            </div>
            <p className="mt-6 text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
              Payment method
            </p>
            <div className="mt-4 space-y-2">
              {methods.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setMethodId(m.id)}
                  className={`w-full rounded-2xl border p-4 text-left ${methodId === m.id ? "border-[#829b57] bg-[#f3f8e7]" : "border-[#e0e5d9]"}`}
                >
                  <span className="flex items-center gap-3">
                    <WalletCards size={17} />
                    <span>
                      <b className="block">{m.displayName}</b>
                      <small>{m.accountType || m.type}</small>
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </Surface>
          <Surface className="p-6">
            {plan && method ? (
              <>
                <div className="rounded-2xl bg-[#172014] p-5 text-white">
                  <p className="text-xs text-white/55">Send exactly</p>
                  <p className="mt-1 text-3xl font-semibold">
                    {money(plan.priceMinor, plan.currency)}
                  </p>
                  <div className="mt-4 flex items-center justify-between rounded-xl bg-white/10 p-3">
                    <span className="font-mono">{method.accountNumber}</span>
                    <button onClick={() => navigator.clipboard.writeText(method.accountNumber)}>
                      <Copy size={16} />
                    </button>
                  </div>
                  {method.instructions && (
                    <p className="mt-3 text-xs text-white/60">{method.instructions}</p>
                  )}
                </div>
                <form className="mt-6 space-y-4" onSubmit={submit}>
                  <label className="block text-sm font-medium">
                    Sender number
                    <Input
                      className="mt-2"
                      required
                      value={senderNumber}
                      onChange={(e) => setSenderNumber(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Transaction ID
                    <Input
                      className="mt-2"
                      required
                      value={transactionId}
                      onChange={(e) => setTransactionId(e.target.value)}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Note
                    <textarea
                      className="mt-2 min-h-24 w-full rounded-xl border p-3"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                  </label>
                  <Button className="w-full">Submit for approval</Button>
                </form>
              </>
            ) : (
              <p className="text-sm text-[#7b8574]">Choose a configured plan and payment method.</p>
            )}
          </Surface>
        </div>
      )}
      <Surface className="overflow-hidden">
        <div className="border-b p-5">
          <h2 className="font-semibold">Payment history</h2>
        </div>
        {history.length ? (
          <div className="divide-y">
            {history.map((x) => (
              <div key={x.id} className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div>
                  <b>{x.planNameSnapshot}</b>
                  <p className="mt-1 text-xs text-[#7d8876]">
                    {x.transactionId} · {money(x.amountMinorSnapshot, x.currencySnapshot)}
                  </p>
                </div>
                <StatusPill status={x.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="p-5 text-sm text-[#7b8574]">No payment history yet.</p>
        )}
      </Surface>
    </div>
  );
}
