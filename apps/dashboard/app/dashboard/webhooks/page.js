"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const eventOptions = [
  ["playback.started", "Playback started"],
  ["playback.revoked", "Playback revoked"],
];

function when(value) {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function DeliveryBadge({ status }) {
  const tone =
    status === "delivered"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "failed"
        ? "border-red-200 bg-red-50 text-red-700"
        : "border-amber-200 bg-amber-50 text-amber-700";
  return <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

export default function WebhooksPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState(eventOptions.map(([value]) => value));
  const [secret, setSecret] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [selected, setSelected] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [status, setStatus] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api("/v1/webhooks");
      setItems(data.items || []);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  }, []);

  const loadDeliveries = useCallback(async (endpoint, targetPage = page, targetStatus = status) => {
    if (!endpoint) return;
    const params = new URLSearchParams({ page: String(targetPage), limit: "20" });
    if (targetStatus) params.set("status", targetStatus);
    try {
      const data = await api(`/v1/webhooks/${endpoint.id}/deliveries?${params}`);
      setDeliveries(data.items || []);
      setPagination(data.pagination || null);
      setError("");
    } catch (loadError) {
      setError(loadError.message);
    }
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selected) loadDeliveries(selected, page, status);
  }, [loadDeliveries, page, selected, status]);

  async function createEndpoint(event) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setMessage("");
    setSecret("");
    try {
      const data = await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ name, url, events }),
      });
      setSecret(data.secret);
      setName("");
      setUrl("");
      setEvents(eventOptions.map(([value]) => value));
      setMessage("Endpoint created. Copy the signing secret now.");
      await load();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy("");
    }
  }

  async function act(endpoint, action, request, success) {
    setBusy(`${action}:${endpoint.id}`);
    setError("");
    setMessage("");
    try {
      const result = await request();
      if (result?.secret) setSecret(result.secret);
      setMessage(success);
      if (action === "delete" && selected?.id === endpoint.id) {
        setSelected(null);
        setDeliveries([]);
      }
      await load();
      if (action !== "delete" && selected?.id === endpoint.id)
        await loadDeliveries(endpoint, page, status);
    } catch (actionError) {
      setError(actionError.message);
      await load();
      if (action !== "delete" && selected?.id === endpoint.id)
        await loadDeliveries(endpoint, page, status);
    } finally {
      setBusy("");
    }
  }

  async function retry(delivery) {
    if (!selected) return;
    setBusy(`retry:${delivery.id}`);
    try {
      await api(`/v1/webhooks/${selected.id}/deliveries/${delivery.id}/retry`, { method: "POST" });
      setMessage("Delivery queued for retry.");
      await loadDeliveries(selected, page, status);
      await load();
    } catch (retryError) {
      setError(retryError.message);
    } finally {
      setBusy("");
    }
  }

  function openDeliveries(endpoint) {
    setSelected(endpoint);
    setPage(1);
    setStatus("");
  }

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Webhooks</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Send signed playback events to your backend and inspect delivery attempts.
          </p>
        </div>
        <Button variant="outline" onClick={load}>Refresh</Button>
      </header>

      <form onSubmit={createEndpoint} className="rounded-2xl border bg-white p-5 sm:p-6">
        <h2 className="text-lg font-semibold">Add endpoint</h2>
        <p className="mt-1 text-sm text-muted-foreground">HTTPS only. Each endpoint gets its own signing secret.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Name
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Production backend" required />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            HTTPS endpoint
            <Input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.com/webhooks/unpirator" required />
          </label>
        </div>
        <fieldset className="mt-5">
          <legend className="text-sm font-medium">Events</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {eventOptions.map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={events.includes(value)}
                  onChange={() => setEvents((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
        <Button className="mt-5" disabled={busy === "create" || events.length === 0}>
          {busy === "create" ? "Creating…" : "Add endpoint"}
        </Button>
      </form>

      {secret && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-amber-950">Copy this signing secret now</p>
              <p className="mt-1 text-sm text-amber-800">It is shown only once.</p>
              <code className="mt-3 block break-all rounded-lg bg-white p-3 text-xs">{secret}</code>
            </div>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(secret)}>Copy</Button>
          </div>
        </div>
      )}

      {(error || message) && (
        <div role={error ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm ${error ? "border-red-200 bg-red-50 text-red-700" : "bg-slate-50"}`}>
          {error || message}
        </div>
      )}

      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Endpoints</h2>
          <p className="mt-1 text-sm text-muted-foreground">{items.length} configured</p>
        </div>
        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-muted-foreground">No endpoints configured.</div>
        ) : (
          <div className="space-y-4">
            {items.map((endpoint) => (
              <article key={endpoint.id} className="rounded-2xl border bg-white p-5 transition hover:border-slate-300 hover:shadow-sm">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <button type="button" onClick={() => openDeliveries(endpoint)} className="min-w-0 cursor-pointer text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{endpoint.name}</h3>
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${endpoint.enabled ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
                        {endpoint.enabled ? "Enabled" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-2 break-all text-sm text-muted-foreground">{endpoint.url}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(endpoint.events || []).map((event) => (
                        <span key={event} className="rounded-full bg-slate-100 px-2 py-1 text-xs">{event === "*" ? "All events" : event}</span>
                      ))}
                    </div>
                    <p className="mt-4 text-xs text-muted-foreground">
                      {endpoint.lastDelivery
                        ? `Last delivery ${when(endpoint.lastDelivery.createdAt)} · ${endpoint.lastDelivery.status} · ${endpoint.lastDelivery.attempts} attempt${endpoint.lastDelivery.attempts === 1 ? "" : "s"}`
                        : "No deliveries yet"}
                    </p>
                  </button>
                  <div className="flex flex-wrap gap-2 xl:justify-end">
                    <Button size="sm" variant="outline" onClick={() => openDeliveries(endpoint)}>Deliveries</Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!endpoint.enabled || busy === `test:${endpoint.id}`}
                      onClick={() => act(endpoint, "test", () => api(`/v1/webhooks/${endpoint.id}/test`, { method: "POST" }), `Test delivery sent to ${endpoint.name}.`)}
                    >
                      Send test
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(endpoint, "toggle", () => api(`/v1/webhooks/${endpoint.id}`, { method: "PATCH", body: JSON.stringify({ enabled: !endpoint.enabled }) }), endpoint.enabled ? "Webhook paused." : "Webhook enabled.")}
                    >
                      {endpoint.enabled ? "Pause" : "Enable"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => act(endpoint, "secret", () => api(`/v1/webhooks/${endpoint.id}/rotate-secret`, { method: "POST" }), `Signing secret rotated for ${endpoint.name}.`)}
                    >
                      Rotate secret
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        if (confirmDelete !== endpoint.id) return setConfirmDelete(endpoint.id);
                        return act(endpoint, "delete", () => api(`/v1/webhooks/${endpoint.id}`, { method: "DELETE" }), `${endpoint.name} removed.`).then(() => setConfirmDelete(""));
                      }}
                    >
                      {confirmDelete === endpoint.id ? "Confirm remove" : "Remove"}
                    </Button>
                    {confirmDelete === endpoint.id && <Button size="sm" variant="outline" onClick={() => setConfirmDelete("")}>Cancel</Button>}
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {selected && (
        <div className="fixed inset-0 z-50 bg-black/20" onMouseDown={() => setSelected(null)}>
          <aside className="ml-auto h-full w-full max-w-2xl overflow-y-auto border-l bg-white p-5 shadow-xl sm:p-6" onMouseDown={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Delivery history</p>
                <h2 className="mt-1 truncate text-xl font-semibold">{selected.name}</h2>
                <p className="mt-1 break-all text-sm text-muted-foreground">{selected.url}</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setSelected(null)}>Close</Button>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {["", "delivered", "failed", "pending"].map((value) => (
                <button
                  key={value || "all"}
                  type="button"
                  onClick={() => { setStatus(value); setPage(1); }}
                  className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-medium ${status === value ? "border-slate-900 bg-slate-900 text-white" : "hover:bg-slate-50"}`}
                >
                  {value || "All"}
                </button>
              ))}
            </div>

            <div className="mt-6 space-y-3">
              {deliveries.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">No deliveries match this filter.</div>
              ) : (
                deliveries.map((delivery) => (
                  <article key={delivery.id} className="rounded-xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{delivery.eventType}</p>
                        <p className="mt-1 text-xs text-muted-foreground">{when(delivery.createdAt)} · {delivery.attempts} attempt{delivery.attempts === 1 ? "" : "s"}</p>
                      </div>
                      <DeliveryBadge status={delivery.status} />
                    </div>
                    {delivery.lastError && <p className="mt-3 rounded-lg bg-red-50 p-3 text-xs text-red-700">{delivery.lastError}</p>}
                    {delivery.status === "pending" && <p className="mt-3 text-xs text-muted-foreground">Next attempt: {when(delivery.nextAttemptAt)}</p>}
                    {delivery.status === "failed" && (
                      <Button className="mt-3" size="sm" variant="outline" disabled={busy === `retry:${delivery.id}`} onClick={() => retry(delivery)}>
                        {busy === `retry:${delivery.id}` ? "Queueing…" : "Retry delivery"}
                      </Button>
                    )}
                    <details className="mt-3 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Technical details</summary>
                      <div className="mt-2 break-all font-mono"><p>{delivery.id}</p><p>{delivery.eventId}</p></div>
                    </details>
                  </article>
                ))
              )}
            </div>

            {pagination && pagination.total > 0 && (
              <div className="mt-6 flex items-center justify-between gap-3 border-t pt-4 text-sm">
                <span className="text-muted-foreground">Page {pagination.page} of {pagination.totalPages} · {pagination.total} deliveries</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={!pagination.hasPrevious} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button>
                  <Button size="sm" variant="outline" disabled={!pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next</Button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
