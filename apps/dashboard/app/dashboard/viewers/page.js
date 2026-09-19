"use client";

import Link from "next/link";
import {
  Activity,
  Ban,
  ChevronLeft,
  ChevronRight,
  Laptop,
  MonitorSmartphone,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Smartphone,
  UserRound,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Surface, useModalA11y } from "@/components/console-kit";

const PAGE_SIZE = 25;
const FILTERS = [
  { id: "all", label: "All viewers" },
  { id: "active", label: "Active" },
  { id: "blocked", label: "Blocked" },
];

function safeDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not available";
  return date.toLocaleString();
}

function relativeTime(value) {
  if (!value) return "Not seen yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not seen yet";
  const diff = Date.now() - date.getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function humanize(value) {
  return String(value || "Unknown")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function StatusBadge({ status }) {
  const current = String(status || "unknown").toLowerCase();
  const classes =
    current === "active"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : current === "blocked"
        ? "bg-red-50 text-red-700 ring-red-200"
        : current === "retired"
          ? "bg-slate-100 text-slate-500 ring-slate-200"
          : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] ring-1 ${classes}`}
    >
      {humanize(current)}
    </span>
  );
}

function SessionBadge({ status }) {
  const current = String(status || "unknown").toLowerCase();
  const classes =
    current === "active"
      ? "bg-emerald-50 text-emerald-700"
      : current === "idle"
        ? "bg-amber-50 text-amber-700"
        : current === "revoked"
          ? "bg-red-50 text-red-700"
          : "bg-slate-100 text-slate-600";
  return (
    <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${classes}`}>
      {humanize(current)}
    </span>
  );
}

