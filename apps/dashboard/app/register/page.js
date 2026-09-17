"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AuthShell } from "@/components/auth-shell";
import { PasswordChecklist, passwordIsValid } from "@/components/password-checklist";

const emailLooksValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

export default function RegisterPage() {
  const [tenantName, setTenantName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  function validate() {
    const next = {};
    if (tenantName.trim().length < 2) next.tenantName = "Organization name must be at least 2 characters.";
    if (!email.trim()) next.email = "Enter your email address.";
    else if (!emailLooksValid(email)) next.email = "Enter a valid email address.";
    if (!password) next.password = "Create a password.";
    else if (!passwordIsValid(password)) next.password = "Complete all password requirements below.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!validate()) return;
    setBusy(true);
    try {
      const data = await api("/v1/auth/register", {
        method: "POST",
        body: JSON.stringify({ tenantName: tenantName.trim(), email: email.trim(), password }),
      });
      localStorage.setItem("unpirator_tenant_id", data.tenant.id);
      window.location.assign("/dashboard/onboarding");
    } catch (e) {
      setError(e.message || "We could not create your workspace. Please try again.");
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
      <form className="space-y-5" onSubmit={submit} noValidate>
        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#30342e]">Organization</span>
          <Input
            placeholder="Acme Learning"
            value={tenantName}
            onChange={(e) => {
              setTenantName(e.target.value);
              setFieldErrors((old) => ({ ...old, tenantName: "" }));
            }}
            aria-invalid={Boolean(fieldErrors.tenantName)}
            className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
          />
          {fieldErrors.tenantName && <p className="mt-2 text-sm text-red-600">{fieldErrors.tenantName}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#30342e]">Owner email</span>
          <Input
            type="email"
            placeholder="owner@example.com"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setFieldErrors((old) => ({ ...old, email: "" }));
            }}
            aria-invalid={Boolean(fieldErrors.email)}
            className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
          />
          {fieldErrors.email && <p className="mt-2 text-sm text-red-600">{fieldErrors.email}</p>}
        </label>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-[#30342e]">Password</span>
          <Input
            type="password"
            placeholder="8+ characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFieldErrors((old) => ({ ...old, password: "" }));
            }}
            aria-invalid={Boolean(fieldErrors.password)}
            autoComplete="new-password"
            className="h-12 rounded-lg border-[#d9dcd6] bg-white px-3.5 text-[15px] shadow-none focus-visible:ring-[#9aa095]"
          />
          <PasswordChecklist value={password} />
          {fieldErrors.password && <p className="mt-2 text-sm text-red-600">{fieldErrors.password}</p>}
        </label>

        {error && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm leading-5 text-red-700">
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
