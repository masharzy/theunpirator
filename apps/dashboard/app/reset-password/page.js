"use client";

import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordChecklist, passwordIsValid } from "@/components/password-checklist";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (!passwordIsValid(password)) {
      setError("Complete all password requirements below.");
      return;
    }
    const token = new URLSearchParams(window.location.search).get("token") || "";
    if (!token) {
      setError("This reset link is missing or invalid. Request a new password reset email.");
      return;
    }
    setBusy(true);
    try {
      const data = await api("/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setSuccess(data.message);
    } catch (e) {
      setError(e.message || "We could not update your password. Please request a new reset link.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-stage">
      <section className="auth-panel">
        <p className="eyebrow">NEW CREDENTIAL</p>
        <h1>Choose a new password.</h1>
        <p className="mt-2 text-sm text-[#687260]">
          Use at least 8 characters with a mix of letters and a number.
        </p>
        <form onSubmit={submit} noValidate className="mt-6 space-y-4">
          <div>
            <Input
              type="password"
              placeholder="8+ characters"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              autoComplete="new-password"
              aria-invalid={Boolean(error)}
            />
            <PasswordChecklist value={password} />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-sm text-emerald-700">
              {success}
            </p>
          )}
          <Button disabled={busy}>{busy ? "Updating…" : "Update password"}</Button>
        </form>
        <Link href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
