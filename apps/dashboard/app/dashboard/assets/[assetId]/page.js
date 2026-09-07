"use client";

import { ArrowLeft, Save, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, StatusPill, Surface } from "@/components/console-kit";

export default function AssetDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.assetId;
  const [asset, setAsset] = useState(null);
  const [connection, setConnection] = useState(null);
  const [connections, setConnections] = useState([]);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("active");
  const [policy, setPolicy] = useState("strict");
  const [connectionId, setConnectionId] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    const [assetData, connectionData] = await Promise.all([
      api(`/v1/assets/${id}`),
      api("/v1/workspace/connections").catch(() => ({ items: [] })),
    ]);
    setAsset(assetData.asset);
    setConnection(assetData.connection || null);
    setTitle(assetData.asset.title);
    setStatus(assetData.asset.status);
    setPolicy(assetData.asset.securityPolicy);
    setConnectionId(assetData.asset.connectionId || "");
    setConnections(
      (connectionData.items || []).filter((item) => item.provider === assetData.asset.provider),
    );
  };

  useEffect(() => {
    if (id) load().catch((e) => setMessage(e.message));
  }, [id]);

  async function save() {
    try {
      await api(`/v1/assets/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title,
          status,
          securityPolicy: policy,
          connectionId: connectionId || null,
        }),
      });
      setMessage("Asset updated.");
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  async function remove() {
    if (!confirm("Delete this asset and its playback records?")) return;
    try {
      await api(`/v1/assets/${id}`, { method: "DELETE" });
      router.replace("/dashboard/assets");
    } catch (e) {
      setMessage(e.message);
    }
  }

  if (!asset)
    return (
      <div className="space-y-4">
        <Link
          href="/dashboard/assets"
          className="inline-flex items-center gap-2 text-sm text-[#607052]"
        >
          <ArrowLeft size={15} /> Assets
        </Link>
        <p className="text-sm text-[#7b8574]">{message || "Loading asset…"}</p>
      </div>
    );

  return (
    <div className="space-y-8">
      <Link
        href="/dashboard/assets"
        className="inline-flex items-center gap-2 text-sm font-medium text-[#607052]"
      >
        <ArrowLeft size={15} />
        Back to assets
      </Link>
      <PageHeader
        eyebrow={asset.provider}
        title={asset.title}
        description="Control this source, connection and baseline security policy."
        action={<StatusPill status={asset.status} />}
      />
      {message && (
        <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">
          {message}
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1.1fr_.9fr]">
        <Surface className="p-6">
          <h2 className="font-semibold">Asset configuration</h2>
          <div className="mt-6 space-y-4">
            <label className="block text-sm font-medium">
              Title
              <Input className="mt-2" value={title} onChange={(e) => setTitle(e.target.value)} />
            </label>
            <label className="block text-sm font-medium">
              Status
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Security policy
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={policy}
                onChange={(e) => setPolicy(e.target.value)}
              >
                <option value="standard">Standard</option>
                <option value="strict">Strict</option>
                <option value="maximum">Maximum</option>
              </select>
            </label>
            <label className="block text-sm font-medium">
              Saved {asset.provider} connection
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={connectionId}
                onChange={(e) => setConnectionId(e.target.value)}
              >
                <option value="">No saved connection</option>
                {connections.map((item) => (
                  <option key={item.id} value={item.id} disabled={item.status === "disabled"}>
                    {item.name}
                    {item.status === "disabled" ? " (disabled)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={save}>
              <Save size={15} />
              Save changes
            </Button>
          </div>
        </Surface>

        <div className="space-y-5">
          <Surface className="p-6">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-[#71805b]">Source</p>
            <div className="mt-5 space-y-4 text-sm">
              <div>
                <p className="text-xs text-[#87917f]">Provider</p>
                <p className="mt-1 font-semibold">{asset.provider}</p>
              </div>
              <div>
                <p className="text-xs text-[#87917f]">Reference</p>
                <p className="mt-1 break-all font-mono text-xs">{asset.providerReference}</p>
              </div>
              <div>
                <p className="text-xs text-[#87917f]">Allowed hosts</p>
                <p className="mt-1 break-all">{(asset.allowedHosts || []).join(", ")}</p>
              </div>
              <div>
                <p className="text-xs text-[#87917f]">Saved connection</p>
                <p className="mt-1">{connection?.name || "Inline/no saved connection"}</p>
              </div>
            </div>
          </Surface>

          <Surface className="border-red-100 p-6">
            <h2 className="font-semibold text-red-800">Danger zone</h2>
            <p className="mt-2 text-sm leading-6 text-red-700/70">
              Deleting an asset removes the source record and cascades its playback records.
            </p>
            <Button variant="outline" className="mt-4 border-red-200 text-red-700" onClick={remove}>
              <Trash2 size={15} />
              Delete asset
            </Button>
          </Surface>
        </div>
      </div>
    </div>
  );
}
