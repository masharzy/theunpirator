"use client";

import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FilterX,
  MonitorSmartphone,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, Stat, StatusPill, Surface } from "@/components/console-kit";

const PAGE_SIZE = 25;
const SEVERITY_OPTIONS = ["all", "critical", "high", "medium", "low", "info"];

function cleanType(value) {
  return String(value || "Unknown event")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (letter) => letter.toUpperCase());
}

function formatDate(value) {
  if (!value) return "Not available";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not available" : date.toLocaleString();
}

function dateBoundary(value, end = false) {
  if (!value) return "";
  const date = new Date(`${value}T${end ? "23:59:59.999" : "00:00:00.000"}`);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="grid gap-1 border-b border-[#edf0e9] py-3 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-[#7a8474]">{label}</dt>
      <dd
        className={`min-w-0 break-words text-sm text-[#25301f] ${mono ? "font-mono text-[12px]" : ""}`}
      >
        {value ?? "Not available"}
      </dd>
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="rounded-2xl border border-[#e2e6de] bg-white p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[#293224]">{title}</h3>
      {description && <p className="mt-1 text-xs leading-5 text-[#879080]">{description}</p>}
      <dl className="mt-2">{children}</dl>
    </section>
  );
}

function EvidenceRows({ evidence }) {
  const rows = Object.entries(evidence || {}).filter(([, value]) => value != null && value !== "");
  if (!rows.length)
    return <p className="mt-3 text-sm text-[#7b8574]">No extra evidence recorded.</p>;
  return (
    <dl className="mt-2">
      {rows.map(([key, value]) => (
        <DetailRow
          key={key}
          label={cleanType(key)}
          value={typeof value === "object" ? JSON.stringify(value) : String(value)}
          mono={typeof value === "object"}
        />
      ))}
    </dl>
  );
}

async function buildFallbackDetail(event) {
  if (!event) return null;
  const detail = { event, site: null, asset: null, viewer: null, session: null, device: null };
  const viewerId = event.endUserId;
  if (!viewerId) return detail;
  try {
    const viewerData = await api(`/v1/security/users/${viewerId}`);
    detail.viewer = viewerData?.viewer || null;
    detail.session =
      (viewerData?.sessions || []).find((session) => session.id === event.sessionId) || null;
    detail.device = detail.session?.deviceId
      ? (viewerData?.devices || []).find((device) => device.id === detail.session.deviceId) || null
      : null;
  } catch {
    // Keep the recorded event visible even if enrichment is temporarily unavailable.
  }
  return detail;
}

