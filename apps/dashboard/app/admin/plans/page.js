"use client";

import { Archive, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, Surface, money } from "@/components/console-kit";

const numericEntitlements = [
  ["max_sites", "Sites"],
  ["max_assets", "Assets"],
  ["max_api_keys", "API keys"],
  ["max_webhooks", "Webhooks"],
  ["max_team_members", "Team members"],
  ["max_devices_per_user", "Devices / viewer"],
  ["max_concurrent_streams", "Concurrent streams"],
  ["monthly_gateway_requests", "Monthly gateway requests"],
  ["monthly_egress_bytes", "Monthly egress bytes"],
  ["monthly_playback_minutes", "Monthly playback minutes"],
  ["monthly_gateway_requests", "Monthly gateway requests"],
  ["monthly_egress_bytes", "Monthly egress bytes"],
  ["monthly_playback_minutes", "Monthly playback minutes"],
  ["monthly_playback_sessions", "Monthly playback sessions"],
];

const booleanEntitlements = [
  ["secure_gateway", "Secure gateway"],
  ["dynamic_watermark", "Dynamic watermark"],
  ["device_control", "Device control"],
  ["advanced_security", "Advanced security"],
  ["webhooks", "Webhooks"],
];

const empty = {
  id: "",
  name: "",
  description: "",
  priceMinor: "",
  durationDays: 30,
  trialDays: 14,
  currency: "BDT",
  billingInterval: "month",
  isPublic: true,
  status: "active",
  sortOrder: 0,
  badge: "",
  entitlements: {
    secure_gateway: true,
    dynamic_watermark: true,
    device_control: true,
    max_sites: 1,
    max_devices_per_user: 2,
    max_concurrent_streams: 1,
    session_policy: "block_new",
  },
};

