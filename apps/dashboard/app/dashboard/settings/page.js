"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/console-kit";
export default function SettingsPage() {
  const [name, setName] = useState(""),
    [timezone, setTimezone] = useState("Asia/Dhaka"),
    [status, setStatus] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    api("/v1/workspace/settings")
      .then((d) => {
        setName(d.tenant?.name || "");
        setStatus(d.tenant?.status || "");
        setTimezone(d.settings?.timezone || "Asia/Dhaka");
      })
      .catch((e) => setMessage(e.message));
  }, []);
  async function save(e) {
    e.preventDefault();
    try {
      await api("/v1/workspace/settings", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone }),
      });
      setMessage("Workspace settings saved.");
    } catch (err) {
      setMessage(err.message);
    }
  }
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Workspace"
        title="Settings"
        description="Manage workspace identity and timezone. Protection features come from the active plan."
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">
          {message}
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
            <Input
              className="mt-2"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            />
          </label>
          <div className="rounded-xl bg-[#f7f9f2] p-4 text-sm text-[#6f7a68]">
            Workspace status: <b>{status || "—"}</b>
          </div>
          <Button>Save settings</Button>
        </form>
      </Surface>
    </div>
  );
}
