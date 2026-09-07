"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
export default function RestrictedPage() {
  const auth = useAuth(),
    [items, setItems] = useState([]),
    [message, setMessage] = useState("");
  const canManage = ["super_admin", "security_admin"].includes(auth?.account?.platformRole);
  const load = () => api("/v1/admin/restricted-integrations").then((d) => setItems(d.items || []));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function review(item, status) {
    const reason = prompt(`Reason for ${status} (minimum 8 characters)`);
    if (!reason) return;
    try {
      await api(`/v1/admin/restricted-integrations/${item.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, reason }),
      });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#8d4a34]">CONTROLLED ACCESS</p>
      <h1 className="mt-3 text-4xl font-semibold">Restricted integrations</h1>
      <p className="mt-2 max-w-2xl text-[#687260]">
        Eligibility review, tenant approval and emergency revocation for private providers.
      </p>
      {message && (
        <p className="mt-5 rounded-xl bg-lg bg-red-50 p-4 text-sm text-red-700">{message}</p>
      )}
      <div className="mt-8 space-y-4">
        {items.length ? (
          items.map((x) => (
            <article
              key={x.id}
              className="rounded-2xl border border-[#e1d7cc] bg-white p-6 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold">{x.provider.replaceAll("_", " ")}</p>
                  <p className="mt-1 text-sm text-[#717b69]">
                    {x.tenantName} · {x.tenantId}
                  </p>
                  <p className="mt-3 text-sm">{x.reason || "Awaiting compliance review."}</p>
                </div>
                <span className="rounded-full bg-[#f2eadc] px-3 py-1 text-xs font-bold uppercase">
                  {x.status}
                </span>
              </div>
              {canManage && (
                <div className="mt-5 flex gap-2">
                  <button
                    onClick={() => review(x, "approved")}
                    className="rounded-xl bg-[#587535] px-4 py-2 text-xs font-bold text-white"
                  >
                    Approve
                  </button>
                  <button
                    onClick={() => review(x, "rejected")}
                    className="rounded-xl border px-4 py-2 text-xs font-bold"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => review(x, "disabled")}
                    className="rounded-xl bg-[#9f3024] px-4 py-2 text-xs font-bold text-white"
                  >
                    Emergency disable
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-[#717b69]">
            No restricted access requests.
          </div>
        )}
      </div>
    </div>
  );
}
