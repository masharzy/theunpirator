"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const METHODS = [
  { id: "dns", label: "DNS record", note: "Best for custom domains" },
  { id: "meta", label: "Secret code", note: "Paste one line into your homepage" },
  { id: "file", label: "Text file", note: "Best for Vercel and simple hosting" },
];

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
    meta: [["Paste inside your homepage <head>", domain.meta.value]],
    file: [
      ["Create", `public/${domain.file.name}`],
      ["Put this inside", domain.file.value],
    ],
  };
  return (
    <div className="mt-5 overflow-hidden rounded-xl border bg-background">
      <div className="border-b bg-[#f8f9f4] p-4">
        <p className="text-sm font-semibold">Choose one easy verification method</p>
        <p className="mt-1 text-xs text-muted-foreground">Only one method is required.</p>
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
              className={`rounded-lg border p-3 text-left transition ${
                method === item.id
                  ? "border-[#779736] bg-[#eff7d9] shadow-sm"
                  : "bg-white hover:border-[#a8b58b]"
              }`}
            >
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{item.note}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-4" role="tabpanel">
        {method === "file" && (
          <p className="mb-3 text-xs text-muted-foreground">
            In Next.js, create the file inside the <strong>public</strong> folder. No route or
            environment variable is needed.
          </p>
        )}
        <dl className="space-y-3">
          {details[method].map(([label, value], index) => {
            const field = `${method}-${index}`;
            return (
              <div key={label}>
                <dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt>
                <dd className="flex items-start gap-2">
                  <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-3 py-2 text-xs">
                    {value}
                  </code>
                  <Button size="sm" variant="outline" onClick={() => copy(value, field)}>
                    {copied === field ? "Copied" : "Copy"}
                  </Button>
                </dd>
              </div>
            );
          })}
        </dl>
        {method === "file" && (
          <p className="mt-3 break-all text-xs text-muted-foreground">
            We will check: <span className="font-medium text-foreground">{domain.file.url}</span>
          </p>
        )}
        <Button
          className="mt-4"
          size="sm"
          disabled={busy}
          onClick={() => onVerify(siteId, domain.id, method)}
        >
          {busy ? "Checking..." : `Verify with ${METHODS.find((item) => item.id === method).label}`}
        </Button>
      </div>
    </div>
  );
}

export default function Page() {
  const [items, setItems] = useState([]),
    [name, setName] = useState(""),
    [domain, setDomain] = useState(""),
    [error, setError] = useState(""),
    [domains, setDomains] = useState({}),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/v1/sites")
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
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
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function showDomains(id) {
    try {
      const d = await api(`/v1/sites/${id}/domains`);
      setDomains((x) => ({ ...x, [id]: d.items }));
    } catch (e) {
      setError(e.message);
    }
  }
  async function verify(siteId, id, method) {
    setBusy(true);
    setError("");
    try {
      await api(`/v1/sites/${siteId}/domains/${id}/verify`, {
        method: "POST",
        body: JSON.stringify({ method }),
      });
      await showDomains(siteId);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold">Sites</h1>
      <p className="mt-2 text-muted-foreground">
        Register your website and verify domain ownership before playback.
      </p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Add site</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid items-end gap-3 md:grid-cols-[1fr_1fr_auto]" onSubmit={create}>
            <label className="grid gap-2 text-sm">
              Site name
              <Input
                placeholder="Learning portal"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
              />
            </label>
            <label className="grid gap-2 text-sm">
              Domain
              <Input
                placeholder="learn.example.com"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
              />
            </label>
            <Button disabled={busy}>{busy ? "Saving..." : "Add site"}</Button>
          </form>
        </CardContent>
      </Card>
      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          {error}
        </p>
      )}
      <div className="mt-6 space-y-4">
        {items.length === 0 ? (
          <p className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
            Add your first site to connect your content.
          </p>
        ) : (
          items.map((s) => (
            <Card key={s.id}>
              <CardContent className="p-5">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <h2 className="font-medium">{s.name}</h2>
                    <p className="text-sm text-muted-foreground">{s.domain}</p>
                    <code className="mt-2 block text-xs text-muted-foreground">{s.id}</code>
                  </div>
                  <Button variant="outline" onClick={() => showDomains(s.id)}>
                    Verify domain
                  </Button>
                </div>
                {domains[s.id]?.map((d) => (
                  <div key={d.id} className="mt-5 rounded-lg bg-muted p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <strong className="text-sm">{d.domain}</strong>
                      <span className="text-xs">
                        {d.verifiedAt ? "Verified" : "Verification required"}
                      </span>
                    </div>
                    {!d.verifiedAt && (
                      <VerificationPanel
                        siteId={s.id}
                        domain={d}
                        busy={busy}
                        onVerify={verify}
                      />
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
