"use client";

import { CheckCircle2, Clock3, Eye, MessageSquareWarning, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusPill, Surface, money } from "@/components/console-kit";
import { useAuth } from "@/components/auth-provider";

export default function AdminPaymentsPage() {
  const auth = useAuth();
  const canReview = ["super_admin", "billing_admin"].includes(auth?.account?.platformRole);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState("");
  const [filter, setFilter] = useState("pending");
  const [message, setMessage] = useState("");

  const load = async () => {
    const data = await api("/v1/admin/commerce/payments");
    setItems(data.items || []);
    if (!selectedId && data.items?.length) setSelectedId(data.items[0].id);
  };

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    api(`/v1/admin/commerce/payments/${selectedId}`)
      .then(setDetail)
      .catch((e) => setMessage(e.message));
  }, [selectedId]);

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.status === filter)),
    [items, filter],
  );

  const counters = useMemo(
    () => ({
      pending: items.filter((i) => i.status === "pending").length,
      reviewing: items.filter((i) => i.status === "reviewing").length,
      needs: items.filter((i) => i.status === "needs_information").length,
    }),
    [items],
  );

  async function review(action) {
    if (!selectedId) return;
    if (action === "approve" && !confirm("Approve this payment and activate the plan now?")) return;
    if (["reject", "needs_information"].includes(action) && !note.trim()) {
      setMessage("Add a review note before this action.");
      return;
    }
    try {
      await api(`/v1/admin/commerce/payments/${selectedId}/review`, {
        method: "POST",
        body: JSON.stringify({ action, note: note || null }),
      });
      setNote("");
      setMessage(
        action === "approve" ? "Payment approved and subscription activated." : "Payment updated.",
      );
      await load();
      const refreshed = await api(`/v1/admin/commerce/payments/${selectedId}`);
      setDetail(refreshed);
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue operations"
        title="Payment approval"
        description="Verify manual transactions, request more information, reject invalid claims or atomically activate the requested subscription."
        action={
          <select
            className="rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="pending">Pending ({counters.pending})</option>
            <option value="reviewing">Reviewing ({counters.reviewing})</option>
            <option value="needs_information">Needs information ({counters.needs})</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="all">All</option>
          </select>
        }
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm">{message}</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_.9fr]">
        <Surface className="overflow-hidden">
          {visible.length ? (
            <div className="divide-y divide-[#edf0e9]">
              {visible.map((payment) => (
                <button
                  key={payment.id}
                  onClick={() => setSelectedId(payment.id)}
                  className={`grid w-full gap-3 p-5 text-left transition md:grid-cols-[1fr_auto_auto] md:items-center ${
                    selectedId === payment.id ? "bg-[#f3f8e7]" : "hover:bg-[#fafbf8]"
                  }`}
                >
                  <div>
                    <p className="font-semibold">{payment.tenantName}</p>
                    <p className="mt-1 text-xs text-[#7f8978]">
                      {payment.planName} · {payment.transactionId} · {payment.email}
                    </p>
                  </div>
                  <p className="font-semibold">{money(payment.amountMinor, payment.currency)}</p>
                  <StatusPill status={payment.status} />
                </button>
              ))}
            </div>
          ) : (
            <p className="p-8 text-sm text-[#7b8574]">No payments match this filter.</p>
          )}
        </Surface>

        <Surface className="p-6">
          {detail?.payment ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
                    Review transaction
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">{detail.payment.planNameSnapshot}</h2>
                </div>
                <StatusPill status={detail.payment.status} />
              </div>

              <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2">
                {[
                  [
                    "Amount",
                    money(detail.payment.amountMinorSnapshot, detail.payment.currencySnapshot),
                  ],
                  ["Method", detail.method?.displayName || "Unknown"],
                  ["Sender", detail.payment.senderNumber],
                  ["Transaction ID", detail.payment.transactionId],
                  ["Submitted", new Date(detail.payment.submittedAt).toLocaleString()],
                  ["Plan duration", `${detail.payment.durationDaysSnapshot} days`],
                ].map(([label, value]) => (
                  <div key={label} className="rounded-xl bg-[#f7f9f2] p-3">
                    <dt className="text-xs text-[#87917f]">{label}</dt>
                    <dd className="mt-1 break-all font-medium">{value}</dd>
                  </div>
                ))}
              </dl>

              {detail.payment.proofReference && (
                <div className="mt-4 rounded-xl border border-[#e2e7dc] p-4 text-sm">
                  <p className="text-xs text-[#87917f]">Proof reference</p>
                  <p className="mt-1 break-all">{detail.payment.proofReference}</p>
                </div>
              )}

              {canReview &&
                !["approved", "rejected", "canceled", "expired"].includes(
                  detail.payment.status,
                ) && (
                  <>
                    <label className="mt-5 block text-sm font-medium">
                      Review note
                      <textarea
                        className="mt-2 min-h-24 w-full rounded-xl border border-[#dfe4d6] p-3 text-sm"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Reason, verification details or information requested"
                      />
                    </label>
                    <div className="mt-4 grid gap-2 sm:grid-cols-2">
                      <Button variant="outline" onClick={() => review("reviewing")}>
                        <Eye size={15} /> Mark reviewing
                      </Button>
                      <Button variant="outline" onClick={() => review("needs_information")}>
                        <MessageSquareWarning size={15} /> Need information
                      </Button>
                      <Button
                        className="bg-emerald-700 hover:bg-emerald-800"
                        onClick={() => review("approve")}
                      >
                        <CheckCircle2 size={15} /> Approve & activate
                      </Button>
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-700"
                        onClick={() => review("reject")}
                      >
                        <XCircle size={15} /> Reject
                      </Button>
                    </div>
                  </>
                )}
            </>
          ) : (
            <div className="grid min-h-72 place-items-center text-center text-sm text-[#7b8574]">
              <div>
                <Clock3 className="mx-auto mb-3" />
                Select a payment to review.
              </div>
            </div>
          )}
        </Surface>
      </div>
    </div>
  );
}
