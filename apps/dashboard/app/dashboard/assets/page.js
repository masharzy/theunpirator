"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Page() {
  const [items, setItems] = useState([]),
    [sites, setSites] = useState([]),
    [providers, setProviders] = useState(["direct", "hls", "s3", "r2", "bunny"]);
  const [f, setF] = useState({
    siteId: "",
    title: "",
    provider: "direct",
    providerReference: "",
    allowedHost: "",
  });
  const [error, setError] = useState("");
  const load = () =>
    Promise.all([api("/v1/assets"), api("/v1/sites"), api("/v1/assets/providers")])
      .then(([a, s, p]) => {
        setItems(a.items || []);
        setSites(s.items || []);
        setProviders(p.items || []);
        if (!f.siteId && s.items?.[0]) setF((x) => ({ ...x, siteId: s.items[0].id }));
      })
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      await api("/v1/assets", {
        method: "POST",
        body: JSON.stringify({
          siteId: f.siteId,
          title: f.title,
          provider: f.provider,
          providerReference: f.providerReference,
          allowedHosts: [f.allowedHost],
          providerConfig: {},
          securityPolicy: "strict",
        }),
      });
      setF((x) => ({ ...x, title: "", providerReference: "", allowedHost: "" }));
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold">Assets</h1>
      <p className="mt-2 text-muted-foreground">
        Register only origins you are authorized to deliver.
      </p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Add asset</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3" onSubmit={create}>
            <select
              className="h-10 rounded-lg border bg-white px-3"
              value={f.siteId}
              onChange={(e) => setF({ ...f, siteId: e.target.value })}
              required
            >
              <option value="">Select site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                placeholder="Video title"
                value={f.title}
                onChange={(e) => setF({ ...f, title: e.target.value })}
                required
              />
              <select
                className="h-10 rounded-lg border bg-white px-3"
                value={f.provider}
                onChange={(e) => setF({ ...f, provider: e.target.value })}
              >
                {providers.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
              <Input
                placeholder="Authorized provider reference"
                value={f.providerReference}
                onChange={(e) => setF({ ...f, providerReference: e.target.value })}
                required
              />
              <Input
                placeholder="Allowed origin host e.g. cdn.example.com"
                value={f.allowedHost}
                onChange={(e) => setF({ ...f, allowedHost: e.target.value })}
                required
              />
            </div>
            <Button className="w-fit">Add asset</Button>
          </form>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
      <div className="mt-6 space-y-3">
        {items.map((a) => (
          <Card key={a.id}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="font-medium">{a.title}</div>
                <div className="text-sm text-muted-foreground">
                  {a.provider} • {a.securityPolicy}
                </div>
              </div>
              <code className="text-xs">{a.id}</code>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
