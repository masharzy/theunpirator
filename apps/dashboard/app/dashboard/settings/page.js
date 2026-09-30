"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/console-kit";

const TIMEZONES = [
  "Asia/Dhaka",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "UTC",
];

export default function SettingsPage() {
  const [name, setName] = useState(""),
    [timezone, setTimezone] = useState("Asia/Dhaka"),
    [status, setStatus] = useState(""),
    [deviceLimit, setDeviceLimit] = useState(""),
    [streamLimit, setStreamLimit] = useState(""),
    [entitlements, setEntitlements] = useState(null),
    [message, setMessage] = useState(null);

  useEffect(() => {
    api("/v1/workspace/settings")
      .then((d) => {
        setName(d.tenant?.name || "");
        setStatus(d.tenant?.status || "");
        setTimezone(d.settings?.timezone || "Asia/Dhaka");
        setDeviceLimit(
          d.settings?.deviceLimitOverride == null ? "" : d.settings.deviceLimitOverride,
        );
        setStreamLimit(
          d.settings?.streamLimitOverride == null ? "" : d.settings.streamLimitOverride,
        );
      })
      .catch((e) => setMessage({ kind: "error", text: e.message }));
    api("/v1/billing")
      .then((d) => setEntitlements(d.entitlements || {}))
      .catch(() => setEntitlements({}));
  }, []);

  async function save(e) {
    e.preventDefault();
    try {
      await api("/v1/workspace/settings", {
        method: "PATCH",
        body: JSON.stringify({
          name,
          timezone,
          deviceLimit: deviceLimit === "" ? null : Number(deviceLimit),
          streamLimit: streamLimit === "" ? null : Number(streamLimit),
        }),
      });
      setMessage({ kind: "ok", text: "Workspace settings saved." });
    } catch (err) {
      setMessage({ kind: "error", text: err.message });
    }
  }

  const deviceControlOn = entitlements?.device_control === true;
  const streamControlOn = entitlements?.concurrent_stream_control === true;
  const deviceCeiling = entitlements?.max_devices_per_user;
  const streamCeiling = entitlements?.max_concurrent_streams;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace identity, timezone and how strictly viewers can share access."
      />
      {message && (
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
      )}
      <Surface className="max-w-2xl p-6">
        <form className="space-y-5" onSubmit={save}>
          <label className="block text-sm font-medium">
            Workspace name
            <Input className="mt-2" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Timezone
            <select
              className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {TIMEZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </label>

          <div className="rounded-2xl border border-[#e4e9db] bg-[#fbfcf8] p-4">
            <p className="text-sm font-semibold text-[#263120]">Viewer access policy</p>
            <p className="mt-0.5 text-xs text-[#87917f]">
              Decide how strict anti-sharing is for your viewers. Lower numbers mean tighter
              control. Leave empty to use your plan's default.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="device-limit" className="text-xs font-semibold text-[#3d4736]">
                    Devices per viewer
                  </label>
                  {deviceControlOn ? (
                    <span className="text-[11px] text-[#87917f]">
                      {deviceCeiling == null
                        ? "No plan ceiling"
                        : `Plan allows up to ${deviceCeiling}`}
                    </span>
                  ) : null}
                </div>
                {deviceControlOn ? (
                  <>
                    <Input
                      id="device-limit"
                      className="mt-1.5"
                      type="number"
                      min="1"
                      max={deviceCeiling ?? 20}
                      placeholder={deviceCeiling == null ? "Unlimited" : `Up to ${deviceCeiling}`}
                      value={deviceLimit}
                      onChange={(e) => setDeviceLimit(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] leading-4 text-[#87917f]">
                      One device = a viewer can't share their login between phone and laptop.
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 rounded-xl bg-[#f1f2ee] px-3 py-2.5 text-xs text-[#75806e]">
                    Device control is not included in your current plan — the plan default applies.
                  </p>
                )}
              </div>
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor="stream-limit" className="text-xs font-semibold text-[#3d4736]">
                    Videos playing at once per viewer
                  </label>
                  {streamControlOn ? (
                    <span className="text-[11px] text-[#87917f]">
                      {streamCeiling == null
                        ? "No plan ceiling"
                        : `Plan allows up to ${streamCeiling}`}
                    </span>
                  ) : null}
                </div>
                {streamControlOn ? (
                  <>
                    <Input
                      id="stream-limit"
                      className="mt-1.5"
                      type="number"
                      min="1"
                      max={streamCeiling ?? 20}
                      placeholder={streamCeiling == null ? "Unlimited" : `Up to ${streamCeiling}`}
                      value={streamLimit}
                      onChange={(e) => setStreamLimit(e.target.value)}
                    />
                    <p className="mt-1 text-[11px] leading-4 text-[#87917f]">
                      When a viewer passes this limit, your stream-limit policy (Plan → Security)
                      decides what happens.
                    </p>
                  </>
                ) : (
                  <p className="mt-1.5 rounded-xl bg-[#f1f2ee] px-3 py-2.5 text-xs text-[#75806e]">
                    Concurrent stream control is not included in your current plan.
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#f7f9f2] p-4 text-sm text-[#6f7a68]">
            Workspace status: <b>{status || "—"}</b>
          </div>
          <Button>Save settings</Button>
        </form>
      </Surface>
    </div>
  );
}
