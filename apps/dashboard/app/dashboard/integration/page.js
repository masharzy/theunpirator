"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, CircleCheck, Globe2, RefreshCw, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, ErrorPanel, LoadingPanel, PageHeader, Surface } from "@/components/console-kit";

const statusUi = {
  secure: { label: "Secure", className: "bg-emerald-50 text-emerald-700 ring-emerald-200", Icon: CircleCheck },
  needs_attention: { label: "Needs attention", className: "bg-amber-50 text-amber-700 ring-amber-200", Icon: CircleAlert },
  critical: { label: "Critical", className: "bg-red-50 text-red-700 ring-red-200", Icon: CircleAlert },
};

export default function IntegrationPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setData(await api("/v1/integration-health")); }
    catch (failure) { setError(failure.message || "Integration security check failed"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Site security"
        title="Integration security"
        description="Choose a site to review how safely the Unpirator player is integrated. Checks use verified server evidence and clearly mark anything that still needs manual review."
        action={
          <button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50">
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            {loading ? "Checking" : "Refresh"}
          </button>
        }
      />
      <ErrorPanel message={error} onRetry={load} />
      {loading && !data ? <LoadingPanel label="Loading site security status" /> : null}
      {!loading && data?.sites?.length === 0 ? (
        <EmptyState title="No sites to review" description="Register and verify a playback site before reviewing its integration security." href="/dashboard/sites" action="Add a site" />
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {(data?.sites || []).map((site) => {
          const ui = statusUi[site.status] || statusUi.needs_attention;
          const Icon = ui.Icon;
          return (
            <Surface key={site.id} className="group overflow-hidden transition hover:-translate-y-0.5 hover:border-[#bdc9ad] hover:shadow-[0_20px_55px_rgba(31,45,20,.09)]">
              <Link href={`/dashboard/integration/${site.id}`} className="block p-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#829a5c]">
                <div className="flex items-start justify-between gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]"><Globe2 size={20} /></span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] ring-1 ${ui.className}`}><Icon size={12} />{ui.label}</span>
                </div>
                <h2 className="mt-5 text-xl font-semibold text-[#263120]">{site.name}</h2>
                <p className="mt-1 break-all text-sm text-[#687362]">{site.domain}</p>
                <div className="mt-5 grid grid-cols-3 gap-2 border-y border-[#edf0e9] py-4 text-center">
                  <div><p className="text-lg font-semibold text-red-700">{site.summary.critical}</p><p className="text-[10px] uppercase tracking-[.08em] text-[#899283]">Critical</p></div>
                  <div><p className="text-lg font-semibold text-amber-700">{site.summary.warning}</p><p className="text-[10px] uppercase tracking-[.08em] text-[#899283]">Warnings</p></div>
                  <div><p className="text-lg font-semibold text-[#526b30]">{site.summary.passed}</p><p className="text-[10px] uppercase tracking-[.08em] text-[#899283]">Passed</p></div>
                </div>
                <div className="mt-4 flex items-center justify-between text-sm font-semibold text-[#4f652f]"><span className="inline-flex items-center gap-2"><ShieldCheck size={16} />Review integration</span><ArrowRight size={16} className="transition group-hover:translate-x-1" /></div>
              </Link>
            </Surface>
          );
        })}
      </div>
    </div>
  );
}
