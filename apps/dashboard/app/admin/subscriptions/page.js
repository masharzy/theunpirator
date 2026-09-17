"use client";

import { Ban, CalendarClock, Search, UserPlus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";

const filters = [
  ["all", "All"],
  ["active", "Active"],
  ["trialing", "Trial"],
  ["none", "No plan"],
  ["canceled", "Revoked / canceled"],
];

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState([]);
  const [noPlan, setNoPlan] = useState([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = () =>
    api("/v1/admin/commerce/subscriptions")
      .then((data) => {
        setItems(data.items || []);
        setNoPlan(data.noPlan || []);
      })
      .catch((e) => setMessage(e.message));

  useEffect(() => {
    load();
  }, []);

  const counts = useMemo(
    () => ({
      all: items.length + noPlan.length,
      active: items.filter((item) => item.status === "active").length,
      trialing: items.filter((item) => item.status === "trialing").length,
      none: noPlan.length,
      canceled: items.filter((item) => ["canceled", "expired"].includes(item.status)).length,
    }),
    [items, noPlan],
  );

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    const subscriptionRows = items
      .filter((item) =>
        filter === "all"
          ? true
          : filter === "canceled"
            ? ["canceled", "expired"].includes(item.status)
            : item.status === filter,
      )
      .map((item) => ({ ...item, rowType: "subscription" }));
    const noPlanRows =
      filter === "all" || filter === "none"
        ? noPlan.map((item) => ({ ...item, rowType: "none", status: "no_plan" }))
        : [];

    return [...subscriptionRows, ...noPlanRows].filter((item) =>
      [item.tenantName, item.planName, item.status, item.provider]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [items, noPlan, query, filter]);

  async function revoke(item) {
    const reason = window.prompt(
      `Why are you revoking ${item.tenantName}'s ${item.planName} access?`,
    );
    if (!reason) return;

    setBusyId(item.id);
    setMessage("");
    try {
      await api(`/v1/admin/commerce/subscriptions/${item.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      await load();
      setMessage("Subscription revoked. Plan entitlements are no longer active.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusyId("");
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Subscriptions"
        description="See paid plans, trials and newly created workspaces with no plan. Active access can be revoked immediately."
        action={
          <label className="flex items-center gap-2 rounded-xl border border-[#dfe4d6] bg-white px-3">
            <Search size={15} className="text-[#87917f]" />
            <input
              className="py-2.5 text-sm outline-none"
              placeholder="Search workspace or plan"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        }
      />

      <div className="flex flex-wrap gap-2">
        {filters.map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setFilter(value)}
            className={`rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
              filter === value
                ? "border-[#bcc8ae] bg-[#eef4e7] text-[#314028]"
                : "border-[#e0e5da] bg-white text-[#6d7767] hover:bg-[#f8faf5]"
            }`}
          >
            {label} <span className="ml-1 text-xs opacity-70">{counts[value] || 0}</span>
          </button>
        ))}
      </div>

      {message && (
        <div className="rounded-2xl border border-[#dfe4d6] bg-white p-4 text-sm text-[#566150]">
          {message}
        </div>
      )}

      <Surface className="overflow-hidden">
        {visible.length ? (
          <div className="divide-y divide-[#edf0e9]">
            {visible.map((item) => (
              <div
                key={item.rowType === "none" ? `none-${item.tenantId}` : item.id}
                className="grid gap-4 p-5 lg:grid-cols-[1fr_170px_170px_130px_150px] lg:items-center"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#edf5d8] text-[#536b31]">
                    {item.rowType === "none" ? <UserPlus size={16} /> : <CalendarClock size={16} />}
                  </span>
                  <div>
                    <p className="font-semibold">{item.tenantName}</p>
                    <p className="mt-1 text-xs text-[#7d8876]">
                      {item.rowType === "none"
                        ? "New workspace · no plan selected"
                        : `${item.planName} · ${item.status === "trialing" ? "trial" : item.provider || "internal"}`}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[#87917f]">Starts</p>
                  <p className="mt-1 text-sm">
                    {item.periodStart
                      ? new Date(item.periodStart).toLocaleDateString()
                      : item.createdAt
                        ? new Date(item.createdAt).toLocaleDateString()
                        : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#87917f]">Ends</p>
                  <p className="mt-1 text-sm">
                    {item.periodEnd ? new Date(item.periodEnd).toLocaleDateString() : "—"}
                  </p>
                </div>
                {item.rowType === "none" ? (
                  <span className="w-fit rounded-full border border-[#dde3d7] bg-[#f7f8f4] px-2.5 py-1 text-xs font-semibold text-[#6f786a]">
                    no plan
                  </span>
                ) : (
                  <StatusPill status={item.status} />
                )}
                <div className="lg:text-right">
                  {item.rowType === "subscription" && ["active", "trialing"].includes(item.status) ? (
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-700 hover:bg-red-50"
                      disabled={busyId === item.id}
                      onClick={() => revoke(item)}
                    >
                      <Ban size={14} className="mr-2" />
                      {busyId === item.id ? "Revoking…" : "Revoke access"}
                    </Button>
                  ) : (
                    <span className="text-xs text-[#8a9384]">No active access</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-sm text-[#7b8574]">No matching subscriptions or workspaces.</p>
        )}
      </Surface>
    </div>
  );
}
