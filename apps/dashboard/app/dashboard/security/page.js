"use client";

import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  MonitorSmartphone,
  ShieldCheck,
  ShieldX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { EmptyState, PageHeader, Stat, StatusPill, Surface } from "@/components/console-kit";

function cleanType(value) {
  return String(value || "Unknown event").replaceAll("_", " ");
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function DetailRow({ label, value, mono = false }) {
  return (
    <div className="grid gap-1 border-b border-[#edf0e9] py-3 last:border-0 sm:grid-cols-[140px_1fr] sm:gap-4">
      <dt className="text-xs font-medium text-[#7a8474]">{label}</dt>
      <dd
        className={`min-w-0 break-words text-sm text-[#25301f] ${mono ? "font-mono text-[12px]" : ""}`}
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="rounded-2xl border border-[#e2e6de] bg-white p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-[#293224]">{title}</h3>
      <dl className="mt-2">{children}</dl>
    </section>
  );
}

async function buildFallbackDetail(event) {
  if (!event) return null;
  const detail = { event, site: null, asset: null, viewer: null, session: null, device: null };

  if (!event.endUserId) return detail;
  try {
    const viewerData = await api(`/v1/security/users/${event.endUserId}`);
    detail.viewer = viewerData?.viewer || null;
    detail.session =
      (viewerData?.sessions || []).find((session) => session.id === event.sessionId) || null;
    detail.device = detail.session?.deviceId
      ? (viewerData?.devices || []).find((device) => device.id === detail.session.deviceId) || null
      : null;
  } catch {
    // The event row itself is still enough to show the recorded event and metadata.
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
        if (active) setDetail(data);
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

  return (
    <div
      className="fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label="Security event details"
    >
      <button
        type="button"
        className="absolute inset-0 bg-[#172014]/30 backdrop-blur-[2px]"
        onClick={onClose}
        aria-label="Close event details"
      />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-2xl flex-col border-l border-[#dde2d8] bg-[#f7f8f4] shadow-2xl">
        <div className="flex items-start gap-4 border-b border-[#e0e4dc] bg-white px-5 py-5 sm:px-6">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-[.18em] text-[#7b856f]">
              Security event
            </p>
            <h2 className="mt-2 truncate text-xl font-semibold tracking-[-.02em] text-[#20291c]">
              {cleanType(event?.type)}
            </h2>
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
            className="grid size-10 shrink-0 place-items-center rounded-xl border border-[#dce1d8] bg-white text-[#4c5747] transition hover:bg-[#f3f5f0]"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="space-y-4">
            {partial && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">
                Full event enrichment is temporarily unavailable from the control API. Showing the
                recorded event plus any related viewer/session data that is available.
              </div>
            )}

            <Section title="Event">
              <DetailRow label="Event ID" value={event?.id} mono />
              <DetailRow label="Type" value={cleanType(event?.type)} />
              <DetailRow label="Severity" value={event?.severity} />
              <DetailRow label="Risk score" value={event?.riskScore} />
              <DetailRow label="Occurred" value={formatDate(event?.createdAt)} />
            </Section>

            <Section title="Playback context">
              <DetailRow
                label="Site"
                value={detail?.site ? `${detail.site.name} · ${detail.site.domain}` : event?.siteId || "—"}
                mono={!detail?.site && Boolean(event?.siteId)}
              />
              <DetailRow label="Asset" value={detail?.asset?.title || event?.assetId || "—"} mono={!detail?.asset && Boolean(event?.assetId)} />
              <DetailRow label="Provider" value={detail?.asset?.provider || "—"} />
              <DetailRow label="Session" value={detail?.session?.id || event?.sessionId || "—"} mono />
              <DetailRow label="Session status" value={detail?.session?.status || "—"} />
              <DetailRow label="Started" value={formatDate(detail?.session?.startedAt)} />
              <DetailRow label="Last heartbeat" value={formatDate(detail?.session?.lastHeartbeatAt)} />
              <DetailRow label="Expires" value={formatDate(detail?.session?.expiresAt)} />
              <DetailRow label="Ended" value={formatDate(detail?.session?.endedAt)} />
            </Section>

            <Section title="Viewer & device">
              <DetailRow
                label="Viewer"
                value={detail?.viewer?.displayLabel || detail?.viewer?.externalUserId || event?.endUserId || "—"}
              />
              <DetailRow label="Viewer ID" value={detail?.viewer?.externalUserId || event?.endUserId || "—"} mono />
              <DetailRow label="Viewer status" value={detail?.viewer?.status || "—"} />
              <DetailRow
                label="Device"
                value={detail?.device?.deviceName || detail?.device?.externalDeviceId || "—"}
              />
              <DetailRow label="Device ID" value={detail?.device?.externalDeviceId || "—"} mono />
              <DetailRow label="Browser" value={detail?.device?.browser || "—"} />
              <DetailRow label="OS" value={detail?.device?.os || "—"} />
              <DetailRow label="Device status" value={detail?.device?.status || "—"} />
            </Section>

            <Section title="Request context">
              <DetailRow label="IP address" value={detail?.session?.ip || metadata.ip || "—"} mono />
              <DetailRow
                label="User agent"
                value={detail?.session?.userAgent || metadata.userAgent || "—"}
                mono
              />
            </Section>

            <section className="rounded-2xl border border-[#e2e6de] bg-white p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-[#293224]">Raw event metadata</h3>
              <pre className="mt-3 max-h-80 overflow-auto rounded-xl bg-[#f4f6f1] p-4 text-[11px] leading-5 text-[#53604d]">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </section>
          </div>
        </div>
      </aside>
    </div>
  );
}

export default function SecurityPage() {
  const [events, setEvents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [message, setMessage] = useState("");
  const [selectedEvent, setSelectedEvent] = useState(null);

  useEffect(() => {
    Promise.all([api("/v1/security/events"), api("/v1/security/devices")])
      .then(([eventData, deviceData]) => {
        setEvents(eventData.items || []);
        setDevices(deviceData.items || []);
      })
      .catch((error) => setMessage(error.message));
  }, []);

  const critical = useMemo(
    () =>
      events.filter((event) =>
        ["critical", "high"].includes(String(event.severity).toLowerCase()),
      ).length,
    [events],
  );
  const blocked = devices.filter((device) => device.status === "blocked").length;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Trust operations"
        title="Security Center"
        description="Review enforcement events, device blocks and suspicious playback activity."
      />

      {message && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {message}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Recent events" value={events.length} icon={ShieldCheck} />
        <Stat label="High severity" value={critical} icon={AlertTriangle} />
        <Stat label="Blocked devices" value={blocked} icon={ShieldX} />
      </div>

      {events.length === 0 ? (
        <EmptyState
          title="No security events"
          description="Enforcement events will appear here as playback traffic arrives."
        />
      ) : (
        <Surface className="overflow-hidden">
          <div className="divide-y divide-[#edf0e9]">
            {events.map((event) => (
              <button
                type="button"
                key={event.id}
                onClick={() => setSelectedEvent(event)}
                className="grid w-full gap-3 p-5 text-left transition hover:bg-[#f8faf6] focus-visible:bg-[#f8faf6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#9db277] md:grid-cols-[1fr_120px_170px_24px] md:items-center"
                aria-label={`Open details for ${cleanType(event.type)}`}
              >
                <div className="min-w-0">
                  <p className="font-medium">{cleanType(event.type)}</p>
                  <p className="mt-1 font-mono text-[11px] text-[#87917f]">
                    risk {event.riskScore}
                  </p>
                </div>
                <StatusPill status={event.severity} />
                <p className="text-xs text-[#75806e]">{formatDate(event.createdAt)}</p>
                <ChevronRight size={17} className="hidden text-[#98a291] md:block" />
              </button>
            ))}
          </div>
        </Surface>
      )}

      <div className="flex items-center gap-2 text-xs text-[#7b8574]">
        <MonitorSmartphone size={14} />
        Select any event to inspect its playback, viewer, device and request context.
      </div>

      <EventDrawer selectedEvent={selectedEvent} onClose={() => setSelectedEvent(null)} />
    </div>
  );
}