function EventDrawer({ selectedEvent, onClose }) {
  const eventId = selectedEvent?.id;
  const [detail, setDetail] = useState(selectedEvent ? { event: selectedEvent } : null);
  const [partial, setPartial] = useState(false);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    setDetail({ event: selectedEvent });
    setPartial(false);

    api(`/v1/security/events/${eventId}`)
      .then((data) => {
        if (!active) return;
        setDetail({ ...data, event: { ...selectedEvent, ...(data.event || {}) } });
      })
      .catch(async () => {
        const fallback = await buildFallbackDetail(selectedEvent);
        if (!active) return;
        setDetail(fallback || { event: selectedEvent });
        setPartial(true);
      });

    return () => {
      active = false;
    };
  }, [eventId, selectedEvent]);

  useEffect(() => {
    if (!eventId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [eventId, onClose]);

  if (!eventId) return null;

  const event = detail?.event || selectedEvent;
  const metadata = event?.metadata || {};
  const viewerEmail = detail?.viewer?.email || event?.viewerEmail || "Viewer email unavailable";
  const assetTitle = detail?.asset?.title || event?.assetTitle || "Content unavailable";
  const siteLabel = detail?.site
    ? `${detail.site.name} · ${detail.site.domain}`
    : [event?.siteName, event?.siteDomain].filter(Boolean).join(" · ") || "Site unavailable";
  const deviceLabel =
    detail?.device?.deviceName ||
    event?.deviceName ||
    detail?.device?.externalDeviceId ||
    "Device unavailable";
  const browserLabel = [detail?.device?.browser || event?.browser, detail?.device?.os || event?.os]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Security event details"
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-[#172014]/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close event details"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#dde2d8] bg-[#f7f8f4] shadow-2xl">
        <div className="flex items-start gap-4 border-b border-[#e0e4dc] bg-white px-5 py-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#7b856f]">
              Security incident
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-.02em] text-[#20291c]">
              {cleanType(event?.type)}
            </h2>
            <p className="mt-1 truncate text-sm text-[#66705f]">{viewerEmail}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <StatusPill status={event?.severity} />
              <span className="rounded-full bg-[#edf1e9] px-2.5 py-1 text-[11px] font-medium text-[#606b5a]">
                Risk {event?.riskScore ?? 0}
              </span>
              <span className="inline-flex items-center gap-1.5 text-xs text-[#7b8475]">
                <Clock3 size={13} /> {formatDate(event?.createdAt)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-10 shrink-0 cursor-pointer place-items-center rounded-xl border border-[#dce1d8] bg-white text-[#4c5747] transition hover:bg-[#f3f5f0]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-4">
            {partial && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Full enrichment is temporarily unavailable. Showing the incident data that is
                currently accessible.
              </div>
            )}

            <Section title="What happened">
              <DetailRow label="Reason" value={detail?.reason?.title || cleanType(event?.type)} />
              <DetailRow
                label="Explanation"
                value={
                  detail?.reason?.explanation ||
                  "The protected playback system recorded this incident while enforcing access."
                }
              />
            </Section>

            <Section
              title="Affected playback"
              description="Human-readable context for the viewer and content involved."
            >
              <DetailRow label="Viewer" value={viewerEmail} />
              <DetailRow label="Content" value={assetTitle} />
              <DetailRow label="Site" value={siteLabel} />
              <DetailRow label="Device" value={deviceLabel} />
              <DetailRow label="Browser / OS" value={browserLabel || "Not available"} />
              <DetailRow
                label="Session state"
                value={
                  metadata.sessionStatusAtEvent ||
                  detail?.session?.status ||
                  "Not captured for this event"
                }
              />
              <DetailRow
                label="Request IP"
                value={detail?.session?.ip || metadata.ip || "Not available"}
              />
            </Section>

            <Section title="Timeline">
              <DetailRow label="Occurred" value={formatDate(event?.createdAt)} />
              <DetailRow label="Session started" value={formatDate(detail?.session?.startedAt)} />
              <DetailRow
                label="Last heartbeat"
                value={formatDate(detail?.session?.lastHeartbeatAt)}
              />
              <DetailRow label="Expires" value={formatDate(detail?.session?.expiresAt)} />
              <DetailRow label="Ended" value={formatDate(detail?.session?.endedAt)} />
            </Section>

            <section className="rounded-2xl border border-[#e2e6de] bg-white p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-[#293224]">Evidence</h3>
              <p className="mt-1 text-xs leading-5 text-[#879080]">
                Signals recorded when the protection rule was enforced.
              </p>
              <EvidenceRows evidence={detail?.reason?.evidence} />
            </section>

            <details className="rounded-2xl border border-[#e2e6de] bg-white open:shadow-sm">
              <summary className="cursor-pointer list-none px-4 py-4 text-sm font-semibold text-[#586451] sm:px-5">
                Technical details
              </summary>
              <div className="border-t border-[#edf0e9] px-4 pb-5 sm:px-5">
                <dl>
                  <DetailRow label="Event ID" value={event?.id} mono />
                  <DetailRow
                    label="Session ID"
                    value={detail?.session?.id || event?.sessionId}
                    mono
                  />
                  <DetailRow
                    label="Viewer ID"
                    value={detail?.viewer?.id || event?.endUserId}
                    mono
                  />
                  <DetailRow label="Asset ID" value={detail?.asset?.id || event?.assetId} mono />
                  <DetailRow label="Site ID" value={detail?.site?.id || event?.siteId} mono />
                  <DetailRow
                    label="Device ID"
                    value={detail?.device?.id || detail?.session?.deviceId}
                    mono
                  />
                  <DetailRow label="Event producer" value={metadata.source || "Not available"} />
                  <DetailRow
                    label="User agent"
                    value={detail?.session?.userAgent || metadata.userAgent || "Not available"}
                    mono
                  />
                </dl>
                <p className="mt-4 text-xs font-semibold text-[#687362]">Raw metadata</p>
                <pre className="mt-2 max-h-72 overflow-auto rounded-xl bg-[#f4f6f1] p-4 text-[11px] leading-5 text-[#53604d]">
                  {JSON.stringify(metadata, null, 2)}
                </pre>
              </div>
            </details>
          </div>
        </div>
      </aside>
    </div>
  );
}

function LoadingRows() {
  return (
    <Surface className="overflow-hidden">
      <div className="divide-y divide-[#edf0e9]">
        {[0, 1, 2, 3, 4].map((item) => (
          <div key={item} className="grid gap-4 p-5 md:grid-cols-[1.25fr_1fr_.8fr_120px_150px]">
            {[0, 1, 2, 3, 4].map((cell) => (
              <div key={cell} className="h-8 animate-pulse rounded-xl bg-[#eef1e9]" />
            ))}
          </div>
        ))}
      </div>
    </Surface>
  );
}

export default function SecurityPage() {
  const [events, setEvents] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrevious: false,
  });
  const [summary, setSummary] = useState({ events: 0, highSeverity: 0, blockedDevices: 0 });
  const [types, setTypes] = useState([]);
  const [queryInput, setQueryInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [severity, setSeverity] = useState("all");
  const [type, setType] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [refreshNonce, setRefreshNonce] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearchQuery(queryInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);

  useEffect(() => {
    let active = true;
    setMessage("");
    if (!events.length) setLoading(true);
    else setRefreshing(true);

    const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (searchQuery) params.set("search", searchQuery);
    if (severity !== "all") params.set("severity", severity);
    if (type !== "all") params.set("type", type);
    const from = dateBoundary(fromDate);
    const to = dateBoundary(toDate, true);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    api(`/v1/security/events?${params.toString()}`)
      .then((data) => {
        if (!active) return;
        setEvents(data.items || []);
        setPagination(data.pagination || pagination);
        setSummary(data.summary || summary);
        setTypes(data.facets?.types || []);
      })
      .catch((error) => {
        if (active) setMessage(error.message || "Unable to load security events");
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
        setRefreshing(false);
      });

    return () => {
      active = false;
    };
  }, [page, searchQuery, severity, type, fromDate, toDate, refreshNonce]);

  const hasFilters = Boolean(
    searchQuery || severity !== "all" || type !== "all" || fromDate || toDate,
  );
  const resultLabel = useMemo(() => {
    if (!pagination.total) return "No matching incidents";
    const start = (pagination.page - 1) * pagination.limit + 1;
    const end = Math.min(pagination.page * pagination.limit, pagination.total);
    return `${start}–${end} of ${pagination.total}`;
  }, [pagination]);

  function clearFilters() {
    setQueryInput("");
    setSearchQuery("");
    setSeverity("all");
    setType("all");
    setFromDate("");
    setToDate("");
    setPage(1);
  }

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Trust operations"
        title="Security Center"
        description="Investigate protection incidents with viewer, content, device and playback context in one place."
        action={
          <Button
            variant="outline"
            className="border-[#dce3d4] bg-white text-[#46513f]"
            disabled={loading || refreshing}
            onClick={() => setRefreshNonce((value) => value + 1)}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing" : "Refresh"}
          </Button>
        }
      />

      {message && (
        <div
          className="flex items-start justify-between gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
          role="alert"
        >
          <span>{message}</span>
          <button
            type="button"
            className="cursor-pointer opacity-70 transition hover:opacity-100"
            onClick={() => setMessage("")}
            aria-label="Dismiss error"
          >
            <X size={15} />
          </button>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Security events" value={summary.events} icon={ShieldCheck} />
        <Stat label="High severity" value={summary.highSeverity} icon={AlertTriangle} />
        <Stat label="Blocked devices" value={summary.blockedDevices} icon={ShieldX} />
      </div>

      <Surface className="overflow-hidden">
        <div className="border-b border-[#e7ebe2] p-4 sm:p-5">
          <div className="grid gap-3 xl:grid-cols-[minmax(260px,1.5fr)_180px_220px_150px_150px_auto]">
            <div className="flex items-center gap-2 rounded-xl border border-[#dfe4d6] bg-[#fbfcf9] px-3.5 py-2.5">
              <Search size={16} className="shrink-0 text-[#8a9483]" />
              <label htmlFor="security-search" className="sr-only">
                Search security incidents
              </label>
              <input
                id="security-search"
                value={queryInput}
                onChange={(event) => setQueryInput(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-sm text-[#263120] outline-none placeholder:text-[#9aa292]"
                placeholder="Full email, content, site, device, IP, type or ID"
              />
              {queryInput && (
                <button
                  type="button"
                  className="cursor-pointer rounded-lg p-1 text-[#8a9483] hover:bg-[#eef1e9]"
                  onClick={() => setQueryInput("")}
                  aria-label="Clear search"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <select
              aria-label="Severity"
              value={severity}
              onChange={(event) => {
                setSeverity(event.target.value);
                setPage(1);
              }}
              className="cursor-pointer rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm text-[#46513f] outline-none focus:border-[#9db277]"
            >
              {SEVERITY_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All severities" : cleanType(option)}
                </option>
              ))}
            </select>

            <select
              aria-label="Incident type"
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPage(1);
              }}
              className="cursor-pointer rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm text-[#46513f] outline-none focus:border-[#9db277]"
            >
              <option value="all">All incident types</option>
              {types.map((option) => (
                <option key={option} value={option}>
                  {cleanType(option)}
                </option>
              ))}
            </select>

            <input
              aria-label="From date"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              className="cursor-pointer rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm text-[#46513f] outline-none focus:border-[#9db277]"
            />

            <input
              aria-label="To date"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
              className="cursor-pointer rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm text-[#46513f] outline-none focus:border-[#9db277]"
            />

            <Button
              variant="outline"
              disabled={!hasFilters}
              className="border-[#dce3d4] bg-white text-[#566050]"
              onClick={clearFilters}
            >
              <FilterX size={15} />
              Clear
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-[#879080]">
            <p>{resultLabel}</p>
            <p>
              Viewer email search uses the complete email address; other context supports partial
              search.
            </p>
          </div>
        </div>
      </Surface>

      {loading ? (
        <LoadingRows />
      ) : events.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No incidents match these filters" : "No security incidents"}
          description={
            hasFilters
              ? "Change or clear the search and filters to broaden the incident view."
              : "Protection incidents will appear here as playback traffic arrives."
          }
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="hidden border-b border-[#e7ebe2] bg-[#fafbf8] px-5 py-3 text-[10px] font-bold uppercase tracking-[.12em] text-[#8a9483] md:grid md:grid-cols-[1.25fr_1fr_.8fr_120px_150px_24px] md:gap-4">
            <span>Incident / Viewer</span>
            <span>Content / Site</span>
            <span>Device</span>
            <span>Severity</span>
            <span>Occurred</span>
            <span />
          </div>
          <div className="divide-y divide-[#edf0e9]">
            {events.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="group grid w-full cursor-pointer gap-4 p-5 text-left transition duration-150 hover:bg-[#f8faf6] focus-visible:bg-[#f8faf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9db277] md:grid-cols-[1.25fr_1fr_.8fr_120px_150px_24px] md:items-center"
                aria-label={`Open details for ${cleanType(event.type)}`}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[#263120] group-hover:text-[#4e6335]">
                    {cleanType(event.type)}
                  </p>
                  <p className="mt-1 truncate text-xs font-medium text-[#5e6958]">
                    {event.viewerEmail || "Viewer email unavailable"}
                  </p>
                  <p className="mt-1 text-[11px] text-[#929b8b]">
                    Risk score {event.riskScore ?? 0}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[#3f4b39]">
                    {event.assetTitle || "Content unavailable"}
                  </p>
                  <p className="mt-1 truncate text-xs text-[#7f8978]">
                    {[event.siteName, event.siteDomain].filter(Boolean).join(" · ") ||
                      "Site unavailable"}
                  </p>
                </div>

                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-[#52604b]">
                    {event.deviceName || "Device unavailable"}
                  </p>
                  <p className="mt-1 truncate text-[11px] text-[#879080]">
                    {[event.browser, event.os].filter(Boolean).join(" · ") || "Browser unavailable"}
                  </p>
                </div>

                <div>
                  <StatusPill status={event.severity} />
                </div>

                <p className="text-xs text-[#75806e]">{formatDate(event.createdAt)}</p>
                <ChevronRight
                  size={17}
                  className="hidden text-[#a4ac9e] transition group-hover:translate-x-0.5 group-hover:text-[#60783b] md:block"
                />
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3 border-t border-[#e7ebe2] bg-[#fafbf8] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[#7b8574]">
              Page <span className="font-semibold text-[#46513f]">{pagination.page}</span> of{" "}
              {pagination.totalPages}
            </p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!pagination.hasPrevious || refreshing}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={14} />
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!pagination.hasNext || refreshing}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
                <ChevronRight size={14} />
              </Button>
            </div>
          </div>
        </Surface>
      )}

      <div className="flex items-center gap-2 text-xs text-[#7b8574]">
        <MonitorSmartphone size={14} />
        Select an incident to inspect the viewer, content, device, timeline and enforcement
        evidence.
      </div>

      <EventDrawer selectedEvent={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
