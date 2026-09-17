"use client";

import { useState } from "react";
import { ArrowRight, Building2, KeyRound, Mail } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";

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
    <AuthShell
      mode="register"
      title="Create your protected workspace."
      intro="Start with your organization, then connect your site and media from the guided onboarding flow."
    >
      <form className="space-y-4" onSubmit={submit}>
        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-[#687261]">
            Organization
          </span>
          <div className="relative">
            <Building2 className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7b8674]" />
            <Input
              placeholder="Acme Learning"
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className="h-12 rounded-xl border-[#d7ded0] bg-[#fafbf8] pl-10"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-[#687261]">
            Owner email
          </span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7b8674]" />
            <Input
              type="email"
              placeholder="owner@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl border-[#d7ded0] bg-[#fafbf8] pl-10"
              required
            />
          </div>
        </label>

        <label className="block">
          <span className="mb-2 block text-xs font-bold uppercase tracking-[.12em] text-[#687261]">
            Password
          </span>
          <div className="relative">
            <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#7b8674]" />
            <Input
              type="password"
              placeholder="12+ characters"
              minLength={12}
              pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl border-[#d7ded0] bg-[#fafbf8] pl-10"
              required
            />
          </div>
          <span className="mt-2 block text-xs leading-5 text-[#7d8777]">
            Use 12+ characters with uppercase, lowercase and at least one number.
          </span>
        </label>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <Button className="h-12 w-full rounded-xl bg-[#172014] text-white hover:bg-[#24301f]" disabled={busy}>
          {busy ? "Creating workspace…" : "Create workspace"}
          {!busy && <ArrowRight className="ml-2 size-4" />}
        </Button>
      </form>

      <div className="mt-5 rounded-xl bg-[#f4f6ef] px-4 py-3 text-xs leading-5 text-[#677160]">
        After signup, onboarding walks you through site verification, provider connection and your first protected playback.
      </div>
    </AuthShell>
  );
}
