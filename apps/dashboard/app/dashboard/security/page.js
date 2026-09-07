"use client";
import { useState } from "react";
import { DataPage } from "@/components/data-page";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
export default function Security() {
  const [tab, setTab] = useState("events"),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  async function block(id) {
    try {
      await api(`/v1/security/${tab}/${id}/block`, { method: "POST" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e.message);
    }
  }
  return (
    <>
      <div className="mb-6 flex gap-2">
        {["events", "devices", "users"].map((t) => (
          <Button variant={tab === t ? "default" : "outline"} key={t} onClick={() => setTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-4 text-red-600">
          {error}
        </p>
      )}
      <DataPage
        key={`${tab}-${version}`}
        title="Security"
        description="Review activity and manage viewer access."
        endpoint={`/v1/security/${tab}`}
        render={
          tab === "events"
            ? undefined
            : (data) => (
                <div className="space-y-3">
                  {data.items.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      No {tab} registered yet.
                    </p>
                  ) : (
                    data.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4"
                      >
                        <div>
                          <p className="font-medium">
                            {item.deviceName ||
                              item.displayLabel ||
                              item.externalUserId ||
                              item.externalDeviceId}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {item.status}
                            {item.browser ? ` · ${item.browser}` : ""}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={item.status === "blocked"}
                          onClick={() => block(item.id)}
                        >
                          {item.status === "blocked" ? "Blocked" : "Block access"}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              )
        }
      />
    </>
  );
}
