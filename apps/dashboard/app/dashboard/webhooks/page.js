"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
export default function Webhooks() {
  const [items, setItems] = useState([]),
    [url, setUrl] = useState(""),
    [secret, setSecret] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = () =>
    api("/v1/webhooks")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function create(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const d = await api("/v1/webhooks", {
        method: "POST",
        body: JSON.stringify({ url, events: ["*"] }),
      });
      setSecret(d.secret);
      setUrl("");
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function remove(id) {
    try {
      await api(`/v1/webhooks/${id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold">Webhooks</h1>
      <p className="mt-2 text-muted-foreground">Receive signed session events on your backend.</p>
      <form onSubmit={create} className="mt-8 rounded-xl border bg-white p-6">
        <label className="grid gap-2 text-sm">
          HTTPS endpoint
          <Input
            type="url"
            placeholder="https://your-site.com/webhooks/unpirator"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            required
          />
        </label>
        <Button className="mt-4" disabled={busy}>
          {busy ? "Saving…" : "Add endpoint"}
        </Button>
        {secret && (
          <div role="status" className="mt-4 rounded-lg bg-muted p-4">
            <p className="text-xs font-medium">
              Copy this signing secret now. It is shown only once.
            </p>
            <code className="mt-2 block break-all text-xs">{secret}</code>
          </div>
        )}
      </form>
      {error && (
        <p role="alert" className="mt-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <div className="mt-6 space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No endpoints configured.</p>
        ) : (
          items.map((item) => (
            <article
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-5"
              key={item.id}
            >
              <div className="min-w-0">
                <h2 className="break-all text-sm font-medium">{item.url}</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  {item.status} · {item.events.join(", ")}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => remove(item.id)}>
                Remove endpoint
              </Button>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
