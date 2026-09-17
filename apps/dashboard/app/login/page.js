"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, KeyRound, Mail } from "lucide-react";
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
      title={challenge ? "Verify it’s you." : "Sign in to your workspace."}
      intro={
        challenge
          ? "Enter the 6-digit code from your authenticator app to continue."
          : "Open the control plane for your sites, viewers and protected playback sessions."
      }
    >
      <form className="space-y-4" onSubmit={submit}>
        {!challenge ? (
          <>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-[#687261]">
                Email
              </span>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7b8674]" />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="h-12 rounded-xl border-[#d7ded0] bg-[#fafbf8] pl-10"
                  required
                />
              </div>
            </label>
            <label className="block">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-xs font-bold uppercase tracking-[.12em] text-[#687261]">
                  Password
                </span>
                <Link
                  href="/forgot-password"
                  className="text-xs font-semibold text-[#607742] hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7b8674]" />
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  minLength={10}
                  className="h-12 rounded-xl border-[#d7ded0] bg-[#fafbf8] pl-10"
                  required
                />
              </div>
            </label>
          </>
        ) : (
          <label className="block">
            <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-[#687261]">
              Authenticator code
            </span>
            <Input
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="000000"
              className="h-14 rounded-xl border-[#d7ded0] bg-[#fafbf8] text-center text-xl tracking-[.35em]"
              required
            />
          </label>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <Button
          className="h-12 w-full rounded-xl bg-[#172014] text-white hover:bg-[#24301f]"
          disabled={busy}
        >
          {busy ? "Signing in…" : challenge ? "Verify and continue" : "Sign in"}
          {!busy && <ArrowRight className="ml-2 size-4" />}
        </Button>
      </form>

      {google && !challenge && (
        <>
          <div className="my-5 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[.16em] text-[#9aa391]">
            <span className="h-px flex-1 bg-[#e0e5da]" /> or{" "}
            <span className="h-px flex-1 bg-[#e0e5da]" />
          </div>
          <Button
            asChild
            variant="outline"
            className="h-12 w-full rounded-xl border-[#d7ded0] bg-white"
          >
            <a href="/control-api/v1/auth/google">Continue with Google</a>
          </Button>
        </>
      )}
    </AuthShell>
  );
}
