"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
export default function ProvidersPage() {
  const auth = useAuth(),
    [items, setItems] = useState([]),
    [message, setMessage] = useState("");
  const canManage = ["super_admin", "operations_admin"].includes(auth?.account?.platformRole);
  const load = () => api("/v1/admin/providers").then((d) => setItems(d.items || []));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function setStatus(item, status) {
    try {
      await api(`/v1/admin/providers/${item.provider}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#657154]">DELIVERY NETWORK</p>
      <h1 className="mt-3 text-4xl font-semibold">Media providers</h1>
      <p className="mt-2 text-[#687260]">
        Availability, last success/failure and emergency routing controls.
      </p>
      {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-red-700">{message}</p>}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {items.map((x) => (
          <article key={x.provider} className="rounded-2xl border bg-white p-6 shadow-sm">
            <div className="flex justify-between">
              <div>
                <h2 className="text-lg font-semibold uppercase">{x.provider}</h2>
                <p className="mt-2 text-xs text-[#778170]">
                  Updated {new Date(x.updatedAt).toLocaleString()}
                </p>
              </div>
              <span className="h-fit rounded-full bg-[#edf4dc] px-3 py-1 text-xs font-bold uppercase">
                {x.status}
              </span>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-[#f6f7f2] p-3">
                <dt>Last success</dt>
                <dd className="mt-1 font-semibold">
                  {x.lastSuccessAt ? new Date(x.lastSuccessAt).toLocaleString() : "—"}
                </dd>
              </div>
              <div className="rounded-xl bg-[#f6f7f2] p-3">
                <dt>Last failure</dt>
                <dd className="mt-1 font-semibold">
                  {x.lastFailureAt ? new Date(x.lastFailureAt).toLocaleString() : "—"}
                </dd>
              </div>
            </dl>
            {canManage && (
              <div className="mt-5 flex flex-wrap gap-2">
                {["healthy", "degraded", "down", "disabled"].map((s) => (
                  <button
                    key={s}
                    disabled={s === x.status}
                    onClick={() => setStatus(x, s)}
                    className="rounded-lg border px-3 py-2 text-xs font-bold capitalize disabled:opacity-40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
