"use client";

import Link from "next/link";
import { Clapperboard, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, PageHeader, StatusPill, Surface } from "@/components/console-kit";

export default function AssetsPage() {
  const [items, setItems] = useState([]);
  const [sites, setSites] = useState([]);
  const [providers, setProviders] = useState(["direct"]);
  const [connections, setConnections] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState("");

  const [siteId, setSiteId] = useState("");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("direct");
  const [connectionId, setConnectionId] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [allowedHosts, setAllowedHosts] = useState("");
  const [securityPolicy, setSecurityPolicy] = useState("strict");

  const load = async () => {
    const [assetData, siteData, providerData, connectionData] = await Promise.all([
      api("/v1/assets"),
      api("/v1/sites"),
      api("/v1/assets/providers"),
      api("/v1/workspace/connections").catch(() => ({ items: [] })),
    ]);
    setItems(assetData.items || []);
    setSites(siteData.items || []);
    setProviders(providerData.items || ["direct"]);
    setConnections(connectionData.items || []);
    if (!siteId && siteData.items?.length) setSiteId(siteData.items[0].id);
  };

  useEffect(() => {
    load().catch((e) => setMessage(e.message));
  }, []);

  const filtered = useMemo(() => {
    const term = query.toLowerCase();
    return items.filter((item) =>
      [item.title, item.provider, item.status].some((value) => String(value || "").toLowerCase().includes(term)),
    );
  }, [items, query]);

  const matchingConnections = connections.filter(
    (item) => item.provider === provider && item.status !== "disabled",
  );

  async function create(event) {
    event.preventDefault();
    try {
      await api("/v1/assets", {
        method: "POST",
        body: JSON.stringify({
          siteId,
          title,
          provider,
          providerReference,
          allowedHosts: allowedHosts
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean),
          connectionId: connectionId || null,
          providerConfig: {},
          securityPolicy,
        }),
      });
      setTitle("");
      setProviderReference("");
      setAllowedHosts("");
      setConnectionId("");
      setShowCreate(false);
      setMessage("Protected asset created.");
      await load();
    } catch (e) {
      setMessage(e.message);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Protected media"
        title="Assets"
        description="Register customer-authorized media sources and route playback through your protected gateway."
        action={
          <Button onClick={() => setShowCreate((value) => !value)}>
            <Plus size={16} />
            Add asset
          </Button>
        }
      />
      {message && <div className="rounded-2xl border border-[#dce3d4] bg-white p-4 text-sm text-[#52604b]">{message}</div>}

      {showCreate && (
        <Surface className="p-6">
          <form className="grid gap-4 lg:grid-cols-2" onSubmit={create}>
            <label className="text-sm font-medium">
              Title
              <Input className="mt-2" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson 01" />
            </label>
            <label className="text-sm font-medium">
              Site
              <select className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm" value={siteId} onChange={(e) => setSiteId(e.target.value)} required>
                <option value="">Choose site</option>
                {sites.map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Provider
              <select
                className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setConnectionId("");
                }}
              >
                {providers.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium">
              Saved connection
              <select className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}>
                <option value="">No saved connection</option>
                {matchingConnections.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium lg:col-span-2">
              Provider reference / authorized source
              <Input className="mt-2" required value={providerReference} onChange={(e) => setProviderReference(e.target.value)} placeholder={provider === "s3" || provider === "r2" ? "bucket/path/video.mp4" : "https://media.example.com/video.m3u8"} />
            </label>
            <label className="text-sm font-medium">
              Allowed source hosts
              <Input className="mt-2" required value={allowedHosts} onChange={(e) => setAllowedHosts(e.target.value)} placeholder="media.example.com, cdn.example.com" />
            </label>
            <label className="text-sm font-medium">
              Security policy
              <select className="mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm" value={securityPolicy} onChange={(e) => setSecurityPolicy(e.target.value)}>
                <option value="standard">Standard</option>
                <option value="strict">Strict</option>
                <option value="maximum">Maximum</option>
              </select>
            </label>
            <div className="flex gap-2 lg:col-span-2">
              <Button disabled={!siteId}>Create protected asset</Button>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
            </div>
          </form>
        </Surface>
      )}

      <div className="flex items-center gap-2 rounded-2xl border border-[#dfe4d6] bg-white px-4 py-2.5">
        <Search size={16} className="text-[#8a9483]" />
        <input
          className="w-full bg-transparent text-sm outline-none"
          placeholder="Search assets, provider or status"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          title="No protected assets"
          description="Register your first authorized source after adding and verifying a site."
          href="/dashboard/sites"
          action="Review sites"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => (
            <Link key={item.id} href={`/dashboard/assets/${item.id}`} className="block">
              <Surface className="h-full p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid size-10 place-items-center rounded-2xl bg-[#edf5d8] text-[#536b31]">
                    <Clapperboard size={18} />
                  </span>
                  <StatusPill status={item.status} />
                </div>
                <h2 className="mt-6 line-clamp-2 font-semibold">{item.title}</h2>
                <p className="mt-2 text-xs uppercase tracking-[.12em] text-[#899283]">{item.provider} · {item.securityPolicy}</p>
                <p className="mt-5 truncate font-mono text-[10px] text-[#9aa292]">{item.id}</p>
              </Surface>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
