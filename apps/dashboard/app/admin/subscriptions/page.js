"use client";

import { CalendarClock, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";

export default function AdminSubscriptionsPage() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/v1/admin/commerce/subscriptions")
      .then((data) => setItems(data.items || []))
      .catch((e) => setMessage(e.message));
  }, []);

  const visible = useMemo(() => {
    const term = query.toLowerCase();
    return items.filter((item) =>
      [item.tenantName, item.planName, item.status, item.provider]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term)),
    );
  }, [items, query]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Subscriptions"
        description="Inspect every trial and paid subscription, its activation source and exact entitlement period."
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
      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}
      <Surface className="overflow-hidden">
        {visible.length ? (
          <div className="divide-y divide-[#edf0e9]">
            {visible.map((item) => (
              <div
                key={item.id}
                className="grid gap-4 p-5 lg:grid-cols-[1fr_180px_180px_130px] lg:items-center"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-[#edf5d8] text-[#536b31]">
                    <CalendarClock size={16} />
                  </span>
                  <div>
                    <p className="font-semibold">{item.tenantName}</p>
                    <p className="mt-1 text-xs text-[#7d8876]">
                      {item.planName} · {item.provider || "internal/trial"}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-[#87917f]">Starts</p>
                  <p className="mt-1 text-sm">
                    {item.periodStart ? new Date(item.periodStart).toLocaleDateString() : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-[#87917f]">Ends</p>
                  <p className="mt-1 text-sm">
                    {item.periodEnd ? new Date(item.periodEnd).toLocaleDateString() : "—"}
                  </p>
                </div>
                <StatusPill status={item.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="p-8 text-sm text-[#7b8574]">No subscriptions found.</p>
        )}
      </Surface>
    </div>
  );
}