export default function AdminPlansPage() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState("");

  const load = () => api("/v1/admin/commerce/plans").then((data) => setItems(data.items || []));

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, []);

  function reset() {
    setEditing(null);
    setForm(structuredClone(empty));
  }

  function edit(plan) {
    setEditing(plan.id);
    setForm({
      id: plan.id,
      name: plan.name,
      description: plan.description || "",
      priceMinor: plan.priceMinor == null ? "" : plan.priceMinor,
      durationDays: plan.durationDays,
      trialDays: plan.trialDays,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isPublic: plan.isPublic,
      status: plan.status,
      sortOrder: plan.sortOrder,
      badge: plan.badge || "",
      entitlements: { ...(plan.entitlements || {}) },
    });
  }

  function setEntitlement(key, value) {
    setForm((current) => ({
      ...current,
      entitlements: { ...current.entitlements, [key]: value },
    }));
  }

  async function save(event) {
    event.preventDefault();
    try {
      const entitlements = { ...form.entitlements };
      for (const [key] of numericEntitlements) {
        const value = entitlements[key];
        if (value === "" || value == null) delete entitlements[key];
        else entitlements[key] = Number(value);
      }
      const payload = {
        ...form,
        priceMinor: form.priceMinor === "" ? null : Number(form.priceMinor),
        durationDays: Number(form.durationDays),
        trialDays: Number(form.trialDays),
        sortOrder: Number(form.sortOrder),
        badge: form.badge || null,
        description: form.description || null,
        entitlements,
      };
      if (editing) {
        delete payload.id;
        await api(`/v1/admin/commerce/plans/${editing}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
      } else {
        await api("/v1/admin/commerce/plans", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }
      setMessage(editing ? "Plan updated." : "Plan created.");
      reset();
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function archive(plan) {
    if (!confirm(`Archive ${plan.name}? Existing subscriptions remain historically visible.`))
      return;
    try {
      await api(`/v1/admin/commerce/plans/${plan.id}`, { method: "DELETE" });
      setMessage("Plan archived and removed from self-service selection.");
      if (editing === plan.id) reset();
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Plans"
        description="One catalog powers customer plan selection and entitlement enforcement. Configure pricing, limits and security features here."
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm">{message}</div>
      )}

      <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
        <Surface className="p-6">
          <h2 className="font-semibold">{editing ? `Edit ${form.name}` : "Create plan"}</h2>
          <form className="mt-5 space-y-5" onSubmit={save}>
            <div className="space-y-3">
              {!editing && (
                <Input
                  required
                  placeholder="plan-id"
                  value={form.id}
                  onChange={(event) => setForm({ ...form, id: event.target.value.toLowerCase() })}
                />
              )}
              <Input
                required
                placeholder="Plan name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              <textarea
                className="min-h-20 w-full rounded-xl border border-[#dfe4d6] p-3 text-sm"
                placeholder="Description"
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  min="0"
                  placeholder="Price minor units"
                  value={form.priceMinor}
                  onChange={(event) => setForm({ ...form, priceMinor: event.target.value })}
                />
                <Input
                  value={form.currency}
                  onChange={(event) =>
                    setForm({ ...form, currency: event.target.value.toUpperCase() })
                  }
                />
                <Input
                  type="number"
                  min="1"
                  value={form.durationDays}
                  onChange={(event) => setForm({ ...form, durationDays: event.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  value={form.trialDays}
                  onChange={(event) => setForm({ ...form, trialDays: event.target.value })}
                />
                <Input
                  type="number"
                  min="0"
                  value={form.sortOrder}
                  onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                />
                <Input
                  placeholder="Badge"
                  value={form.badge}
                  onChange={(event) => setForm({ ...form, badge: event.target.value })}
                />
              </div>
              <select
                className="w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={form.billingInterval}
                onChange={(event) => setForm({ ...form, billingInterval: event.target.value })}
              >
                <option value="month">Monthly</option>
                <option value="quarter">Quarterly</option>
                <option value="year">Yearly</option>
                <option value="custom">Custom</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isPublic}
                  onChange={(event) => setForm({ ...form, isPublic: event.target.checked })}
                />
                Public/self-service
              </label>
            </div>

            <div className="rounded-2xl bg-[#f7f9f2] p-4">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">Limits</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {numericEntitlements.map(([key, label]) => (
                  <label key={key} className="text-xs font-medium text-[#5f6b58]">
                    {label}
                    <Input
                      className="mt-1.5 bg-white"
                      type="number"
                      min="0"
                      value={form.entitlements?.[key] ?? ""}
                      onChange={(event) => setEntitlement(key, event.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-[#f7f9f2] p-4">
              <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
                Features
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {booleanEntitlements.map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={Boolean(form.entitlements?.[key])}
                      onChange={(event) => setEntitlement(key, event.target.checked)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <label className="mt-4 block text-xs font-medium text-[#5f6b58]">
                Session limit action
                <select
                  className="mt-1.5 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                  value={form.entitlements?.session_policy || "block_new"}
                  onChange={(event) => setEntitlement("session_policy", event.target.value)}
                >
                  <option value="block_new">Block new stream</option>
                  <option value="revoke_old">Revoke old stream</option>
                </select>
              </label>
            </div>

            <div className="flex gap-2">
              <Button>
                <Save size={15} /> {editing ? "Save plan" : "Create plan"}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={reset}>
                  Cancel
                </Button>
              )}
            </div>
          </form>
        </Surface>

        <div className="grid content-start gap-4">
          {items.map((plan) => (
            <Surface key={plan.id} className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold">{plan.name}</h2>
                    <StatusPill status={plan.archivedAt ? "archived" : plan.status} />
                  </div>
                  <p className="mt-2 max-w-xl text-sm text-[#75806e]">
                    {plan.description || "No description"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{money(plan.priceMinor, plan.currency)}</p>
                  <p className="text-xs text-[#87917f]">{plan.durationDays} days</p>
                </div>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">
                <div className="rounded-xl bg-[#f7f9f2] p-3 text-xs">
                  <span className="text-[#87917f]">Sites</span>
                  <p className="mt-1 font-semibold">{plan.entitlements?.max_sites ?? "—"}</p>
                </div>
                <div className="rounded-xl bg-[#f7f9f2] p-3 text-xs">
                  <span className="text-[#87917f]">Devices / viewer</span>
                  <p className="mt-1 font-semibold">
                    {plan.entitlements?.max_devices_per_user ?? "—"}
                  </p>
                </div>
                <div className="rounded-xl bg-[#f7f9f2] p-3 text-xs">
                  <span className="text-[#87917f]">Concurrent streams</span>
                  <p className="mt-1 font-semibold">
                    {plan.entitlements?.max_concurrent_streams ?? "—"}
                  </p>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f9f2] p-3">
                <p className="font-mono text-xs">{plan.id}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => edit(plan)}>
                    Edit
                  </Button>
                  {!plan.archivedAt && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-red-200 text-red-700"
                      onClick={() => archive(plan)}
                    >
                      <Archive size={14} /> Archive
                    </Button>
                  )}
                </div>
              </div>
            </Surface>
          ))}
        </div>
      </div>
    </div>
  );
}