function Metric({ label, value, hint, icon: Icon, tone = "default" }) {
  const toneClass =
    tone === "danger"
      ? "bg-red-50 text-red-700"
      : tone === "success"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-[#edf5d8] text-[#536b31]";
  return (
    <div className="rounded-2xl border border-[#e0e5d9] bg-white p-4 shadow-[0_10px_28px_rgba(31,45,20,.035)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#879080]">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-[#263120]">{value}</p>
          <p className="mt-1 text-xs text-[#899283]">{hint}</p>
        </div>
        <span className={`grid size-9 place-items-center rounded-xl ${toneClass}`}>
          <Icon size={16} />
        </span>
      </div>
    </div>
  );
}

function DeviceIcon({ os = "" }) {
  const Icon = /android|ios|iphone|ipad/i.test(os) ? Smartphone : Laptop;
  return <Icon size={16} />;
}

function ViewerDrawer({ detail, loading, busyAction, onClose, onAction }) {
  const [confirmReset, setConfirmReset] = useState(false);
  const drawerRef = useModalA11y(true, onClose);

  return (
    <div className="fixed inset-0 z-50 bg-[#172014]/25 backdrop-blur-[2px]" onMouseDown={onClose}>
      <aside
        ref={drawerRef}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l border-[#dfe4d6] bg-[#f7f8f3] shadow-[-24px_0_70px_rgba(23,32,20,.16)] outline-none"
        onMouseDown={(event) => event.stopPropagation()}
        aria-label="Viewer details"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e0e5d9] bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#71805b]">
              Viewer details
            </p>
            <p className="mt-1 text-sm text-[#7b8574]">Identity, devices and playback activity</p>
          </div>
          <button
            type="button"
            className="grid size-9 cursor-pointer place-items-center rounded-xl text-[#687362] transition hover:bg-[#eef1e9] hover:text-[#263120]"
            onClick={onClose}
            aria-label="Close viewer details"
          >
            <X size={18} />
          </button>
        </div>

        {loading || !detail ? (
          <div className="space-y-4 p-5">
            {[0, 1, 2, 3].map((item) => (
              <div key={item} className="h-28 animate-pulse rounded-2xl bg-white" />
            ))}
          </div>
        ) : (
          <div className="space-y-5 p-5">
            <Surface className="p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                      <UserRound size={18} />
                    </span>
                    <div className="min-w-0">
                      <h2 className="truncate text-lg font-semibold text-[#263120]">
                        {detail.viewer.email || "Viewer email unavailable"}
                      </h2>
                      <p className="mt-1 text-xs text-[#879080]">
                        Last seen {relativeTime(detail.summary?.lastSeenAt)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <StatusBadge status={detail.viewer.status} />
                    <span className="rounded-full bg-[#f1f4ed] px-2.5 py-1 text-[10px] font-semibold text-[#687362]">
                      {detail.summary?.deviceCount || 0} devices
                    </span>
                    <span className="rounded-full bg-[#f1f4ed] px-2.5 py-1 text-[10px] font-semibold text-[#687362]">
                      {detail.summary?.activeSessionCount || 0} live sessions
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={Boolean(busyAction)}
                    className={
                      detail.viewer.status === "blocked"
                        ? "border-emerald-200 bg-white text-emerald-700"
                        : "border-red-200 bg-white text-red-700"
                    }
                    onClick={() =>
                      onAction(
                        `/v1/security/users/${detail.viewer.id}/${
                          detail.viewer.status === "blocked" ? "unblock" : "block"
                        }`,
                        detail.viewer.status === "blocked"
                          ? "Viewer unblocked."
                          : "Viewer blocked.",
                      )
                    }
                  >
                    {detail.viewer.status === "blocked" ? (
                      <ShieldCheck size={14} />
                    ) : (
                      <ShieldOff size={14} />
                    )}
                    {detail.viewer.status === "blocked" ? "Unblock" : "Block"}
                  </Button>
                  {!confirmReset ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={Boolean(busyAction)}
                      onClick={() => setConfirmReset(true)}
                    >
                      <RotateCcw size={14} />
                      Reset devices
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 p-1">
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        className="cursor-pointer rounded-lg px-2 py-1.5 text-xs font-semibold text-[#6c7566] hover:bg-white"
                        onClick={() => setConfirmReset(false)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={Boolean(busyAction)}
                        className="cursor-pointer rounded-lg bg-[#172014] px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                        onClick={async () => {
                          await onAction(
                            `/v1/security/users/${detail.viewer.id}/devices/reset`,
                            "Viewer devices reset.",
                          );
                          setConfirmReset(false);
                        }}
                      >
                        Confirm reset
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-[#f7f9f3] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9485]">
                    First seen
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#46513f]">
                    {safeDate(detail.viewer.createdAt)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f7f9f3] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9485]">
                    Last seen
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#46513f]">
                    {safeDate(detail.summary?.lastSeenAt)}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f7f9f3] p-3">
                  <p className="text-[10px] font-bold uppercase tracking-[.12em] text-[#8b9485]">
                    Live sessions
                  </p>
                  <p className="mt-1 text-xs font-medium text-[#46513f]">
                    {detail.summary?.activeSessionCount || 0}
                  </p>
                </div>
              </div>
            </Surface>

            <Surface className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#e7ebe2] px-5 py-4">
                <div>
                  <h3 className="font-semibold text-[#263120]">Devices</h3>
                  <p className="mt-1 text-xs text-[#879080]">Recognized devices for this viewer</p>
                </div>
                <span className="text-xs font-semibold text-[#71805b]">
                  {detail.devices?.length || 0}
                </span>
              </div>
              <div className="divide-y divide-[#edf0e9]">
                {detail.devices?.length ? (
                  detail.devices.map((device) => (
                    <div key={device.id} className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-3">
                          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[#edf5d8] text-[#536b31]">
                            <DeviceIcon os={device.os} />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#35432f]">
                              {device.deviceName || "Unnamed device"}
                            </p>
                            <p className="mt-1 truncate text-xs text-[#7f8978]">
                              {device.browser || "Unknown browser"} · {device.os || "Unknown OS"}
                            </p>
                            <p className="mt-1 text-[11px] text-[#929b8b]">
                              Last seen {relativeTime(device.lastSeenAt)}
                            </p>
                          </div>
                        </div>
                        <StatusBadge status={device.status} />
                      </div>
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <details className="min-w-0 text-[11px] text-[#879080]">
                          <summary className="cursor-pointer font-medium text-[#71805b]">
                            Technical details
                          </summary>
                          <div className="mt-2 space-y-1 break-all font-mono text-[10px]">
                            <p>Device {device.id}</p>
                            <p>Stable ID {device.externalDeviceId}</p>
                          </div>
                        </details>
                        {device.status !== "retired" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={Boolean(busyAction)}
                            className="shrink-0"
                            onClick={() =>
                              onAction(
                                `/v1/security/devices/${device.id}/${
                                  device.status === "blocked" ? "unblock" : "block"
                                }`,
                                device.status === "blocked"
                                  ? "Device unblocked."
                                  : "Device blocked.",
                              )
                            }
                          >
                            {device.status === "blocked" ? "Unblock" : "Block"}
                          </Button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm text-[#7b8574]">No devices recorded for this viewer.</p>
                )}
              </div>
            </Surface>

            <Surface className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#e7ebe2] px-5 py-4">
                <div>
                  <h3 className="font-semibold text-[#263120]">Recent playback</h3>
                  <p className="mt-1 text-xs text-[#879080]">Latest protected sessions</p>
                </div>
                <Link
                  href="/dashboard/sessions"
                  className="text-xs font-semibold text-[#60783b] hover:underline"
                >
                  View all
                </Link>
              </div>
              <div className="divide-y divide-[#edf0e9]">
                {detail.sessions?.length ? (
                  detail.sessions.slice(0, 8).map((session) => (
                    <div key={session.id} className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#35432f]">
                          {session.assetTitle || "Protected video"}
                        </p>
                        <p className="mt-1 truncate text-xs text-[#7f8978]">
                          {session.siteName || session.siteDomain || "Site unavailable"}
                        </p>
                        <p className="mt-1 text-[11px] text-[#929b8b]">
                          Started {safeDate(session.startedAt)}
                        </p>
                      </div>
                      <SessionBadge status={session.status} />
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm text-[#7b8574]">No playback sessions recorded.</p>
                )}
              </div>
            </Surface>

            <Surface className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#e7ebe2] px-5 py-4">
                <div>
                  <h3 className="font-semibold text-[#263120]">Security activity</h3>
                  <p className="mt-1 text-xs text-[#879080]">
                    Recent incidents linked to this viewer
                  </p>
                </div>
                <Link
                  href="/dashboard/security"
                  className="text-xs font-semibold text-[#60783b] hover:underline"
                >
                  Security Center
                </Link>
              </div>
              <div className="divide-y divide-[#edf0e9]">
                {detail.incidents?.length ? (
                  detail.incidents.slice(0, 6).map((incident) => (
                    <div key={incident.id} className="flex items-start justify-between gap-3 p-4">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#35432f]">
                          {humanize(incident.type)}
                        </p>
                        <p className="mt-1 text-xs text-[#7f8978]">
                          {safeDate(incident.createdAt)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#8b9485]">
                          {humanize(incident.severity)}
                        </p>
                        <p className="mt-1 text-[11px] text-[#929b8b]">
                          Risk {incident.riskScore || 0}
                        </p>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="p-5 text-sm text-[#7b8574]">No linked security incidents.</p>
                )}
              </div>
            </Surface>

            <details className="rounded-2xl border border-[#e0e5d9] bg-white p-4 text-xs text-[#687362]">
              <summary className="cursor-pointer font-semibold text-[#46513f]">
                Technical details
              </summary>
              <div className="mt-3 space-y-2 break-all font-mono text-[10px] leading-5">
                <p>Viewer ID: {detail.viewer.id}</p>
                <p>Updated: {safeDate(detail.viewer.updatedAt)}</p>
              </div>
            </details>
          </div>
        )}
      </aside>
    </div>
  );
}

export default function ViewersPage() {
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({
    viewers: 0,
    activeViewers: 0,
    blockedViewers: 0,
    devices: 0,
    liveSessions: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [busyAction, setBusyAction] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(query.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: String(PAGE_SIZE),
          status,
        });
        if (search) params.set("search", search);
        const data = await api(`/v1/viewers?${params.toString()}`);
        if (cancelled) return;
        setItems(data.items || []);
        setSummary(data.summary || {});
        setPagination(data.pagination || {});
        if (data.pagination?.page && data.pagination.page !== page) {
          setPage(data.pagination.page);
        }
      } catch (requestError) {
        if (!cancelled) setError(requestError?.message || "Unable to load viewers");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [page, refreshKey, search, status]);

  async function openViewer(id) {
    setSelectedId(id);
    setDrawerLoading(true);
    setDetail(null);
    setError("");
    try {
      setDetail(await api(`/v1/viewers/${id}`));
    } catch (requestError) {
      setError(requestError?.message || "Unable to load viewer details");
      setSelectedId(null);
    } finally {
      setDrawerLoading(false);
    }
  }

  async function action(path, successMessage) {
    setBusyAction(path);
    setError("");
    setNotice("");
    try {
      await api(path, { method: "POST" });
      setNotice(successMessage);
      setRefreshKey((value) => value + 1);
      if (selectedId) await openViewer(selectedId);
    } catch (requestError) {
      setError(requestError?.message || "Unable to apply viewer action");
    } finally {
      setBusyAction("");
    }
  }

  const rangeStart = pagination.total ? (pagination.page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(pagination.page * PAGE_SIZE, pagination.total || 0);

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Audience control"
        title="Viewers"
        description="Manage viewer access, recognized devices, playback activity and security context from one place."
        action={
          <Button
            variant="outline"
            className="border-[#dce3d4] bg-white text-[#46513f]"
            disabled={loading}
            onClick={() => setRefreshKey((value) => value + 1)}
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Viewers"
          value={summary.viewers || 0}
          hint="Known identities"
          icon={UsersRound}
        />
        <Metric
          label="Active viewers"
          value={summary.activeViewers || 0}
          hint={`${summary.liveSessions || 0} live sessions now`}
          icon={Activity}
          tone="success"
        />
        <Metric
          label="Blocked"
          value={summary.blockedViewers || 0}
          hint="Access currently denied"
          icon={Ban}
          tone="danger"
        />
        <Metric
          label="Devices"
          value={summary.devices || 0}
          hint="Recognized across viewers"
          icon={MonitorSmartphone}
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
            className="cursor-pointer opacity-70 transition hover:opacity-100"
            onClick={() => {
              setError("");
              setNotice("");
            }}
            aria-label="Dismiss message"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="border-b border-[#e7ebe2] p-4 sm:p-5">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="min-w-0 flex-1 xl:max-w-xl">
              <div className="flex items-center gap-2 rounded-2xl border border-[#dfe4d6] bg-[#fbfcf9] px-3.5 py-2.5">
                <Search size={16} className="shrink-0 text-[#8a9483]" />
                <label className="sr-only" htmlFor="viewer-search">
                  Search viewers
                </label>
                <input
                  id="viewer-search"
                  className="min-w-0 flex-1 bg-transparent text-sm text-[#263120] outline-none placeholder:text-[#9aa292]"
                  placeholder="Search exact email, device, browser, OS or ID"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {query && (
                  <button
                    type="button"
                    className="cursor-pointer rounded-lg p-1 text-[#8a9483] transition hover:bg-[#eef1e9] hover:text-[#46513f]"
                    onClick={() => setQuery("")}
                    aria-label="Clear viewer search"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] text-[#929b8b]">
                Email lookup is exact for privacy; device, browser and OS matching is partial.
              </p>
            </div>

            <div className="flex gap-1 overflow-x-auto rounded-2xl bg-[#f3f5ef] p-1">
              {FILTERS.map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  className={`cursor-pointer rounded-xl px-3 py-2 text-xs font-semibold transition ${
                    status === filter.id
                      ? "bg-white text-[#263120] shadow-sm ring-1 ring-[#dfe4d6]"
                      : "text-[#778171] hover:text-[#46513f]"
                  }`}
                  aria-pressed={status === filter.id}
                  onClick={() => {
                    setStatus(filter.id);
                    setPage(1);
                  }}
                >
                  {filter.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 bg-[#fafbf8] px-5 py-3 text-xs text-[#7c8775]">
          <span>
            {pagination.total
              ? `Showing ${rangeStart}–${rangeEnd} of ${pagination.total}`
              : "No matching viewers"}
          </span>
          <span>25 per page</span>
        </div>
      </Surface>

      {loading ? (
        <Surface className="overflow-hidden">
          <div className="divide-y divide-[#edf0e9]">
            {[0, 1, 2, 3, 4].map((row) => (
              <div
                key={row}
                className="grid animate-pulse gap-4 p-5 md:grid-cols-[1.5fr_.7fr_.7fr_1fr]"
              >
                <div className="h-5 w-52 rounded bg-[#edf0e9]" />
                <div className="h-5 w-20 rounded bg-[#edf0e9]" />
                <div className="h-5 w-16 rounded bg-[#edf0e9]" />
                <div className="h-5 w-28 rounded bg-[#edf0e9]" />
              </div>
            ))}
          </div>
        </Surface>
      ) : items.length === 0 ? (
        <EmptyState
          title={search ? "No viewers match your search" : "No viewers yet"}
          description={
            search
              ? "Try an exact viewer email or a device, browser, OS or ID value."
              : "Viewer identities appear after your integration creates protected playback sessions."
          }
          href={!search ? "/dashboard/integration" : undefined}
          action="Check integration"
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="hidden border-b border-[#e7ebe2] bg-[#fafbf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9483] md:grid md:grid-cols-[1.5fr_.7fr_.7fr_1fr] md:gap-4">
            <span>Viewer</span>
            <span>Devices</span>
            <span>Live sessions</span>
            <span>Last seen</span>
          </div>
          <div className="divide-y divide-[#edf0e9]">
            {items.map((viewer) => (
              <button
                key={viewer.id}
                type="button"
                className="group grid w-full cursor-pointer gap-4 p-5 text-left transition duration-200 hover:-translate-y-px hover:bg-[#fbfcf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#8fa868] md:grid-cols-[1.5fr_.7fr_.7fr_1fr] md:items-center"
                onClick={() => openViewer(viewer.id)}
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31] transition group-hover:scale-105">
                    <UserRound size={17} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-[#263120]">
                      {viewer.email || "Viewer email unavailable"}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <StatusBadge status={viewer.status} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between md:block">
                  <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#9aa292] md:hidden">
                    Devices
                  </span>
                  <span className="text-sm font-semibold text-[#46513f]">
                    {viewer.deviceCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between md:block">
                  <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#9aa292] md:hidden">
                    Live
                  </span>
                  <span
                    className={`text-sm font-semibold ${
                      viewer.activeSessionCount ? "text-emerald-700" : "text-[#7f8978]"
                    }`}
                  >
                    {viewer.activeSessionCount || 0}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-3 md:block">
                  <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#9aa292] md:hidden">
                    Last seen
                  </span>
                  <div>
                    <p className="text-sm font-medium text-[#46513f]">
                      {relativeTime(viewer.lastSeenAt)}
                    </p>
                    <p className="mt-1 hidden text-[11px] text-[#929b8b] lg:block">
                      {safeDate(viewer.lastSeenAt)}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </Surface>
      )}

      {!loading && pagination.totalPages > 1 && (
        <div className="flex flex-col gap-3 rounded-2xl border border-[#e0e5d9] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[#7c8775]">
            Page <span className="font-semibold text-[#46513f]">{pagination.page}</span> of{" "}
            <span className="font-semibold text-[#46513f]">{pagination.totalPages}</span>
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasPrevious}
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft size={14} />
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!pagination.hasNext}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
              <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {selectedId && (
        <ViewerDrawer
          detail={detail}
          loading={drawerLoading}
          busyAction={busyAction}
          onClose={() => {
            setSelectedId(null);
            setDetail(null);
          }}
          onAction={action}
        />
      )}
    </div>
  );
}
