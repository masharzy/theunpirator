"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CircleAlert, FlaskConical, Play, ShieldCheck } from "lucide-react";
import { UnpiratorPlayer } from "@unpirator/react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/console-kit";

const selectClass =
  "mt-2 w-full rounded-xl border border-[#dfe4d6] bg-white px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#91aa61]";

function csrfToken() {
  const raw = document.cookie
    .split("; ")
    .find((value) => value.startsWith("ap_csrf="))
    ?.split("=")
    .slice(1)
    .join("=");
  return raw ? decodeURIComponent(raw) : "";
}

function inferHost(reference) {
  try {
    return new URL(reference).hostname;
  } catch {
    return "";
  }
}

function parseProviderConfig(value) {
  if (!value.trim()) return {};
  const config = JSON.parse(value);
  if (!config || Array.isArray(config) || typeof config !== "object")
    throw new Error("Provider config must be a JSON object.");
  return config;
}

function configPlaceholder(provider) {
  if (provider === "bunny") return '{"accessKey":"...","headers":{"Referer":"..."}}';
  if (provider === "s3" || provider === "r2")
    return '{"endpoint":"...","region":"auto","accessKeyId":"...","secretAccessKey":"..."}';
  return '{"headers":{"Authorization":"Bearer ..."}}';
}

