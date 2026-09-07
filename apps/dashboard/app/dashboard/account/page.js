"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/components/auth-provider";
export default function AccountPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState([]),
    [google, setGoogle] = useState(false);
  const load = () => api("/v1/auth/sessions").then((v) => setSessions(v.items));
  useEffect(() => {
    load().catch(() => {});
    api("/v1/auth/capabilities")
      .then((v) => setGoogle(v.google))
      .catch(() => {});
  }, []);
  async function revoke(id) {
    await api(`/v1/auth/sessions/${id}`, { method: "DELETE" });
    await load();
  }
  async function unlinkGoogle() {
    await api("/v1/auth/google/link", { method: "DELETE" });
    await auth.refresh();
  }
  return (
    <div>
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h1 className="mt-3 text-3xl font-semibold">Your account</h1>
      <p className="mt-2 text-muted-foreground">{auth?.account?.email}</p>
      {google && !auth?.account?.googleLinked && (
        <Button asChild variant="outline" className="mt-5">
          <a href="/control-api/v1/auth/google/link">Link Google account</a>
        </Button>
      )}
      {auth?.account?.googleLinked && (
        <Button
          variant="outline"
          className="mt-5"
          disabled={!auth.account.canUnlinkGoogle}
          title={
            auth.account.canUnlinkGoogle ? undefined : "Set a password before unlinking Google"
          }
          onClick={unlinkGoogle}
        >
          Unlink Google
        </Button>
      )}
      <div className="mt-8 grid gap-4">
        {sessions.map((s) => (
          <Card key={s.id}>
            <CardHeader>
              <CardTitle className="text-base">{s.userAgent || "Unknown browser"}</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="text-sm text-muted-foreground">
                <p>{s.ip || "IP unavailable"}</p>
                <p>Signed in {new Date(s.createdAt).toLocaleString()}</p>
              </div>
              <Button variant="outline" onClick={() => revoke(s.id)}>
                Revoke
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
