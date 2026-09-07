"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  async function verify(siteId, id) {
    setBusy(true);
    setError("");
    try {
      await api(`/v1/sites/${siteId}/domains/${id}/verify`, { method: "POST" });
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
            <Button disabled={busy}>{busy ? "Saving…" : "Add site"}</Button>
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
                      <>
                        <p className="mt-3 text-xs text-muted-foreground">
                          Add this TXT record with your DNS provider, then check verification.
                        </p>
                        <dl className="mt-3 space-y-2 break-all text-xs">
                          <div>
                            <dt className="font-medium">Name</dt>
                            <dd>{d.dns.name}</dd>
                          </div>
                          <div>
                            <dt className="font-medium">Value</dt>
                            <dd>{d.dns.value}</dd>
                          </div>
                        </dl>
                        <Button
                          className="mt-4"
                          size="sm"
                          disabled={busy}
                          onClick={() => verify(s.id, d.id)}
                        >
                          Check DNS verification
                        </Button>
                      </>
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
