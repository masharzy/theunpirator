"use client";

import { CheckCircle2, PlugZap, RefreshCw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatusPill, Surface } from "@/components/console-kit";

const providers = [
  ["direct", "Direct HTTP"],
  ["hls", "HLS origin"],
  ["s3", "Amazon S3"],
  ["r2", "Cloudflare R2"],
  ["bunny", "Bunny"],
];

export default function ConnectionsPage() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [provider, setProvider] = useState("r2");
  const [endpoint, setEndpoint] = useState("");
  const [region, setRegion] = useState("auto");
  const [accessKeyId, setAccessKeyId] = useState("");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  const [accessKey, setAccessKey] = useState("");
  const [headers, setHeaders] = useState("{}");
  const [message, setMessage] = useState("");

  const load = () => api("/v1/workspace/connections").then((data) => setItems(data.items || []));
  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  function buildConfig() {
    if (provider === "s3" || provider === "r2")
      return {
        endpoint: endpoint || undefined,
        region: region || "auto",
        accessKeyId,
        secretAccessKey,
        forcePathStyle: provider === "r2",
      };
    if (provider === "bunny") return { accessKey: accessKey || undefined };
    let parsed = {};
    try {
      parsed = headers.trim() ? JSON.parse(headers) : {};
    } catch {
      throw new Error("Headers must be valid JSON");
    }
    return { headers: parsed };
  }

  async function create(event) {
    event.preventDefault();
    setMessage("");
    try {
      await api("/v1/workspace/connections", {
        method: "POST",
        body: JSON.stringify({ name, provider, config: buildConfig() }),
      });
      setName("");
      setAccessKeyId("");
      setSecretAccessKey("");
      setAccessKey("");
      setMessage("Connection saved. Secrets are encrypted and will not be shown again.");
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function test(id) {
    try {
      const result = await api(`/v1/workspace/connections/${id}/test`, { method: "POST" });
      setMessage(result.ok ? "Connection configuration is usable." : "Connection is disabled.");
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function toggle(item) {
    await api(`/v1/workspace/connections/${item.id}`, {
      method: "PATCH",
      body: JSON.stringify({ status: item.status === "disabled" ? "configured" : "disabled" }),
    });
    await load();
  }

  async function remove(id) {
    if (!confirm("Delete this saved connection? Assets using it must be moved first.")) return;
    try {
      await api(`/v1/workspace/connections/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Media sources"
        title="Provider connections"
        description="Save reusable provider credentials once. Secrets stay encrypted in the control plane and are never returned to the browser."
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[.8fr_1.2fr]">
        <Surface className="p-6">
          <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">
            Add connection
          </p>
          <form className="mt-5 space-y-4" onSubmit={create}>
            <label className="block text-sm font-medium">
              Connection name
              <Input
                className="mt-2"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Production R2"
              />
            </label>
            <label className="block text-sm font-medium">
              Provider
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
              >
                {providers.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {(provider === "s3" || provider === "r2") && (
              <>
                <label className="block text-sm font-medium">
                  Endpoint{" "}
                  {provider === "s3" && (
                    <span className="font-normal text-[#87917f]">(optional)</span>
                  )}
                  <Input
                    className="mt-2"
                    required={provider === "r2"}
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="https://...r2.cloudflarestorage.com"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Region
                  <Input
                    className="mt-2"
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                  />
                </label>
                <label className="block text-sm font-medium">
                  Access key ID
                  <Input
                    className="mt-2"
                    required
                    value={accessKeyId}
                    onChange={(e) => setAccessKeyId(e.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="block text-sm font-medium">
                  Secret access key
                  <Input
                    className="mt-2"
                    required
                    type="password"
                    value={secretAccessKey}
                    onChange={(e) => setSecretAccessKey(e.target.value)}
                    autoComplete="new-password"
                  />
                </label>
              </>
            )}
            {provider === "bunny" && (
              <label className="block text-sm font-medium">
                Access key
                <Input
                  className="mt-2"
                  type="password"
                  value={accessKey}
                  onChange={(e) => setAccessKey(e.target.value)}
                  autoComplete="new-password"
                />
              </label>
            )}
            {(provider === "direct" || provider === "hls") && (
              <label className="block text-sm font-medium">
                Origin headers JSON
                <textarea
                  className="mt-2 min-h-28 w-full rounded-xl border border-[#dfe4d6] bg-white p-3 font-mono text-xs"
                  value={headers}
                  onChange={(e) => setHeaders(e.target.value)}
                  placeholder='{"Authorization":"Bearer ..."}'
                />
              </label>
            )}
            <Button className="w-full">
              <PlugZap size={16} />
              Save encrypted connection
            </Button>
          </form>
        </Surface>

        <div>
          {items.length === 0 ? (
            <EmptyState
              title="No provider connections"
              description="Save R2, S3, Bunny, Direct HTTP or HLS credentials to reuse them across protected assets."
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {items.map((item) => (
                <Surface key={item.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className="grid size-10 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                      <PlugZap size={18} />
                    </span>
                    <StatusPill status={item.status} />
                  </div>
                  <h2 className="mt-6 font-semibold">{item.name}</h2>
                  <p className="mt-1 text-xs uppercase tracking-[.12em] text-[#8a9483]">
                    {item.provider}
                  </p>
                  <div className="mt-5 rounded-xl bg-[#f7f9f2] p-3 text-xs text-[#75806e]">
                    {item.lastTestAt
                      ? `Last checked ${new Date(item.lastTestAt).toLocaleString()}`
                      : "Not checked yet"}
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => test(item.id)}>
                      <RefreshCw size={14} /> Test
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggle(item)}>
                      <CheckCircle2 size={14} /> {item.status === "disabled" ? "Enable" : "Disable"}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => remove(item.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </Surface>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
