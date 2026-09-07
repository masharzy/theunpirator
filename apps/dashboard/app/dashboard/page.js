"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
export default function Dashboard() {
  const [usage, setUsage] = useState({});
  useEffect(() => {
    api("/v1/usage/summary")
      .then((d) => setUsage(d.metrics || {}))
      .catch(() => {});
  }, []);
  const metrics = [
    ["Playback sessions", usage.playback_sessions || 0],
    ["Gateway requests", usage.gateway_requests || 0],
    ["Heartbeats", usage.playback_heartbeat || 0],
    ["Security events", usage.security_events || 0],
  ];
  return (
    <div>
      <h1 className="text-3xl font-semibold">Overview</h1>
      <p className="mt-2 text-muted-foreground">Tenant activity and protected playback usage.</p>
      <div className="mt-8 grid gap-4 md:grid-cols-4">
        {metrics.map(([k, v]) => (
          <Card key={k}>
            <CardHeader>
              <CardTitle className="text-sm text-muted-foreground">{k}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-semibold">{v}</div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
