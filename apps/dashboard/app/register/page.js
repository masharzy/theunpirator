"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
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
      title="Create your workspace"
      intro="Set up the account first. Site connection and playback setup come next in onboarding."
    >
      <form className="space-y-5" onSubmit={submit}>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#30342e]">Organization</span>
          <Input
            placeholder="Acme Learning"
            value={tenantName}
            onChange={(e) => setTenantName(e.target.value)}
            className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#30342e]">Owner email</span>
          <Input
            type="email"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
            required
          />
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#30342e]">Password</span>
          <Input
            type="password"
            placeholder="12+ characters"
            minLength={12}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
            required
          />
          <span className="mt-2 block text-xs leading-5 text-[#777d73]">
            12+ characters, with uppercase, lowercase and at least one number.
          </span>
        </label>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
            {error}
          </div>
        )}

        <Button className="h-12 w-full rounded-lg bg-[#20251d] text-sm font-semibold text-white hover:bg-[#32382e]" disabled={busy}>
          {busy ? "Creating workspace…" : "Create workspace"}
          {!busy && <ArrowRight className="ml-2 size-4" />}
        </Button>
      </form>
    </AuthShell>
  );
}
