"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const label = (key) => key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export default function AdminCommandCenter() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("today");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  useEffect(() => {
    api(`/v1/admin/command-center?${new URLSearchParams({ range, from, to })}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [range, from, to]);
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold tracking-[.2em] text-[#657154]">COMMAND CENTER</p>
        <h1 className="mt-3 text-4xl font-semibold">Platform at a glance</h1>
        <p className="mt-2 text-[#687260]">Health, resource demand and urgent work in one view.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {[
          ["today", "Today"],
          ["7d", "7 days"],
          ["30d", "30 days"],
          ["billing", "Billing period"],
          ["custom", "Custom"],
        ].map(([v, n]) => (
          <button
            key={v}
            onClick={() => setRange(v)}
            className={`rounded-full px-4 py-2 text-xs font-bold ${range === v ? "bg-[#172014] text-white" : "border bg-white"}`}
          >
            {n}
          </button>
        ))}
      </div>
      {range === "custom" && (
        <div className="flex flex-wrap gap-3 rounded-2xl border bg-white p-4">
          <label className="text-xs">
            From{" "}
            <input
              type="date"
              className="ml-2 rounded-lg border p-2"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="text-xs">
            To{" "}
            <input
              type="date"
              className="ml-2 rounded-lg border p-2"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
      )}
      {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {!data ? (
        <p>Loading live operations…</p>
      ) : (
        <>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Platform health</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {data.providers.map((x) => (
                <div className="rounded-2xl border bg-white p-4" key={x.provider}>
                  <p className="font-semibold uppercase">{x.provider}</p>
                  <p className="mt-2 text-xs font-bold uppercase text-[#607a39]">{x.status}</p>
                  <p className="mt-2 text-[10px] text-[#818a7a]">
                    {x.lastSuccessAt
                      ? `Last success ${new Date(x.lastSuccessAt).toLocaleString()}`
                      : "No success recorded"}
                  </p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Business KPI</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {Object.entries(data.business || {}).map(([k, v]) => (
                <div key={k} className="rounded-2xl border bg-white p-4">
                  <p className="text-2xl font-semibold">{String(v)}</p>
                  <p className="mt-2 text-xs text-[#747e6d]">{label(k)}</p>
                </div>
              ))}
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-lg font-semibold">Media KPI</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Object.entries(data.media || {}).map(([k, v]) => (
                <div key={k} className="rounded-2xl border bg-white p-4">
                  <p className="text-2xl font-semibold">{String(v)}</p>
                  <p className="mt-2 text-xs text-[#747e6d]">{label(k)}</p>
                </div>
              ))}
            </div>
          </section>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Top consumers</h2>
              {data.topWorkspaces.map((x) => (
                <Link
                  className="mt-3 flex justify-between border-b py-2 text-sm"
                  href={`/admin/workspaces/${x.id}`}
                  key={x.id}
                >
                  <span>{x.name}</span>
                  <b>
                    {x.egress_bytes} bytes · {x.gateway_requests} requests · {x.playback_minutes}{" "}
                    min
                  </b>
                </Link>
              ))}
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Attention queue</h2>
              {data.attention.length ? (
                data.attention.map((x) => (
                  <Link
                    className="mt-3 block border-b py-2 text-sm"
                    href={
                      x.type === "payment"
                        ? "/admin/payments"
                        : x.type === "provider"
                          ? "/admin/providers"
                          : x.type === "webhook"
                            ? "/admin/system/jobs"
                            : `/admin/workspaces/${x.tenant_id}/${x.type === "subscription" ? "subscription" : "security"}`
                    }
                    key={`${x.type}-${x.id}`}
                  >
                    {x.title}
                  </Link>
                ))
              ) : (
                <p className="mt-4 text-sm text-[#747e6d]">Nothing needs immediate attention.</p>
              )}
            </section>
          </div>
          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Top assets</h2>
              {data.topAssets.map((x) => (
                <Link
                  className="mt-3 flex justify-between border-b py-2 text-sm"
                  href={`/admin/workspaces/${x.tenant_id}/assets`}
                  key={x.id}
                >
                  <span>{x.title}</span>
                  <b>
                    {x.egress_bytes} bytes · {x.plays} plays · {x.viewers} viewers · {x.errors}{" "}
                    errors
                  </b>
                </Link>
              ))}
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <h2 className="font-semibold">Provider demand</h2>
              {data.topProviders.map((x) => (
                <div className="mt-3 flex justify-between border-b py-2 text-sm" key={x.provider}>
                  <span className="uppercase">{x.provider}</span>
                  <b>
                    {x.requests} requests · {x.failures} failures
                  </b>
                </div>
              ))}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
