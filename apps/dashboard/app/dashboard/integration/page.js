"use client";

import Link from "next/link";
import {
  Activity,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
  TriangleAlert,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Surface } from "@/components/console-kit";

const statusUi = {
  pass: {
    label: "Healthy",
    icon: CheckCircle2,
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200",
    iconClass: "text-emerald-600",
  },
  action: {
    label: "Needs action",
    icon: TriangleAlert,
    badge: "bg-amber-50 text-amber-700 border-amber-200",
    iconClass: "text-amber-600",
  },
  waiting: {
    label: "Waiting",
    icon: Activity,
    badge: "bg-[#f1f3ed] text-[#66705f] border-[#dfe4d8]",
    iconClass: "text-[#85907e]",
  },
};

function formatObserved(value) {
  if (!value) return "Not observed yet";
  return new Date(value).toLocaleString();
}

export default function IntegrationPage() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const scan = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setHealth(await api("/v1/integration-health"));
    } catch (failure) {
      setError(failure.message || "Integration scan failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    scan();
  }, [scan]);

  const overall = useMemo(() => {
    if (!health) return null;
    if (health.summary.action > 0) return "action";
    if (health.summary.healthy === health.summary.total) return "pass";
    return "waiting";
  }, [health]);

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer setup"
        title="Integration health"
        description="Scan the real integration state instead of guessing from setup steps. Each failed check shows the next exact fix."
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={scan}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              {loading ? "Scanning" : "Run scan"}
            </button>
            <Link
              href="/docs"
              className="inline-flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-sm font-semibold"
            >
              Docs <ExternalLink size={15} />
            </Link>
          </div>
        }
      />

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="grid gap-0 lg:grid-cols-[1.1fr_.9fr]">
          <div className="border-b border-[#e6eadf] p-6 lg:border-b-0 lg:border-r">
            <div className="flex items-start gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                <ShieldCheck size={19} />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#7b8574]">
                  Diagnostic result
                </p>
                <h2 className="mt-2 text-xl font-semibold text-[#263120]">
                  {loading && !health
                    ? "Scanning integration"
                    : health
                      ? `${health.summary.healthy}/${health.summary.total} checks healthy`
                      : "Scan unavailable"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#697363]">
                  {overall === "pass"
                    ? "Domain, server authentication, viewer identity, asset discovery, playback and gateway protection have all been observed."
                    : overall === "action"
                      ? "At least one integration problem needs a concrete fix before the setup is fully healthy."
                      : "Core setup may be ready, but one or more runtime signals are still waiting for real playback traffic."}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 p-6 text-center">
            <div className="rounded-2xl bg-[#f6f8f2] p-4">
              <p className="text-2xl font-semibold text-[#263120]">{health?.summary?.healthy ?? "—"}</p>
              <p className="mt-1 text-xs text-[#74806d]">Healthy</p>
            </div>
            <div className="rounded-2xl bg-[#fff8e8] p-4">
              <p className="text-2xl font-semibold text-[#7b5b12]">{health?.summary?.action ?? "—"}</p>
              <p className="mt-1 text-xs text-[#8a7442]">Action</p>
            </div>
            <div className="rounded-2xl bg-[#f1f3ed] p-4">
              <p className="text-2xl font-semibold text-[#596551]">{health?.summary?.waiting ?? "—"}</p>
              <p className="mt-1 text-xs text-[#74806d]">Waiting</p>
            </div>
          </div>
        </div>
      </Surface>

      <div className="grid gap-4">
        {(health?.checks || []).map((item) => {
          const ui = statusUi[item.status] || statusUi.waiting;
          const Icon = ui.icon;
          return (
            <Surface key={item.id} className="p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="flex min-w-0 gap-4">
                  <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-[#f6f8f2]">
                    <Icon size={18} className={ui.iconClass} />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-[#263120]">{item.title}</h2>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.08em] ${ui.badge}`}
                      >
                        {ui.label}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-[#697363]">{item.detail}</p>
                    <p className="mt-2 text-xs text-[#8a9384]">
                      Last observed: {formatObserved(item.observedAt)}
                    </p>
                    {item.fix && (
                      <div className="mt-4 flex gap-3 rounded-xl border border-[#e7eadf] bg-[#fbfcf8] p-4">
                        <Wrench size={16} className="mt-0.5 shrink-0 text-[#6f8150]" />
                        <p className="text-sm leading-6 text-[#596551]">{item.fix}</p>
                      </div>
                    )}
                  </div>
                </div>
                {item.href && item.status !== "pass" && (
                  <Link
                    href={item.href}
                    className="inline-flex shrink-0 items-center justify-center rounded-xl border bg-white px-3.5 py-2 text-xs font-semibold"
                  >
                    Fix this <ExternalLink size={13} className="ml-1.5" />
                  </Link>
                )}
              </div>
            </Surface>
          );
        })}
      </div>

      {!loading && health?.checks?.length === 0 && (
        <Surface className="p-8 text-center text-sm text-[#74806d]">
          No diagnostic checks were returned.
        </Surface>
      )}
    </div>
  );
}
