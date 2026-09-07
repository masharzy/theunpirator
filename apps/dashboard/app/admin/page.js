"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const label = (key) => key.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
export default function AdminCommandCenter() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api("/v1/admin/command-center")
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);
  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs font-bold tracking-[.2em] text-[#657154]">COMMAND CENTER</p>
        <h1 className="mt-3 text-4xl font-semibold">Platform at a glance</h1>
        <p className="mt-2 text-[#687260]">Health, resource demand and urgent work in one view.</p>
      </div>
      {error && <p className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
      {!data ? (
        <p>Loading live operations…</p>
      ) : (
        <>
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
                  <b>{x.usage}</b>
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
                        : `/admin/workspaces/${x.tenant_id}/security`
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
        </>
      )}
    </div>
  );
}
