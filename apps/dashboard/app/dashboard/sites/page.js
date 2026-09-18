"use client";

import {
  Check,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Copy,
  Globe2,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/console-kit";

const METHODS = [
  { id: "dns", label: "DNS record", note: "Best for custom domains" },
  { id: "meta", label: "Meta tag", note: "Add one tag to your homepage" },
  { id: "file", label: "Verification file", note: "Simple for Vercel and static hosting" },
];

function formatVerifiedAt(value) {
  if (!value) return "";
  return new Date(value).toLocaleString();
}

function VerificationPanel({ siteId, domain, busy, onVerify }) {
  const [method, setMethod] = useState("file");
  const [copied, setCopied] = useState("");

  const copy = async (value, field) => {
    await navigator.clipboard.writeText(value);
    setCopied(field);
    window.setTimeout(() => setCopied(""), 1600);
  };

  const details = {
    dns: [
      ["Name", domain.dns.name],
      ["Value", domain.dns.value],
    ],
    meta: [["Paste inside <head>", domain.meta.value]],
    file: [
      ["Create this file", `public/${domain.file.name}`],
      ["File content", domain.file.value],
    ],
  };

  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe5d8] bg-white">
      <div className="border-b border-[#e6eadf] bg-[#f8faf4] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[#263120]">Verify domain ownership</p>
            <p className="mt-1 text-xs leading-5 text-[#7b8574]">
              Choose one method. Verification only needs to succeed once.
            </p>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#7a8473] ring-1 ring-[#e2e7dc]">
            Required
          </span>
        </div>
        <div
          className="mt-4 grid gap-2 sm:grid-cols-3"
          role="tablist"
          aria-label="Verification method"
        >
          {METHODS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={method === item.id}
              onClick={() => setMethod(item.id)}
              className={`rounded-xl border px-3.5 py-3 text-left transition ${
                method === item.id
                  ? "border-[#8aa45f] bg-[#eef5df] shadow-sm"
                  : "border-[#e1e6da] bg-white hover:border-[#bcc9aa] hover:bg-[#fbfcf8]"
              }`}
            >
              <span className="block text-sm font-semibold text-[#2e3928]">{item.label}</span>
              <span className="mt-1 block text-xs leading-4 text-[#808a79]">{item.note}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5" role="tabpanel">
        <dl className="space-y-3">
          {details[method].map(([label, value], index) => {
            const field = `${method}-${index}`;
            return (
              <div key={label}>
                <dt className="mb-1.5 text-[11px] font-bold uppercase tracking-[.1em] text-[#879080]">
                  {label}
                </dt>
                <dd className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-xl bg-[#f3f5ef] px-3 py-2.5 text-xs text-[#465041]">
                    {value}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => copy(value, field)}
                  >
                    {copied === field ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied === field ? "Copied" : "Copy"}
                  </Button>
                </dd>
              </div>
            );
          })}
        </dl>

        {method === "file" && (
          <p className="mt-3 break-all text-xs leading-5 text-[#7d8776]">
            We will check <span className="font-medium text-[#3d4838]">{domain.file.url}</span>
          </p>
        )}

        <Button
          className="mt-4 bg-[#172014] text-white hover:bg-[#263221]"
          size="sm"
          disabled={busy}
          onClick={() => onVerify(siteId, domain.id, method)}
        >
          <ShieldCheck className="h-4 w-4" />
          {busy ? "Checking..." : `Verify with ${METHODS.find((item) => item.id === method).label}`}
        </Button>
      </div>
    </div>
  );
}

