"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
export default function Sessions() {
  const [items, setItems] = useState([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const load = () =>
    api("/v1/playback/sessions")
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);
  async function revoke(id) {
    setBusy(id);
    try {
      await api(`/v1/playback/sessions/${id}/revoke`, { method: "POST" });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <div>
      <h1 className="text-3xl font-semibold">Playback sessions</h1>
      <p className="mt-2 text-muted-foreground">
        See active viewers and end access to protected streams.
      </p>
      {error && (
        <p role="alert" className="mt-4 text-red-600">
          {error}
        </p>
      )}
      <div className="mt-8 space-y-3">
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed p-12 text-center text-sm text-muted-foreground">
            No sessions yet. Integrate your player to start protected playback.
          </p>
        ) : (
          items.map((s) => (
            <article
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5"
            >
              <div>
                <h2 className="text-sm font-medium">Session {s.id.slice(0, 8)}</h2>
                <p className="mt-2 text-xs text-muted-foreground">
                  {s.status} · Started {new Date(s.startedAt).toLocaleString()}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">Asset {s.assetId}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={s.status !== "active" || busy === s.id}
                onClick={() => revoke(s.id)}
              >
                {busy === s.id ? "Revoking…" : s.status === "active" ? "Revoke session" : "Ended"}
              </Button>
            </article>
          ))
        )}
      </div>
    </div>
  );
}
