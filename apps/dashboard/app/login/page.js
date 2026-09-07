"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
      if (me.memberships?.[0])
        localStorage.setItem("unpirator_tenant_id", me.memberships[0].tenantId);
      router.push(data.account.platformRole === "super_admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid min-h-screen place-items-center px-6">
      <Card className="w-full max-w-md">
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
        </CardContent>
      </Card>
    </main>
  );
}