export default function Page() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [error, setError] = useState("");
  const [domains, setDomains] = useState({});
  const [expandedSite, setExpandedSite] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = () =>
    api("/v1/sites")
      .then((data) => {
        setItems(data.items || []);
        return data;
      })
      .catch((requestError) => {
        setError(requestError.message);
        throw requestError;
      });

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function create(event) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api("/v1/sites", {
        method: "POST",
        body: JSON.stringify({ name, domain, allowedDomains: [] }),
      });
      setName("");
      setDomain("");
      await load();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function showDomains(id) {
    try {
      const data = await api(`/v1/sites/${id}/domains`);
      setDomains((current) => ({ ...current, [id]: data.items }));
      return data.items;
    } catch (requestError) {
      setError(requestError.message);
      throw requestError;
    }
  }

  async function toggleVerification(site) {
    if (expandedSite === site.id) {
      setExpandedSite(null);
      return;
    }
    setError("");
    setExpandedSite(site.id);
    if (!domains[site.id]) await showDomains(site.id).catch(() => {});
  }

  async function verify(siteId, id, method) {
    setBusy(true);
    setError("");
    try {
      await api(`/v1/sites/${siteId}/domains/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      await Promise.all([showDomains(siteId), load()]);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  const verifiedCount = items.filter((site) => site.domainVerifiedAt).length;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow="Playback origins"
        title="Sites"
        description="Register the websites that can request protected playback and verify domain ownership."
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#e0e5d9] bg-[#f8faf4] px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#879080]">
            Registered
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#263120]">{items.length}</p>
        </div>
        <div className="rounded-2xl border border-[#dce7cf] bg-[#f3f8ea] px-4 py-3.5">
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#71805b]">
            Verified
          </p>
          <p className="mt-1 text-2xl font-semibold text-[#405525]">{verifiedCount}</p>
        </div>
      </div>

      <Surface className="overflow-hidden">
        <div className="border-b border-[#e5e9e1] px-5 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid size-9 place-items-center rounded-xl bg-[#eef5df] text-[#60783b]">
              <Plus className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-semibold text-[#263120]">Add a site</h2>
              <p className="mt-0.5 text-xs text-[#7d8776]">
                Use the hostname that serves your player.
              </p>
            </div>
          </div>
        </div>
        <form
          className="grid items-end gap-4 p-5 md:grid-cols-[1fr_1fr_auto] sm:p-6"
          onSubmit={create}
        >
          <label className="grid gap-2 text-sm font-medium text-[#465041]">
            Site name
            <Input
              placeholder="Learning portal"
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              minLength={2}
            />
          </label>
          <label className="grid gap-2 text-sm font-medium text-[#465041]">
            Domain
            <Input
              placeholder="learn.example.com"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              required
            />
          </label>
          <Button className="bg-[#172014] text-white hover:bg-[#263221]" disabled={busy}>
            <Plus className="h-4 w-4" />
            {busy ? "Saving..." : "Add site"}
          </Button>
        </form>
      </Surface>

      {error && (
        <div
          role="alert"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5e9e1] px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#879080]">
              Workspace origins
            </p>
            <h2 className="mt-1 font-semibold text-[#263120]">Registered sites</h2>
          </div>
          <p className="text-xs text-[#879080]">{items.length} total</p>
        </div>

        {items.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center">
            <div>
              <div className="mx-auto grid size-11 place-items-center rounded-2xl bg-[#f1f4eb] text-[#70805d]">
                <Globe2 className="h-5 w-5" />
              </div>
              <p className="mt-4 font-medium text-[#34402f]">No sites yet</p>
              <p className="mt-1 text-sm text-[#7d8776]">
                Add your first playback origin above.
              </p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-[#edf0e9]">
            {items.map((site) => {
              const verified = Boolean(site.domainVerifiedAt);
              const expanded = expandedSite === site.id;
              return (
                <div key={site.id} className="px-5 py-5 sm:px-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3.5">
                      <div
                        className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${verified ? "bg-[#edf5d8] text-[#5e7737]" : "bg-[#f2f4ef] text-[#7c8775]"}`}
                      >
                        {verified ? (
                          <CircleCheck className="h-5 w-5" />
                        ) : (
                          <Globe2 className="h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="truncate font-semibold text-[#263120]">{site.name}</h3>
                          {verified ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-[#edf5d8] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#536b31]">
                              <CircleCheck className="h-3 w-3" />
                              Verified
                            </span>
                          ) : (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.1em] text-amber-700 ring-1 ring-amber-200">
                              Verification required
                            </span>
                          )}
                        </div>
                        <p className="mt-1 truncate text-sm text-[#65705f]">{site.domain}</p>
                        <p className="mt-1 text-xs text-[#969f90]">
                          {verified
                            ? `Verified ${formatVerifiedAt(site.domainVerifiedAt)}`
                            : "Playback remains locked until ownership is verified."}
                        </p>
                      </div>
                    </div>

                    {!verified && (
                      <Button
                        variant="outline"
                        className="shrink-0 border-[#dce3d4] bg-white text-[#46513f]"
                        onClick={() => toggleVerification(site)}
                      >
                        <ShieldCheck className="h-4 w-4" />
                        {expanded ? "Hide setup" : "Set up verification"}
                        {expanded ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </Button>
                    )}
                  </div>

                  {expanded && !verified && (
                    <div className="mt-4 sm:ml-[54px]">
                      {domains[site.id]?.length ? (
                        domains[site.id].map((item) =>
                          item.verifiedAt ? (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 rounded-xl bg-[#f3f8ea] px-4 py-3 text-sm font-medium text-[#536b31]"
                            >
                              <CircleCheck className="h-4 w-4" />
                              {item.domain} is verified
                            </div>
                          ) : (
                            <VerificationPanel
                              key={item.id}
                              siteId={site.id}
                              domain={item}
                              busy={busy}
                              onVerify={verify}
                            />
                          ),
                        )
                      ) : (
                        <div className="rounded-xl border border-[#e1e6da] bg-[#fafbf8] px-4 py-3 text-sm text-[#7d8776]">
                          Loading verification details…
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Surface>
    </div>
  );
}
