"use client";

import {
  Archive,
  Boxes,
  Coins,
  Gauge,
  Save,
  ScrollText,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, Surface, money } from "@/components/console-kit";

// ---- Entitlement metadata -------------------------------------------------
// Single source of truth for the form and the plan cards.

function formatTransfer(bytes) {
  if (bytes == null) return null;
  const gb = Number(bytes) / 1024 ** 3;
  if (gb >= 1024) return `${Number((gb / 1024).toFixed(1))} TB`;
  return `${Number(gb.toFixed(1))} GB`;
}

const numericEntitlements = [
  ["max_sites", "Websites", "How many websites this plan can protect"],
  ["max_assets", "Videos / assets", "Protected videos this plan can register"],
  ["monthly_egress_bytes", "Monthly transfer (GB)", "Video data delivered per month, in gigabytes"],
];

const booleanEntitlements = [
  [
    "secure_gateway",
    "Secure playback gateway",
    "Videos are only served through the signed gateway — raw file links are never exposed.",
  ],
  [
    "protected_delivery",
    "Protected media delivery",
    "Streams are wrapped with per-viewer keys so downloads and share links break.",
  ],
  [
    "player_integrity",
    "Player integrity checks",
    "Playback is denied if the embedded player is tampered with.",
  ],
  [
    "dynamic_watermark",
    "Dynamic watermark",
    "Stamp the viewer's identity on the video so leaks are traceable.",
  ],
  [
    "device_control",
    "Device control",
    "Let the customer limit, block and revoke the devices each viewer uses — they set the exact device count in their settings.",
  ],
  [
    "concurrent_stream_control",
    "Concurrent stream control",
    "Let the customer cap how many videos one viewer watches at once — they set the exact number in their settings.",
  ],
  [
    "piracy_scan",
    "Piracy detection & takedowns",
    "Scan Telegram and YouTube for leaked courses and draft DMCA notices.",
  ],
];

const sessionPolicies = [
  [
    "block_new",
    "Block the new stream",
    "The viewer must stop one of their current videos first. Nothing they are already watching is interrupted.",
  ],
  [
    "revoke_old",
    "Replace the oldest stream",
    "The new video starts right away and their oldest active stream is ended automatically.",
  ],
];

const billingIntervals = [
  ["month", "Monthly"],
  ["quarter", "Every 3 months"],
  ["year", "Yearly"],
  ["custom", "Custom period"],
];

