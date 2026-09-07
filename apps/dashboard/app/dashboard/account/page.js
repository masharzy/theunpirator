"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
export default function AccountPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState([]),
    [google, setGoogle] = useState(false),
    [mfa, setMfa] = useState(null),
    [mfaCode, setMfaCode] = useState(""),
    [message, setMessage] = useState("");
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
  async function startMfa() {
    try {
      setMfa(await api("/v1/auth/mfa/setup", { method: "POST" }));
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function confirmMfa() {
    try {
      await api("/v1/auth/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode }),
      });
      setMessage("Authenticator confirmed. Admin access is unlocked.");
      setMfa(null);
      await auth.refresh();
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function reauthenticate() {
    try {
      await api("/v1/auth/mfa/reauth", { method: "POST", body: JSON.stringify({ code: mfaCode }) });
      setMessage("Admin session verified for sensitive changes.");
      setMfaCode("");
      await auth.refresh();
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <div>
      <p className="eyebrow">ACCOUNT SECURITY</p>
      <h1 className="mt-3 text-3xl font-semibold">Your account</h1>
      <p className="mt-2 text-muted-foreground">{auth?.account?.email}</p>
      {auth?.account?.platformRole === "super_admin" && !auth.account.mfaConfirmed && (
        <Card className="mt-6 border-amber-300">
          <CardHeader>
            <CardTitle>Authenticator required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Admin access stays locked until you confirm a TOTP authenticator.
            </p>
            {!mfa ? (
              <Button onClick={startMfa}>Set up authenticator</Button>
            ) : (
              <>
                <p className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{mfa.secret}</p>
                <p className="text-xs text-muted-foreground">
                  Add this secret in your authenticator app.
                </p>
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                />
                <Button onClick={confirmMfa}>Confirm MFA</Button>
              </>
            )}
          </CardContent>
        </Card>
      )}
      {auth?.account?.platformRole === "super_admin" && auth.account.mfaConfirmed && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Verify admin session</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Input
              className="max-w-xs"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="6-digit code"
              value={mfaCode}
              onChange={(e) => setMfaCode(e.target.value)}
            />
            <Button onClick={reauthenticate}>Verify for 15 minutes</Button>
          </CardContent>
        </Card>
      )}
      {message && (
        <p role="status" className="mt-4 text-sm">
          {message}
        </p>
      )}
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
