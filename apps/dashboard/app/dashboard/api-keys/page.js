"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Page() {
  const [items, setItems] = useState([]),
    [name, setName] = useState("Production"),
    [secret, setSecret] = useState(""),
    [error, setError] = useState("");
  const load = () =>
    api("/v1/api-keys")
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    try {
      const d = await api("/v1/api-keys", {
        method: "POST",
        body: JSON.stringify({ name, scopes: ["playback:create"] }),
      });
      setSecret(d.secret);
      load();
    } catch (e) {
      setError(e.message);
    }
  }
  async function revoke(id) {
    await api(`/v1/api-keys/${id}/revoke`, { method: "POST" });
    load();
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold">API Keys</h1>
      <p className="mt-2 text-muted-foreground">
        Server-to-server credentials. Secrets are shown once.
      </p>
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Create key</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="flex gap-3" onSubmit={create}>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
            <Button>Create</Button>
          </form>
          {secret && (
            <div className="mt-4 rounded-lg border bg-neutral-50 p-3">
              <div className="text-xs font-medium">Copy now</div>
              <code className="break-all text-xs">{secret}</code>
            </div>
          )}
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>
      <div className="mt-6 space-y-3">
        {items.map((k) => (
          <Card key={k.id}>
            <CardContent className="flex items-center justify-between p-5">
              <div>
                <div className="font-medium">{k.name}</div>
                <div className="text-xs text-muted-foreground">apk_{k.keyPrefix}.••••••</div>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={!!k.revokedAt}
                onClick={() => revoke(k.id)}
              >
                {k.revokedAt ? "Revoked" : "Revoke"}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