// ---- Form primitives -------------------------------------------------------

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-[#3d4736]">{label}</span>
      {hint ? (
        <span className="mt-0.5 block text-[11px] leading-4 text-[#87917f]">{hint}</span>
      ) : null}
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function Section({ icon: Icon, title, description, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-[#e4e9db] bg-[#fbfcf8] p-4 sm:p-5 ${className}`}>
      <div className="flex items-start gap-2.5">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#78944f]" />
        <div>
          <h3 className="text-sm font-semibold text-[#263120]">{title}</h3>
          {description ? <p className="mt-0.5 text-xs text-[#87917f]">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

function ToggleRow({ label, description, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-xl border border-[#e4e9db] bg-white p-3 transition hover:border-[#bcc9aa]">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-[#263120]">{label}</span>
        <span className="mt-0.5 block text-xs leading-4 text-[#75806e]">{description}</span>
      </span>
      <span className="relative mt-0.5 inline-flex shrink-0">
        <input type="checkbox" className="peer sr-only" checked={checked} onChange={onChange} />
        <span className="h-5 w-9 rounded-full bg-[#d8ddd0] transition peer-checked:bg-[#78944f]" />
        <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
      </span>
    </label>
  );
}

// ---- Page ------------------------------------------------------------------

const empty = {
  id: "",
  name: "",
  description: "",
  priceMajor: "",
  durationDays: 30,
  trialDays: 14,
  currency: "BDT",
  billingInterval: "month",
  isPublic: true,
  status: "active",
  sortOrder: 0,
  badge: "",
  entitlements: {
    secure_gateway: false,
    protected_delivery: false,
    player_integrity: false,
    secure_browser_restriction: false,
    dynamic_watermark: false,
    device_control: false,
    concurrent_stream_control: false,
    webhooks: false,
    youtube_custom: false,
    piracy_scan: false,
    max_sites: 1,
    session_policy: "block_new",
  },
};

export default function AdminPlansPage() {
  const [items, setItems] = useState(null);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(null);
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () => api("/v1/admin/commerce/plans").then((data) => setItems(data.items || []));

  useEffect(() => {
    load().catch((error) => setMessage({ kind: "error", text: error.message }));
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
      // stored as minor units (paisa); the form works in taka
      priceMajor: plan.priceMinor == null ? "" : Number(plan.priceMinor) / 100,
      durationDays: plan.durationDays,
      trialDays: plan.trialDays,
      currency: plan.currency,
      billingInterval: plan.billingInterval,
      isPublic: plan.isPublic,
      status: plan.status,
      sortOrder: plan.sortOrder,
      badge: plan.badge || "",
      entitlements: {
        ...empty.entitlements,
        ...(plan.entitlements || {}),
        // stored in bytes; the form works in gigabytes
        ...(plan.entitlements?.monthly_egress_bytes != null
          ? {
              monthly_egress_bytes:
                Math.round((Number(plan.entitlements.monthly_egress_bytes) / 1024 ** 3) * 100) /
                100,
            }
          : {}),
      },
    });
    setMessage(null);
  }

  function setEntitlement(key, value) {
    setForm((current) => ({
      ...current,
      entitlements: { ...current.entitlements, [key]: value },
    }));
  }

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const entitlements = { ...form.entitlements };
      for (const [key] of numericEntitlements) {
        const value = entitlements[key];
        if (value === "" || value == null) delete entitlements[key];
        else if (key === "monthly_egress_bytes")
          entitlements[key] = Math.round(Number(value) * 1024 ** 3);
        else entitlements[key] = Number(value);
      }
      const payload = {
        name: form.name,
        description: form.description || null,
        priceMinor: form.priceMajor === "" ? null : Math.round(Number(form.priceMajor) * 100),
        durationDays: Number(form.durationDays),
        trialDays: Number(form.trialDays),
        currency: form.currency,
        billingInterval: form.billingInterval,
        isPublic: form.isPublic,
        status: form.status,
        sortOrder: Number(form.sortOrder),
        badge: form.badge || null,
        entitlements,
      };
      if (editing) {
        await api(`/v1/admin/commerce/plans/${editing}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage({ kind: "ok", text: `Plan "${form.name}" updated.` });
      } else {
        await api("/v1/admin/commerce/plans", {
          method: "POST",
          body: JSON.stringify({ ...payload, id: form.id }),
        });
        setMessage({ kind: "ok", text: `Plan "${form.name}" created.` });
      }
      reset();
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  }

  async function archive(plan) {
    if (
      !confirm(
        `Archive "${plan.name}"? It disappears from customer selection; existing subscriptions stay visible in history.`,
      )
    )
      return;
    try {
      await api(`/v1/admin/commerce/plans/${plan.id}`, { method: "DELETE" });
      setMessage({ kind: "ok", text: "Plan archived and removed from self-service selection." });
      if (editing === plan.id) reset();
      await load();
    } catch (error) {
      setMessage({ kind: "error", text: error.message });
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Revenue"
        title="Plans"
        description="One catalog powers customer plan selection and entitlement enforcement. Configure pricing, limits and security features here."
      />

      {message ? (
        <div
          className={`rounded-2xl border p-4 text-sm ${
            message.kind === "error"
              ? "border-[#f3cdcd] bg-[#fdeaea] text-[#a33b3b]"
              : "border-[#d6e2ba] bg-[#eef5df] text-[#465041]"
          }`}
          role="status"
        >
          {message.text}
        </div>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:items-start">
        <Surface className="p-6">
          <h2 className="font-semibold text-[#263120]">
            {editing ? `Edit plan: ${form.name}` : "Create a plan"}
          </h2>
          <p className="mt-1 text-xs text-[#87917f]">
            {editing
              ? "Changes apply to new subscribers; existing ones keep their current terms."
              : "The plan appears in customer selection as soon as it is public."}
          </p>

          <form className="mt-5 space-y-4" onSubmit={save}>
            <Section icon={ScrollText} title="Plan basics">
              {!editing ? (
                <Field
                  label="Plan ID"
                  hint="Short unique code used in the API — lowercase letters, numbers and dashes (e.g. pro-monthly)"
                >
                  <Input
                    required
                    minLength={2}
                    maxLength={40}
                    pattern="[a-z0-9_-]{2,40}"
                    placeholder="pro-monthly"
                    value={form.id}
                    onChange={(event) => setForm({ ...form, id: event.target.value.toLowerCase() })}
                  />
                </Field>
              ) : (
                <Field label="Plan ID" hint="Cannot be changed after creation">
                  <Input value={form.id} disabled />
                </Field>
              )}
              <Field label="Plan name" hint="Shown to customers, e.g. Pro — monthly">
                <Input
                  required
                  minLength={2}
                  maxLength={80}
                  placeholder="Pro — monthly"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </Field>
              <Field label="Description" hint="One or two lines that explain who this plan is for">
                <textarea
                  className="min-h-20 w-full rounded-xl border border-[#dfe4d6] bg-white p-3 text-sm"
                  maxLength={500}
                  placeholder="Everything a growing academy needs — watermarking, device control and piracy monitoring."
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                />
              </Field>
            </Section>

            <Section icon={Coins} title="Pricing & billing">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Price"
                  hint={
                    form.priceMajor === ""
                      ? "Leave empty for a free / custom-quoted plan"
                      : `Stored as ${Math.round(Number(form.priceMajor) * 100)} paisa`
                  }
                >
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#87917f]">
                      ৳
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      className="pl-8"
                      placeholder="499"
                      value={form.priceMajor}
                      onChange={(event) => setForm({ ...form, priceMajor: event.target.value })}
                    />
                  </div>
                </Field>
                <Field label="Currency" hint="3-letter code, e.g. BDT">
                  <Input
                    required
                    minLength={3}
                    maxLength={8}
                    value={form.currency}
                    onChange={(event) =>
                      setForm({ ...form, currency: event.target.value.toUpperCase() })
                    }
                  />
                </Field>
                <Field label="Billing interval" hint="How often customers are charged">
                  <select
                    className="w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                    value={form.billingInterval}
                    onChange={(event) => setForm({ ...form, billingInterval: event.target.value })}
                  >
                    {billingIntervals.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Plan duration" hint="Days one billing period lasts (30 = monthly)">
                  <Input
                    type="number"
                    min="1"
                    max="3660"
                    value={form.durationDays}
                    onChange={(event) => setForm({ ...form, durationDays: event.target.value })}
                  />
                </Field>
                <Field label="Trial days" hint="Free trial before charging starts (0 = none)">
                  <Input
                    type="number"
                    min="0"
                    max="365"
                    value={form.trialDays}
                    onChange={(event) => setForm({ ...form, trialDays: event.target.value })}
                  />
                </Field>
                <Field label="Display order" hint="Lower numbers appear first on the pricing page">
                  <Input
                    type="number"
                    min="0"
                    max="9999"
                    value={form.sortOrder}
                    onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Badge"
                  hint="Optional highlight on the pricing card, e.g. Most popular"
                >
                  <Input
                    maxLength={40}
                    placeholder="Most popular"
                    value={form.badge}
                    onChange={(event) => setForm({ ...form, badge: event.target.value })}
                  />
                </Field>
                <div>
                  <span className="block text-xs font-semibold text-[#3d4736]">Visibility</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-[#87917f]">
                    {form.isPublic
                      ? "Customers can pick this plan themselves"
                      : "Only you can assign this plan"}
                  </span>
                  <span className="mt-1.5 block">
                    <ToggleRow
                      label="Public / self-service"
                      description="List it on the pricing page for customers to choose."
                      checked={form.isPublic}
                      onChange={(event) => setForm({ ...form, isPublic: event.target.checked })}
                    />
                  </span>
                </div>
              </div>
            </Section>

            <Section
              icon={Gauge}
              title="Usage limits"
              description="Leave any limit empty to enforce the platform default for that item."
            >
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {numericEntitlements.map(([key, label, hint]) => (
                  <Field key={key} label={label} hint={hint}>
                    <Input
                      type="number"
                      min="0"
                      placeholder="Unlimited"
                      value={form.entitlements?.[key] ?? ""}
                      onChange={(event) => setEntitlement(key, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
            </Section>

            <Section
              icon={ShieldCheck}
              title="Security & platform features"
              description="What this plan includes."
            >
              <div className="grid gap-2.5">
                {booleanEntitlements.map(([key, label, description]) => (
                  <ToggleRow
                    key={key}
                    label={label}
                    description={description}
                    checked={Boolean(form.entitlements?.[key])}
                    onChange={(event) => setEntitlement(key, event.target.checked)}
                  />
                ))}
              </div>
            </Section>

            <Section
              icon={SlidersHorizontal}
              title="When a viewer hits their stream limit"
              description="Applies when “Concurrent stream control” is on. Choose what happens to the extra stream."
            >
              <div className="grid gap-2.5">
                {sessionPolicies.map(([value, label, description]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition ${
                      (form.entitlements?.session_policy || "block_new") === value
                        ? "border-[#8aa45f] bg-[#eef5df] shadow-sm"
                        : "border-[#e4e9db] bg-white hover:border-[#bcc9aa]"
                    }`}
                  >
                    <input
                      type="radio"
                      name="session_policy"
                      className="mt-1 accent-[#78944f]"
                      value={value}
                      checked={(form.entitlements?.session_policy || "block_new") === value}
                      onChange={(event) => setEntitlement("session_policy", event.target.value)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-[#263120]">{label}</span>
                      <span className="mt-0.5 block text-xs leading-4 text-[#75806e]">
                        {description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </Section>

            <div className="flex items-center gap-2 pb-2">
              <Button type="submit" disabled={busy}>
                <Save size={15} /> {editing ? "Save changes" : "Create plan"}
              </Button>
              {editing ? (
                <Button type="button" variant="outline" onClick={reset} disabled={busy}>
                  Cancel
                </Button>
              ) : null}
            </div>
          </form>
        </Surface>

        <div className="grid content-start gap-4">
          {items === null ? (
            <Surface className="p-6 text-sm text-[#75806e]">Loading plans…</Surface>
          ) : items.length === 0 ? (
            <Surface className="p-6">
              <p className="text-sm font-semibold text-[#263120]">No plans yet</p>
              <p className="mt-1 text-xs text-[#87917f]">
                Create your first plan with the form on the left — it becomes selectable by
                customers immediately when public.
              </p>
            </Surface>
          ) : (
            items.map((plan) => {
              const enabled = booleanEntitlements.filter(
                ([key]) => plan.entitlements?.[key] === true,
              );
              const interval = billingIntervals.find(
                ([value]) => value === plan.billingInterval,
              )?.[1];
              return (
                <Surface key={plan.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-[#263120]">{plan.name}</h2>
                        <StatusPill status={plan.archivedAt ? "archived" : plan.status} />
                        {plan.badge ? (
                          <span className="rounded-full bg-[#eef5df] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#5a7433]">
                            {plan.badge}
                          </span>
                        ) : null}
                        {!plan.isPublic && !plan.archivedAt ? (
                          <span className="rounded-full bg-[#f1f2ee] px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[.12em] text-[#7b8574]">
                            Private
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 max-w-xl text-sm leading-5 text-[#75806e]">
                        {plan.description || "No description"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-semibold text-[#263120]">
                        {money(plan.priceMinor, plan.currency)}
                      </p>
                      <p className="text-xs text-[#87917f]">
                        per {interval ? interval.toLowerCase() : `${plan.durationDays} days`}
                      </p>
                    </div>
                  </div>

                  {enabled.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {enabled.slice(0, 4).map(([key, label]) => (
                        <span
                          key={key}
                          className="rounded-full bg-[#f3f5ef] px-2.5 py-1 text-xs text-[#465041]"
                        >
                          {label}
                        </span>
                      ))}
                      {enabled.length > 4 ? (
                        <span className="rounded-full bg-[#f3f5ef] px-2.5 py-1 text-xs text-[#75806e]">
                          +{enabled.length - 4} more
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-[#a33b3b]">
                      No security features enabled — this plan has no protection.
                    </p>
                  )}

                  <div className="mt-4 grid gap-2 sm:grid-cols-3">
                    {[
                      ["Websites", plan.entitlements?.max_sites],
                      ["Videos", plan.entitlements?.max_assets],
                      ["Transfer", formatTransfer(plan.entitlements?.monthly_egress_bytes)],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-xl bg-[#f7f9f2] p-3 text-xs">
                        <span className="text-[#87917f]">{label}</span>
                        <p className="mt-1 font-semibold text-[#263120]">{value ?? "—"}</p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f7f9f2] p-3">
                    <p className="font-mono text-xs text-[#75806e]">{plan.id}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => edit(plan)}>
                        <Boxes size={14} /> Edit
                      </Button>
                      {!plan.archivedAt ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-red-200 text-red-700"
                          onClick={() => archive(plan)}
                        >
                          <Archive size={14} /> Archive
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </Surface>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
