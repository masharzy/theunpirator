"use client";
import Link from "next/link";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export default function ResetPassword() {
  const [password, setPassword] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e) {
    e.preventDefault();
    const token = new URLSearchParams(window.location.search).get("token") || "";
    try {
      const data = await api("/v1/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(data.message);
    } catch (e) {
      setMessage(e.message);
    }
  }
  return (
    <main className="auth-stage">
      <section className="auth-panel">
        <p className="eyebrow">NEW CREDENTIAL</p>
        <h1>Choose a new password.</h1>
        <form onSubmit={submit}>
          <Input
            type="password"
            minLength={12}
            pattern="(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9]).{12,}"
            placeholder="12+ chars, upper/lowercase and number"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button>Update password</Button>
        </form>
        {message && <p role="status">{message}</p>}
        <Link href="/login">Return to sign in</Link>
      </section>
    </main>
  );
}
