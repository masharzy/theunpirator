"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PublicNav } from "@/components/public-nav";
export default function RegisterPage() {
  const [tenantName, setTenantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = await api("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ tenantName, email, password }),
      });
      localStorage.setItem("unpirator_tenant_id", data.tenant.id);
      window.location.assign("/dashboard/onboarding");
    } catch (e) {
      setError(e.message);
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
            <CardTitle>Create The Unpirator workspace</CardTitle>
            <CardDescription>
              Start a protected media workspace with the seeded trial entitlement set.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={submit}>
              <Input
                placeholder="Organization"
                value={tenantName}
                onChange={(e) => setTenantName(e.target.value)}
                required
              />
              <Input
                type="email"
                placeholder="owner@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="12+ chars, upper/lowercase and number"
                minLength={12}
                pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <Button className="w-full" disabled={busy}>
                {busy ? "Creating…" : "Create workspace"}
              </Button>
            </form>
            <p className="mt-4 text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link className="underline" href="/login">
                Sign in
              </Link>
            </p>
          </CardContent>
        </Card>
      </main>
    </>
  );
}
