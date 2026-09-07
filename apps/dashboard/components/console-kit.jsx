"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, CircleAlert } from "lucide-react";

export function PageHeader({ eyebrow, title, description, action }) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#6d7c52]">
            {eyebrow}
          </p>
        )}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#172014] md:text-4xl">
          {title}
        </h1>
        {description && <p className="mt-2 max-w-2xl text-sm leading-6 text-[#66705f]">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function Surface({ children, className = "" }) {
  return (
    <section
      className={`rounded-[24px] border border-[#dfe4d6] bg-white shadow-[0_16px_50px_rgba(31,45,20,.05)] ${className}`}
    >
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, icon: Icon }) {
  return (
    <Surface className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-[#75806e]">{label}</p>
          <p className="mt-3 text-3xl font-semibold tracking-tight text-[#172014]">{value}</p>
          {hint && <p className="mt-2 text-xs text-[#87917f]">{hint}</p>}
        </div>
        {Icon && (
          <span className="grid size-10 place-items-center rounded-2xl bg-[#edf5d8] text-[#4c632d]">
            <Icon size={18} />
          </span>
        )}
      </div>
    </Surface>
  );
}

export function StatusPill({ status }) {
  const value = String(status || "unknown").replaceAll("_", " ");
  const ok = ["active", "approved", "healthy", "configured", "verified", "trialing"].includes(
    String(status || "").toLowerCase(),
  );
  const warning = ["pending", "reviewing", "needs_information", "degraded"].includes(
    String(status || "").toLowerCase(),
  );
  const classes = ok
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : warning
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ring-1 ${classes}`}>
      {value}
    </span>
  );
}

export function ProgressMeter({ label, used = 0, limit, format = (v) => String(v) }) {
  const finite = Number.isFinite(Number(limit)) && Number(limit) > 0;
  const pct = finite ? Math.min(100, Math.max(0, (Number(used) / Number(limit)) * 100)) : 0;
  return (
    <div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-[#33402d]">{label}</span>
        <span className="text-[#727d6b]">
          {format(used)} {finite ? `/ ${format(limit)}` : ""}
        </span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#edf0e8]">
        <div className="h-full rounded-full bg-[#7d9853]" style={{ width: finite ? `${pct}%` : "0%" }} />
      </div>
      {finite && (
        <p className="mt-1 text-right text-[11px] text-[#90998a]">
          {Math.max(0, 100 - pct).toFixed(0)}% remaining
        </p>
      )}
    </div>
  );
}

export function EmptyState({ title, description, href, action = "Get started" }) {
  return (
    <div className="grid min-h-52 place-items-center rounded-[22px] border border-dashed border-[#ccd5bf] bg-[#f8faf4] p-8 text-center">
      <div className="max-w-md">
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-[#edf5d8] text-[#536b31]">
          <CircleAlert size={18} />
        </span>
        <h3 className="mt-4 font-semibold text-[#253021]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#72806a]">{description}</p>
        {href && (
          <Link
            href={href}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#172014] px-4 py-2.5 text-sm font-semibold text-white"
          >
            {action}
            <ArrowRight size={15} />
          </Link>
        )}
      </div>
    </div>
  );
}

export function ChecklistItem({ done, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#e4e8dc] bg-white px-4 py-3 text-sm">
      <CheckCircle2 size={17} className={done ? "text-emerald-600" : "text-[#c3c9ba]"} />
      <span className={done ? "text-[#33402d]" : "text-[#778171]"}>{children}</span>
    </div>
  );
}

export function money(minor, currency = "BDT") {
  if (minor == null) return "Not configured";
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Number(minor) / 100);
}
