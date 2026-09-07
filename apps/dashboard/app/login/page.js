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
  useEffect(() => {
    api("/v1/auth/capabilities")
      .then((v) => setGoogle(v.google))
      .catch(() => {});
    if (new URLSearchParams(window.location.search).get("error") === "link-required")
      setError(
        "That email already has an account. Sign in with your password, then link Google from account settings.",
      );
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const me = await api("/v1/auth/me");
      if (me.activeTenantId) localStorage.setItem("unpirator_tenant_id", me.activeTenantId);
      window.location.assign(data.account.platformRole === "super_admin" ? "/admin" : "/dashboard");
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
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button className="w-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <div className="auth-links">
              <Link href="/forgot-password">Forgot password?</Link>
              <Link href="/register">Create workspace</Link>
            </div>
            {google && (
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
