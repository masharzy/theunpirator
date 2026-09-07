"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/components/auth-provider";
const privilegedRoles = new Set([
  "super_admin",
  "operations_admin",
  "billing_admin",
  "support_admin",
  "security_admin",
]);
export default function AccountPage() {
  const auth = useAuth();
  const [sessions, setSessions] = useState([]),
    [google, setGoogle] = useState(false),
    [mfa, setMfa] = useState(null),
    [mfaCode, setMfaCode] = useState(""),
    [recovery, setRecovery] = useState(null),
    [savedCodes, setSavedCodes] = useState(false),
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
      const setup = await api("/v1/auth/mfa/setup", { method: "POST" });
      const QRCode = await import("qrcode");
      setMfa({
        ...setup,
        qrDataUrl: await QRCode.toDataURL(setup.otpauthUri, { width: 240, margin: 1 }),
      });
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function confirmMfa() {
    try {
      const result = await api("/v1/auth/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ code: mfaCode }),
      });
      setRecovery(result);
      setMessage("Authenticator confirmed. Save every recovery code to unlock Admin access.");
    } catch (e) {
      setMessage(e.message);
    }
  }
  async function acknowledgeRecovery() {
    try {
      await api("/v1/auth/mfa/recovery/ack", {
        method: "POST",
        body: JSON.stringify({ receipt: recovery.receipt, acknowledged: savedCodes }),
      });
      setRecovery(null);
      setMfa(null);
      setMfaCode("");
      setMessage("MFA setup complete. Admin access is unlocked.");
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
      {privilegedRoles.has(auth?.account?.platformRole) && !auth.account.mfaConfirmed && (
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
                {mfa.qrDataUrl && (
                  <img
                    src={mfa.qrDataUrl}
                    width="240"
                    height="240"
                    alt="Scan this QR code with your authenticator app"
                    className="rounded-xl border bg-white p-2"
                  />
                )}
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
                {!recovery && <Button onClick={confirmMfa}>Confirm MFA</Button>}
                {recovery && (
                  <div className="space-y-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <h3 className="font-semibold">Save your recovery codes</h3>
                    <div className="grid grid-cols-2 gap-2 font-mono text-sm">
                      {recovery.recoveryCodes.map((code) => (
                        <code key={code}>{code}</code>
                      ))}
                    </div>
                    <a
                      className="inline-block text-sm font-semibold underline"
                      download="the-unpirator-recovery-codes.txt"
                      href={`data:text/plain;charset=utf-8,${encodeURIComponent(recovery.recoveryCodes.join("\n"))}`}
                    >
                      Download recovery codes
                    </a>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={savedCodes}
                        onChange={(e) => setSavedCodes(e.target.checked)}
                      />
                      I saved these codes in a secure place.
                    </label>
                    <Button disabled={!savedCodes} onClick={acknowledgeRecovery}>
                      Finish MFA setup
                    </Button>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}
      {privilegedRoles.has(auth?.account?.platformRole) && auth.account.mfaConfirmed && (
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
