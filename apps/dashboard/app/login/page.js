"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";

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
          : data.account.platformRole
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
    <AuthShell
      mode="login"
      title={challenge ? "Verify your identity" : "Sign in"}
      intro={
        challenge
          ? "Enter the 6-digit code from your authenticator app."
          : "Use your workspace credentials to continue."
      }
    >
      <form className="space-y-5" onSubmit={submit}>
        {!challenge ? (
          <>
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-[#30342e]">Email</span>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
                required
              />
            </label>
            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[#30342e]">Password</span>
                <Link href="/forgot-password" className="text-sm text-[#666c62] hover:text-[#20251d] hover:underline">
                  Forgot password?
                </Link>
              </div>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                minLength={10}
                className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
                required
              />
            </label>
          </>
        ) : (
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-[#30342e]">Authenticator code</span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="h-14 rounded-lg border-[#d9dcd6] bg-white text-center text-xl tracking-[.32em] shadow-none focus-visible:ring-[#9aa095]"
              required
            />
          </label>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <Button className="h-12 w-full rounded-lg bg-[#20251d] text-sm font-semibold text-white hover:bg-[#32382e]" disabled={busy}>
          {busy ? "Signing in…" : challenge ? "Verify and continue" : "Sign in"}
          {!busy && <ArrowRight className="ml-2 size-4" />}
        </Button>
      </form>

      {google && !challenge && (
        <>
          <div className="my-6 flex items-center gap-3 text-xs text-[#8a8f87]">
            <span className="h-px flex-1 bg-[#e4e6e0]" />
            <span>or</span>
            <span className="h-px flex-1 bg-[#e4e6e0]" />
          </div>
          <Button asChild variant="outline" className="h-12 w-full rounded-lg border-[#d9dcd6] bg-white text-sm font-semibold shadow-none hover:bg-[#f7f8f5]">
            <a href="/control-api/v1/auth/google">Continue with Google</a>
          </Button>
        </>
      )}
    </AuthShell>
  );
}
