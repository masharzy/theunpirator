"use client";

import Link from "next/link";
import {
  Activity,
  Clock3,
  Monitor,
  Radio,
  RefreshCw,
  Search,
  ShieldOff,
  Smartphone,
  Wifi,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Surface } from "@/components/console-kit";

const FILTERS = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "idle", label: "Idle" },
  { id: "ended", label: "Ended" },
  { id: "revoked", label: "Revoked" },
];

const STATUS_STYLES = {
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    pill: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  },
  idle: {
    label: "Idle",
    dot: "bg-amber-500",
    pill: "bg-amber-50 text-amber-700 ring-amber-200",
  },
  ended: {
    label: "Ended",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600 ring-slate-200",
  },
  revoked: {
    label: "Revoked",
    dot: "bg-red-500",
    pill: "bg-red-50 text-red-700 ring-red-200",
  },
};

function safeDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function shortId(value) {
  if (!value) return "Unknown";
  const text = String(value);
  return text.length > 15 ? `${text.slice(0, 8)}…${text.slice(-5)}` : text;
}

function browserName(userAgent = "") {
  if (/Edg\//i.test(userAgent)) return "Edge";
  if (/OPR\//i.test(userAgent)) return "Opera";
  if (/Firefox\//i.test(userAgent)) return "Firefox";
  if (/Chrome\//i.test(userAgent)) return "Chrome";
  if (/Safari\//i.test(userAgent)) return "Safari";
  return "Browser unknown";
}

function platformName(userAgent = "") {
  if (/Android/i.test(userAgent)) return "Android";
  if (/iPhone|iPad|iPod/i.test(userAgent)) return "iOS";
  if (/Windows/i.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(userAgent)) return "macOS";
  if (/Linux/i.test(userAgent)) return "Linux";
  return "Device unknown";
}

function deviceIcon(userAgent = "") {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) ? Smartphone : Monitor;
}

function SessionStatus({ status }) {
  const tone = STATUS_STYLES[status] || {
    label: status || "Unknown",
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-600 ring-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ring-1 ${tone.pill}`}
    >
      <span className={`size-1.5 rounded-full ${tone.dot}`} />
      {tone.label}
    </span>
  );
}

function MetricCard({ label, value, hint, icon: Icon, tone = "default" }) {
  const tones = {
    default: "bg-[#f8faf4] text-[#536b31]",
    active: "bg-emerald-50 text-emerald-700",
    idle: "bg-amber-50 text-amber-700",
    revoked: "bg-red-50 text-red-700",
  };
  return (
    <div className="rounded-2xl border border-[#e0e5d9] bg-white p-4 shadow-[0_10px_28px_rgba(31,45,20,.035)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#879080]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[#263120]">{value}</p>
          <p className="mt-1 text-xs text-[#899283]">{hint}</p>
        </div>
        <span
          className={`grid size-9 place-items-center rounded-xl ${tones[tone] || tones.default}`}
        >
          <Icon size={16} />
        </span>
      </div>
    </div>
  );
}

function LoadingRows() {
  return (
    <Surface className="overflow-hidden">
      <div className="divide-y divide-[#edf0e9]">
        {[0, 1, 2].map((row) => (
          <div
            key={row}
            className="grid animate-pulse gap-5 p-5 lg:grid-cols-[1.2fr_1fr_1fr_180px]"
          >
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-[#edf0e9]" />
              <div className="h-3 w-32 rounded bg-[#f2f4ef]" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-36 rounded bg-[#edf0e9]" />
              <div className="h-3 w-24 rounded bg-[#f2f4ef]" />
            </div>
            <div className="space-y-2">
              <div className="h-4 w-28 rounded bg-[#edf0e9]" />
              <div className="h-3 w-36 rounded bg-[#f2f4ef]" />
            </div>
            <div className="h-8 w-28 rounded-xl bg-[#edf0e9]" />
          </div>
        ))}
      </div>
    </Surface>
  );
}

export default function SessionsPage() {
  const [items, setItems] = useState([]);
  const [assets, setAssets] = useState([]);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirmingId, setConfirmingId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  async function load({ background = false } = {}) {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [sessionResult, assetResult, siteResult] = await Promise.allSettled([
        api("/v1/playback/sessions"),
        api("/v1/assets"),
        api("/v1/sites"),
      ]);
      if (sessionResult.status === "rejected") throw sessionResult.reason;
      setItems(sessionResult.value.items || []);
      if (assetResult.status === "fulfilled") setAssets(assetResult.value.items || []);
      if (siteResult.status === "fulfilled") setSites(siteResult.value.items || []);
    } catch (requestError) {
      setError(requestError?.message || "Unable to load playback sessions");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const assetMap = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);
  const siteMap = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);

  const counts = useMemo(() => {
    const next = { all: items.length, active: 0, idle: 0, ended: 0, revoked: 0 };
    for (const item of items) {
      if (Object.prototype.hasOwnProperty.call(next, item.status)) next[item.status] += 1;
    }
    return next;
  }, [items]);

  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return [...items]
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .filter((session) => filter === "all" || session.status === filter)
      .filter((session) => {
        if (!term) return true;
        const asset = assetMap.get(session.assetId);
        const site = siteMap.get(session.siteId);
        return [
          session.id,
          session.viewerEmail,
          session.assetId,
          asset?.title,
          session.siteId,
          site?.name,
          site?.domain,
          session.deviceId,
          session.ip,
          session.userAgent,
          session.status,
        ].some((value) =>
          String(value || "")
            .toLowerCase()
            .includes(term),
        );
      });
  }, [assetMap, filter, items, query, siteMap]);

  async function revoke(session) {
    setRevokingId(session.id);
    setError("");
    setNotice("");
    try {
      await api(`/v1/playback/sessions/${session.id}/revoke`, { method: "POST" });
      setItems((current) =>
        current.map((item) =>
          item.id === session.id
            ? { ...item, status: "revoked", endedAt: new Date().toISOString() }
            : item,
        ),
      );
      setConfirmingId(null);
      setNotice(`Playback access revoked for ${session.viewerEmail || "this viewer"}.`);
      load({ background: true });
    } catch (requestError) {
      setError(requestError?.message || "Unable to revoke playback session");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Playback control"
        title="Sessions"
        description="See who is watching protected content right now, inspect device and network context, and revoke a playback grant when access should stop."
        action={
          <Button
            variant="outline"
            className="border-[#dce3d4] bg-white text-[#46513f]"
            disabled={loading || refreshing}
            onClick={() => load({ background: true })}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Live now"
          value={counts.active}
          hint="Heartbeat is current"
          icon={Radio}
          tone="active"
        />
        <MetricCard
          label="Idle"
          value={counts.idle}
          hint="Heartbeat is stale"
          icon={Clock3}
          tone="idle"
        />
        <MetricCard
          label="Ended"
          value={counts.ended}
          hint="Playback naturally closed"
          icon={Activity}
        />
        <MetricCard
          label="Revoked"
          value={counts.revoked}
          hint="Access stopped manually"
          icon={ShieldOff}
          tone="revoked"
        />
      </div>

      {(error || notice) && (
        <div
          role={error ? "alert" : "status"}
          className={`flex items-start justify-between gap-4 rounded-2xl border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-700"
          }`}
        >
          <span>{error || notice}</span>
          <button
            type="button"
            className="mt-0.5 shrink-0 opacity-70 transition hover:opacity-100"
            aria-label="Dismiss message"
            onClick={() => {
              setError("");
              setNotice("");
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="border-b border-[#e7ebe2] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-2xl border border-[#dfe4d6] bg-[#fbfcf9] px-3.5 py-2.5 xl:max-w-xl">
              <Search size={16} className="shrink-0 text-[#8a9483]" />
              <label className="sr-only" htmlFor="session-search">
                Search playback sessions
              </label>
              <input
                id="session-search"
                className="min-w-0 flex-1 bg-transparent text-sm text-[#263120] outline-none placeholder:text-[#9aa292]"
                placeholder="Search viewer, content, site, IP or session ID"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="rounded-lg p-1 text-[#8a9483] transition hover:bg-[#eef1e9] hover:text-[#46513f]"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <div
              className="flex gap-1 overflow-x-auto rounded-2xl bg-[#f3f5ef] p-1"
              role="group"
              aria-label="Filter playback sessions"
            >
              {FILTERS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={filter === item.id}
                  onClick={() => setFilter(item.id)}
                  className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    filter === item.id
                      ? "bg-white text-[#263120] shadow-sm ring-1 ring-[#dfe4d6]"
                      : "text-[#778171] hover:text-[#46513f]"
                  }`}
                >
                  {item.label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                      filter === item.id ? "bg-[#edf5d8] text-[#536b31]" : "bg-white/70"
                    }`}
                  >
                    {counts[item.id] || 0}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 bg-[#fafbf8] px-5 py-3 text-xs text-[#7c8775]">
          <p>
            Showing <span className="font-semibold text-[#46513f]">{visible.length}</span> of{" "}
            {items.length}
            {query ? " matching sessions" : " sessions"}
          </p>
          <p className="hidden sm:block">
            Idle sessions remain revocable until they end or expire.
          </p>
        </div>
      </Surface>

      {loading ? (
        <LoadingRows />
      ) : items.length === 0 ? (
        <EmptyState
          title="No playback sessions yet"
          description="Sessions will appear here as soon as your integration creates a protected playback grant."
          href="/dashboard/integration"
          action="Review integration"
        />
      ) : visible.length === 0 ? (
        <EmptyState
          title="No sessions match this view"
          description="Try another status filter or clear your search to see more playback sessions."
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="hidden border-b border-[#e7ebe2] bg-[#fafbf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9483] lg:grid lg:grid-cols-[1.2fr_1fr_1fr_190px] lg:gap-5">
            <span>Viewer</span>
            <span>Content</span>
            <span>Device & activity</span>
            <span className="text-right">Control</span>
          </div>

          <div className="divide-y divide-[#edf0e9]">
            {visible.map((session) => {
              const asset = assetMap.get(session.assetId);
              const site = siteMap.get(session.siteId);
              const DeviceIcon = deviceIcon(session.userAgent);
              const canRevoke = session.status === "active" || session.status === "idle";
              const confirming = confirmingId === session.id;
              const revoking = revokingId === session.id;

              return (
                <article key={session.id} className="group p-5 transition hover:bg-[#fcfdf9]">
                  <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr_1fr_190px] lg:items-center">
                    <div className="min-w-0">
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf5d8] text-[#536b31]">
                          <Radio size={16} />
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[#263120]">
                            {session.viewerEmail || "Viewer email unavailable"}
                          </p>
                          <p
                            className="mt-1 font-mono text-[10px] text-[#929b8b]"
                            title={session.id}
                          >
                            Session {shortId(session.id)}
                          </p>
                          <div className="mt-2 lg:hidden">
                            <SessionStatus status={session.status} />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="min-w-0 border-l-0 border-[#edf0e9] lg:border-l lg:pl-5">
                      {asset ? (
                        <Link
                          href={`/dashboard/assets/${session.assetId}`}
                          className="block truncate text-sm font-semibold text-[#35432f] transition hover:text-[#60783b] hover:underline"
                          title={asset.title}
                        >
                          {asset.title}
                        </Link>
                      ) : (
                        <p className="truncate text-sm font-semibold text-[#35432f]">
                          Asset {shortId(session.assetId)}
                        </p>
                      )}
                      <p className="mt-1 truncate text-xs text-[#7f8978]">
                        {site?.name || "Site unavailable"}
                        {site?.domain ? ` · ${site.domain}` : ""}
                      </p>
                    </div>

                    <div className="min-w-0 border-l-0 border-[#edf0e9] lg:border-l lg:pl-5">
                      <div className="flex items-center gap-2 text-sm font-medium text-[#46513f]">
                        <DeviceIcon size={15} className="shrink-0 text-[#70805d]" />
                        <span className="truncate">
                          {browserName(session.userAgent)} · {platformName(session.userAgent)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2 text-xs text-[#7f8978]">
                        <Wifi size={13} className="shrink-0" />
                        <span className="truncate">{session.ip || "IP unavailable"}</span>
                      </div>
                      <p className="mt-2 text-[11px] text-[#929b8b]">
                        Heartbeat {safeDate(session.lastHeartbeatAt)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <div className="hidden lg:block">
                        <SessionStatus status={session.status} />
                      </div>
                      {canRevoke && !confirming && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-[#dce3d4] bg-white text-[#46513f] hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          disabled={revoking}
                          onClick={() => setConfirmingId(session.id)}
                        >
                          <ShieldOff size={14} />
                          Revoke
                        </Button>
                      )}
                      {canRevoke && confirming && (
                        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-1.5">
                          <button
                            type="button"
                            className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-[#6f7869] hover:bg-white"
                            disabled={revoking}
                            onClick={() => setConfirmingId(null)}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            disabled={revoking}
                            onClick={() => revoke(session)}
                          >
                            {revoking ? "Revoking…" : "Confirm revoke"}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <details className="mt-4 rounded-xl border border-[#edf0e9] bg-[#fafbf8] open:bg-white">
                    <summary className="cursor-pointer list-none px-3.5 py-2.5 text-xs font-semibold text-[#6f7a68] marker:hidden">
                      Session details
                    </summary>
                    <div className="grid gap-3 border-t border-[#edf0e9] px-3.5 py-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
                      <div>
                        <p className="text-[#929b8b]">Started</p>
                        <p className="mt-1 text-[#46513f]">{safeDate(session.startedAt)}</p>
                      </div>
                      <div>
                        <p className="text-[#929b8b]">Expires</p>
                        <p className="mt-1 text-[#46513f]">{safeDate(session.expiresAt)}</p>
                      </div>
                      <div>
                        <p className="text-[#929b8b]">Device ID</p>
                        <p className="mt-1 break-all font-mono text-[10px] text-[#46513f]">
                          {session.deviceId || "Not available"}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#929b8b]">Ended</p>
                        <p className="mt-1 text-[#46513f]">{safeDate(session.endedAt)}</p>
                      </div>
                      <div className="sm:col-span-2 xl:col-span-4">
                        <p className="text-[#929b8b]">User agent</p>
                        <p className="mt-1 break-all font-mono text-[10px] leading-5 text-[#5d6857]">
                          {session.userAgent || "Not available"}
                        </p>
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </Surface>
      )}
    </div>
  );
}
