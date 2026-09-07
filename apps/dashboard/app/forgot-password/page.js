"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function ForgotPassword() {
  const [email, setEmail] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e) {
    e.preventDefault();
    const data = await api("/v1/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
    setMessage(data.message);
  }
  return (
    <main className="auth-stage">
      <section className="auth-panel">
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h1>Reset your password.</h1>
        <p>We will send a one-hour reset link if the account exists.</p>
        <form onSubmit={submit}>
          <Input
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Button>Send reset link</Button>
        </form>
        {message && <p role="status">{message}</p>}
        <Link href="/login">Back to sign in</Link>
      </section>
    </main>
  );
}
