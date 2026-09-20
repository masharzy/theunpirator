"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, CheckCircle2, CircleAlert, ExternalLink, RefreshCw, SearchCheck, ShieldAlert, Wrench } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { ErrorPanel, LoadingPanel, PageHeader, Surface } from "@/components/console-kit";

const statusUi = {
  pass: { label: "Passed", Icon: CheckCircle2, badge: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: "text-emerald-600" },
  warning: { label: "Warning", Icon: CircleAlert, badge: "bg-amber-50 text-amber-700 border-amber-200", icon: "text-amber-600" },
  critical: { label: "Critical", Icon: ShieldAlert, badge: "bg-red-50 text-red-700 border-red-200", icon: "text-red-600" },
  manual: { label: "Manual check", Icon: SearchCheck, badge: "bg-slate-50 text-slate-600 border-slate-200", icon: "text-slate-500" },
};

export default function SiteIntegrationPage() {
  const { siteId } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    if (!siteId) return;
    setLoading(true); setError("");
    try { setData(await api(`/v1/integration-health?siteId=${encodeURIComponent(siteId)}`)); }
    catch (failure) { setError(failure.message || "Site security check failed"); }
    finally { setLoading(false); }
  }, [siteId]);
  useEffect(() => { load(); }, [load]);
  const site = data?.site;

  return (
    <div className="space-y-7">
      <Link href="/dashboard/integration" className="inline-flex items-center gap-2 text-sm font-semibold text-[#596d3d]"><ArrowLeft size={15} />All sites</Link>
      <PageHeader eyebrow="Integration security" title={site?.name || "Site review"} description={site ? `${site.domain} · Evidence-backed configuration checks` : "Loading site configuration checks."} action={<button type="button" onClick={load} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"><RefreshCw size={15} className={loading ? "animate-spin" : ""} />{loading ? "Checking" : "Run security check"}</button>} />
      <ErrorPanel message={error} onRetry={load} />
      {loading && !site ? <LoadingPanel label="Inspecting site integration" /> : null}
      {site ? (
        <Surface className="grid gap-3 p-5 sm:grid-cols-4">
          {[["Passed", site.summary.passed, "text-emerald-700"], ["Critical", site.summary.critical, "text-red-700"], ["Warnings", site.summary.warning, "text-amber-700"], ["Manual", site.summary.manual, "text-slate-600"]].map(([label, value, color]) => <div key={label} className="rounded-2xl bg-[#f7f9f4] p-4 text-center"><p className={`text-2xl font-semibold ${color}`}>{value}</p><p className="mt-1 text-xs text-[#7b8574]">{label}</p></div>)}
        </Surface>
      ) : null}
      <div className="grid gap-4">
        {(site?.checks || []).map((item) => {
          const ui = statusUi[item.status] || statusUi.manual; const Icon = ui.Icon;
          return <Surface key={item.id} className="p-5"><div className="flex gap-4"><span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[#f5f7f1]"><Icon size={18} className={ui.icon} /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="font-semibold text-[#263120]">{item.title}</h2><span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${ui.badge}`}>{ui.label}</span></div><p className="mt-2 text-sm leading-6 text-[#697363]">{item.detail}</p>{item.evidence ? <div className="mt-3 flex flex-wrap gap-2">{Object.entries(item.evidence).map(([key, value]) => <code key={key} className="rounded-lg border bg-[#f8faf5] px-2.5 py-1.5 text-[11px] text-[#46503f]">{key}: {Array.isArray(value) ? value.join(", ") : String(value)}</code>)}</div> : null}{item.fix ? <div className="mt-4 flex gap-3 rounded-xl border border-[#e7eadf] bg-[#fbfcf8] p-4"><Wrench size={16} className="mt-0.5 shrink-0 text-[#6f8150]" /><p className="text-sm leading-6 text-[#596551]">{item.fix}</p></div> : null}{item.href && item.status !== "pass" ? <Link href={item.href} className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[#526a31]">Open fix guide <ExternalLink size={13} /></Link> : null}</div></div></Surface>;
        })}
      </div>
    </div>
  );
}
