"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/components/auth-provider";
export default function FeaturesPage() {
  const auth = useAuth(),
    [items, setItems] = useState([]),
    [message, setMessage] = useState("");
  const canManage = ["super_admin", "operations_admin", "security_admin"].includes(
    auth?.account?.platformRole,
  );
  const load = () => api("/v1/admin/features").then((d) => setItems(d.items || []));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);
  async function toggle(item) {
    const reason = prompt("Reason for changing this global feature (minimum 8 characters)");
    if (!reason) return;
    try {
      await api(`/v1/admin/features/${item.key}`, {
        method: "PUT",
        body: JSON.stringify({ enabled: !item.enabled, reason }),
      });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div>
      <p className="text-xs font-bold tracking-[.2em] text-[#657154]">PLATFORM CAPABILITIES</p>
      <h1 className="mt-3 text-4xl font-semibold">Feature controls</h1>
      <p className="mt-2 text-[#687260]">
        Global defaults and tenant overrides. Every change is MFA protected and audited.
      </p>
      {message && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{message}</p>}
      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        {items.map((x) => (
          <article key={x.id} className="rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-semibold">{x.key.replaceAll("_", " ")}</p>
                <p className="mt-1 text-xs text-[#7b8574]">
                  {x.scopeType} · {x.scopeId}
                </p>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${x.enabled ? "bg-[#e7f3cc] text-[#506b2d]" : "bg-[#eceee8] text-[#737a6d]"}`}
              >
                {x.enabled ? "Enabled" : "Disabled"}
              </span>
            </div>
            {canManage && x.scopeType === "global" && (
              <button
                onClick={() => toggle(x)}
                className="mt-5 rounded-xl border px-4 py-2 text-xs font-bold"
              >
                {x.enabled ? "Disable" : "Enable"}
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
