"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
export default function VerifyEmail() {
  const [message, setMessage] = useState("Verifying your email…");
  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token") || "";
    api("/v1/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) })
      .then((v) => setMessage(v.message))
      .catch((e) => setMessage(e.message));
  }, []);
  return (
    <main className="auth-stage">
      <section className="auth-panel">
        <p className="eyebrow">EMAIL VERIFICATION</p>
        <h1>{message}</h1>
        <Link href="/dashboard">Continue to dashboard</Link>
      </section>
    </main>
  );
}