function providerForReference(selectedProvider, reference) {
  if (selectedProvider !== "direct") return selectedProvider;
  const path = (() => {
    try {
      return new URL(reference).pathname.toLowerCase();
    } catch {
      return reference.toLowerCase().split(/[?#]/)[0];
    }
  })();
  if (path.endsWith(".m3u8")) return "hls";
  if (path.endsWith(".mpd"))
    throw new Error("DASH/MPD is not supported yet. Use an MP4 or HLS source.");
  if (path.endsWith(".m3u"))
    throw new Error("M3U playlists are not supported. Use an HLS .m3u8 manifest.");
  return selectedProvider;
}

export default function PlaybackLabPage() {
  const [sites, setSites] = useState([]);
  const [assets, setAssets] = useState([]);
  const [providers, setProviders] = useState([]);
  const [connections, setConnections] = useState([]);
  const [siteId, setSiteId] = useState("");
  const [mode, setMode] = useState("youtube");
  const [provider, setProvider] = useState("direct");
  const [assetId, setAssetId] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [title, setTitle] = useState("Playback Lab test");
  const [reference, setReference] = useState("");
  const [allowedHosts, setAllowedHosts] = useState("");
  const [headersJson, setHeadersJson] = useState("");
  const [target, setTarget] = useState(null);
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState("Loading workspace configuration…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([
      api("/v1/sites"),
      api("/v1/assets"),
      api("/v1/assets/providers"),
      api("/v1/workspace/connections").catch(() => ({ items: [] })),
    ])
      .then(([siteData, assetData, providerData, connectionData]) => {
        setSites(siteData.items || []);
        setAssets(assetData.items || []);
        setProviders(providerData.items || []);
        setConnections(connectionData.items || []);
        setSiteId(siteData.items?.[0]?.id || "");
        setAssetId(assetData.items?.[0]?.id || "");
        setStatus("Ready for a protected playback test.");
      })
      .catch((error) => setStatus(error.message));
  }, []);

  const matchingConnections = useMemo(
    () => connections.filter((item) => item.provider === provider && item.status !== "disabled"),
    [connections, provider],
  );
  const requestHeaders = useCallback(() => {
    const tenantId = localStorage.getItem("unpirator_tenant_id") || "";
    return { "x-csrf-token": csrfToken(), "x-tenant-id": tenantId };
  }, []);

  async function start(event) {
    event.preventDefault();
    setBusy(true);
    setTarget(null);
    try {
      let next;
      if (mode === "youtube") {
        if (!reference.trim()) throw new Error("Enter a YouTube URL.");
        next = { src: reference.trim(), title: title.trim() || "YouTube test" };
      } else if (mode === "existing") {
        if (!assetId) throw new Error("Select an asset.");
        const selected = assets.find((item) => item.id === assetId);
        setSiteId(selected?.siteId || siteId);
        next = { assetId, title: selected?.title || "Asset test" };
      } else {
        const resolvedProvider = providerForReference(provider, reference.trim());
        const hosts = (allowedHosts || inferHost(reference))
          .split(",")
          .map((value) => value.trim().toLowerCase())
          .filter(Boolean);
        if (!hosts.length) throw new Error("Enter at least one allowed source host.");
        const created = await api("/v1/assets", {
          method: "POST",
          body: JSON.stringify({
            siteId,
            title: title.trim() || "Playback Lab asset",
            provider: resolvedProvider,
            providerReference: reference.trim(),
            allowedHosts: hosts,
            connectionId: connectionId || null,
            providerConfig: connectionId ? {} : parseProviderConfig(headersJson),
            securityPolicy: "strict",
          }),
        });
        next = { assetId: created.asset.id, title: title.trim() || "Playback Lab asset" };
        if (resolvedProvider !== provider) {
          setProvider(resolvedProvider);
        }
        setAssets((items) => [{ ...created.asset, siteId }, ...items]);
        setAssetId(created.asset.id);
      }
      setTarget(next);
      setRun((value) => value + 1);
      setStatus("Creating a protected session…");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  const activeSiteId =
    mode === "existing" ? assets.find((item) => item.id === assetId)?.siteId || siteId : siteId;
  const endpoint = `/control-api/v1/playback/test-session`;
  const playbackHeaders = useCallback(
    () => ({ ...requestHeaders(), "x-unpirator-site-id": activeSiteId }),
    [activeSiteId, requestHeaders],
  );

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Developer tools"
        title="Playback Lab"
        description="Run the real protected-player flow against YouTube, registered assets, and authorized origins that require server-side headers."
      />

      <div className="grid gap-6 xl:grid-cols-[390px_minmax(0,1fr)]">
        <Surface className="overflow-hidden">
          <div className="border-b border-[#e5e9df] bg-[#f4f7ef] p-6">
            <span className="grid size-11 place-items-center rounded-2xl bg-[#172014] text-[#d4f279]">
              <FlaskConical size={20} />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-[#1d2919]">Test configuration</h2>
            <p className="mt-1 text-xs leading-5 text-[#74806d]">
              Each run uses your current dashboard identity and a strict playback session.
            </p>
          </div>
          <form className="space-y-5 p-6" onSubmit={start}>
            <label className="block text-sm font-medium text-[#354230]">
              Source type
              <select
                className={selectClass}
                value={mode}
                onChange={(e) => setMode(e.target.value)}
              >
                <option value="youtube">YouTube URL</option>
                <option value="existing">Existing protected asset</option>
                <option value="new">New authorized source</option>
              </select>
            </label>

            {mode !== "existing" && (
              <label className="block text-sm font-medium text-[#354230]">
                Site
                <select
                  className={selectClass}
                  value={siteId}
                  onChange={(e) => setSiteId(e.target.value)}
                  required
                >
                  <option value="">Choose a verified site</option>
                  {sites.map((site) => (
                    <option value={site.id} key={site.id}>
                      {site.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {mode === "existing" ? (
              <label className="block text-sm font-medium text-[#354230]">
                Asset
                <select
                  className={selectClass}
                  value={assetId}
                  onChange={(e) => setAssetId(e.target.value)}
                  required
                >
                  <option value="">Choose an asset</option>
                  {assets.map((asset) => (
                    <option value={asset.id} key={asset.id}>
                      {asset.title} · {asset.provider}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <>
                {mode === "new" && (
                  <label className="block text-sm font-medium text-[#354230]">
                    Provider
                    <select
                      className={selectClass}
                      value={provider}
                      onChange={(e) => {
                        setProvider(e.target.value);
                        setConnectionId("");
                      }}
                    >
                      {providers
                        .filter((value) => value !== "youtube_custom")
                        .map((value) => (
                          <option value={value} key={value}>
                            {value.toUpperCase()}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <label className="block text-sm font-medium text-[#354230]">
                  {mode === "youtube" ? "YouTube URL" : "Source URL / object reference"}
                  <Input
                    className="mt-2"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    required
                    placeholder={
                      mode === "youtube"
                        ? "https://youtube.com/watch?v=…"
                        : "https://cdn.example.com/lesson.m3u8"
                    }
                  />
                </label>
                <label className="block text-sm font-medium text-[#354230]">
                  Test title
                  <Input
                    className="mt-2"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
              </>
            )}

            {mode === "new" && (
              <>
                <label className="block text-sm font-medium text-[#354230]">
                  Saved connection
                  <select
                    className={selectClass}
                    value={connectionId}
                    onChange={(e) => setConnectionId(e.target.value)}
                  >
                    <option value="">None — use options below</option>
                    {matchingConnections.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm font-medium text-[#354230]">
                  Allowed hosts
                  <Input
                    className="mt-2"
                    value={allowedHosts}
                    onChange={(e) => setAllowedHosts(e.target.value)}
                    placeholder="Auto from URL, or host1, host2"
                  />
                </label>
                {!connectionId && (
                  <label className="block text-sm font-medium text-[#354230]">
                    Provider config (JSON)
                    <textarea
                      className={`${selectClass} min-h-28 resize-y font-mono text-xs`}
                      value={headersJson}
                      onChange={(e) => setHeadersJson(e.target.value)}
                      placeholder={configPlaceholder(provider)}
                    />
                    <span className="mt-2 block text-[11px] leading-4 text-[#7b8674]">
                      Supports origin headers and provider credentials. It is encrypted at rest and
                      used only by the server. Prefer a saved connection for reusable secrets.
                    </span>
                  </label>
                )}
              </>
            )}

            <Button className="w-full" disabled={busy || !activeSiteId}>
              <Play size={16} /> {busy ? "Preparing…" : "Run protected test"}
            </Button>
          </form>
        </Surface>

        <div className="space-y-5">
          <Surface className="overflow-hidden bg-[#07110b] p-2 shadow-[0_25px_80px_rgba(15,30,10,.22)]">
            <div className="aspect-video overflow-hidden rounded-[18px] bg-[#050806]">
              {target ? (
                <UnpiratorPlayer
                  key={run}
                  {...target}
                  endpoint={endpoint}
                  getHeaders={playbackHeaders}
                  onReady={() => setStatus("Protected playback is ready.")}
                  onError={(error) => setStatus(error?.message || "Playback failed.")}
                />
              ) : (
                <div className="grid h-full place-items-center px-8 text-center">
                  <div>
                    <Activity className="mx-auto text-[#b9dd6f]" size={30} />
                    <p className="mt-4 text-sm font-medium text-white">
                      Player waiting for a test source
                    </p>
                    <p className="mt-2 text-xs text-white/50">
                      Choose a source and run the real session flow.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </Surface>
          <div
            role="status"
            aria-live="polite"
            className="flex items-start gap-3 rounded-2xl border border-[#dce4d3] bg-white p-4 text-sm text-[#53604d]"
          >
            <CircleAlert className="mt-0.5 shrink-0 text-[#758c4e]" size={17} />
            <span>{status}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              "Real session tokens",
              "Server-only origin headers",
              "Actual seek & refresh flow",
            ].map((label) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-2xl border border-[#e1e6da] bg-[#f8faf5] p-4 text-xs font-medium text-[#566450]"
              >
                <ShieldCheck size={16} className="shrink-0 text-[#6f8a43]" /> {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
