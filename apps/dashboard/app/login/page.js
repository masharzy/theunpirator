"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Link from "next/link";
import { PublicNav } from "@/components/public-nav";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  useEffect(() => {
    api("/v1/auth/capabilities")
      .then((v) => setGoogle(v.google))
      .catch(() => {});
    const params = new URLSearchParams(window.location.search);
    if (params.get("mfa_challenge")) setChallenge(params.get("mfa_challenge"));
    if (params.get("error") === "link-required")
      setError(
        "That email already has an account. Sign in with your password, then link Google from account settings.",
      );
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = challenge
        ? await api("/v1/auth/mfa/challenge", {
            method: "POST",
            body: JSON.stringify({ challenge, code }),
          })
        : await api("/v1/auth/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
          });
      if (data.mfaRequired) {
        setChallenge(data.challenge);
        return;
      }
      const me = await api("/v1/auth/me");
      if (me.activeTenantId) localStorage.setItem("unpirator_tenant_id", me.activeTenantId);
      window.location.assign(
        data.account.mfaSetupRequired
          ? "/dashboard/account?setup=mfa"
          : data.account.platformRole === "super_admin"
            ? "/admin"
            : "/dashboard",
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PublicNav />
      <main className="auth-stage">
        <Card className="auth-panel">
          <CardHeader>
            <CardTitle>The Unpirator</CardTitle>
            <CardDescription>Sign in to your protected media control plane.</CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              {!challenge && (
                <>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    required
                  />
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    minLength={10}
                    required
                  />
                </>
              )}
              {challenge && (
                <Input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6-digit authenticator code"
                  required
                />
              )}
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            {!challenge && (
              <div className="auth-links">
                <Link href="/forgot-password">Forgot password?</Link>
                <Link href="/register">Create workspace</Link>
              </div>
            )}
            {google && !challenge && (
              <Button asChild variant="outline" className="mt-4 w-full">
                <a href="/control-api/v1/auth/google">Continue with Google</a>
              </Button>
            )}
          </CardContent>
        </Card>
      </main>
    </>
  );
}
